/**
 * vaultAppearanceStore — the open vault's `.obsidian/appearance.json`: base theme, accent colour,
 * font size and fonts. Same for everyone who opens the vault; changing it needs write access.
 * The theme (`cssTheme`) and the CSS snippets are handled elsewhere and are not part of this store.
 *
 * @module state/vaultAppearanceStore
 */

import {
  APPEARANCE_CONFIG_DEFAULTS,
  describeAppearanceDeviations,
  mergeAppearanceConfig,
  type AppearanceConfigValues,
} from '@slatebase/shared-contracts'
import { createVaultConfigStore } from './vaultConfigStore'

export type { AppearanceConfigValues }

export const APPEARANCE_CONFIG_PATH = '.obsidian/appearance.json'

const store = createVaultConfigStore<AppearanceConfigValues>({
  fileLabel: 'appearance.json',
  path: APPEARANCE_CONFIG_PATH,
  defaults: APPEARANCE_CONFIG_DEFAULTS,
  merge: mergeAppearanceConfig,
  deviations: describeAppearanceDeviations,
  fetch: (client, vaultId) => client.getAppearanceConfig(vaultId),
  patch: (client, vaultId, patch) => client.patchAppearanceConfig(vaultId, patch),
})

export const getAppearanceValue = store.get
export const getAppearanceRaw = store.getRaw
export const updateAppearance = store.update
export const refreshAppearance = store.refresh
export const onAppearanceChange = store.onChange
export const useAppearanceValue = store.useValue
export const useAppearanceSnapshot = store.useSnapshot
export const initialize = store.initialize
export const setActiveVault = store.setActiveVault
export const disconnect = store.disconnect
export const _reset = store._reset
