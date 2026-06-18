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
  vaultId: z.string().min(1).max(64),
  path: z.string().min(1).max(1024),
  addedAt: z.string().min(1).max(64),
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
