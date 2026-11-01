/**
 * vaultGraphStore — the open vault's `.obsidian/graph.json`: the force settings and display options
 * of the graph view, same for everyone who opens the vault. Changing them needs write access.
 *
 * @module state/vaultGraphStore
 */

import {
  GRAPH_CONFIG_DEFAULTS,
  describeGraphDeviations,
  mergeGraphConfig,
  type GraphConfigValues,
} from '@slatebase/shared-contracts'
import { createVaultConfigStore } from './vaultConfigStore'

export type { GraphConfigValues }

export const GRAPH_CONFIG_PATH = '.obsidian/graph.json'

const store = createVaultConfigStore<GraphConfigValues>({
  fileLabel: 'graph.json',
  path: GRAPH_CONFIG_PATH,
  defaults: GRAPH_CONFIG_DEFAULTS,
  merge: mergeGraphConfig,
  deviations: describeGraphDeviations,
  fetch: (client, vaultId) => client.getGraphConfig(vaultId),
  patch: (client, vaultId, patch) => client.patchGraphConfig(vaultId, patch),
})

export const getGraphValue = store.get
export const updateGraph = store.update
export const refreshGraph = store.refresh
export const onGraphChange = store.onChange
export const useGraphSnapshot = store.useSnapshot
export const initialize = store.initialize
export const setActiveVault = store.setActiveVault
export const disconnect = store.disconnect
export const _reset = store._reset
