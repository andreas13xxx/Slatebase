// `<vault>/.obsidian/graph.json` — settings of the graph view, same for everyone who opens the vault.
// Keys, ranges and defaults come from the table in @slatebase/shared-contracts; keys of the file
// that Slatebase's graph has no function for stay as they are.

import {
  GRAPH_CONFIG_KEYS,
  describeGraphDeviations,
  type GraphConfigKey,
  type GraphConfigValue,
} from '@slatebase/shared-contracts'
import { readObsidianConfig, updateObsidianConfig } from '../shared/obsidian-config-file.js'
import { applyConfigPatch } from './app-config.js'
import { configRequestSchema } from './config-schema.js'
import { noopDeviationReporter, type IDeviationReporter } from './deviation-reporter.js'

export const graphConfigRequestSchema = configRequestSchema(GRAPH_CONFIG_KEYS)

export type GraphConfigRequest = { [K in GraphConfigKey]?: GraphConfigValue<K> | null }

export interface IGraphConfigService {
  /** All fields of graph.json (known and unknown); an empty object if the file does not exist. */
  get(vaultPath: string, vaultId?: string): Promise<Record<string, unknown>>
  /** Applies a patch (`null` removes a key) and returns the fields as they are on disk afterwards. */
  patch(vaultPath: string, patch: GraphConfigRequest): Promise<Record<string, unknown>>
}

export class GraphConfigService implements IGraphConfigService {
  constructor(private readonly reporter: IDeviationReporter = noopDeviationReporter) {}

  async get(vaultPath: string, vaultId: string = vaultPath): Promise<Record<string, unknown>> {
    const fields = (await readObsidianConfig(vaultPath, 'graph.json')) ?? {}
    this.reporter.report(vaultId, 'graph.json', describeGraphDeviations(fields).map((d) => ({ path: d.key, reason: d.reason })))
    return fields
  }

  async patch(vaultPath: string, patch: GraphConfigRequest): Promise<Record<string, unknown>> {
    return updateObsidianConfig(vaultPath, 'graph.json', (current) => (applyConfigPatch(current, patch) ? current : null))
  }
}
