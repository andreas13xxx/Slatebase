import { z } from 'zod'

// ─── Plugin ID Validation ────────────────────────────────────────────────────

/**
 * Strict regex for plugin IDs. Matches Obsidian community plugin conventions:
 * - Starts with a lowercase letter or digit
 * - Contains only lowercase letters, digits, and hyphens
 * - Max 64 characters
 * - No path separators, dots, or special characters
 *
 * This prevents path traversal attacks when the ID is used in filesystem paths.
 */
export const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

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
    .regex(PLUGIN_ID_PATTERN, 'Plugin ID must contain only lowercase letters, digits, and hyphens, and start with a letter or digit'),
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
 * Must be a JSON string not exceeding 1 MB (1,048,576 bytes).
 */
export const pluginSettingsSchema = z.string().max(1_048_576, 'Plugin settings must not exceed 1 MB')

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
    }),
  ),
})

/**
 * Upload size constraints for plugin files.
 */
export const pluginUploadConstraints = {
  /** Maximum ZIP file size: 5 MB */
  maxZipSize: 5 * 1024 * 1024,
  /** Maximum individual file size: 5 MB */
  maxFileSize: 5 * 1024 * 1024,
} as const

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type PluginManifestInput = z.infer<typeof pluginManifestSchema>
export type PluginRegistryInput = z.infer<typeof pluginRegistrySchema>
