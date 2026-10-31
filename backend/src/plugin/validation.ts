import { z } from 'zod'
import { PLUGIN_LIMITS, formatPluginLimit } from '@slatebase/shared-contracts'

// ─── Plugin ID Validation ────────────────────────────────────────────────────

/**
 * Regex for plugin IDs. Plugins live in Obsidian's `.obsidian/plugins/<id>/`, and Obsidian
 * itself only requires the id to be unique, so the pattern has to accept every id that exists
 * in the community catalog (checked against all 9,410 entries: besides lowercase ids there are
 * e.g. `ObsidianAnkiSync`, `scrybble.ink`, `waka_time_box`, `3d_embeds`):
 * - Starts with a letter or digit (so it can never be `.`, `..`, or collide with `_registry.json`
 *   and other service files next to the plugin folders)
 * - Contains only letters, digits, `.`, `_` and `-`; does not end with a dot (Windows drops it)
 * - Max 64 characters
 * - No path separators or other special characters
 *
 * This prevents path traversal attacks when the ID is used in filesystem paths.
 * Note: ids that differ only in case share a folder on case-insensitive filesystems
 * (Windows, macOS), exactly as in Obsidian.
 */
export const PLUGIN_ID_PATTERN = /^(?!.*\.$)[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

/**
 * Validates a plugin ID string against the safe pattern.
 * Use this for route parameter validation where Zod is not available.
 *
 * @returns true if the plugin ID is safe to use in filesystem paths
 */
export function isValidPluginId(pluginId: string): boolean {
  return PLUGIN_ID_PATTERN.test(pluginId)
}

// ─── Plugin Validation Schemas ───────────────────────────────────────────────

/**
 * Schema for validating an Obsidian plugin manifest.
 * Required fields: id, name, version (semver format).
 * Optional fields: minAppVersion, author, description, authorUrl, isDesktopOnly.
 * Uses passthrough to preserve unknown fields for round-trip compatibility.
 */
export const pluginManifestSchema = z.object({
  id: z.string()
    .min(1, 'Plugin ID must not be empty')
    .max(64, 'Plugin ID must not exceed 64 characters')
    .regex(PLUGIN_ID_PATTERN, 'Plugin ID must contain only letters, digits, ".", "_" and "-", start with a letter or digit, and not end with "."'),
  name: z.string().min(1, 'Plugin name must not be empty'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be in MAJOR.MINOR.PATCH format'),
  minAppVersion: z.string().regex(/^\d+\.\d+\.\d+$/, 'minAppVersion must be in MAJOR.MINOR.PATCH format').optional(),
  author: z.string().optional(),
  description: z.string().optional(),
  authorUrl: z.string().url('authorUrl must be a valid URL').optional(),
  isDesktopOnly: z.boolean().optional(),
}).passthrough()

/**
 * Schema for validating plugin settings (data.json content).
 * Must be a JSON string not exceeding PLUGIN_LIMITS.maxSettingsBytes (10 MB).
 */
export const pluginSettingsSchema = z.string().max(PLUGIN_LIMITS.maxSettingsBytes, `Plugin settings must not exceed ${formatPluginLimit(PLUGIN_LIMITS.maxSettingsBytes)}`)

/**
 * Schema for validating the plugin registry (_registry.json).
 */
export const pluginRegistrySchema = z.object({
  version: z.literal(1),
  plugins: z.record(
    z.string(),
    z.object({
      status: z.enum(['active', 'inactive', 'error', 'loading']),
      permissions: z.object({
        network: z.boolean(),
        networkAllowlist: z.array(z.string()),
        filesystemWrite: z.boolean(),
        domManipulation: z.boolean(),
      }),
      compatibilityLevel: z.enum(['full', 'partial', 'unsupported', 'unknown']),
      installedAt: z.string(),
      updatedAt: z.string(),
      error: z.string().optional(),
      hasEvalUsage: z.boolean().optional(),
    }),
  ),
})

/**
 * Upload size constraints for plugin files.
 */
export const pluginUploadConstraints = {
  /** Maximum ZIP file size (shared-contracts plugin-limits.ts) */
  maxZipSize: PLUGIN_LIMITS.maxZipBytes,
  /** Maximum individual file size */
  maxFileSize: PLUGIN_LIMITS.maxFileBytes,
} as const

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type PluginManifestInput = z.infer<typeof pluginManifestSchema>
export type PluginRegistryInput = z.infer<typeof pluginRegistrySchema>
