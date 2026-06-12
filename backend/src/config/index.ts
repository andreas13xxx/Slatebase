// Config module — Zod-validated configuration service

import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// --- Zod Schema ---

const VaultConfigSchema = z.object({
  path: z.string().min(1),
  name: z.string().max(128).optional(),
})

const FeatureEntrySchema = z.object({
  enabled: z.boolean(),
})

const FeaturesConfigSchema = z.record(z.string(), FeatureEntrySchema).default({})

export const ServerConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().default('127.0.0.1'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  vaults: z.array(VaultConfigSchema).default([]),
  maxFileSize: z.number().int().positive().default(5242880),
  maxDirectoryDepth: z.number().int().positive().default(50),
  maxVaults: z.number().int().positive().default(20),
  allowedOrigins: z.array(z.string()).default(['http://localhost:5173']),
  dataDir: z.string().default('./data'),
  maxImportFileSize: z.number().int().positive().default(524288000),
  maxImportFiles: z.number().int().positive().default(500),
  maxImportDepth: z.number().int().positive().default(10),
  trustedProxies: z.array(z.string()).default([]),
  sessionDurationHours: z.number().positive().default(24),
  sessionMaxLifetimeDays: z.number().positive().default(7),
  features: FeaturesConfigSchema,
})

// --- Types ---

export type ServerConfig = z.infer<typeof ServerConfigSchema>
export type VaultConfig = z.infer<typeof VaultConfigSchema>

// --- Interface ---

export interface IConfigService {
  getServerConfig(): ServerConfig
  getVaultConfigs(): VaultConfig[]
  /** Returns the features configuration section (feature name → { enabled }) */
  getFeaturesConfig(): Record<string, { enabled: boolean }>
}

// --- Implementation ---

export class ConfigService implements IConfigService {
  private readonly config: ServerConfig

  constructor() {
    const fileConfig = this.loadConfigFile()
    const envOverlay = this.loadEnvOverlay()
    const merged = { ...fileConfig, ...envOverlay }
    this.config = ServerConfigSchema.parse(merged)
  }

  getServerConfig(): ServerConfig {
    return this.config
  }

  getVaultConfigs(): VaultConfig[] {
    return this.config.vaults
  }

  getFeaturesConfig(): Record<string, { enabled: boolean }> {
    return this.config.features
  }

  private loadConfigFile(): Record<string, unknown> {
    try {
      const __filename = fileURLToPath(import.meta.url)
      const __dirname = dirname(__filename)
      const configPath = resolve(__dirname, '../../config/default.json')
      const raw = readFileSync(configPath, 'utf-8')
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      // If config file doesn't exist or is unreadable, return empty object
      // Zod defaults will apply
      return {}
    }
  }

  private loadEnvOverlay(): Record<string, unknown> {
    const overlay: Record<string, unknown> = {}

    if (process.env['SLATEBASE_PORT'] !== undefined) {
      overlay['port'] = Number(process.env['SLATEBASE_PORT'])
    }

    if (process.env['SLATEBASE_HOST'] !== undefined) {
      overlay['host'] = process.env['SLATEBASE_HOST']
    }

    if (process.env['SLATEBASE_LOG_LEVEL'] !== undefined) {
      overlay['logLevel'] = process.env['SLATEBASE_LOG_LEVEL']
    }

    if (process.env['SLATEBASE_VAULT_PATHS'] !== undefined) {
      const paths = process.env['SLATEBASE_VAULT_PATHS']
      overlay['vaults'] = paths
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => ({ path: p }))
    }

    if (process.env['SLATEBASE_MAX_FILE_SIZE'] !== undefined) {
      overlay['maxFileSize'] = Number(process.env['SLATEBASE_MAX_FILE_SIZE'])
    }

    if (process.env['SLATEBASE_ALLOWED_ORIGINS'] !== undefined) {
      const origins = process.env['SLATEBASE_ALLOWED_ORIGINS']
      overlay['allowedOrigins'] = origins
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o.length > 0)
    }

    if (process.env['SLATEBASE_DATA_DIR'] !== undefined) {
      overlay['dataDir'] = process.env['SLATEBASE_DATA_DIR']
    }

    if (process.env['SLATEBASE_MAX_IMPORT_FILE_SIZE'] !== undefined) {
      overlay['maxImportFileSize'] = Number(process.env['SLATEBASE_MAX_IMPORT_FILE_SIZE'])
    }

    if (process.env['SLATEBASE_MAX_IMPORT_FILES'] !== undefined) {
      overlay['maxImportFiles'] = Number(process.env['SLATEBASE_MAX_IMPORT_FILES'])
    }

    if (process.env['SLATEBASE_MAX_IMPORT_DEPTH'] !== undefined) {
      overlay['maxImportDepth'] = Number(process.env['SLATEBASE_MAX_IMPORT_DEPTH'])
    }

    if (process.env['SLATEBASE_TRUSTED_PROXIES'] !== undefined) {
      const proxies = process.env['SLATEBASE_TRUSTED_PROXIES']
      overlay['trustedProxies'] = proxies
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
    }

    if (process.env['SLATEBASE_SESSION_DURATION_HOURS'] !== undefined) {
      overlay['sessionDurationHours'] = Number(process.env['SLATEBASE_SESSION_DURATION_HOURS'])
    }

    if (process.env['SLATEBASE_SESSION_MAX_LIFETIME_DAYS'] !== undefined) {
      overlay['sessionMaxLifetimeDays'] = Number(process.env['SLATEBASE_SESSION_MAX_LIFETIME_DAYS'])
    }

    return overlay
  }
}
