// `<vault>/.obsidian/appearance.json` — base theme, accent colour, font size and fonts. The theme
// (`cssTheme`) and the enabled CSS snippets stay with their own services; they share this file, so
// every read-modify-write goes through the one lock of appearance-file.ts and no field is lost.

import {
  APPEARANCE_CONFIG_KEYS,
  describeAppearanceDeviations,
  type AppearanceConfigKey,
  type AppearanceConfigValue,
} from '@slatebase/shared-contracts'
import { readAppearance, withAppearanceLock, writeAppearance } from '../shared/appearance-file.js'
import { applyConfigPatch } from './app-config.js'
import { configRequestSchema } from './config-schema.js'
import { noopDeviationReporter, type IDeviationReporter } from './deviation-reporter.js'

export const appearanceConfigRequestSchema = configRequestSchema(APPEARANCE_CONFIG_KEYS)

export type AppearanceConfigRequest = { [K in AppearanceConfigKey]?: AppearanceConfigValue<K> | null }

export interface IAppearanceConfigService {
  /** All fields of appearance.json (known, owned by other services, and unknown); empty if the file does not exist. */
  get(vaultPath: string, vaultId?: string): Promise<Record<string, unknown>>
  /** Applies a patch (`null` removes a key) and returns the fields as they are on disk afterwards. */
  patch(vaultPath: string, patch: AppearanceConfigRequest): Promise<Record<string, unknown>>
}

export class AppearanceConfigService implements IAppearanceConfigService {
  constructor(private readonly reporter: IDeviationReporter = noopDeviationReporter) {}

  async get(vaultPath: string, vaultId: string = vaultPath): Promise<Record<string, unknown>> {
    const fields = (await readAppearance(vaultPath)) ?? {}
    this.reporter.report(vaultId, 'appearance.json', describeAppearanceDeviations(fields).map((d) => ({ path: d.key, reason: d.reason })))
    return fields
  }

  async patch(vaultPath: string, patch: AppearanceConfigRequest): Promise<Record<string, unknown>> {
    return withAppearanceLock(vaultPath, async () => {
      const current = (await readAppearance(vaultPath)) ?? {}
      if (applyConfigPatch(current, patch)) await writeAppearance(vaultPath, current)
      return current
    })
  }
}
