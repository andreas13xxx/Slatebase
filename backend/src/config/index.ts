// Config module — Zod-validated configuration service

import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { writeJsonFileAtomic } from '../shared/json-file-store.js'
import { resolve, dirname, join, isAbsolute } from 'node:path'
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

/**
 * MCP-specific limits. Separate from the server-wide `maxFileSize`, which
 * guards text files loaded into the editor: MCP also serves binary files
 * (images, PDFs) base64-encoded, and vault attachments are routinely larger
 * than a note — 16 MB covers screenshots and scans with room to spare.
 * Overridable per setting via SLATEBASE_MCP_* environment variables.
 */
const McpLimitsConfigSchema = z.object({
  maxFileSize: z.number().int().positive().default(16777216),
  rateLimit: z.number().int().positive().default(60),
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
  directory: z.string().default('Templates'),
})

const UploadConfigSchema = z.object({
  maxFileSizeBytes: z.number().int().positive().default(104857600),
  maxFilesPerDrop: z.number().int().positive().default(50),
  maxImagePasteSize: z.number().int().positive().default(10485760),
})

const WelcomeVaultConfigSchema = z.object({
  name: z.object({
    de: z.string().min(1).max(128).default('Willkommen'),
    en: z.string().min(1).max(128).default('Welcome'),
  }).prefault({}),
})

export const ServerConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().default('127.0.0.1'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  vaults: z.array(VaultConfigSchema).default([]),
  maxFileSize: z.number().int().positive().default(5242880),
  maxDirectoryDepth: z.number().int().positive().default(50),
  /**
   * Maximum number of vaults a single user may own. Enforced in
   * `BusinessService.createVault`. Instance-wide storage is bounded by the
   * disk, not by a global vault count — the resource a limit can meaningfully
   * protect here is what one account can claim.
   */
  maxVaultsPerUser: z.number().int().positive().default(50),
  allowedOrigins: z.array(z.string()).default(['http://localhost:5173']),
  dataDir: z.string().default('./data'),
  templatesDir: z.string().default('./assets/templates'),
  maxImportFileSize: z.number().int().positive().default(524288000),
  maxImportFiles: z.number().int().positive().default(500),
  maxImportDepth: z.number().int().positive().default(10),
  trustedProxies: z.array(z.string()).default([]),
  sessionDurationHours: z.number().positive().default(24),
  sessionMaxLifetimeDays: z.number().positive().default(7),
  features: FeaturesConfigSchema,
  mcp: McpLimitsConfigSchema.prefault({}),
  sse: SseConfigSchema.prefault({}),
  trash: TrashConfigSchema.prefault({}),
  versions: VersionsConfigSchema.prefault({}),
  cleanup: CleanupConfigSchema.prefault({}),
  templates: TemplatesConfigSchema.prefault({}),
  upload: UploadConfigSchema.prefault({}),
  welcomeVault: WelcomeVaultConfigSchema.prefault({}),
})

// --- Types ---

export type ServerConfig = z.infer<typeof ServerConfigSchema>
export type VaultConfig = z.infer<typeof VaultConfigSchema>
export type McpLimitsConfig = z.infer<typeof McpLimitsConfigSchema>
export type SseConfig = z.infer<typeof SseConfigSchema>
export type TrashConfig = z.infer<typeof TrashConfigSchema>
export type VersionsConfig = z.infer<typeof VersionsConfigSchema>
export type CleanupConfig = z.infer<typeof CleanupConfigSchema>
export type TemplatesConfig = z.infer<typeof TemplatesConfigSchema>
export type UploadConfig = z.infer<typeof UploadConfigSchema>
export type WelcomeVaultConfig = z.infer<typeof WelcomeVaultConfigSchema>

// --- Interface ---

/**
 * The subset of server settings an admin may change at runtime through
 * `PUT /admin/config`. Everything else (data directory, vault paths, secrets,
 * trusted proxies) stays file- or environment-only: those decide where the
 * process reads and writes, and an HTTP endpoint is the wrong place to move
 * them.
 */
export type OverridableConfigKey =
  | 'port'
  | 'host'
  | 'logLevel'
  | 'allowedOrigins'
  | 'maxFileSize'
  | 'maxDirectoryDepth'
  | 'maxVaultsPerUser'
  | 'maxImportFileSize'
  | 'maxImportFiles'
  | 'maxImportDepth'
  | 'trash'
  | 'versions'
  | 'cleanup'
  | 'upload'
  | 'mcp'

/**
 * Each key is typed `| undefined` rather than merely optional: under
 * `exactOptionalPropertyTypes` the Zod-inferred request body carries explicit
 * `undefined` for absent optional fields, and a plain `Partial<>` would reject it.
 */
export type ServerConfigOverrides = {
  [K in OverridableConfigKey]?: ServerConfig[K] | undefined
}

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
  /** Returns the admin-set runtime overrides currently persisted on disk. */
  getOverrides(): ServerConfigOverrides
  /**
   * Merges `overrides` into the persisted admin overrides, writes them to
   * `<dataDir>/server-config.json`, and applies them to the live config.
   *
   * Values still under an environment variable keep the environment value —
   * the env layer wins by design, so the caller is told which keys did not
   * take effect rather than the UI silently showing a value the process does
   * not use.
   *
   * @returns The keys whose new value is shadowed by an environment variable.
   */
  updateOverrides(overrides: ServerConfigOverrides): Promise<string[]>
}

// --- Merge Helpers ---

/** True for plain objects — the only values `deepMerge` recurses into. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Recursively merges `overlay` over `base`, one nested level of config
 * sections at a time. A shallow spread would drop sibling keys: an admin
 * setting only `upload.maxFilesPerDrop` would otherwise erase
 * `upload.maxFileSizeBytes` back to its schema default. Arrays are replaced
 * wholesale — `allowedOrigins` is a value, not a set to union.
 */
function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) continue
    const existing = result[key]
    result[key] = isPlainObject(existing) && isPlainObject(value)
      ? deepMerge(existing, value)
      : value
  }
  return result
}

/**
 * Resolves where the admin overrides file lives, honouring a `dataDir` set in
 * the config file or the environment before the full config exists.
 */
function resolveOverridesPath(
  fileConfig: Record<string, unknown>,
  envOverlay: Record<string, unknown>,
): string {
  const raw = envOverlay['dataDir'] ?? fileConfig['dataDir']
  const dataDir = typeof raw === 'string' && raw.length > 0 ? raw : './data'
  const base = isAbsolute(dataDir) ? dataDir : resolve(process.cwd(), dataDir)
  return join(base, 'server-config.json')
}

// --- Implementation ---

export class ConfigService implements IConfigService {
  private config: ServerConfig
  private readonly fileConfig: Record<string, unknown>
  private readonly envOverlay: Record<string, unknown>
  private overrides: ServerConfigOverrides
  private readonly overridesPath: string

  constructor() {
    this.fileConfig = this.loadConfigFile()
    this.envOverlay = this.loadEnvOverlay()

    // The overrides live inside the data directory, whose location is itself a
    // config value — so resolve the file/env layers first, then read them.
    this.overridesPath = resolveOverridesPath(this.fileConfig, this.envOverlay)
    this.overrides = this.loadOverridesFile()

    this.config = this.buildConfig()
    this.validateRanges()
  }

  getServerConfig(): ServerConfig {
    return this.config
  }

  getOverrides(): ServerConfigOverrides {
    return structuredClone(this.overrides)
  }

  async updateOverrides(overrides: ServerConfigOverrides): Promise<string[]> {
    const next = deepMerge(
      this.overrides as Record<string, unknown>,
      overrides as Record<string, unknown>,
    ) as ServerConfigOverrides

    // Validate the *result* before persisting, so a bad partial can never be
    // written and leave the next start-up parsing a broken file.
    ServerConfigSchema.parse(deepMerge(this.fileConfig, next as Record<string, unknown>))

    await writeJsonFileAtomic(this.overridesPath, next)
    this.overrides = next
    this.config = this.buildConfig()
    this.validateRanges()

    return Object.keys(overrides).filter((key) => key in this.envOverlay)
  }

  /**
   * Layers the three sources in precedence order: the shipped config file,
   * then the admin's runtime overrides, then the environment. The environment
   * wins last so a deployment can pin a value that no admin can move — the
   * same order the feature toggles use.
   */
  private buildConfig(): ServerConfig {
    const merged = deepMerge(
      deepMerge(this.fileConfig, this.overrides as Record<string, unknown>),
      this.envOverlay,
    )
    return ServerConfigSchema.parse(merged)
  }

  private loadOverridesFile(): ServerConfigOverrides {
    try {
      const raw = readFileSync(this.overridesPath, 'utf-8')
      return JSON.parse(raw) as ServerConfigOverrides
    } catch {
      // Absent on first run; unreadable or corrupt means the shipped config
      // still starts the server rather than blocking it.
      return {}
    }
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

    if (process.env['SLATEBASE_TEMPLATES_DIR'] !== undefined) {
      overlay['templatesDir'] = process.env['SLATEBASE_TEMPLATES_DIR']
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
