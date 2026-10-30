// `<vault>/.obsidian/templates.json` and `daily-notes.json` — the template folder and the daily-note
// settings Obsidian keeps for its core plugins. Shapes taken from real Obsidian-written files:
//
//   templates.json    { "folder": "template" }
//   daily-notes.json  { "folder": "2024", "format": "MM月/MM-DD ddd", "template": "template/diary", "autorun": false }
//
// `template` is a vault path without the `.md` extension. `format` is a Moment pattern; Slatebase
// names daily notes `YYYY-MM-DD.md` and cannot follow another one, so it only reads `format` (to
// tell the user) and writes the default when it creates the file. Keys this app does not know are kept.

import {
  ObsidianConfigFileInvalidError,
  readObsidianConfig,
  updateObsidianConfig,
  type ObsidianConfigFile,
} from '../shared/obsidian-config-file.js'

/** The only date format Slatebase can produce for daily notes. */
export const SUPPORTED_DAILY_NOTE_FORMAT = 'YYYY-MM-DD'

/** What the two files say; `null` where the file or the key is absent (or not a string). */
export interface NoteConfig {
  templatesFolder: string | null
  dailyFolder: string | null
  /** Vault path of the daily-note template, without `.md` (as Obsidian writes it). `''` means "no template". */
  dailyTemplate: string | null
  dailyFormat: string | null
}

export interface NoteConfigPatch {
  templatesFolder?: string
  dailyFolder?: string
  /** Vault path of the template; a trailing `.md` is stripped before it is written. */
  dailyTemplate?: string
}

export interface INoteConfigService {
  /** Reads both files. An unreadable (invalid JSON) file counts as absent, so settings pages still load. */
  get(vaultPath: string): Promise<NoteConfig>
  /** Writes only the given values; throws {@link ObsidianConfigFileInvalidError} if a file to write is invalid. */
  patch(vaultPath: string, patch: NoteConfigPatch): Promise<void>
}

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)

async function readTolerant(vaultPath: string, file: ObsidianConfigFile): Promise<Record<string, unknown>> {
  try {
    return (await readObsidianConfig(vaultPath, file)) ?? {}
  } catch (error: unknown) {
    if (error instanceof ObsidianConfigFileInvalidError) return {}
    throw error
  }
}

export class NoteConfigService implements INoteConfigService {
  async get(vaultPath: string): Promise<NoteConfig> {
    const [templates, daily] = await Promise.all([
      readTolerant(vaultPath, 'templates.json'),
      readTolerant(vaultPath, 'daily-notes.json'),
    ])
    return {
      templatesFolder: str(templates['folder']),
      dailyFolder: str(daily['folder']),
      dailyTemplate: str(daily['template']),
      dailyFormat: str(daily['format']),
    }
  }

  async patch(vaultPath: string, patch: NoteConfigPatch): Promise<void> {
    if (patch.templatesFolder !== undefined) {
      const folder = patch.templatesFolder
      await updateObsidianConfig(vaultPath, 'templates.json', (current) => {
        if (current['folder'] === folder) return null
        current['folder'] = folder
        return current
      })
    }

    if (patch.dailyFolder !== undefined || patch.dailyTemplate !== undefined) {
      await updateObsidianConfig(vaultPath, 'daily-notes.json', (current) => {
        let changed = false
        if (patch.dailyFolder !== undefined && current['folder'] !== patch.dailyFolder) {
          current['folder'] = patch.dailyFolder
          changed = true
        }
        if (patch.dailyTemplate !== undefined) {
          const template = patch.dailyTemplate.replace(/\.md$/i, '')
          if (current['template'] !== template) {
            current['template'] = template
            changed = true
          }
        }
        // Slatebase names daily notes YYYY-MM-DD.md; say so for Obsidian when the file does not say otherwise.
        if (changed && typeof current['format'] !== 'string') current['format'] = SUPPORTED_DAILY_NOTE_FORMAT
        return changed ? current : null
      })
    }
  }
}
