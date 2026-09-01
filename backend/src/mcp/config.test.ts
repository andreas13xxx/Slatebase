import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadMcpConfig } from './config.js'
import type { IConfigService } from '../config/index.js'
import type { ServerConfig } from '../config/index.js'

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

describe('loadMcpConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env['SLATEBASE_MCP_MAX_FILE_SIZE']
    delete process.env['SLATEBASE_MCP_RATE_LIMIT']
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns defaults when no env vars are set', () => {
    const config = loadMcpConfig(createMockConfigService())

    expect(config.maxFileSize).toBe(16777216)
    expect(config.rateLimit).toBe(60)
    expect(config.maxTokensPerUser).toBe(10)
  })

  it('does not have an enabled property', () => {
    const config = loadMcpConfig(createMockConfigService())

    expect('enabled' in config).toBe(false)
  })

  it('reads SLATEBASE_MCP_MAX_FILE_SIZE from env', () => {
    process.env['SLATEBASE_MCP_MAX_FILE_SIZE'] = '1048576'

    const config = loadMcpConfig(createMockConfigService())

    expect(config.maxFileSize).toBe(1048576)
  })

  it('uses the mcp section of the config file as default', () => {
    const config = loadMcpConfig(createMockConfigService({ mcp: { maxFileSize: 10485760, rateLimit: 90 } }))

    expect(config.maxFileSize).toBe(10485760)
    expect(config.rateLimit).toBe(90)
  })

  it('is independent of the server-wide maxFileSize (which only guards editor reads)', () => {
    const config = loadMcpConfig(createMockConfigService({ maxFileSize: 5242880 }))

    expect(config.maxFileSize).toBe(16777216)
  })

  it('falls back to the config file value for invalid SLATEBASE_MCP_MAX_FILE_SIZE', () => {
    process.env['SLATEBASE_MCP_MAX_FILE_SIZE'] = 'not-a-number'

    const config = loadMcpConfig(createMockConfigService({ mcp: { maxFileSize: 2097152, rateLimit: 60 } }))

    expect(config.maxFileSize).toBe(2097152)
  })

  it('falls back to the config file value for negative SLATEBASE_MCP_MAX_FILE_SIZE', () => {
    process.env['SLATEBASE_MCP_MAX_FILE_SIZE'] = '-100'

    const config = loadMcpConfig(createMockConfigService({ mcp: { maxFileSize: 5242880, rateLimit: 60 } }))

    expect(config.maxFileSize).toBe(5242880)
  })

  it('reads SLATEBASE_MCP_RATE_LIMIT from env', () => {
    process.env['SLATEBASE_MCP_RATE_LIMIT'] = '120'

    const config = loadMcpConfig(createMockConfigService())

    expect(config.rateLimit).toBe(120)
  })

  it('falls back to default for invalid SLATEBASE_MCP_RATE_LIMIT', () => {
    process.env['SLATEBASE_MCP_RATE_LIMIT'] = '0'

    const config = loadMcpConfig(createMockConfigService())

    expect(config.rateLimit).toBe(60)
  })

  it('falls back to default for non-integer SLATEBASE_MCP_RATE_LIMIT', () => {
    process.env['SLATEBASE_MCP_RATE_LIMIT'] = '3.5'

    const config = loadMcpConfig(createMockConfigService())

    expect(config.rateLimit).toBe(60)
  })

  it('maxTokensPerUser is always 10', () => {
    const config = loadMcpConfig(createMockConfigService())

    expect(config.maxTokensPerUser).toBe(10)
  })
})
