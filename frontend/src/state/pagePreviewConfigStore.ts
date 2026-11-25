/**
 * pagePreviewConfigStore — the open vault's `.obsidian/page-preview.json`, the settings of
 * Obsidian's core "Page preview" plugin.
 *
 * One entry per hover source: `true` = the preview only appears while Ctrl (Cmd) is held, `false` =
 * it appears on hover alone. Where the file has no entry, a source registered by a plugin brings its
 * own default (`defaultMod`); every other source keeps Slatebase's long-standing behaviour (hover
 * alone), so a vault without the file behaves as before.
 *
 * The file lives in the vault, so a value is the same for everyone who opens it. Writes are
 * optimistic and roll back (rejecting) when refused, like `vaultAppConfigStore`.
 *
 * @module state/pagePreviewConfigStore
 */

import { useSyncExternalStore } from 'react'
import type { IApiClient } from '../api'
import { getHoverLinkSources } from '../plugins/compat/hover-link-bus'

/** Path of the file, as reported by `vault:change` events. */
export const PAGE_PREVIEW_CONFIG_PATH = '.obsidian/page-preview.json'

/** Source id Slatebase's own links use on the hover bus. */
const INTERNAL_LINK_SOURCE = 'internal-link'
/** Key of Slatebase's own links (Obsidian's "Vorschau" = reading view) in the file. */
export const PREVIEW_SOURCE_KEY = 'preview'

let activeVaultId: string | null = null
let apiClient: IApiClient | null = null
let fileFields: Record<string, unknown> = {}
/** Bumped on every switch and every applied response, so a slow older response cannot win. */
let generation = 0
/** Replaced on every change, so `useSyncExternalStore` sees a new snapshot. */
let version = 0

const subscribers = new Set<() => void>()

function apply(fields: Record<string, unknown>): void {
  fileFields = fields
  version++
  for (const cb of subscribers) cb()
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb)
  return () => { subscribers.delete(cb) }
}

/** The key under which a hover source is stored in the file. */
export function pagePreviewKey(source: string): string {
  return source === INTERNAL_LINK_SOURCE ? PREVIEW_SOURCE_KEY : source
}

/** Whether previews of this source need Ctrl (Cmd) held. */
export function pagePreviewRequiresMod(source: string): boolean {
  const key = pagePreviewKey(source)
  const stored = fileFields[key]
  if (typeof stored === 'boolean') return stored
  return getHoverLinkSources().find((entry) => entry.id === key)?.defaultMod ?? false
}

/** Subscribes a component to the file; the value is a counter that changes whenever the file does. */
export function usePagePreviewConfigVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version)
}

/**
 * Sets whether one source needs Ctrl (Cmd); `null` removes the entry (back to the default).
 * Rejects with the server's error (typically: no write access) after putting the old value back.
 */
export async function setPagePreviewRequiresMod(key: string, value: boolean | null): Promise<void> {
  const vaultId = activeVaultId
  if (vaultId === null || apiClient === null) throw new Error('Kein Vault aktiv')

  const hadKey = key in fileFields
  const before = fileFields[key]
  const optimistic = { ...fileFields }
  if (value === null) delete optimistic[key]
  else optimistic[key] = value
  const mine = ++generation
  apply(optimistic)

  try {
    const saved = await apiClient.patchPagePreviewConfig(vaultId, { [key]: value })
    if (activeVaultId === vaultId && mine === generation) apply(saved)
  } catch (error) {
    // Only undo what is still this change's value; a later change is neither undone nor resurrected.
    if (activeVaultId === vaultId && fileFields[key] === (value ?? undefined)) {
      const restored = { ...fileFields }
      if (hadKey) restored[key] = before
      else delete restored[key]
      apply(restored)
    }
    throw error
  }
}

/** Connects the store to the API client. Called on login / app mount. */
export function initialize(client: IApiClient): void {
  apiClient = client
}

/** Re-reads the file of the active vault. A failed read keeps what is shown (unknown, not "gone"). */
export async function refreshPagePreviewConfig(vaultId: string): Promise<void> {
  if (apiClient === null || vaultId !== activeVaultId) return
  const mine = ++generation
  try {
    const fields = await apiClient.getPagePreviewConfig(vaultId)
    if (activeVaultId === vaultId && mine === generation) apply(fields)
  } catch {
    // Keep the current values; the next change event or vault switch retries.
  }
}

/** Switches to another vault: defaults at once, then the vault's file. */
export async function setActiveVault(vaultId: string | null): Promise<void> {
  if (vaultId === activeVaultId) return
  activeVaultId = vaultId
  generation++
  apply({})
  if (vaultId !== null) await refreshPagePreviewConfig(vaultId)
}

/** Disconnects on logout. */
export function disconnect(): void {
  apiClient = null
  activeVaultId = null
  generation++
  apply({})
}

/**
 * Resets all module state. Test helper.
 * @internal
 */
export function _reset(): void {
  disconnect()
}
