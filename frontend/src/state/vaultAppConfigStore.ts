/**
 * vaultAppConfigStore — the open vault's `.obsidian/app.json`, Obsidian's main vault settings.
 *
 * The file lives in the vault, so a value is the same for everyone who opens it: there is no
 * per-user copy and no override. Where the file does not contain a key the default below applies;
 * keys this app does not know are kept in the snapshot (plugins read them through
 * `vault.getConfig()`).
 *
 * Writes are optimistic: the snapshot changes at once, the PATCH follows, and a refused or failed
 * write puts the previous value back and rejects, so the caller can say why. Changing a value needs
 * write access to the vault.
 *
 * @module state/vaultAppConfigStore
 */

import { useSyncExternalStore } from 'react'
import {
  APP_CONFIG_DEFAULTS,
  describeAppConfigDeviations,
  mergeAppConfig,
  type AppConfigKey,
  type AppConfigValues,
} from '@slatebase/shared-contracts'
import type { IApiClient } from '../api'

// ─── Types ───────────────────────────────────────────────────────────────────

/** The keys this app understands, with their value types (one table, shared with the backend). */
export type { AppConfigKey, AppConfigValues }

/**
 * Applied where `app.json` has no such key: Obsidian's default where it is known (table in
 * shared-contracts, documented in docs/app-json.md). `attachmentFolderPath: './'` means "next to
 * the note".
 */
export const DEFAULT_APP_CONFIG: Readonly<AppConfigValues> = APP_CONFIG_DEFAULTS

/** Path of the file, as reported by `vault:change` events. */
export const APP_CONFIG_PATH = '.obsidian/app.json'

// ─── Internal State ──────────────────────────────────────────────────────────

let activeVaultId: string | null = null
let apiClient: IApiClient | null = null
/** Raw fields of the file (known and unknown keys). */
let fileFields: Record<string, unknown> = {}
/** Defaults merged with the file's values; what consumers read. Replaced on every change. */
let snapshot: Record<string, unknown> = { ...DEFAULT_APP_CONFIG }
/** Bumped on every switch and every applied response, so a slow older response cannot win. */
let generation = 0

const subscribers = new Set<() => void>()

/** Deviations already written to the console, so a refresh does not repeat them. */
const reportedDeviations = new Set<string>()

/** Warns once per session about what the file contains that Slatebase does not expect. */
function reportDeviations(vaultId: string, fields: Record<string, unknown>): void {
  for (const { key, reason } of describeAppConfigDeviations(fields)) {
    const id = `${vaultId}\0${key}\0${reason}`
    if (reportedDeviations.has(id)) continue
    reportedDeviations.add(id)
    console.warn(`[app.json] ${key}: ${reason}`)
  }
}

function apply(fields: Record<string, unknown>): void {
  fileFields = fields
  snapshot = mergeAppConfig(fields)
  for (const cb of subscribers) cb()
}

// ─── Reading ─────────────────────────────────────────────────────────────────

function subscribe(cb: () => void): () => void {
  subscribers.add(cb)
  return () => { subscribers.delete(cb) }
}

/** Calls `cb` after every change of the snapshot. Returns the function that stops it. */
export function onAppConfigChange(cb: () => void): () => void {
  return subscribe(cb)
}

/** One value of the active vault's app.json (default if the file has none). */
export function getAppConfigValue<K extends AppConfigKey>(key: K): AppConfigValues[K] {
  return snapshot[key] as AppConfigValues[K]
}

/** Any key of the file, known or not (`vault.getConfig()` for plugins); null if absent and without a default. */
export function getAppConfigRaw(key: string): unknown {
  return key in snapshot ? snapshot[key] : null
}

/** Subscribes a component to one value. */
export function useAppConfigValue<K extends AppConfigKey>(key: K): AppConfigValues[K] {
  return useSyncExternalStore(subscribe, () => getAppConfigValue(key), () => getAppConfigValue(key))
}

// ─── Writing ─────────────────────────────────────────────────────────────────

/**
 * Changes known keys of the active vault's app.json. `null` removes a key (back to the default).
 * Rejects with the server's error (typically: no write access); the keys of this change go back to
 * what they were before it.
 *
 * The rollback is per key and only for keys that still hold this change's value: a second change that
 * was made meanwhile (and may have succeeded or failed on its own) is neither undone nor resurrected.
 */
export async function updateAppConfig(patch: { [K in AppConfigKey]?: AppConfigValues[K] | null }): Promise<void> {
  const vaultId = activeVaultId
  if (vaultId === null || apiClient === null) throw new Error('Kein Vault aktiv')

  const entries = Object.entries(patch).filter(([, value]) => value !== undefined) as [string, unknown][]
  const previous = new Map(entries.map(([key]) => [key, key in fileFields ? { value: fileFields[key] } : null]))

  const optimistic = { ...fileFields }
  for (const [key, value] of entries) {
    if (value === null) delete optimistic[key]
    else optimistic[key] = value
  }
  const mine = ++generation
  apply(optimistic)

  try {
    const saved = await apiClient.patchAppConfig(vaultId, patch)
    // Only the newest change may adopt the server's copy: an older response predates the newer optimistic values.
    if (activeVaultId === vaultId && mine === generation) apply(saved)
  } catch (error) {
    if (activeVaultId === vaultId) {
      const restored = { ...fileFields }
      for (const [key, value] of entries) {
        const stillMine = value === null ? !(key in restored) : restored[key] === value
        if (!stillMine) continue
        const before = previous.get(key)
        if (before === null || before === undefined) delete restored[key]
        else restored[key] = before.value
      }
      apply(restored)
    }
    throw error
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/** Connects the store to the API client. Called on login / app mount. */
export function initialize(client: IApiClient): void {
  apiClient = client
}

/** Re-reads the file of the active vault. A failed read keeps what is shown (unknown, not "gone"). */
export async function refreshAppConfig(vaultId: string): Promise<void> {
  if (apiClient === null || vaultId !== activeVaultId) return
  const mine = ++generation
  try {
    const fields = await apiClient.getAppConfig(vaultId)
    if (activeVaultId === vaultId && mine === generation) {
      reportDeviations(vaultId, fields)
      apply(fields)
    }
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
  if (vaultId !== null) await refreshAppConfig(vaultId)
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
