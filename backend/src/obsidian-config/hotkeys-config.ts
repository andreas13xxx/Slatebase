// `<vault>/.obsidian/hotkeys.json` — the vault's key bindings (see @slatebase/shared-contracts).
// A PATCH is a map command ID → list of bindings; `null` removes the entry (the command is back to
// its default), an empty list unbinds the command. Entries the patch does not name stay as they are,
// as does everything in the file Slatebase does not understand (other apps' commands included).

import { z } from 'zod'
import {
  MAX_HOTKEYS_PER_COMMAND,
  MAX_HOTKEY_COMMANDS,
  HOTKEY_MODIFIERS,
  MAX_HOTKEY_KEY_LENGTH,
  describeHotkeysDeviations,
  isValidHotkeyCommandId,
} from '@slatebase/shared-contracts'
import { readObsidianConfig, updateObsidianConfig } from '../shared/obsidian-config-file.js'
import { applyConfigPatch } from './app-config.js'
import { noopDeviationReporter, type IDeviationReporter } from './deviation-reporter.js'

const hotkeySchema = z.object({
  modifiers: z.array(z.enum(HOTKEY_MODIFIERS)).max(HOTKEY_MODIFIERS.length),
  key: z.string().min(1).max(MAX_HOTKEY_KEY_LENGTH),
}).strict()

export const hotkeysConfigRequestSchema = z
  .record(z.string(), z.array(hotkeySchema).max(MAX_HOTKEYS_PER_COMMAND).nullable())
  .refine((patch) => Object.keys(patch).length <= MAX_HOTKEY_COMMANDS, 'too many commands')
  .refine((patch) => Object.keys(patch).every(isValidHotkeyCommandId), 'not a usable command ID')

export type HotkeysConfigRequest = Record<string, Array<{ modifiers: string[]; key: string }> | null>

export interface IHotkeysConfigService {
  /** All entries of hotkeys.json; an empty object if the file does not exist. */
  get(vaultPath: string, vaultId?: string): Promise<Record<string, unknown>>
  /** Applies a patch and returns the entries as they are on disk afterwards. */
  patch(vaultPath: string, patch: HotkeysConfigRequest): Promise<Record<string, unknown>>
}

export class HotkeysConfigService implements IHotkeysConfigService {
  constructor(private readonly reporter: IDeviationReporter = noopDeviationReporter) {}

  async get(vaultPath: string, vaultId: string = vaultPath): Promise<Record<string, unknown>> {
    const fields = (await readObsidianConfig(vaultPath, 'hotkeys.json')) ?? {}
    this.reporter.report(vaultId, 'hotkeys.json', describeHotkeysDeviations(fields).map((d) => ({ path: d.key, reason: d.reason })))
    return fields
  }

  async patch(vaultPath: string, patch: HotkeysConfigRequest): Promise<Record<string, unknown>> {
    return updateObsidianConfig(vaultPath, 'hotkeys.json', (current) => (applyConfigPatch(current, patch) ? current : null))
  }
}
