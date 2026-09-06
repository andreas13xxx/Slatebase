// Whisper backend HTTP client
//
// Thin wrapper around the operator-configured self-hosted Whisper backend. The
// exact request/response mapping lives ONLY here, so pointing Slatebase at a
// different backend (whisper.cpp server, faster-whisper behind a small HTTP
// shell, an openai/whisper-compatible local server) means changing this one
// file. Everything above (`TranscriptionService`, the route) is backend-agnostic.
//
// Request shape: multipart/form-data POST with an `audio_file` part (the widely
// used `whisper-asr-webservice` / faster-whisper convention) plus an optional
// `language` form field. Response: JSON, read leniently for a `text` field (and
// an optional detected `language`).

import type { ILogger } from '../logger/index.js'
import {
  TranscriptionBackendUnavailableError,
  TranscriptionTimeoutError,
} from './errors.js'
import type { IWhisperClient, TranscriptionResult } from './types.js'

export interface WhisperClientOptions {
  /** Base URL / full endpoint of the Whisper backend. */
  backendUrl: string
  /** Request timeout in milliseconds. */
  timeoutMs: number
}

/**
 * WhisperClient — forwards audio to the configured Whisper HTTP backend and
 * returns the recognized text.
 */
export class WhisperClient implements IWhisperClient {
  private readonly backendUrl: string
  private readonly timeoutMs: number
  private readonly logger: ILogger

  constructor(options: WhisperClientOptions, logger: ILogger) {
    this.backendUrl = options.backendUrl
    this.timeoutMs = options.timeoutMs
    this.logger = logger
  }

  /**
   * Transcribe an audio buffer.
   *
   * @throws {TranscriptionTimeoutError} if the backend does not answer within the timeout
   * @throws {TranscriptionBackendUnavailableError} if the backend is unreachable, returns
   *   a non-2xx status, or sends an unparseable response
   */
  async transcribe(audio: Buffer, contentType: string, language?: string): Promise<TranscriptionResult> {
    const form = new FormData()
    // Copy into a fresh Uint8Array so the Blob owns a plain ArrayBuffer (not a
    // possibly-shared Node Buffer pool slice), then wrap as a Blob for FormData.
    const bytes = new Uint8Array(audio)
    form.append('audio_file', new Blob([bytes], { type: contentType }), 'audio')
    if (language !== undefined) {
      form.append('language', language)
    }

    let response: Response
    try {
      response = await fetch(this.backendUrl, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        this.logger.error('Transcription backend timed out', { timeoutMs: this.timeoutMs })
        throw new TranscriptionTimeoutError(this.timeoutMs)
      }
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error('Transcription backend request failed', { error: message })
      throw new TranscriptionBackendUnavailableError('Transcription backend is unreachable')
    }

    if (!response.ok) {
      this.logger.error('Transcription backend returned a non-2xx status', { status: response.status })
      throw new TranscriptionBackendUnavailableError(
        `Transcription backend returned status ${response.status}`,
      )
    }

    let data: unknown
    try {
      data = await response.json()
    } catch {
      this.logger.error('Transcription backend returned an unparseable response')
      throw new TranscriptionBackendUnavailableError('Transcription backend returned an invalid response')
    }

    return parseResult(data)
  }
}

/**
 * Read the recognized text out of the backend response, tolerating the small
 * shape differences between common Whisper servers. Requires at least a string
 * `text` field; a detected language is picked up when present.
 */
function parseResult(data: unknown): TranscriptionResult {
  if (typeof data !== 'object' || data === null) {
    throw new TranscriptionBackendUnavailableError('Transcription backend returned an invalid response')
  }

  const record = data as Record<string, unknown>
  const text = record['text']
  if (typeof text !== 'string') {
    throw new TranscriptionBackendUnavailableError('Transcription backend response is missing a text field')
  }

  const detected = record['language'] ?? record['detected_language']
  const detectedLanguage = typeof detected === 'string' && detected.length > 0 ? detected : undefined

  return { text: text.trim(), detectedLanguage }
}
