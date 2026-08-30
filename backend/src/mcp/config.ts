// MCP configuration loader — Zod-validated, env-var-driven

import { z } from 'zod'
import type { IConfigService } from '../config/index.js'

// --- Zod Schema ---

const McpConfigSchema = z.object({
  maxFileSize: z.number().int().positive(),
  rateLimit: z.number().int().min(1).default(60),
  maxTokensPerUser: z.literal(10),
})

// --- Types ---

/** MCP module configuration. */
export interface McpConfig {
  /**
   * Maximum file size in bytes for MCP reads and writes — raw bytes, before
   * base64 encoding inflates a binary payload by ~4/3.
   * Env: SLATEBASE_MCP_MAX_FILE_SIZE, default: config file `mcp.maxFileSize` (16 MB).
   */
  maxFileSize: number
  /** Maximum MCP requests per minute per token. Env: SLATEBASE_MCP_RATE_LIMIT, default: config file `mcp.rateLimit` (60). */
  rateLimit: number
  /** Maximum number of active API tokens per user. Fixed: 10. */
  maxTokensPerUser: 10
}

// --- Loader ---

/**
 * Load MCP configuration: environment variables win, otherwise the `mcp`
 * section of the server config file applies (16 MB / 60 requests per minute by
 * default). Uses Zod for validation and type coercion.
 *
 * The file size limit is deliberately independent of the server-wide
 * `maxFileSize`: that one guards text files loaded into the editor, while MCP
 * also serves binary attachments, which are typically larger.
 *
 * Note: The MCP enabled/disabled toggle is now managed by the FeatureToggleService
 * via `isEnabled('mcp')`. This loader only handles MCP-specific operational settings.
 *
 * @param configService - The server config service (provides the `mcp` section defaults)
 * @returns Validated MCP configuration
 */
export function loadMcpConfig(configService: IConfigService): McpConfig {
  const mcpSection = configService.getServerConfig().mcp

  const raw: Record<string, unknown> = {
    maxFileSize: parsePositiveInt(process.env['SLATEBASE_MCP_MAX_FILE_SIZE'], mcpSection.maxFileSize),
    rateLimit: parsePositiveInt(process.env['SLATEBASE_MCP_RATE_LIMIT'], mcpSection.rateLimit),
    maxTokensPerUser: 10,
  }

  return McpConfigSchema.parse(raw)
}

// --- Helpers ---

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
