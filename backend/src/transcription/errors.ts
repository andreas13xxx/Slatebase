// Voice Transcription — error classes
//
// Mapped to HTTP status codes in the route layer (transcriptionRoutes.ts):
//   TranscriptionNotConfiguredError     → 503 TRANSCRIPTION_NOT_CONFIGURED
//   AudioTooLargeError                  → 413 AUDIO_TOO_LARGE
//   TranscriptionTimeoutError           → 504 TRANSCRIPTION_TIMEOUT
//   TranscriptionBackendUnavailableError→ 502 TRANSCRIPTION_BACKEND_UNAVAILABLE

/**
 * Thrown when no Whisper backend URL is configured. The feature toggle can be
 * on, but without a backend there is nothing to forward audio to.
 */
export class TranscriptionNotConfiguredError extends Error {
  public readonly code = 'TRANSCRIPTION_NOT_CONFIGURED'

  constructor() {
    super('No transcription backend is configured (set SLATEBASE_TRANSCRIPTION_BACKEND_URL)')
    this.name = 'TranscriptionNotConfiguredError'
  }
}

/** Thrown when the submitted audio exceeds the configured maximum size. */
export class AudioTooLargeError extends Error {
  public readonly code = 'AUDIO_TOO_LARGE'

  constructor(sizeBytes: number, maxBytes: number) {
    super(`Audio size ${sizeBytes} bytes exceeds the maximum of ${maxBytes} bytes`)
    this.name = 'AudioTooLargeError'
  }
}

/** Thrown when the transcription backend does not respond within the timeout. */
export class TranscriptionTimeoutError extends Error {
  public readonly code = 'TRANSCRIPTION_TIMEOUT'

  constructor(timeoutMs: number) {
    super(`Transcription backend did not respond within ${timeoutMs} ms`)
    this.name = 'TranscriptionTimeoutError'
  }
}

/**
 * Thrown when the transcription backend is unreachable or returns an error
 * response. The detailed cause is logged server-side; the client only sees a
 * generic message.
 */
export class TranscriptionBackendUnavailableError extends Error {
  public readonly code = 'TRANSCRIPTION_BACKEND_UNAVAILABLE'

  constructor(message: string) {
    super(message)
    this.name = 'TranscriptionBackendUnavailableError'
  }
}
