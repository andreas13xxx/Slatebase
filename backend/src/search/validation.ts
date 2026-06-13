import { z } from 'zod'

// ─── Search Validation Schemas ───────────────────────────────────────────────

/**
 * Schema for validating single-vault search query parameters.
 * Query params come as strings from HTTP, so booleans use z.coerce.boolean()
 * and numbers use z.coerce.number().
 */
export const searchQuerySchema = z.object({
  query: z
    .string()
    .min(1, 'Query must be at least 1 character')
    .max(500, 'Query must not exceed 500 characters')
    .refine(
      (s) => s.trim().length > 0,
      { message: 'Query must not be whitespace-only' },
    ),
  caseSensitive: z.coerce.boolean().default(false),
  regex: z.coerce.boolean().default(false),
  contextLines: z.coerce.number().int().min(0).max(10).default(2),
  maxResults: z.coerce.number().int().min(1).max(500).default(500),
})

/**
 * Schema for validating multi-vault search query parameters.
 * Extends searchQuerySchema with an optional vaultIds parameter
 * (comma-separated string, max 20 IDs when split).
 */
export const multiVaultSearchSchema = searchQuerySchema.extend({
  vaultIds: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (val === undefined || val === '') return true
        const ids = val.split(',').map((id) => id.trim()).filter((id) => id.length > 0)
        return ids.length <= 20
      },
      { message: 'Maximum 20 vault IDs allowed' },
    ),
})

/**
 * Schema for validating the replace request body.
 * Body fields use regular z.boolean() (not coerced) since they come as JSON.
 */
export const replaceBodySchema = z.object({
  query: z
    .string()
    .min(1, 'Query must be at least 1 character')
    .max(500, 'Query must not exceed 500 characters')
    .refine(
      (s) => s.trim().length > 0,
      { message: 'Query must not be whitespace-only' },
    ),
  replacement: z
    .string()
    .min(0)
    .max(5000, 'Replacement must not exceed 5000 characters'),
  caseSensitive: z.boolean(),
  regex: z.boolean(),
  paths: z
    .array(z.string())
    .max(100, 'Maximum 100 paths allowed')
    .optional(),
})

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type SearchQueryInput = z.infer<typeof searchQuerySchema>
export type MultiVaultSearchInput = z.infer<typeof multiVaultSearchSchema>
export type ReplaceBodyInput = z.infer<typeof replaceBodySchema>
