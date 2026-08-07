import { z } from 'zod'

// ─── Repo Format Validation ──────────────────────────────────────────────────

/**
 * Regex for validating GitHub repository format "owner/repo".
 * Allows alphanumeric characters, dots, hyphens, and underscores in both segments.
 */
export const REPO_FORMAT_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/

// ─── Plugin Store Validation Schemas ─────────────────────────────────────────

/**
 * Schema for validating the POST body of the store-install endpoint.
 * Validates pluginId and repo fields. The vaultId comes from the URL path parameter.
 */
export const storeInstallSchema = z.object({
  pluginId: z.string()
    .trim()
    .min(1, 'pluginId must not be empty'),
  repo: z.string()
    .trim()
    .min(1, 'repo must not be empty')
    .regex(REPO_FORMAT_PATTERN, 'repo must match "owner/repo" format'),
})

/**
 * Schema for validating entries from the community-plugins.json.
 * Each entry represents a plugin listed in the Obsidian community plugin registry.
 */
export const communityPluginEntrySchema = z.object({
  id: z.string().min(1, 'id must not be empty'),
  name: z.string().min(1, 'name must not be empty'),
  author: z.string().min(1, 'author must not be empty'),
  description: z.string(),
  repo: z.string().regex(REPO_FORMAT_PATTERN, 'repo must match "owner/repo" format'),
})

/**
 * Schema for a single entry in community-plugin-stats.json.
 * Each entry has `downloads` (total across all versions) and `updated`
 * (epoch ms of the latest release), plus per-version download counts as
 * additional keys — passthrough since those extra keys aren't consumed.
 */
export const communityPluginStatsEntrySchema = z.object({
  downloads: z.number(),
  updated: z.number(),
}).passthrough()

// ─── Inferred Types ──────────────────────────────────────────────────────────

/** Request body type for the store-install endpoint. */
export type StoreInstallBody = z.infer<typeof storeInstallSchema>

/** Type for a single entry from community-plugins.json. */
export type CommunityPluginEntryInput = z.infer<typeof communityPluginEntrySchema>
