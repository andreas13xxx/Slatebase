/**
 * Zod validation schemas for preferences API input.
 */

import { z } from 'zod'

/** Schema for a single recent file entry. */
const recentFileEntrySchema = z.object({
  vaultId: z.string().min(1).max(64),
  path: z.string().min(1).max(1024),
  timestamp: z.string().min(1).max(64),
})

/** Schema for saving recent files. */
export const saveRecentFilesSchema = z.object({
  entries: z.array(recentFileEntrySchema).max(20),
})

/** Schema for a single favorite entry. */
const favoriteEntrySchema = z.object({
  id: z.string().min(1).max(128).optional(),
  vaultId: z.string().min(1).max(64),
  // Empty string is valid for type='search' (no file target).
  path: z.string().max(1024),
  addedAt: z.string().min(1).max(64),
  order: z.number().int().min(0).optional(),
  label: z.string().max(100).optional(),
  type: z.enum(['file', 'heading', 'block', 'search']).optional(),
  heading: z.string().max(500).optional(),
  blockId: z.string().max(128).optional(),
  searchQuery: z.string().max(1024).optional(),
  searchCaseSensitive: z.boolean().optional(),
  searchRegex: z.boolean().optional(),
})

/** Schema for saving favorites. */
export const saveFavoritesSchema = z.object({
  entries: z.array(favoriteEntrySchema).max(500),
})

/** Schema for a single keybinding entry. */
const keybindingEntrySchema = z.object({
  commandId: z.string().min(1).max(128),
  shortcut: z.string().max(64),
})

/** Schema for saving keybindings. */
export const saveKeybindingsSchema = z.object({
  entries: z.array(keybindingEntrySchema).max(200),
})

// ─── UI Settings ─────────────────────────────────────────────────────────────

/** Bounded string→boolean map, used for status bar item visibility. */
const booleanMapSchema = z.record(z.string().max(128), z.boolean())

/** Bounded string→string map, used for toolbar entry colours. */
const colorMapSchema = z.record(z.string().max(256), z.string().max(64))

/** Toolbar preferences. Entry ids include `plugin:<id>:<title>` ribbon icons. */
const toolbarSettingsSchema = z.object({
  visible: z.boolean(),
  position: z.enum(['left', 'right']),
  order: z.array(z.string().max(256)).max(200),
  hidden: z.array(z.string().max(256)).max(200),
  colors: colorMapSchema,
}).partial()

/**
 * Account-wide UI settings. Every field is optional: a single control saves
 * only what it changed, so two controls cannot overwrite each other's value.
 */
export const saveUiSettingsSchema = z.object({
  statusBarVisible: z.boolean().optional(),
  statusBarItems: booleanMapSchema.optional(),
  explorerFollowActiveFile: z.boolean().optional(),
  toolbar: toolbarSettingsSchema.optional(),
})

// ─── Per-Vault Settings ──────────────────────────────────────────────────────

/**
 * Client-owned JSON blobs (graph config, panel layouts). Validated for size
 * and type only — the server has no stake in their shape, and duplicating the
 * client's schema here would mean every new panel field needs a backend change.
 */
const opaqueBlobSchema = z.record(z.string().max(128), z.unknown()).nullable()

/** Per-user, per-vault settings. Partial for the same reason as UI settings. */
export const saveVaultSettingsSchema = z.object({
  lineNumbers: z.boolean().optional(),
  readableLineLength: z.boolean().optional(),
  spellcheck: z.boolean().optional(),
  spellcheckLanguage: z.string().max(16).optional(),
  zoom: z.number().min(0.5).max(2).optional(),
  graph: opaqueBlobSchema.optional(),
  sidebarPanel: opaqueBlobSchema.optional(),
  contextPanel: opaqueBlobSchema.optional(),
})
