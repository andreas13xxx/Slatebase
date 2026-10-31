// `<vault>/.obsidian/bookmarks.json` — the vault's bookmarks (see the table in
// @slatebase/shared-contracts). The list is replaced as a whole by a PATCH; what the file contains
// that Slatebase has no use for (groups, folders, URLs, unknown types) is the client's to keep in it.

import { z } from 'zod'
import { MAX_BOOKMARK_ITEMS, describeBookmarksDeviations } from '@slatebase/shared-contracts'
import { readObsidianConfig, updateObsidianConfig } from '../shared/obsidian-config-file.js'
import { applyConfigPatch } from './app-config.js'
import { noopDeviationReporter, type IDeviationReporter } from './deviation-reporter.js'

/** `items` replaces the list; `null` removes the key. Every entry is an object (its fields are Obsidian's business). */
export const bookmarksConfigRequestSchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())).max(MAX_BOOKMARK_ITEMS).nullable().optional(),
}).strict()

export interface BookmarksConfigRequest {
  items?: Array<Record<string, unknown>> | null
}

export interface IBookmarksConfigService {
  /** All fields of bookmarks.json; an empty object if the file does not exist. */
  get(vaultPath: string, vaultId?: string): Promise<Record<string, unknown>>
  /** Applies a patch and returns the fields as they are on disk afterwards. */
  patch(vaultPath: string, patch: BookmarksConfigRequest): Promise<Record<string, unknown>>
}

export class BookmarksConfigService implements IBookmarksConfigService {
  constructor(private readonly reporter: IDeviationReporter = noopDeviationReporter) {}

  async get(vaultPath: string, vaultId: string = vaultPath): Promise<Record<string, unknown>> {
    const fields = (await readObsidianConfig(vaultPath, 'bookmarks.json')) ?? {}
    this.reporter.report(vaultId, 'bookmarks.json', describeBookmarksDeviations(fields).map((d) => ({ path: d.key, reason: d.reason })))
    return fields
  }

  async patch(vaultPath: string, patch: BookmarksConfigRequest): Promise<Record<string, unknown>> {
    return updateObsidianConfig(vaultPath, 'bookmarks.json', (current) => (applyConfigPatch(current, patch) ? current : null))
  }
}
