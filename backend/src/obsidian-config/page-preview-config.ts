// `<vault>/.obsidian/page-preview.json` — settings of Obsidian's core "Page preview" plugin: one entry
// per hover source (`preview`, `search`, `editor`, ... or the id a plugin registered through
// `registerHoverLinkSource`). `true` means the preview only appears while Ctrl (Cmd) is held, `false`
// means it appears on hover alone. The file name and key names come from Obsidian's plugin data
// convention and are not verified against a real vault. A PATCH names single sources; `null` removes
// one (back to the default), everything else in the file stays as it is.

import { z } from 'zod'
import { readObsidianConfig, updateObsidianConfig } from '../shared/obsidian-config-file.js'
import { applyConfigPatch } from './app-config.js'

/** Upper bound of entries a PATCH may carry. */
export const MAX_PAGE_PREVIEW_SOURCES = 100

const SOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/

export const pagePreviewConfigRequestSchema = z
  .record(z.string(), z.boolean().nullable())
  .refine((patch) => Object.keys(patch).length <= MAX_PAGE_PREVIEW_SOURCES, 'too many sources')
  .refine((patch) => Object.keys(patch).every((key) => SOURCE_ID_PATTERN.test(key)), 'not a usable source ID')

export type PagePreviewConfigRequest = Record<string, boolean | null>

export interface IPagePreviewConfigService {
  /** All entries of page-preview.json; an empty object if the file does not exist. */
  get(vaultPath: string, vaultId?: string): Promise<Record<string, unknown>>
  /** Applies a patch and returns the entries as they are on disk afterwards. */
  patch(vaultPath: string, patch: PagePreviewConfigRequest): Promise<Record<string, unknown>>
}

export class PagePreviewConfigService implements IPagePreviewConfigService {
  async get(vaultPath: string): Promise<Record<string, unknown>> {
    return (await readObsidianConfig(vaultPath, 'page-preview.json')) ?? {}
  }

  async patch(vaultPath: string, patch: PagePreviewConfigRequest): Promise<Record<string, unknown>> {
    return updateObsidianConfig(vaultPath, 'page-preview.json', (current) => (applyConfigPatch(current, patch) ? current : null))
  }
}
