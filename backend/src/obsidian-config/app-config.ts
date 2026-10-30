// `<vault>/.obsidian/app.json` — Obsidian's main vault settings. The key names come from a real
// Obsidian-written file. Enum members that file does not show (`root`, `folder`, `absolute`,
// `preview`) come from Slatebase's earlier defaults and are not verified against Obsidian's docs.
// Every other key in the file is passed through untouched.

import { z } from 'zod'
import { readObsidianConfig, updateObsidianConfig } from '../shared/obsidian-config-file.js'

const MAX_PATH_LENGTH = 1024

/**
 * Keys this app understands and may change. Every key is optional and may be `null`, which removes
 * it from the file (back to Obsidian's default). Keys that are not listed are rejected, not ignored.
 */
export const appConfigRequestSchema = z.object({
  newFileLocation: z.enum(['root', 'current', 'folder']).nullable(),
  newFileFolderPath: z.string().max(MAX_PATH_LENGTH).nullable(),
  attachmentFolderPath: z.string().max(MAX_PATH_LENGTH).nullable(),
  useMarkdownLinks: z.boolean().nullable(),
  newLinkFormat: z.enum(['shortest', 'relative', 'absolute']).nullable(),
  alwaysUpdateLinks: z.boolean().nullable(),
  readableLineLength: z.boolean().nullable(),
  defaultViewMode: z.enum(['source', 'preview']).nullable(),
  livePreview: z.boolean().nullable(),
  strictLineBreaks: z.boolean().nullable(),
  showFrontmatter: z.boolean().nullable(),
  foldHeading: z.boolean().nullable(),
  foldIndent: z.boolean().nullable(),
  spellcheck: z.boolean().nullable(),
  showLineNumber: z.boolean().nullable(),
}).partial().strict()

export type AppConfigRequest = z.infer<typeof appConfigRequestSchema>

export interface IAppConfigService {
  /** All fields of app.json (known and unknown); an empty object if the file does not exist. */
  get(vaultPath: string): Promise<Record<string, unknown>>
  /** Applies a patch (`null` removes a key) and returns the fields as they are on disk afterwards. */
  patch(vaultPath: string, patch: AppConfigRequest): Promise<Record<string, unknown>>
}

export class AppConfigService implements IAppConfigService {
  async get(vaultPath: string): Promise<Record<string, unknown>> {
    return (await readObsidianConfig(vaultPath, 'app.json')) ?? {}
  }

  async patch(vaultPath: string, patch: AppConfigRequest): Promise<Record<string, unknown>> {
    return updateObsidianConfig(vaultPath, 'app.json', (current) => {
      let changed = false
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue
        if (value === null) {
          if (key in current) {
            delete current[key]
            changed = true
          }
        } else if (current[key] !== value) {
          current[key] = value
          changed = true
        }
      }
      return changed ? current : null
    })
  }
}
