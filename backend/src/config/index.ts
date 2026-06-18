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

const SseConfigSchema = z.object({
  maxConnections: z.number().int().positive().default(1000),
  maxPerUser: z.number().int().positive().default(3),
  heartbeatInterval: z.number().int().positive().default(30000),
  replayBufferSize: z.number().int().positive().default(100),
  replayTtl: z.number().int().positive().default(300000),
  batchWindow: z.number().int().positive().default(100),
  batchMax: z.number().int().positive().default(20),
})

const TrashConfigSchema = z.object({
  retentionDays: z.number().int().default(30),
})

const VersionsConfigSchema = z.object({
  maxPerFile: z.number().int().default(20),
})

const CleanupConfigSchema = z.object({
  intervalHours: z.number().default(24),
})

const TemplatesConfigSchema = z.object({
  directory: z.string().default('_templates'),
})

const UploadConfigSchema = z.object({
  maxFileSizeBytes: z.number().int().positive().default(104857600),
  maxFilesPerDrop: z.number().int().positive().default(50),
  maxImagePasteSize: z.number().int().positive().default(10485760),
})

const WelcomeVaultConfigSchema = z.object({
  name: z.string().min(1).max(128).default('Willkommen'),
})

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
  sse: SseConfigSchema.default({}),
  trash: TrashConfigSchema.default({}),
  versions: VersionsConfigSchema.default({}),
  cleanup: CleanupConfigSchema.default({}),
  templates: TemplatesConfigSchema.default({}),
  upload: UploadConfigSchema.default({}),
  welcomeVault: WelcomeVaultConfigSchema.default({}),
})

// --- Types ---

export type ServerConfig = z.infer<typeof ServerConfigSchema>
export type VaultConfig = z.infer<typeof VaultConfigSchema>
export type SseConfig = z.infer<typeof SseConfigSchema>
export type TrashConfig = z.infer<typeof TrashConfigSchema>
export type VersionsConfig = z.infer<typeof VersionsConfigSchema>
export type CleanupConfig = z.infer<typeof CleanupConfigSchema>
export type TemplatesConfig = z.infer<typeof TemplatesConfigSchema>
export type UploadConfig = z.infer<typeof UploadConfigSchema>
export type WelcomeVaultConfig = z.infer<typeof WelcomeVaultConfigSchema>

// --- Interface ---

export interface IConfigService {
  getServerConfig(): ServerConfig
  getVaultConfigs(): VaultConfig[]
  /** Returns the features configuration section (feature name → { enabled }) */
  getFeaturesConfig(): Record<string, { enabled: boolean }>
  /** Returns the SSE configuration section */
  getSseConfig(): SseConfig
  /** Returns the trash configuration section */
  getTrashConfig(): TrashConfig
  /** Returns the versions configuration section */
  getVersionsConfig(): VersionsConfig
  /** Returns the cleanup configuration section */
  getCleanupConfig(): CleanupConfig
  /** Returns the templates configuration section */
  getTemplatesConfig(): TemplatesConfig
  /** Returns the upload configuration section */
  getUploadConfig(): UploadConfig
  /** Returns the welcome vault configuration section */
  getWelcomeVaultConfig(): WelcomeVaultConfig
}

// --- Implementation ---

export class ConfigService implements IConfigService {
  private readonly config: ServerConfig

  constructor() {
    const fileConfig = this.loadConfigFile()
    const envOverlay = this.loadEnvOverlay()
    const merged = { ...fileConfig, ...envOverlay }
    this.config = ServerConfigSchema.parse(merged)
    this.validateRanges()
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

  getSseConfig(): SseConfig {
    return this.config.sse
  }

  getTrashConfig(): TrashConfig {
    return this.config.trash
  }

  getVersionsConfig(): VersionsConfig {
    return this.config.versions
  }

  getCleanupConfig(): CleanupConfig {
    return this.config.cleanup
  }

  getTemplatesConfig(): TemplatesConfig {
    return this.config.templates
  }

  getUploadConfig(): UploadConfig {
    return this.config.upload
  }

  getWelcomeVaultConfig(): WelcomeVaultConfig {
    return this.config.welcomeVault
  }

  /**
   * Validates config ranges and falls back to defaults with a warning
   * for out-of-range values. Uses console.warn because ConfigService
   * is instantiated before the Pino logger.
   */
  private validateRanges(): void {
    const { trash, versions, cleanup } = this.config

    if (trash.retentionDays < 0 || trash.retentionDays > 365) {
      console.warn(
        `[config] trash.retentionDays value ${trash.retentionDays} is out of range (0–365), falling back to default 30`
      )
      ;(this.config.trash as { retentionDays: number }).retentionDays = 30
    }

    if (versions.maxPerFile < 0 || versions.maxPerFile > 100) {
      console.warn(
        `[config] versions.maxPerFile value ${versions.maxPerFile} is out of range (0–100), falling back to default 20`
      )
      ;(this.config.versions as { maxPerFile: number }).maxPerFile = 20
    }

    if (cleanup.intervalHours < 1) {
      console.warn(
        `[config] cleanup.intervalHours value ${cleanup.intervalHours} is out of range (≥1), falling back to default 24`
      )
      ;(this.config.cleanup as { intervalHours: number }).intervalHours = 24
    }
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

    const sseOverlay: Record<string, unknown> = {}

    if (process.env['SLATEBASE_SSE_MAX_CONNECTIONS'] !== undefined) {
      sseOverlay['maxConnections'] = parseInt(process.env['SLATEBASE_SSE_MAX_CONNECTIONS'], 10)
    }

    if (process.env['SLATEBASE_SSE_MAX_PER_USER'] !== undefined) {
      sseOverlay['maxPerUser'] = parseInt(process.env['SLATEBASE_SSE_MAX_PER_USER'], 10)
    }

    if (process.env['SLATEBASE_SSE_HEARTBEAT_INTERVAL'] !== undefined) {
      sseOverlay['heartbeatInterval'] = parseInt(process.env['SLATEBASE_SSE_HEARTBEAT_INTERVAL'], 10)
    }

    if (process.env['SLATEBASE_SSE_REPLAY_BUFFER_SIZE'] !== undefined) {
      sseOverlay['replayBufferSize'] = parseInt(process.env['SLATEBASE_SSE_REPLAY_BUFFER_SIZE'], 10)
    }

    if (process.env['SLATEBASE_SSE_REPLAY_TTL'] !== undefined) {
      sseOverlay['replayTtl'] = parseInt(process.env['SLATEBASE_SSE_REPLAY_TTL'], 10)
    }

    if (process.env['SLATEBASE_SSE_BATCH_WINDOW'] !== undefined) {
      sseOverlay['batchWindow'] = parseInt(process.env['SLATEBASE_SSE_BATCH_WINDOW'], 10)
    }

    if (process.env['SLATEBASE_SSE_BATCH_MAX'] !== undefined) {
      sseOverlay['batchMax'] = parseInt(process.env['SLATEBASE_SSE_BATCH_MAX'], 10)
    }

    if (Object.keys(sseOverlay).length > 0) {
      overlay['sse'] = sseOverlay
    }

    return overlay
  }
}
