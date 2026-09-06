import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadTranscriptionConfig } from './config.js'
import type { IConfigService, ServerConfig } from '../config/index.js'

function createMockConfigService(overrides: Partial<ServerConfig> = {}): IConfigService {
  const config: ServerConfig = {
    port: 3000,
    host: '127.0.0.1',
    logLevel: 'info',
    vaults: [],
    maxFileSize: 5242880,
    maxDirectoryDepth: 50,
    maxVaultsPerUser: 50,
    allowedOrigins: ['http://localhost:5173'],
    dataDir: './data',
    templatesDir: './assets/templates',
    maxImportFileSize: 524288000,
    maxImportFiles: 500,
    maxImportDepth: 10,
    trustedProxies: [],
    sessionDurationHours: 24,
    sessionMaxLifetimeDays: 7,
    features: {},
    mcp: { maxFileSize: 16777216, rateLimit: 60 },
    transcription: { timeoutMs: 120000, maxAudioBytes: 26214400, supportedLanguages: ['de', 'en'] },
    sse: { maxConnections: 1000, maxPerUser: 3, heartbeatInterval: 30000, replayBufferSize: 100, replayTtl: 300000, batchWindow: 100, batchMax: 20 },
    trash: { retentionDays: 30 },
    versions: { maxPerFile: 20 },
    cleanup: { intervalHours: 24 },
    templates: { directory: 'Templates' },
    upload: { maxFileSizeBytes: 104857600, maxFilesPerDrop: 50, maxImagePasteSize: 10485760 },
    welcomeVault: { name: { de: 'Willkommen', en: 'Welcome' } },
    ...overrides,
  }
  return {
    getServerConfig: () => config,
    getVaultConfigs: () => config.vaults,
    getFeaturesConfig: () => ({}),
    getSseConfig: () => config.sse,
    getTranscriptionConfig: () => config.transcription,
    getTrashConfig: () => config.trash,
    getVersionsConfig: () => config.versions,
    getCleanupConfig: () => config.cleanup,
    getTemplatesConfig: () => config.templates,
    getUploadConfig: () => config.upload,
    getWelcomeVaultConfig: () => config.welcomeVault,
    getOverrides: () => ({}),
    updateOverrides: async () => [],
  }
}

describe('loadTranscriptionConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env['SLATEBASE_TRANSCRIPTION_BACKEND_URL']
    delete process.env['SLATEBASE_TRANSCRIPTION_TIMEOUT_MS']
    delete process.env['SLATEBASE_TRANSCRIPTION_MAX_AUDIO_MB']
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('backendUrl (env-only)', () => {
    it('is undefined when the env var is not set — feature stays functionally off', () => {
      const config = loadTranscriptionConfig(createMockConfigService())
      expect(config.backendUrl).toBeUndefined()
    })

    it('reads SLATEBASE_TRANSCRIPTION_BACKEND_URL from env', () => {
      process.env['SLATEBASE_TRANSCRIPTION_BACKEND_URL'] = 'http://whisper:9000/asr'
      const config = loadTranscriptionConfig(createMockConfigService())
      expect(config.backendUrl).toBe('http://whisper:9000/asr')
    })

    it('treats an empty/whitespace env var as not configured', () => {
      process.env['SLATEBASE_TRANSCRIPTION_BACKEND_URL'] = '   '
      const config = loadTranscriptionConfig(createMockConfigService())
      expect(config.backendUrl).toBeUndefined()
    })

    it('rejects a non-URL backend value', () => {
      process.env['SLATEBASE_TRANSCRIPTION_BACKEND_URL'] = 'not a url'
      expect(() => loadTranscriptionConfig(createMockConfigService())).toThrow()
    })
  })

  describe('timeoutMs', () => {
    it('defaults from the config-file section', () => {
      const config = loadTranscriptionConfig(createMockConfigService())
      expect(config.timeoutMs).toBe(120000)
    })

    it('uses the transcription section of the config file as default', () => {
      const config = loadTranscriptionConfig(
        createMockConfigService({ transcription: { timeoutMs: 300000, maxAudioBytes: 26214400, supportedLanguages: ['de', 'en'] } }),
      )
      expect(config.timeoutMs).toBe(300000)
    })

    it('reads SLATEBASE_TRANSCRIPTION_TIMEOUT_MS from env', () => {
      process.env['SLATEBASE_TRANSCRIPTION_TIMEOUT_MS'] = '90000'
      const config = loadTranscriptionConfig(createMockConfigService())
      expect(config.timeoutMs).toBe(90000)
    })

    it('falls back to the config value for an invalid env timeout', () => {
      process.env['SLATEBASE_TRANSCRIPTION_TIMEOUT_MS'] = 'nope'
      const config = loadTranscriptionConfig(
        createMockConfigService({ transcription: { timeoutMs: 60000, maxAudioBytes: 26214400, supportedLanguages: ['de'] } }),
      )
      expect(config.timeoutMs).toBe(60000)
    })

    it('falls back for a non-positive env timeout', () => {
      process.env['SLATEBASE_TRANSCRIPTION_TIMEOUT_MS'] = '0'
      const config = loadTranscriptionConfig(createMockConfigService())
      expect(config.timeoutMs).toBe(120000)
    })
  })

  describe('maxAudioBytes (env in MB, config in bytes)', () => {
    it('defaults from the config-file section', () => {
      const config = loadTranscriptionConfig(createMockConfigService())
      expect(config.maxAudioBytes).toBe(26214400)
    })

    it('converts SLATEBASE_TRANSCRIPTION_MAX_AUDIO_MB to bytes', () => {
      process.env['SLATEBASE_TRANSCRIPTION_MAX_AUDIO_MB'] = '10'
      const config = loadTranscriptionConfig(createMockConfigService())
      expect(config.maxAudioBytes).toBe(10 * 1024 * 1024)
    })

    it('accepts fractional megabytes', () => {
      process.env['SLATEBASE_TRANSCRIPTION_MAX_AUDIO_MB'] = '0.5'
      const config = loadTranscriptionConfig(createMockConfigService())
      expect(config.maxAudioBytes).toBe(Math.floor(0.5 * 1024 * 1024))
    })

    it('falls back to the config value for an invalid env MB value', () => {
      process.env['SLATEBASE_TRANSCRIPTION_MAX_AUDIO_MB'] = '-5'
      const config = loadTranscriptionConfig(createMockConfigService())
      expect(config.maxAudioBytes).toBe(26214400)
    })
  })

  describe('supportedLanguages', () => {
    it('defaults to de + en from the config section', () => {
      const config = loadTranscriptionConfig(createMockConfigService())
      expect(config.supportedLanguages).toEqual(['de', 'en'])
    })

    it('reflects a customized config-section language list', () => {
      const config = loadTranscriptionConfig(
        createMockConfigService({ transcription: { timeoutMs: 120000, maxAudioBytes: 26214400, supportedLanguages: ['de', 'en', 'fr'] } }),
      )
      expect(config.supportedLanguages).toEqual(['de', 'en', 'fr'])
    })
  })
})
