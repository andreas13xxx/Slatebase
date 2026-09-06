// TranscriptionService — orchestrates a single transcription
//
// Sits between the route and the WhisperClient. Enforces the "configured?" gate
// and the max-audio-size limit, then delegates to the client. Deliberately does
// NOT persist audio: the only stored artifact is the optional vault attachment,
// which the route/frontend handle via the normal upload path, not here.

import { AudioTooLargeError, TranscriptionNotConfiguredError } from './errors.js'
import type {
  ITranscriptionService,
  IWhisperClient,
  TranscriptionConfig,
  TranscriptionRequest,
  TranscriptionResult,
} from './types.js'

/**
 * Factory for the WhisperClient, so the service can stay agnostic of the
 * concrete transport and tests can inject a mock. Given the (guaranteed
 * present) backend URL, returns a client bound to it.
 */
export type WhisperClientFactory = (backendUrl: string) => IWhisperClient

export class TranscriptionService implements ITranscriptionService {
  private readonly config: TranscriptionConfig
  private readonly clientFactory: WhisperClientFactory
  /** Lazily created once a backend URL is known, then reused. */
  private client: IWhisperClient | undefined

  constructor(config: TranscriptionConfig, clientFactory: WhisperClientFactory) {
    this.config = config
    this.clientFactory = clientFactory
  }

  isConfigured(): boolean {
    return typeof this.config.backendUrl === 'string' && this.config.backendUrl.length > 0
  }

  getSupportedLanguages(): string[] {
    return [...this.config.supportedLanguages]
  }

  async transcribe(req: TranscriptionRequest): Promise<TranscriptionResult> {
    if (!this.isConfigured()) {
      throw new TranscriptionNotConfiguredError()
    }

    if (req.audio.length > this.config.maxAudioBytes) {
      throw new AudioTooLargeError(req.audio.length, this.config.maxAudioBytes)
    }

    // `isConfigured()` guarantees a non-empty backendUrl here.
    const backendUrl = this.config.backendUrl as string
    this.client ??= this.clientFactory(backendUrl)

    return this.client.transcribe(req.audio, req.contentType, req.language)
  }
}
