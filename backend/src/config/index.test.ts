import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
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

    it('exposes the mcp limits section — 16 MB, above the server-wide maxFileSize', () => {
      const config = new ConfigService()
      const server = config.getServerConfig()

      expect(server.mcp).toEqual({ maxFileSize: 16777216, rateLimit: 60 })
      expect(server.mcp.maxFileSize).toBeGreaterThan(server.maxFileSize)
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

describe('ConfigService — admin overrides', () => {
  let dataDir: string

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'config-overrides-'))
    process.env['SLATEBASE_DATA_DIR'] = dataDir
  })

  afterEach(async () => {
    delete process.env['SLATEBASE_DATA_DIR']
    await rm(dataDir, { recursive: true, force: true })
  })

  it('starts with no overrides', () => {
    const config = new ConfigService()
    expect(config.getOverrides()).toEqual({})
  })

  it('persists an override and applies it to the live config', async () => {
    const config = new ConfigService()
    await config.updateOverrides({ maxVaultsPerUser: 7 })

    expect(config.getServerConfig().maxVaultsPerUser).toBe(7)
    expect(config.getOverrides().maxVaultsPerUser).toBe(7)
  })

  it('reloads persisted overrides on the next start', async () => {
    const first = new ConfigService()
    await first.updateOverrides({ maxVaultsPerUser: 7 })

    const second = new ConfigService()
    expect(second.getServerConfig().maxVaultsPerUser).toBe(7)
  })

  it('merges nested sections instead of replacing them', async () => {
    const config = new ConfigService()
    await config.updateOverrides({
      upload: { maxFileSizeBytes: 123, maxFilesPerDrop: 5, maxImagePasteSize: 99 },
    })
    // A later patch that touches one key must not reset its siblings to the
    // schema defaults — the whole point of the deep merge.
    await config.updateOverrides({
      upload: { maxFileSizeBytes: 456, maxFilesPerDrop: 5, maxImagePasteSize: 99 },
    })

    const upload = config.getUploadConfig()
    expect(upload.maxFileSizeBytes).toBe(456)
    expect(upload.maxFilesPerDrop).toBe(5)
    expect(upload.maxImagePasteSize).toBe(99)
  })

  it('reports keys that an environment variable pins, and keeps the env value', async () => {
    process.env['SLATEBASE_MAX_FILE_SIZE'] = '1234'
    const config = new ConfigService()

    const shadowed = await config.updateOverrides({ maxFileSize: 9999 })

    expect(shadowed).toEqual(['maxFileSize'])
    expect(config.getServerConfig().maxFileSize).toBe(1234)
    // Still recorded, so it takes effect once the variable is removed.
    expect(config.getOverrides().maxFileSize).toBe(9999)
  })

  it('rejects an override that would produce an invalid config', async () => {
    const config = new ConfigService()
    await expect(config.updateOverrides({ port: -1 })).rejects.toThrow()
    expect(config.getServerConfig().port).not.toBe(-1)
  })

  it('ignores an unreadable overrides file rather than failing to start', async () => {
    await writeFile(path.join(dataDir, 'server-config.json'), '{not json', 'utf-8')
    const config = new ConfigService()
    expect(config.getOverrides()).toEqual({})
    expect(config.getServerConfig().port).toBeGreaterThan(0)
  })
})
