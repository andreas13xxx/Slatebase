/**
 * createVaultConfigStore — the open vault's copy of one Obsidian JSON config file (appearance.json,
 * graph.json, ...), same for everyone who opens the vault.
 *
 * Where the file lacks a key, the default of its table applies; keys the table does not know stay in
 * the raw fields. Writes are optimistic: the snapshot changes at once, the PATCH follows, and a
 * refused or failed write puts the previous value back and rejects, so the caller can say why.
 * A generation counter keeps a slow older response from winning over a newer state, and a vault
 * switch resets to the defaults at once. What the file contains that the table does not expect is
 * written to the console once per session.
 *
 * (vaultAppConfigStore.ts is the same design for app.json, with its own history.)
 *
 * @module state/vaultConfigStore
 */

import { useSyncExternalStore } from 'react'
import type { IApiClient } from '../api'

export interface VaultConfigStoreOptions<V extends object> {
  /** Name for console messages, e.g. `appearance.json`. */
  fileLabel: string
  /** Path of the file as `vault:change` reports it, e.g. `.obsidian/appearance.json`. */
  path: string
  defaults: Readonly<V>
  /** Defaults merged with the file's valid values; unknown keys pass through. */
  merge(fields: Record<string, unknown>): Record<string, unknown>
  /** What the file contains that the table does not expect. */
  deviations(fields: Record<string, unknown>): Array<{ key: string; reason: string }>
  fetch(client: IApiClient, vaultId: string): Promise<Record<string, unknown>>
  patch(client: IApiClient, vaultId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>>
}

export function createVaultConfigStore<V extends object>(options: VaultConfigStoreOptions<V>) {
  const { fileLabel, path, defaults, merge, deviations, fetch, patch } = options

  let activeVaultId: string | null = null
  let apiClient: IApiClient | null = null
  /** Raw fields of the file. */
  let fileFields: Record<string, unknown> = {}
  /** Defaults merged with the file; what consumers read. Replaced on every change. */
  let snapshot: Record<string, unknown> = merge({})
  /** Bumped on every switch and every applied response, so a slow older response cannot win. */
  let generation = 0
  const subscribers = new Set<() => void>()
  const reported = new Set<string>()

  function apply(fields: Record<string, unknown>): void {
    fileFields = fields
    snapshot = merge(fields)
    for (const cb of subscribers) cb()
  }

  function reportDeviations(vaultId: string, fields: Record<string, unknown>): void {
    for (const { key, reason } of deviations(fields)) {
      const id = `${vaultId}\0${key}\0${reason}`
      if (reported.has(id)) continue
      reported.add(id)
      console.warn(`[${fileLabel}] ${key}: ${reason}`)
    }
  }

  function subscribe(cb: () => void): () => void {
    subscribers.add(cb)
    return () => { subscribers.delete(cb) }
  }

  function get<K extends keyof V>(key: K): V[K] {
    return snapshot[key as string] as V[K]
  }

  function getRaw(key: string): unknown {
    return key in snapshot ? snapshot[key] : null
  }

  /**
   * Changes keys of the active vault's file. `null` removes a key (back to the default). Rejects
   * with the server's error (typically: no write access); the keys of this change go back to what
   * they were before it — per key, and only if they still hold this change's value.
   */
  async function update(change: { [K in keyof V]?: V[K] | null }): Promise<void> {
    const vaultId = activeVaultId
    if (vaultId === null || apiClient === null) throw new Error('Kein Vault aktiv')

    const entries = Object.entries(change).filter(([, value]) => value !== undefined) as [string, unknown][]
    const previous = new Map(entries.map(([key]) => [key, key in fileFields ? { value: fileFields[key] } : null]))

    const optimistic = { ...fileFields }
    for (const [key, value] of entries) {
      if (value === null) delete optimistic[key]
      else optimistic[key] = value
    }
    const mine = ++generation
    apply(optimistic)

    try {
      const saved = await patch(apiClient, vaultId, change as Record<string, unknown>)
      // Only the newest change may adopt the server's copy: an older response predates the newer optimistic values.
      if (activeVaultId === vaultId && mine === generation) apply(saved)
    } catch (error) {
      if (activeVaultId === vaultId) {
        const restored = { ...fileFields }
        for (const [key, value] of entries) {
          const stillMine = value === null ? !(key in restored) : JSON.stringify(restored[key]) === JSON.stringify(value)
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

  /** Re-reads the file of the active vault. A failed read keeps what is shown (unknown, not "gone"). */
  async function refresh(vaultId: string): Promise<void> {
    if (apiClient === null || vaultId !== activeVaultId) return
    const mine = ++generation
    try {
      const fields = await fetch(apiClient, vaultId)
      if (activeVaultId === vaultId && mine === generation) {
        reportDeviations(vaultId, fields)
        apply(fields)
      }
    } catch {
      // Keep the current values; the next change event or vault switch retries.
    }
  }

  return {
    path,
    defaults,
    get,
    getRaw,
    update,
    refresh,
    onChange: subscribe,
    /** Subscribes a component to the whole snapshot (a new object after every change). */
    useSnapshot(): Record<string, unknown> {
      return useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
    },
    /** Subscribes a component to one value. */
    useValue<K extends keyof V>(key: K): V[K] {
      return useSyncExternalStore(subscribe, () => get(key), () => get(key))
    },
    /** Connects the store to the API client. Called on login / app mount. */
    initialize(client: IApiClient): void {
      apiClient = client
    },
    /** Switches to another vault: defaults at once, then the vault's file. */
    async setActiveVault(vaultId: string | null): Promise<void> {
      if (vaultId === activeVaultId) return
      activeVaultId = vaultId
      generation++
      apply({})
      if (vaultId !== null) await refresh(vaultId)
    },
    /** Disconnects on logout. */
    disconnect(): void {
      apiClient = null
      activeVaultId = null
      generation++
      apply({})
    },
    /** Resets all module state. Test helper. @internal */
    _reset(): void {
      apiClient = null
      activeVaultId = null
      generation++
      reported.clear()
      apply({})
    },
  }
}
