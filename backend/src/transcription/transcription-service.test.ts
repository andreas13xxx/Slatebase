import { describe, it, expect, vi } from 'vitest'
import { TranscriptionService } from './transcription-service.js'
import { AudioTooLargeError, TranscriptionNotConfiguredError } from './errors.js'
import type { IWhisperClient, TranscriptionConfig, TranscriptionResult } from './types.js'

function createMockClient(result: TranscriptionResult = { text: 'ok' }): IWhisperClient & {
  transcribe: ReturnType<typeof vi.fn>
} {
  return { transcribe: vi.fn().mockResolvedValue(result) }
}

function createConfig(overrides: Partial<TranscriptionConfig> = {}): TranscriptionConfig {
  return {
    backendUrl: 'http://whisper.test/asr',
    timeoutMs: 5000,
    maxAudioBytes: 1000,
    supportedLanguages: ['de', 'en'],
    ...overrides,
  }
}

describe('TranscriptionService', () => {
  describe('isConfigured', () => {
    it('is true when a backend URL is set', () => {
      const service = new TranscriptionService(createConfig(), () => createMockClient())
      expect(service.isConfigured()).toBe(true)
    })

    it('is false when the backend URL is undefined', () => {
      const service = new TranscriptionService(createConfig({ backendUrl: undefined }), () => createMockClient())
      expect(service.isConfigured()).toBe(false)
    })

    it('is false when the backend URL is an empty string', () => {
      const service = new TranscriptionService(createConfig({ backendUrl: '' }), () => createMockClient())
      expect(service.isConfigured()).toBe(false)
    })
  })

  describe('getSupportedLanguages', () => {
    it('returns the configured languages as a copy', () => {
      const config = createConfig({ supportedLanguages: ['de', 'en', 'fr'] })
      const service = new TranscriptionService(config, () => createMockClient())
      const langs = service.getSupportedLanguages()
      expect(langs).toEqual(['de', 'en', 'fr'])
      langs.push('xx')
      expect(service.getSupportedLanguages()).toEqual(['de', 'en', 'fr'])
    })
  })

  describe('transcribe', () => {
    it('throws TranscriptionNotConfiguredError without a backend URL, without calling the client', async () => {
      const client = createMockClient()
      const service = new TranscriptionService(createConfig({ backendUrl: undefined }), () => client)
      await expect(service.transcribe({ audio: Buffer.from('x'), contentType: 'audio/webm' })).rejects.toBeInstanceOf(
        TranscriptionNotConfiguredError,
      )
      expect(client.transcribe).not.toHaveBeenCalled()
    })

    it('throws AudioTooLargeError when the audio exceeds the limit, without calling the client', async () => {
      const client = createMockClient()
      const service = new TranscriptionService(createConfig({ maxAudioBytes: 4 }), () => client)
      await expect(
        service.transcribe({ audio: Buffer.from('too long'), contentType: 'audio/webm' }),
      ).rejects.toBeInstanceOf(AudioTooLargeError)
      expect(client.transcribe).not.toHaveBeenCalled()
    })

    it('allows audio exactly at the limit', async () => {
      const client = createMockClient({ text: 'edge' })
      const service = new TranscriptionService(createConfig({ maxAudioBytes: 4 }), () => client)
      const result = await service.transcribe({ audio: Buffer.from('abcd'), contentType: 'audio/webm' })
      expect(result.text).toBe('edge')
    })

    it('forwards audio, content type and language to the client', async () => {
      const client = createMockClient({ text: 'hallo' })
      const service = new TranscriptionService(createConfig(), () => client)
      const audio = Buffer.from('sound')
      await service.transcribe({ audio, contentType: 'audio/ogg', language: 'de' })
      expect(client.transcribe).toHaveBeenCalledWith(audio, 'audio/ogg', 'de')
    })

    it('passes undefined language through (auto-detect)', async () => {
      const client = createMockClient()
      const service = new TranscriptionService(createConfig(), () => client)
      await service.transcribe({ audio: Buffer.from('x'), contentType: 'audio/webm' })
      expect(client.transcribe).toHaveBeenCalledWith(expect.any(Buffer), 'audio/webm', undefined)
    })

    it('returns the client result', async () => {
      const client = createMockClient({ text: 'result text', detectedLanguage: 'en' })
      const service = new TranscriptionService(createConfig(), () => client)
      const result = await service.transcribe({ audio: Buffer.from('x'), contentType: 'audio/webm' })
      expect(result).toEqual({ text: 'result text', detectedLanguage: 'en' })
    })

    it('creates the client once and reuses it across calls', async () => {
      const client = createMockClient()
      const factory = vi.fn().mockReturnValue(client)
      const service = new TranscriptionService(createConfig(), factory)
      await service.transcribe({ audio: Buffer.from('a'), contentType: 'audio/webm' })
      await service.transcribe({ audio: Buffer.from('b'), contentType: 'audio/webm' })
      expect(factory).toHaveBeenCalledOnce()
      expect(client.transcribe).toHaveBeenCalledTimes(2)
    })

    it('propagates a client error', async () => {
      const client: IWhisperClient = { transcribe: vi.fn().mockRejectedValue(new Error('backend boom')) }
      const service = new TranscriptionService(createConfig(), () => client)
      await expect(service.transcribe({ audio: Buffer.from('x'), contentType: 'audio/webm' })).rejects.toThrow(
        'backend boom',
      )
    })
  })
})
