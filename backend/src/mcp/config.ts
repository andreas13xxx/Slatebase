// MCP configuration loader — Zod-validated, env-var-driven

import { z } from 'zod'
import type { IConfigService } from '../config/index.js'

// --- Zod Schema ---

const McpConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxFileSize: z.number().int().positive(),
  rateLimit: z.number().int().min(1).default(60),
  maxTokensPerUser: z.literal(10),
})

// --- Types ---

/** MCP module configuration. */
export interface McpConfig {
  /** Whether the MCP server is enabled. Env: SLATEBASE_MCP_ENABLED, default: true. */
  enabled: boolean
  /** Maximum file size in bytes for MCP reads. Env: SLATEBASE_MCP_MAX_FILE_SIZE, default: from server config maxFileSize. */
  maxFileSize: number
  /** Maximum MCP requests per minute per token. Env: SLATEBASE_MCP_RATE_LIMIT, default: 60. */
  rateLimit: number
  /** Maximum number of active API tokens per user. Fixed: 10. */
  maxTokensPerUser: 10
}

// --- Loader ---

/**
 * Load MCP configuration from environment variables with fallback to server config defaults.
 * Uses Zod for validation and type coercion.
 *
 * @param configService - The server config service (provides maxFileSize default)
 * @returns Validated MCP configuration
 */
export function loadMcpConfig(configService: IConfigService): McpConfig {
  const serverConfig = configService.getServerConfig()

  const raw: Record<string, unknown> = {
    enabled: parseBoolean(process.env['SLATEBASE_MCP_ENABLED'], true),
    maxFileSize: parsePositiveInt(process.env['SLATEBASE_MCP_MAX_FILE_SIZE'], serverConfig.maxFileSize),
    rateLimit: parsePositiveInt(process.env['SLATEBASE_MCP_RATE_LIMIT'], 60),
    maxTokensPerUser: 10,
  }

  return McpConfigSchema.parse(raw)
}

// --- Helpers ---

/**
 * Parse a string env var as boolean. Accepts "true"/"1" as true, "false"/"0" as false.
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue
  const lower = value.toLowerCase().trim()
  if (lower === 'true' || lower === '1') return true
  if (lower === 'false' || lower === '0') return false
  return defaultValue
}

/**
 * Parse a string env var as a positive integer.
 */
function parsePositiveInt(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') return defaultValue
  const parsed = Number(value)
  if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed < 1 || !Number.isInteger(parsed)) {
    return defaultValue
  }
  return parsed
}
