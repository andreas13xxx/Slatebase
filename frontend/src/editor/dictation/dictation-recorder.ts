/**
 * DictationRecorder — records microphone audio via the browser's MediaRecorder.
 *
 * Deliberately not part of the Obsidian plugin-compat layer: `navigator.
 * mediaDevices` is a plain Web API, available without any shim (it just needs a
 * secure context — HTTPS or localhost). The recorded Blob is handed to the
 * dictation controller, which uploads it to the backend for transcription.
 *
 * Degrades with a clear error rather than a silent failure when the microphone
 * is unavailable (no `mediaDevices`, permission denied, insecure context).
 */

/** Error thrown when recording cannot start; carries a stable, user-facing reason. */
export class DictationRecorderError extends Error {
  readonly reason: 'unsupported' | 'permission-denied' | 'insecure-context' | 'failed'

  constructor(reason: DictationRecorderError['reason'], message: string) {
    super(message)
    this.name = 'DictationRecorderError'
    this.reason = reason
  }
}

/** The finished recording: a Blob plus its MIME type. */
export interface DictationRecorderResult {
  blob: Blob
  contentType: string
}

export interface IDictationRecorder {
  start(): Promise<void>
  stop(): Promise<DictationRecorderResult>
  cancel(): void
  isRecording(): boolean
}

/**
 * Candidate MIME types in preference order. WebM/Opus first (compact, widely
 * supported, decodes fine both in an <audio> embed and by Whisper); Ogg as a
 * fallback (Firefox historically preferred it), then let the browser pick.
 */
const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']

/** Picks the first MediaRecorder-supported MIME type, or '' to let the browser decide. */
export function pickSupportedMimeType(): string {
  const MR = (globalThis as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder
  if (MR && typeof MR.isTypeSupported === 'function') {
    for (const type of PREFERRED_MIME_TYPES) {
      if (MR.isTypeSupported(type)) return type
    }
  }
  return ''
}

export class DictationRecorder implements IDictationRecorder {
  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []
  private mimeType = ''

  isRecording(): boolean {
    return this.recorder !== null && this.recorder.state === 'recording'
  }

  async start(): Promise<void> {
    if (this.isRecording()) return

    const mediaDevices = (globalThis.navigator as Navigator | undefined)?.mediaDevices
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
      // Most commonly: page served over plain HTTP (getUserMedia is gated on a
      // secure context), or a browser without the API.
      const insecure = typeof globalThis.isSecureContext === 'boolean' && !globalThis.isSecureContext
      throw new DictationRecorderError(
        insecure ? 'insecure-context' : 'unsupported',
        insecure
          ? 'Microphone access requires a secure (HTTPS) connection.'
          : 'Microphone recording is not supported in this browser.',
      )
    }

    let stream: MediaStream
    try {
      stream = await mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      // A user-denied permission surfaces as NotAllowedError / SecurityError.
      const name = err instanceof Error ? err.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
        throw new DictationRecorderError('permission-denied', 'Microphone access was denied.')
      }
      throw new DictationRecorderError('failed', 'Could not access the microphone.')
    }

    this.stream = stream
    this.chunks = []
    this.mimeType = pickSupportedMimeType()

    try {
      this.recorder = this.mimeType
        ? new MediaRecorder(stream, { mimeType: this.mimeType })
        : new MediaRecorder(stream)
    } catch {
      this.releaseStream()
      throw new DictationRecorderError('failed', 'Could not start the audio recorder.')
    }

    this.recorder.addEventListener('dataavailable', (event: BlobEvent) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data)
    })
    this.recorder.start()
  }

  async stop(): Promise<DictationRecorderResult> {
    const recorder = this.recorder
    if (!recorder || recorder.state === 'inactive') {
      throw new DictationRecorderError('failed', 'No active recording to stop.')
    }

    const result = await new Promise<DictationRecorderResult>((resolve) => {
      recorder.addEventListener(
        'stop',
        () => {
          const contentType = this.mimeType || recorder.mimeType || 'audio/webm'
          const blob = new Blob(this.chunks, { type: contentType })
          resolve({ blob, contentType })
        },
        { once: true },
      )
      recorder.stop()
    })

    this.releaseStream()
    this.recorder = null
    this.chunks = []
    return result
  }

  cancel(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop()
      } catch {
        // Ignore — we're tearing down anyway.
      }
    }
    this.releaseStream()
    this.recorder = null
    this.chunks = []
  }

  private releaseStream(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop()
      this.stream = null
    }
  }
}
