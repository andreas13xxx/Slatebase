import { describe, it, expect, afterEach } from 'vitest'
import { ConfigService } from './index.js'

const ENV_KEYS = [
  'SLATEBASE_PORT',
  'SLATEBASE_HOST',
  'SLATEBASE_LOG_LEVEL',
  'SLATEBASE_VAULT_PATHS',
  'SLATEBASE_MAX_FILE_SIZE',
  'SLATEBASE_ALLOWED_ORIGINS',
  'SLATEBASE_DATA_DIR',
  'SLATEBASE_TEMPLATES_DIR',
  'SLATEBASE_MAX_IMPORT_FILE_SIZE',
  'SLATEBASE_MAX_IMPORT_FILES',
  'SLATEBASE_MAX_IMPORT_DEPTH',
  'SLATEBASE_TRUSTED_PROXIES',
  'SLATEBASE_SESSION_DURATION_HOURS',
  'SLATEBASE_SESSION_MAX_LIFETIME_DAYS',
  'SLATEBASE_SSE_MAX_CONNECTIONS',
  'SLATEBASE_SSE_MAX_PER_USER',
  'SLATEBASE_SSE_HEARTBEAT_INTERVAL',
  'SLATEBASE_SSE_REPLAY_BUFFER_SIZE',
  'SLATEBASE_SSE_REPLAY_TTL',
  'SLATEBASE_SSE_BATCH_WINDOW',
  'SLATEBASE_SSE_BATCH_MAX',
] as const

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
})

describe('ConfigService', () => {
  describe('defaults from backend/config/default.json', () => {
    it('exposes the server config as loaded from the config file', () => {
      const config = new ConfigService()
      const server = config.getServerConfig()

      expect(server.port).toBe(3000)
      expect(server.host).toBe('127.0.0.1')
      expect(server.logLevel).toBe('info')
      expect(server.maxFileSize).toBe(5242880)
      expect(server.allowedOrigins).toEqual(['http://localhost:5173'])
      expect(server.dataDir).toBe('./data')
    })

    it('returns the configured vaults', () => {
      const config = new ConfigService()
      expect(config.getVaultConfigs()).toEqual([{ path: '/path/to/vault' }])
    })

    it('returns the features config', () => {
      const config = new ConfigService()
      const features = config.getFeaturesConfig()
      expect(features['chat']).toEqual({ enabled: true })
      expect(features['mcp']).toEqual({ enabled: true })
    })

    it('returns sse config with schema defaults (not set in default.json)', () => {
      const config = new ConfigService()
      const sse = config.getSseConfig()
      expect(sse.maxConnections).toBe(1000)
      expect(sse.maxPerUser).toBe(3)
      expect(sse.heartbeatInterval).toBe(30000)
      expect(sse.replayBufferSize).toBe(100)
      expect(sse.replayTtl).toBe(300000)
      expect(sse.batchWindow).toBe(100)
      expect(sse.batchMax).toBe(20)
    })

    it('returns trash config from the config file', () => {
      const config = new ConfigService()
      expect(config.getTrashConfig()).toEqual({ retentionDays: 30 })
    })

    it('returns versions config from the config file', () => {
      const config = new ConfigService()
      expect(config.getVersionsConfig()).toEqual({ maxPerFile: 20 })
    })

    it('returns cleanup config from the config file', () => {
      const config = new ConfigService()
      expect(config.getCleanupConfig()).toEqual({ intervalHours: 24 })
    })

    it('returns templates config from the config file', () => {
      const config = new ConfigService()
      expect(config.getTemplatesConfig()).toEqual({ directory: 'Templates' })
    })

    it('returns upload config from the config file', () => {
      const config = new ConfigService()
      expect(config.getUploadConfig()).toEqual({
        maxFileSizeBytes: 104857600,
        maxFilesPerDrop: 50,
        maxImagePasteSize: 10485760,
      })
    })

    it('returns welcome vault config from the config file', () => {
      const config = new ConfigService()
      expect(config.getWelcomeVaultConfig()).toEqual({
        name: { de: 'Willkommen', en: 'Welcome' },
      })
    })
  })

  describe('environment variable overlay', () => {
    it('overrides port, host, and logLevel', () => {
      process.env['SLATEBASE_PORT'] = '4000'
      process.env['SLATEBASE_HOST'] = '0.0.0.0'
      process.env['SLATEBASE_LOG_LEVEL'] = 'debug'

      const server = new ConfigService().getServerConfig()
      expect(server.port).toBe(4000)
      expect(server.host).toBe('0.0.0.0')
      expect(server.logLevel).toBe('debug')
    })

    it('parses a comma-separated vault path list, trimming whitespace and dropping empties', () => {
      process.env['SLATEBASE_VAULT_PATHS'] = ' /vault/a ,/vault/b,, /vault/c'

      const vaults = new ConfigService().getVaultConfigs()
      expect(vaults).toEqual([
        { path: '/vault/a' },
        { path: '/vault/b' },
        { path: '/vault/c' },
      ])
    })

    it('overrides maxFileSize, allowedOrigins, dataDir, and templatesDir', () => {
      process.env['SLATEBASE_MAX_FILE_SIZE'] = '999'
      process.env['SLATEBASE_ALLOWED_ORIGINS'] = 'https://a.test, https://b.test'
      process.env['SLATEBASE_DATA_DIR'] = '/custom/data'
      process.env['SLATEBASE_TEMPLATES_DIR'] = '/custom/templates'

      const server = new ConfigService().getServerConfig()
      expect(server.maxFileSize).toBe(999)
      expect(server.allowedOrigins).toEqual(['https://a.test', 'https://b.test'])
      expect(server.dataDir).toBe('/custom/data')
      expect(server.templatesDir).toBe('/custom/templates')
    })

    it('overrides import limits', () => {
      process.env['SLATEBASE_MAX_IMPORT_FILE_SIZE'] = '111'
      process.env['SLATEBASE_MAX_IMPORT_FILES'] = '222'
      process.env['SLATEBASE_MAX_IMPORT_DEPTH'] = '3'

      const server = new ConfigService().getServerConfig()
      expect(server.maxImportFileSize).toBe(111)
      expect(server.maxImportFiles).toBe(222)
      expect(server.maxImportDepth).toBe(3)
    })

    it('parses a comma-separated trusted proxies list', () => {
      process.env['SLATEBASE_TRUSTED_PROXIES'] = '10.0.0.1, 10.0.0.2'

      const server = new ConfigService().getServerConfig()
      expect(server.trustedProxies).toEqual(['10.0.0.1', '10.0.0.2'])
    })

    it('overrides session duration settings', () => {
      process.env['SLATEBASE_SESSION_DURATION_HOURS'] = '12'
      process.env['SLATEBASE_SESSION_MAX_LIFETIME_DAYS'] = '14'

      const server = new ConfigService().getServerConfig()
      expect(server.sessionDurationHours).toBe(12)
      expect(server.sessionMaxLifetimeDays).toBe(14)
    })

    it('overrides sse config only for the provided fields', () => {
      process.env['SLATEBASE_SSE_MAX_CONNECTIONS'] = '50'
      process.env['SLATEBASE_SSE_MAX_PER_USER'] = '2'
      process.env['SLATEBASE_SSE_HEARTBEAT_INTERVAL'] = '5000'
      process.env['SLATEBASE_SSE_REPLAY_BUFFER_SIZE'] = '10'
      process.env['SLATEBASE_SSE_REPLAY_TTL'] = '60000'
      process.env['SLATEBASE_SSE_BATCH_WINDOW'] = '25'
      process.env['SLATEBASE_SSE_BATCH_MAX'] = '5'

      const sse = new ConfigService().getSseConfig()
      expect(sse).toEqual({
        maxConnections: 50,
        maxPerUser: 2,
        heartbeatInterval: 5000,
        replayBufferSize: 10,
        replayTtl: 60000,
        batchWindow: 25,
        batchMax: 5,
      })
    })

    it('leaves sse config at defaults when no SSE env vars are set', () => {
      process.env['SLATEBASE_PORT'] = '4001'
      const sse = new ConfigService().getSseConfig()
      expect(sse.maxConnections).toBe(1000)
    })
  })
})
