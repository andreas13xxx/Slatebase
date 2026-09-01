/**
 * userSettingsStore — account-wide UI settings, server-backed.
 *
 * Backs everything under Einstellungen → Darstellung: the status bar and its
 * items, the toolbar, and the file explorer's follow-active-file behaviour.
 * These were device-local `localStorage` values, so "my settings" silently
 * differed per browser; they now live in `data/users/<id>-preferences.json`
 * and follow the account, the same way keybindings already did.
 *
 * Shape follows `keybindingsStore`: a module-level snapshot every consumer
 * subscribes to via `useSyncExternalStore`, a localStorage cache for the
 * synchronous first paint, and a debounced PATCH to the server. Only the
 * fields a caller actually changed are sent, so two controls saved in quick
 * succession cannot overwrite each other.
 *
 * @module state/userSettingsStore
 */

import { useSyncExternalStore } from 'react'
import type { IApiClient, UserUiSettings, UserUiSettingsPatch } from '../api'
import {
  hasSyncedBefore,
  markSyncedBefore,
  clearSyncedBefore,
  reportSyncFailure,
  reportSyncSuccess,
} from './preferenceSync'

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'slatebase:uiSettings'
const SYNC_DEBOUNCE_MS = 800

/** Identifies this store to the shared first-sync/failure bookkeeping. */
const SYNC_STORE_KEY = 'uiSettings'

/** Mirrors the backend's `DEFAULT_UI_SETTINGS`. */
export const DEFAULT_UI_SETTINGS: UserUiSettings = {
  statusBarVisible: true,
  statusBarItems: {},
  explorerFollowActiveFile: false,
  toolbar: {
    visible: true,
    position: 'left',
    order: [],
    // The toolbar's own "ausblenden" button starts hidden — the context menu
    // and the command already cover it. Mirrored by the backend defaults and
    // re-exported as `DEFAULT_TOOLBAR_PREFS` from `toolbarStore`.
    hidden: ['toggle-toolbar'],
    colors: {},
  },
}

// ─── Internal State ──────────────────────────────────────────────────────────

let settings: UserUiSettings = loadFromStorage()
let apiClient: IApiClient | null = null
let syncTimer: ReturnType<typeof setTimeout> | null = null
let syncInProgress = false

/** Fields changed since the last successful PATCH, merged into one request. */
let pendingPatch: UserUiSettingsPatch = {}

const subscribers = new Set<() => void>()

// ─── Storage ─────────────────────────────────────────────────────────────────

/** Fills any missing field from the defaults, so an older cache still parses. */
function normalize(raw: unknown): UserUiSettings {
  if (raw === null || typeof raw !== 'object') return structuredClone(DEFAULT_UI_SETTINGS)
  const parsed = raw as Partial<UserUiSettings>
  const toolbar = (parsed.toolbar ?? {}) as Partial<UserUiSettings['toolbar']>

  return {
    statusBarVisible: parsed.statusBarVisible ?? DEFAULT_UI_SETTINGS.statusBarVisible,
    statusBarItems: parsed.statusBarItems ?? {},
    explorerFollowActiveFile:
      parsed.explorerFollowActiveFile ?? DEFAULT_UI_SETTINGS.explorerFollowActiveFile,
    toolbar: {
      visible: toolbar.visible ?? DEFAULT_UI_SETTINGS.toolbar.visible,
      position: toolbar.position ?? DEFAULT_UI_SETTINGS.toolbar.position,
      order: toolbar.order ?? [],
      hidden: toolbar.hidden ?? [...DEFAULT_UI_SETTINGS.toolbar.hidden],
      colors: toolbar.colors ?? {},
    },
  }
}

function loadFromStorage(): UserUiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === null ? structuredClone(DEFAULT_UI_SETTINGS) : normalize(JSON.parse(raw))
  } catch {
    return structuredClone(DEFAULT_UI_SETTINGS)
  }
}

function persistLocal(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
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

/** Current settings snapshot. Stable between changes, as required by React. */
export function getUiSettings(): UserUiSettings {
  return settings
}

/** Subscribes a component to the account-wide UI settings. */
export function useUiSettings(): UserUiSettings {
  return useSyncExternalStore(subscribe, getUiSettings, getUiSettings)
}

// ─── Mutation ────────────────────────────────────────────────────────────────

/**
 * Applies a partial change locally (so the UI reacts immediately) and queues a
 * debounced PATCH carrying only the changed fields.
 */
export function updateUiSettings(patch: UserUiSettingsPatch): void {
  settings = {
    ...settings,
    ...patch,
    toolbar: { ...settings.toolbar, ...(patch.toolbar ?? {}) },
  }
  pendingPatch = {
    ...pendingPatch,
    ...patch,
    ...(patch.toolbar !== undefined
      ? { toolbar: { ...(pendingPatch.toolbar ?? {}), ...patch.toolbar } }
      : {}),
  }

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
    void syncToServer()
  }, SYNC_DEBOUNCE_MS)
}

async function syncToServer(): Promise<void> {
  if (!apiClient || syncInProgress) return
  if (Object.keys(pendingPatch).length === 0) return

  syncInProgress = true
  // Claim the queued fields before awaiting: a change made mid-flight belongs
  // to the next request, not this one.
  const patch = pendingPatch
  pendingPatch = {}

  try {
    const { settings: saved } = await apiClient.saveUiSettings(patch)
    settings = normalize(saved)
    persistLocal()
    notify()
    markSyncedBefore(SYNC_STORE_KEY)
    reportSyncSuccess(SYNC_STORE_KEY)
  } catch (error) {
    // Put the fields back so the next attempt still carries them.
    pendingPatch = { ...patch, ...pendingPatch }
    reportSyncFailure(SYNC_STORE_KEY, error, 'Darstellungseinstellungen')
  } finally {
    syncInProgress = false
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Loads the server copy and takes over from the local cache.
 *
 * The server is authoritative unless this device has never synced and holds
 * local settings — the migration case for values that used to live only in
 * `localStorage`. See preferenceSync.ts.
 */
export async function initialize(client: IApiClient): Promise<void> {
  apiClient = client
  try {
    const { settings: remote } = await client.getUiSettings()

    if (!hasSyncedBefore(SYNC_STORE_KEY) && hasLocalOverrides()) {
      // Seed the server from what this browser accumulated before the move.
      pendingPatch = { ...settings }
      await syncToServer()
      return
    }

    settings = normalize(remote)
    persistLocal()
    notify()
    markSyncedBefore(SYNC_STORE_KEY)
  } catch {
    // Server unreachable — keep the cache and set no marker, so a later
    // successful init can still seed from it.
  }
}

/** True when the local cache differs from the shipped defaults. */
function hasLocalOverrides(): boolean {
  return JSON.stringify(settings) !== JSON.stringify(DEFAULT_UI_SETTINGS)
}

/** Re-fetches after another device changed these settings (SSE). */
export async function refreshFromServer(): Promise<void> {
  if (!apiClient) return
  try {
    const { settings: remote } = await apiClient.getUiSettings()
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
  pendingPatch = {}
  clearSyncedBefore(SYNC_STORE_KEY)
}

/**
 * Resets to defaults and drops the local cache. Test helper.
 * @internal
 */
export function _reset(): void {
  settings = structuredClone(DEFAULT_UI_SETTINGS)
  pendingPatch = {}
  apiClient = null
  if (syncTimer !== null) {
    clearTimeout(syncTimer)
    syncTimer = null
  }
  notify()
}
