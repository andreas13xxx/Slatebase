import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { WhisperClient } from './whisper-client.js'
import {
  TranscriptionBackendUnavailableError,
  TranscriptionTimeoutError,
} from './errors.js'
import type { ILogger } from '../logger/index.js'

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const OPTS = { backendUrl: 'http://whisper.test/asr', timeoutMs: 5000 }

describe('WhisperClient', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns the recognized text on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ text: 'Hallo Welt' }))
    vi.stubGlobal('fetch', fetchMock)

    const client = new WhisperClient(OPTS, createMockLogger())
    const result = await client.transcribe(Buffer.from('audio'), 'audio/webm', 'de')

    expect(result.text).toBe('Hallo Welt')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://whisper.test/asr')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('trims surrounding whitespace from the text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ text: '  spaced  ' })))
    const client = new WhisperClient(OPTS, createMockLogger())
    const result = await client.transcribe(Buffer.from('x'), 'audio/webm')
    expect(result.text).toBe('spaced')
  })

  it('picks up a detected language from `language`', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ text: 'hi', language: 'en' })))
    const client = new WhisperClient(OPTS, createMockLogger())
    const result = await client.transcribe(Buffer.from('x'), 'audio/webm')
    expect(result.detectedLanguage).toBe('en')
  })

  it('picks up a detected language from `detected_language`', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ text: 'hi', detected_language: 'fr' })))
    const client = new WhisperClient(OPTS, createMockLogger())
    const result = await client.transcribe(Buffer.from('x'), 'audio/webm')
    expect(result.detectedLanguage).toBe('fr')
  })

  it('leaves detectedLanguage undefined when the backend reports none', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ text: 'hi' })))
    const client = new WhisperClient(OPTS, createMockLogger())
    const result = await client.transcribe(Buffer.from('x'), 'audio/webm')
    expect(result.detectedLanguage).toBeUndefined()
  })

  it('omits the language form field when none is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ text: 'hi' }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new WhisperClient(OPTS, createMockLogger())
    await client.transcribe(Buffer.from('x'), 'audio/webm')
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1]
    const form = init.body as FormData
    expect(form.get('language')).toBeNull()
    expect(form.get('audio_file')).not.toBeNull()
  })

  it('maps a timeout (AbortSignal.timeout) to TranscriptionTimeoutError', async () => {
    const timeoutErr = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutErr))
    const client = new WhisperClient(OPTS, createMockLogger())
    await expect(client.transcribe(Buffer.from('x'), 'audio/webm')).rejects.toBeInstanceOf(
      TranscriptionTimeoutError,
    )
  })

  it('maps a network failure to TranscriptionBackendUnavailableError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const client = new WhisperClient(OPTS, createMockLogger())
    await expect(client.transcribe(Buffer.from('x'), 'audio/webm')).rejects.toBeInstanceOf(
      TranscriptionBackendUnavailableError,
    )
  })

  it('maps a non-2xx status to TranscriptionBackendUnavailableError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })))
    const client = new WhisperClient(OPTS, createMockLogger())
    await expect(client.transcribe(Buffer.from('x'), 'audio/webm')).rejects.toBeInstanceOf(
      TranscriptionBackendUnavailableError,
    )
  })

  it('rejects an unparseable (non-JSON) response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 200 })))
    const client = new WhisperClient(OPTS, createMockLogger())
    await expect(client.transcribe(Buffer.from('x'), 'audio/webm')).rejects.toBeInstanceOf(
      TranscriptionBackendUnavailableError,
    )
  })

  it('rejects a JSON response missing a text field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ language: 'de' })))
    const client = new WhisperClient(OPTS, createMockLogger())
    await expect(client.transcribe(Buffer.from('x'), 'audio/webm')).rejects.toBeInstanceOf(
      TranscriptionBackendUnavailableError,
    )
  })
})
