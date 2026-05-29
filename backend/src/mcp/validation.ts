import { z } from 'zod'

// ─── MCP Validation Schemas ──────────────────────────────────────────────────

/**
 * Schema for validating token creation request body.
 * Name must be 1–64 characters, expiryDays must be 7–365.
 */
export const createTokenSchema = z.object({
  name: z.string()
    .min(1, 'Token name must not be empty')
    .max(64, 'Token name must not exceed 64 characters'),
  expiryDays: z.number()
    .int('Expiry days must be an integer')
    .min(7, 'Expiry must be at least 7 days')
    .max(365, 'Expiry must not exceed 365 days'),
})

/**
 * Schema for validating the `vaultId` parameter used in MCP tools.
 */
export const vaultIdParamSchema = z.object({
  vaultId: z.string().min(1, 'vaultId is required'),
})

/**
 * Schema for validating `get_vault_structure` tool parameters.
 */
export const getVaultStructureParamsSchema = z.object({
  vaultId: z.string().min(1, 'vaultId is required'),
})

/**
 * Schema for validating `search_vault` tool parameters.
 * Query must be 1–500 characters, maxResults defaults to 20 (range: 1–100).
 */
export const searchVaultParamsSchema = z.object({
  vaultId: z.string().min(1, 'vaultId is required'),
  query: z.string()
    .min(1, 'Search query must not be empty')
    .max(500, 'Search query must not exceed 500 characters')
    .refine(
      (s) => s.trim().length > 0,
      { message: 'Search query must not be empty or whitespace-only' }
    ),
  maxResults: z.number()
    .int('maxResults must be an integer')
    .min(1, 'maxResults must be at least 1')
    .max(100, 'maxResults must not exceed 100')
    .default(20),
})

/**
 * Schema for validating `read_file` tool parameters.
 */
export const readFileParamsSchema = z.object({
  vaultId: z.string().min(1, 'vaultId is required'),
  path: z.string().min(1, 'File path is required'),
})

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type CreateTokenInput = z.infer<typeof createTokenSchema>
export type VaultIdParam = z.infer<typeof vaultIdParamSchema>
export type GetVaultStructureParams = z.infer<typeof getVaultStructureParamsSchema>
export type SearchVaultParams = z.infer<typeof searchVaultParamsSchema>
export type ReadFileParams = z.infer<typeof readFileParamsSchema>
