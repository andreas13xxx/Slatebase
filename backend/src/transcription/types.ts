// Voice Transcription — data models and service interface
//
// Native dictation via a self-hosted Whisper backend. Audio is recorded in the
// browser, sent here, forwarded to a operator-configured transcription backend,
// and the recognized text is returned. Audio is never persisted server-side by
// this module (an optional vault attachment goes through the normal upload path
// instead) and is never sent to a third party — see `.kiro/specs/voice-transcription/`.

/**
 * Whisper language codes Slatebase surfaces in the dictation UI. Whisper itself
 * supports many more; this is the deliberately small, tested subset offered by
 * default. `'auto'` leaves language detection to the backend.
 *
 * A new language needs an entry here (backend) and in the frontend language
 * picker; keep the two in step by hand.
 */
export const SUPPORTED_TRANSCRIPTION_LANGUAGES = ['de', 'en'] as const

/** A concrete Whisper language code offered by Slatebase. */
export type TranscriptionLanguage = (typeof SUPPORTED_TRANSCRIPTION_LANGUAGES)[number]

/**
 * The language selector value from the client: a supported code, or `'auto'`
 * for backend-side detection.
 */
export type TranscriptionLanguageSelection = TranscriptionLanguage | 'auto'

/** A single transcription request handed to the service / whisper client. */
export interface TranscriptionRequest {
  /** Raw audio bytes as recorded by the browser (e.g. audio/webm;codecs=opus). */
  audio: Buffer
  /** MIME type of `audio`, forwarded to the backend for correct decoding. */
  contentType: string
  /**
   * Whisper language code (`'de'`, `'en'`, …), or `undefined` to let the
   * backend auto-detect. A client `'auto'` selection maps to `undefined` here.
   */
  language?: string | undefined
}

/** The transcription result returned to the caller. */
export interface TranscriptionResult {
  /** The recognized text. May be empty if the audio contained no speech. */
  text: string
  /**
   * The language the backend detected, when auto-detection ran. `undefined`
   * if the backend did not report one (or a language was pinned).
   */
  detectedLanguage?: string | undefined
}

/**
 * Operational configuration for the transcription module. Loaded from env /
 * server config (see `config.ts`). The backend URL is deployment-specific and
 * env-driven, not an admin-runtime-editable value.
 */
export interface TranscriptionConfig {
  /**
   * Base URL of the self-hosted Whisper backend. `undefined`/empty means "not
   * configured" — the feature then stays functionally off even when the
   * feature toggle is on (see `isConfigured()`).
   */
  backendUrl: string | undefined
  /**
   * Request timeout in milliseconds. Deliberately generous — Whisper is slow,
   * especially without a GPU.
   */
  timeoutMs: number
  /** Maximum accepted audio size in bytes. Requests above this are rejected. */
  maxAudioBytes: number
  /** Whisper language codes offered to clients (excluding the `'auto'` option). */
  supportedLanguages: string[]
}

/**
 * IWhisperClient — the HTTP transport to the configured Whisper backend. The
 * request/response mapping is an implementation detail of `WhisperClient`; the
 * service depends only on this interface so it stays backend-agnostic and easy
 * to mock in tests.
 */
export interface IWhisperClient {
  /**
   * Send audio to the backend and return the recognized text.
   *
   * @throws {TranscriptionTimeoutError} on timeout
   * @throws {TranscriptionBackendUnavailableError} if unreachable / bad response
   */
  transcribe(audio: Buffer, contentType: string, language?: string): Promise<TranscriptionResult>
}

/**
 * ITranscriptionService — forwards recorded audio to the configured Whisper
 * backend and returns the recognized text. Never persists the audio.
 */
export interface ITranscriptionService {
  /**
   * Whether a transcription backend URL is configured. When `false`, the
   * feature is effectively unavailable regardless of the feature toggle, and
   * the route surfaces `TranscriptionNotConfiguredError` rather than attempting
   * a request.
   */
  isConfigured(): boolean
  /** The Whisper language codes offered to clients (excluding `'auto'`). */
  getSupportedLanguages(): string[]
  /**
   * Transcribe an audio buffer to text.
   *
   * @throws {TranscriptionNotConfiguredError} if no backend URL is configured
   * @throws {AudioTooLargeError} if the audio exceeds `maxAudioBytes`
   * @throws {TranscriptionTimeoutError} if the backend does not answer in time
   * @throws {TranscriptionBackendUnavailableError} if the backend is unreachable or errors
   */
  transcribe(req: TranscriptionRequest): Promise<TranscriptionResult>
}
