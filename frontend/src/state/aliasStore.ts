/**
 * Alias store — loads a vault's frontmatter `aliases` → path mapping and keeps
 * it available for the wikilink resolver and the Quick Switcher.
 *
 * Shape follows the project's "Action Creator" pattern (standalone async
 * functions taking `apiClient` explicitly — see lessons-learned.md), like
 * `snippetStore.ts`. The resolver, however, runs synchronously in render paths
 * and cannot await a fetch, so a tiny module-level reactive holder caches the
 * current vault's map (`useSyncExternalStore`-compatible) — the same approach
 * `favoritesStore` uses for state read from scattered UI locations. The backend
 * is the source of truth; `vault:change` invalidates the cache via a reload.
 */
import type { IApiClient } from '../api'

/** Map of lowercased alias → the file paths declaring it. */
export type AliasMap = Map<string, string[]>

/** One alias→path pair with the alias in its original casing (for display). */
export interface AliasEntry {
  alias: string
  path: string
}

const EMPTY_ALIAS_MAP: AliasMap = new Map()
const EMPTY_ALIAS_ENTRIES: readonly AliasEntry[] = []

/**
 * Fetches a vault's alias list and folds it into a `Map<lowerAlias, string[]>`
 * plus the original-cased entries (for display in the Quick Switcher).
 * Matching is case-insensitive (the map key is lowercased) to mirror name
 * resolution; the resolver lowercases the link target before lookup.
 */
export async function loadAliasData(
  apiClient: IApiClient,
  vaultId: string,
): Promise<{ map: AliasMap; entries: AliasEntry[] }> {
  const { aliases } = await apiClient.getVaultAliases(vaultId)
  const map: AliasMap = new Map()
  const entries: AliasEntry[] = []
  for (const { alias, path } of aliases) {
    entries.push({ alias, path })
    const key = alias.toLowerCase()
    const existing = map.get(key)
    if (existing) {
      if (!existing.includes(path)) existing.push(path)
    } else {
      map.set(key, [path])
    }
  }
  return { map, entries }
}

// ─── Reactive holder (current vault's map) ───────────────────────────────────

let currentVaultId: string | null = null
let currentMap: AliasMap = EMPTY_ALIAS_MAP
let currentEntries: readonly AliasEntry[] = EMPTY_ALIAS_ENTRIES
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

/** Subscribe to alias-map changes (for `useSyncExternalStore`). */
export function subscribeAliasMap(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Current vault's alias map. Empty until `refreshAliasMap` resolves. */
export function getAliasMapSnapshot(): AliasMap {
  return currentMap
}

/**
 * Current vault's alias entries with original casing, for display (Quick
 * Switcher). Empty until `refreshAliasMap` resolves.
 */
export function getAliasEntriesSnapshot(): readonly AliasEntry[] {
  return currentEntries
}

/**
 * Loads (or reloads) the alias map for `vaultId` and publishes it to subscribers.
 * Call on vault switch and on `vault:change`. Switching vault shows an empty map
 * immediately, then fills once the fetch resolves — so a stale vault's aliases
 * are never shown against the new vault. A load that resolves after the vault
 * changed again is dropped.
 */
export async function refreshAliasMap(apiClient: IApiClient, vaultId: string): Promise<void> {
  if (vaultId !== currentVaultId) {
    currentVaultId = vaultId
    currentMap = EMPTY_ALIAS_MAP
    currentEntries = EMPTY_ALIAS_ENTRIES
    emit()
  }
  let data: { map: AliasMap; entries: AliasEntry[] }
  try {
    data = await loadAliasData(apiClient, vaultId)
  } catch {
    // A failed load leaves the last good map in place rather than clearing it;
    // resolution degrades to name-only, never to a wrong target.
    return
  }
  if (vaultId !== currentVaultId) return // vault changed again mid-fetch
  currentMap = data.map
  currentEntries = data.entries
  emit()
}

/** Clears the cached map (e.g. on logout). */
export function clearAliasMap(): void {
  currentVaultId = null
  currentMap = EMPTY_ALIAS_MAP
  currentEntries = EMPTY_ALIAS_ENTRIES
  emit()
}
