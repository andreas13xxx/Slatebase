/**
 * vaultSettingsStore — settings scoped to one user *and* one vault.
 *
 * Backs the editor toggles (line numbers, readable line length, spellcheck),
 * the app zoom, the knowledge-graph configuration and the two panel layouts.
 * These are personal reading preferences, not vault content — a shared vault
 * must not force one member's zoom level on everyone — but they are worth
 * remembering per vault, because a code-heavy vault and a prose vault want
 * different answers.
 *
 * Deliberately absent from the settings panel: every one of these is reached
 * through a context menu or the command palette, which is where people already
 * look for them.
 *
 * Same shape as `userSettingsStore`, with one extra dimension: the active
 * vault. Switching vaults swaps the snapshot, so consumers re-render with the
 * new vault's values without knowing a switch happened.
 *
 * @module state/vaultSettingsStore
 */

import { useSyncExternalStore } from 'react'
import type { IApiClient, UserVaultSettings, UserVaultSettingsPatch } from '../api'
import {
  reportSyncFailure,
  reportSyncSuccess,
} from './preferenceSync'

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_PREFIX = 'slatebase:vaultSettings:'
const SYNC_DEBOUNCE_MS = 800

/** Identifies this store to the shared failure bookkeeping. */
const SYNC_STORE_KEY = 'vaultSettings'

/** Mirrors the backend's `DEFAULT_VAULT_SETTINGS`. */
export const DEFAULT_VAULT_SETTINGS: UserVaultSettings = {
  lineNumbers: false,
  readableLineLength: true,
  spellcheck: true,
  spellcheckLanguage: 'de',
  zoom: 1,
  graph: null,
  sidebarPanel: null,
  contextPanel: null,
}

// ─── Internal State ──────────────────────────────────────────────────────────

let activeVaultId: string | null = null
let settings: UserVaultSettings = structuredClone(DEFAULT_VAULT_SETTINGS)
let apiClient: IApiClient | null = null
let syncTimer: ReturnType<typeof setTimeout> | null = null
let syncInProgress = false

/** Queued changes per vault, so switching vaults mid-debounce loses nothing. */
const pendingPatches = new Map<string, UserVaultSettingsPatch>()

const subscribers = new Set<() => void>()

// ─── Storage ─────────────────────────────────────────────────────────────────

function normalize(raw: unknown): UserVaultSettings {
  if (raw === null || typeof raw !== 'object') return structuredClone(DEFAULT_VAULT_SETTINGS)
  const parsed = raw as Partial<UserVaultSettings>

  return {
    lineNumbers: parsed.lineNumbers ?? DEFAULT_VAULT_SETTINGS.lineNumbers,
    readableLineLength: parsed.readableLineLength ?? DEFAULT_VAULT_SETTINGS.readableLineLength,
    spellcheck: parsed.spellcheck ?? DEFAULT_VAULT_SETTINGS.spellcheck,
    spellcheckLanguage: parsed.spellcheckLanguage ?? DEFAULT_VAULT_SETTINGS.spellcheckLanguage,
    zoom: typeof parsed.zoom === 'number' && parsed.zoom >= 0.5 && parsed.zoom <= 2
      ? parsed.zoom
      : DEFAULT_VAULT_SETTINGS.zoom,
    graph: parsed.graph ?? null,
    sidebarPanel: parsed.sidebarPanel ?? null,
    contextPanel: parsed.contextPanel ?? null,
  }
}

function loadFromStorage(vaultId: string): UserVaultSettings {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + vaultId)
    return raw === null ? structuredClone(DEFAULT_VAULT_SETTINGS) : normalize(JSON.parse(raw))
  } catch {
    return structuredClone(DEFAULT_VAULT_SETTINGS)
  }
}

function persistLocal(): void {
  if (activeVaultId === null) return
  try {
    localStorage.setItem(STORAGE_PREFIX + activeVaultId, JSON.stringify(settings))
  } catch {
    // Private mode or a full quota — the server copy is still authoritative.
  }
}

function notify(): void {
  for (const cb of subscribers) cb()
}

// ─── Subscription ────────────────────────────────────────────────────────────

function subscribe(cb: () => void): () => void {
  subscribers.add(cb)
  return () => { subscribers.delete(cb) }
}

/** Settings for the currently active vault. */
export function getVaultSettings(): UserVaultSettings {
  return settings
}

/** Subscribes a component to the active vault's settings. */
export function useVaultSettings(): UserVaultSettings {
  return useSyncExternalStore(subscribe, getVaultSettings, getVaultSettings)
}

/** Subscribes a component to a single boolean/number setting. */
export function useVaultSetting<K extends keyof UserVaultSettings>(key: K): UserVaultSettings[K] {
  return useVaultSettings()[key]
}

// ─── Mutation ────────────────────────────────────────────────────────────────

/**
 * Applies a partial change to the active vault's settings and queues a
 * debounced PATCH carrying only the changed fields.
 */
export function updateVaultSettings(patch: UserVaultSettingsPatch): void {
  if (activeVaultId === null) return

  settings = { ...settings, ...patch }
  pendingPatches.set(activeVaultId, { ...(pendingPatches.get(activeVaultId) ?? {}), ...patch })

  persistLocal()
  notify()
  scheduleSync()
}

// ─── Server Sync ─────────────────────────────────────────────────────────────

function scheduleSync(): void {
  if (!apiClient) return
  if (syncTimer !== null) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    void flushPending()
  }, SYNC_DEBOUNCE_MS)
}

/**
 * Sends every queued vault's patch, not only the active one: a user who
 * toggles something and immediately switches vaults must not lose the change.
 */
async function flushPending(): Promise<void> {
  if (!apiClient || syncInProgress) return
  if (pendingPatches.size === 0) return

  syncInProgress = true
  const queued = Array.from(pendingPatches.entries())
  pendingPatches.clear()

  try {
    for (const [vaultId, patch] of queued) {
      const { settings: saved } = await apiClient.saveVaultSettings(vaultId, patch)
      if (vaultId === activeVaultId) {
        settings = normalize(saved)
        persistLocal()
        notify()
      }
    }
    reportSyncSuccess(SYNC_STORE_KEY)
  } catch (error) {
    // Re-queue what did not make it; a change made meanwhile still wins.
    for (const [vaultId, patch] of queued) {
      pendingPatches.set(vaultId, { ...patch, ...(pendingPatches.get(vaultId) ?? {}) })
    }
    reportSyncFailure(SYNC_STORE_KEY, error, 'Vault-Einstellungen')
  } finally {
    syncInProgress = false
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/** Connects the store to the API client. Called on login / app mount. */
export function initialize(client: IApiClient): void {
  apiClient = client
}

/**
 * Switches to another vault: shows that vault's cached values immediately,
 * then replaces them with the server copy.
 *
 * The server always wins here — unlike the account-wide store there is no
 * migration seed, because these values were never keyed by vault locally, so
 * a stale browser copy carries no information the server lacks.
 */
export async function setActiveVault(vaultId: string | null): Promise<void> {
  if (vaultId === activeVaultId) return

  activeVaultId = vaultId
  if (vaultId === null) {
    settings = structuredClone(DEFAULT_VAULT_SETTINGS)
    notify()
    return
  }

  settings = loadFromStorage(vaultId)
  notify()

  if (!apiClient) return
  try {
    const { settings: remote } = await apiClient.getVaultSettings(vaultId)
    // Guard against a second switch landing while this request was in flight.
    if (activeVaultId !== vaultId) return
    settings = normalize(remote)
    persistLocal()
    notify()
  } catch {
    // Keep the cached values; the next switch or reload retries.
  }
}

/** Re-fetches after another device changed this vault's settings (SSE). */
export async function refreshFromServer(vaultId: string): Promise<void> {
  if (!apiClient || vaultId !== activeVaultId) return
  try {
    const { settings: remote } = await apiClient.getVaultSettings(vaultId)
    if (activeVaultId !== vaultId) return
    settings = normalize(remote)
    persistLocal()
    notify()
  } catch {
    // A missed refresh self-corrects on the next event or reload.
  }
}

/** Disconnects from the backend on logout. */
export function disconnect(): void {
  if (syncTimer !== null) {
    clearTimeout(syncTimer)
    syncTimer = null
  }
  apiClient = null
  activeVaultId = null
  pendingPatches.clear()
  settings = structuredClone(DEFAULT_VAULT_SETTINGS)
}

/**
 * Resets all module state. Test helper.
 * @internal
 */
export function _reset(): void {
  disconnect()
  notify()
}
