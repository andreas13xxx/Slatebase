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
    maxVaults: 20,
    allowedOrigins: ['http://localhost:5173'],
    dataDir: './data',
    maxImportFileSize: 524288000,
    maxImportFiles: 500,
    maxImportDepth: 10,
    trustedProxies: [],
    features: {},
    ...overrides,
  }
  return {
    getServerConfig: () => config,
    getVaultConfigs: () => config.vaults,
    getFeaturesConfig: () => ({}),
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

    expect(config.maxFileSize).toBe(5242880)
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

  it('uses server config maxFileSize as default', () => {
    const config = loadMcpConfig(createMockConfigService({ maxFileSize: 10485760 }))

    expect(config.maxFileSize).toBe(10485760)
  })

  it('falls back to server default for invalid SLATEBASE_MCP_MAX_FILE_SIZE', () => {
    process.env['SLATEBASE_MCP_MAX_FILE_SIZE'] = 'not-a-number'

    const config = loadMcpConfig(createMockConfigService({ maxFileSize: 2097152 }))

    expect(config.maxFileSize).toBe(2097152)
  })

  it('falls back to server default for negative SLATEBASE_MCP_MAX_FILE_SIZE', () => {
    process.env['SLATEBASE_MCP_MAX_FILE_SIZE'] = '-100'

    const config = loadMcpConfig(createMockConfigService({ maxFileSize: 5242880 }))

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
