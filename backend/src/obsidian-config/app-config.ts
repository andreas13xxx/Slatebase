// `<vault>/.obsidian/app.json` — Obsidian's main vault settings. Keys, value types and defaults come
// from the table in @slatebase/shared-contracts (also used by the frontend), documented in
// docs/app-json.md. Every other key in the file is passed through untouched; keys and values that
// contradict the table are reported to the console (deviation-reporter.ts), never rewritten.

import { z } from 'zod'
import {
  APP_CONFIG_KEYS,
  APP_CONFIG_KEY_NAMES,
  describeAppConfigDeviations,
  type AppConfigKey,
  type AppConfigKeyMeta,
  type AppConfigValue,
} from '@slatebase/shared-contracts'
import { readObsidianConfig, updateObsidianConfig } from '../shared/obsidian-config-file.js'
import { noopDeviationReporter, type IDeviationReporter } from './deviation-reporter.js'

function valueSchema(meta: AppConfigKeyMeta): z.ZodType {
  switch (meta.kind) {
    case 'boolean': return z.boolean()
    case 'number': return z.number().min(meta.min).max(meta.max)
    case 'string': return z.string().max(meta.maxLength)
    case 'enum': return z.enum(meta.values as [string, ...string[]])
    case 'string[]': return z.array(z.string().max(meta.maxLength)).max(meta.maxItems)
  }
}

/**
 * Keys this app understands and may change. Every key is optional and may be `null`, which removes
 * it from the file (back to Obsidian's default). Keys that are not listed are rejected, not ignored.
 */
export const appConfigRequestSchema = z.object(
  Object.fromEntries(APP_CONFIG_KEY_NAMES.map((key) => [key, valueSchema(APP_CONFIG_KEYS[key]).nullable().optional()])),
).strict()

export type { AppConfigValue }

export type AppConfigRequest = { [K in AppConfigKey]?: AppConfigValue<K> | null }

export interface IAppConfigService {
  /** All fields of app.json (known and unknown); an empty object if the file does not exist. */
  get(vaultPath: string, vaultId?: string): Promise<Record<string, unknown>>
  /** Applies a patch (`null` removes a key) and returns the fields as they are on disk afterwards. */
  patch(vaultPath: string, patch: AppConfigRequest): Promise<Record<string, unknown>>
}

export class AppConfigService implements IAppConfigService {
  constructor(private readonly reporter: IDeviationReporter = noopDeviationReporter) {}

  async get(vaultPath: string, vaultId: string = vaultPath): Promise<Record<string, unknown>> {
    const fields = (await readObsidianConfig(vaultPath, 'app.json')) ?? {}
    this.reporter.report(
      vaultId,
      'app.json',
      describeAppConfigDeviations(fields).map((d) => ({ path: d.key, reason: d.reason })),
    )
    return fields
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
        } else if (JSON.stringify(current[key]) !== JSON.stringify(value)) {
          current[key] = value
          changed = true
        }
      }
      return changed ? current : null
    })
  }
}
