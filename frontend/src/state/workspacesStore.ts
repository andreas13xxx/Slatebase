/**
 * Workspaces store — the vault's named layout snapshots, from `.obsidian/workspaces.json`.
 *
 * The file is the vault's, so the saved layouts are the same for everyone who opens the vault and for
 * Obsidian (whose core Workspaces plugin keeps the same file). A workspace is a content-free snapshot
 * of the layout: the pane tree and the panel layouts. It is written as an Obsidian layout (`main` tree)
 * plus a `slatebase` block with the exact snapshot, so loading it here loses nothing; a layout without
 * that block (saved by Obsidian) is read from its `main` tree, and what Slatebase cannot show is left
 * out of the loaded layout and stays in the file. The current layout with the open tabs
 * (`workspace.json`) stays per user and is never written.
 *
 * Reads are synchronous from a cache the lifecycle component fills (`loadVaultWorkspaces`); changes
 * apply to the cache at once and are written in order. Loading a workspace is local and writes nothing;
 * only saving sets the file's `active`. The per-user lists of older versions are moved into the file once
 * per vault (the later saved layout keeps a name both have, the other gets a number).
 *
 * @module state/workspacesStore
 */

import { MAX_WORKSPACES, isValidWorkspaceName } from '@slatebase/shared-contracts'
import type { IApiClient } from '../api'
import type { PersistedPaneTree } from './paneTreeState'
import { parsePersistedPaneTree } from './paneTreeState'
import type { PersistedPanelLayout } from '../components/side-panel/utils/persistence'
import { getVaultSettings, updateVaultSettings } from './vaultSettingsStore'
import { obsidianToPaneTree, paneTreeToObsidian } from './obsidianLayout'
import { reportSyncFailure, reportSyncSuccess } from './preferenceSync'

export { MAX_WORKSPACES }

/** A named, content-free layout snapshot. */
export interface NamedWorkspace {
  /** Unique display name (also the collision key for save/overwrite). */
  name: string
  /** ISO timestamp of when it was saved. */
  savedAt: string
  /** The serialized pane tree (tabs without content). */
  paneTree: PersistedPaneTree
  /** Copy of the sidebar panel layout at save time, if any. */
  sidebarPanel?: PersistedPanelLayout
  /** Copy of the context panel layout at save time, if any. */
  contextPanel?: PersistedPanelLayout
}

type Layout = Record<string, unknown>

/** Identifies this store to the shared failure bookkeeping. */
const SYNC_STORE_KEY = 'workspaces'
const TAKEN_OVER_PREFIX = 'slatebase:workspaces-taken-over:'

// ─── State ───────────────────────────────────────────────────────────────────

let apiClient: IApiClient | null = null
let currentVaultId: string | null = null
/** The file's layouts by name, in file order. */
let layouts = new Map<string, Layout>()
let activeName: string | null = null
const listeners = new Set<() => void>()
/** Writes run one after another, so a rename cannot overtake the save before it. */
let writeChain: Promise<void> = Promise.resolve()
let pendingWrites = 0
/** Bumped on disconnect, so a write that outlives its session cannot touch the next one's counter. */
let generation = 0
/** A read was asked for while a write was running or the vault was just switched; do it when the writes are done. */
let reloadRequested = false
/** The parsed list for the current `layouts`, so a render does not parse every layout again. */
let parsedCache: { layouts: Map<string, Layout>; vaultId: string; list: NamedWorkspace[] } | null = null
/** Skipped-leaf reports already written to the console (once per layout). */
const reported = new Set<string>()

export function initialize(client: IApiClient): void {
  apiClient = client
}

export function disconnect(): void {
  apiClient = null
  currentVaultId = null
  layouts = new Map()
  activeName = null
  writeChain = Promise.resolve()
  pendingWrites = 0
  generation++
  reloadRequested = false
  parsedCache = null
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(TAKEN_OVER_PREFIX)) localStorage.removeItem(key)
  } catch {
    // Silently fail
  }
}

/** Calls `cb` whenever the saved layouts may have changed. Returns the unsubscribe function. */
export function onWorkspacesChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function notify(): void {
  for (const cb of listeners) cb()
}

// ─── Building and reading a workspace ────────────────────────────────────────

/**
 * Builds a NamedWorkspace from live layout data. Pure — the caller reads the
 * live pane tree (`serializePaneTree(usePaneTree().tree)`) and the current
 * panel layouts (`loadPanelLayout`) and passes them in, so this module stays
 * React-free.
 */
export function buildWorkspace(
  name: string,
  paneTree: PersistedPaneTree,
  sidebarPanel: PersistedPanelLayout | null,
  contextPanel: PersistedPanelLayout | null,
): NamedWorkspace {
  const ws: NamedWorkspace = { name: name.trim(), savedAt: new Date().toISOString(), paneTree }
  if (sidebarPanel) ws.sidebarPanel = sidebarPanel
  if (contextPanel) ws.contextPanel = contextPanel
  return ws
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Leniently parse one workspace of the per-user list of older versions, or null if it is structurally
 * unusable. The pane-tree/panel internals are NOT deep-validated here — a workspace whose
 * tree has stale entries is handled at restore time (unresolvable tabs are
 * skipped), matching `parsePersistedPaneTree`'s tolerance.
 */
export function parseWorkspace(data: unknown): NamedWorkspace | null {
  if (!isObject(data)) return null
  if (typeof data.name !== 'string' || data.name.length === 0) return null
  if (!isObject(data.paneTree)) return null
  const ws: NamedWorkspace = {
    name: data.name,
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : new Date().toISOString(),
    paneTree: data.paneTree as unknown as PersistedPaneTree,
  }
  if (isObject(data.sidebarPanel)) ws.sidebarPanel = data.sidebarPanel as unknown as PersistedPanelLayout
  if (isObject(data.contextPanel)) ws.contextPanel = data.contextPanel as unknown as PersistedPanelLayout
  return ws
}

/** A short fingerprint of a layout tree, to notice that it was changed after Slatebase saved it. */
function fingerprint(value: unknown): string {
  const text = JSON.stringify(value)
  let hash = 5381
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0
  return hash.toString(16)
}

/** The file entry for a workspace: Obsidian's layout plus Slatebase's own snapshot. */
function toLayout(ws: NamedWorkspace, vaultId: string): Layout {
  const { main, active, lastOpenFiles } = paneTreeToObsidian(ws.paneTree, vaultId)
  const slatebase: Layout = { savedAt: ws.savedAt, paneTree: ws.paneTree, mainHash: fingerprint(main) }
  if (ws.sidebarPanel) slatebase['sidebarPanel'] = ws.sidebarPanel
  if (ws.contextPanel) slatebase['contextPanel'] = ws.contextPanel
  return { main, active, lastOpenFiles, slatebase }
}

/** A workspace from a file entry, or null if nothing in it can be shown. */
function fromLayout(name: string, layout: unknown, vaultId: string): NamedWorkspace | null {
  if (!isObject(layout)) return null
  const own = isObject(layout['slatebase']) ? layout['slatebase'] : null
  const exact = own ? parsePersistedPaneTree(own['paneTree']) : null
  // The exact snapshot is only right while `main` is what Slatebase wrote: a layout changed in Obsidian
  // since (a different fingerprint) is read from `main`, keeping Slatebase's panel layouts
  const unchanged = own !== null && (own['mainHash'] === undefined || own['mainHash'] === fingerprint(layout['main']))
  const savedAt = own && typeof own['savedAt'] === 'string' ? own['savedAt'] : new Date(0).toISOString()
  const panels = {
    ...(own && isObject(own['sidebarPanel']) ? { sidebarPanel: own['sidebarPanel'] as unknown as PersistedPanelLayout } : {}),
    ...(own && isObject(own['contextPanel']) ? { contextPanel: own['contextPanel'] as unknown as PersistedPanelLayout } : {}),
  }
  if (exact && unchanged) return { name, savedAt, paneTree: exact, ...panels }
  const converted = obsidianToPaneTree(layout['main'], vaultId)
  if (!converted) return null
  const key = `${vaultId}\0${name}`
  if (converted.skipped > 0 && !reported.has(key)) {
    reported.add(key)
    console.warn(`[workspaces.json] ${name}: ${converted.skipped} element(s) of the layout cannot be shown in Slatebase; they stay in the file`)
  }
  return { name, savedAt, paneTree: converted.tree, ...panels }
}

// ─── Reading ─────────────────────────────────────────────────────────────────

/** The active vault's saved workspaces (entries that cannot be shown are left out). */
export function getWorkspaces(): NamedWorkspace[] {
  if (!currentVaultId) return []
  const vaultId = currentVaultId
  if (parsedCache && parsedCache.layouts === layouts && parsedCache.vaultId === vaultId) return parsedCache.list
  const list = [...layouts].map(([name, layout]) => fromLayout(name, layout, vaultId)).filter((w): w is NamedWorkspace => w !== null)
  parsedCache = { layouts, vaultId, list }
  return list
}

/** Finds a workspace by name (case-insensitive). */
export function findWorkspace(name: string): NamedWorkspace | null {
  const lower = name.toLowerCase()
  return getWorkspaces().find((w) => w.name.toLowerCase() === lower) ?? null
}

/** The name the file calls active (the layout last saved), or null. */
export function getActiveWorkspaceName(): string | null {
  return activeName
}

function applyFile(config: Record<string, unknown>): void {
  const map = new Map<string, Layout>()
  const raw = config['workspaces']
  if (isObject(raw)) {
    for (const [name, layout] of Object.entries(raw)) if (isObject(layout)) map.set(name, layout)
  }
  layouts = map
  activeName = typeof config['active'] === 'string' ? config['active'] : null
}

/** The name the file already uses for `name` ignoring case, else `name`. */
function fileNameFor(name: string): string {
  return findByLowerName(name) ?? name
}

// ─── Loading the file ────────────────────────────────────────────────────────

/**
 * Read the vault's workspaces.json into the cache. Called when a vault is opened and when the file
 * changed elsewhere (Obsidian, a sync, another user). Not while a change of this session is still
 * being written. The first time a vault is read on a device, the per-user list of older versions is
 * moved into the file. Returns whether the cache was replaced.
 */
export async function loadVaultWorkspaces(vaultId: string): Promise<boolean> {
  const client = apiClient
  if (!client) return false
  if (currentVaultId !== vaultId) {
    currentVaultId = vaultId
    layouts = new Map()
    activeName = null
    notify()
  }
  if (pendingWrites > 0) {
    reloadRequested = true
    return false
  }
  let config: Record<string, unknown>
  try {
    config = await client.getWorkspacesConfig(vaultId)
  } catch {
    return false // unknown, not gone: the cache stays
  }
  if (currentVaultId !== vaultId || pendingWrites > 0) {
    if (currentVaultId === vaultId) reloadRequested = true
    return false
  }
  applyFile(config)
  if (!isTakenOver(vaultId)) await takeOverUserWorkspaces(client, vaultId)
  notify()
  return true
}

/** Moves the per-user workspaces of older versions into the file. */
async function takeOverUserWorkspaces(client: IApiClient, vaultId: string): Promise<void> {
  // The server's own copy of this vault's settings, read here: the settings store may not have loaded
  // yet, or may be showing another vault
  let stored: unknown
  try {
    stored = (await client.getVaultSettings(vaultId)).settings.workspaces
  } catch {
    return // not known yet: try again the next time this vault is opened
  }
  const legacy = (Array.isArray(stored) ? stored : [])
    .map(parseWorkspace)
    .filter((w): w is NamedWorkspace => w !== null && isValidWorkspaceName(w.name))
  if (legacy.length === 0) {
    markTakenOver(vaultId)
    return
  }
  // Names in use, lower-cased, with the file's own spelling; names the patch adds count too
  const taken = new Map<string, string>([...layouts.keys()].map((n) => [n.toLowerCase(), n]))
  const patch: Record<string, Layout> = {}
  for (const ws of legacy) {
    if (taken.size >= MAX_WORKSPACES) break
    const clash = taken.get(ws.name.toLowerCase())
    if (clash === undefined) {
      patch[ws.name] = toLayout(ws, vaultId)
      taken.set(ws.name.toLowerCase(), ws.name)
      continue
    }
    // The later saved layout keeps the name, the other one is kept under a number. A file entry that
    // cannot be read is not replaced.
    const current = Object.hasOwn(patch, clash) ? patch[clash] : layouts.get(clash)
    const inFile = fromLayout(clash, current, vaultId)
    const free = freeName(ws.name, taken)
    if (!inFile || inFile.savedAt >= ws.savedAt) {
      patch[free] = toLayout({ ...ws, name: free }, vaultId)
    } else {
      patch[free] = current!
      patch[clash] = toLayout({ ...ws, name: clash }, vaultId)
      taken.set(free.toLowerCase(), free)
      continue
    }
    taken.set(free.toLowerCase(), free)
  }
  pendingWrites++ // a read of the file must not overwrite the cache with the state from before this write
  const session = generation
  try {
    applyFile(await client.patchWorkspacesConfig(vaultId, { workspaces: patch }))
    await client.saveVaultSettings(vaultId, { workspaces: [] })
  } catch {
    // No write access or server down: try again the next time this vault is opened. If the file took the
    // layouts and the old list is still there, that run finds the names taken and keeps what the file has.
    return
  } finally {
    if (session === generation) pendingWrites--
  }
  if (getVaultSettings().workspaces.length > 0) updateVaultSettings({ workspaces: [] })
  markTakenOver(vaultId)
}

function findByLowerName(name: string): string | null {
  const lower = name.toLowerCase()
  for (const existing of layouts.keys()) if (existing.toLowerCase() === lower) return existing
  return null
}

function freeName(base: string, taken: Map<string, string>): string {
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

function isTakenOver(vaultId: string): boolean {
  try {
    return localStorage.getItem(TAKEN_OVER_PREFIX + vaultId) !== null
  } catch {
    return false
  }
}

function markTakenOver(vaultId: string): void {
  try {
    localStorage.setItem(TAKEN_OVER_PREFIX + vaultId, '1')
  } catch {
    // Silently fail
  }
}

// ─── Mutations (written to the file) ─────────────────────────────────────────

/** Writes a patch after the writes before it. A refused write puts the file's state back and says so. */
function write(vaultId: string, patch: Record<string, unknown>): void {
  const client = apiClient
  if (!client) return
  const session = generation
  pendingWrites++
  writeChain = writeChain
    .then(async () => {
      if (session !== generation) return // logged out meanwhile
      try {
        const saved = await client.patchWorkspacesConfig(vaultId, patch)
        reportSyncSuccess(SYNC_STORE_KEY)
        if (session === generation && currentVaultId === vaultId && pendingWrites === 1) {
          applyFile(saved)
          notify()
        }
      } catch (error) {
        reportSyncFailure(SYNC_STORE_KEY, error, 'Arbeitsbereiche')
        if (session === generation && currentVaultId === vaultId && pendingWrites === 1) {
          // What was refused must not stay on screen as if saved: show the file again
          try {
            applyFile(await client.getWorkspacesConfig(vaultId))
            notify()
          } catch {
            // The cache stays; the next read corrects it
          }
        }
      }
    })
    .catch(() => undefined) // one failing write must not stop the ones after it
    .finally(() => {
      if (session !== generation) return
      pendingWrites--
      // A read that was held back while writing (the file changed elsewhere, or the vault was switched)
      if (pendingWrites === 0 && reloadRequested && currentVaultId) {
        reloadRequested = false
        void loadVaultWorkspaces(currentVaultId)
      }
    })
}

/** Why {@link saveWorkspace} refused a workspace, for the message. */
export function workspaceSaveProblem(ws: NamedWorkspace): 'no-vault' | 'invalid-name' | 'limit' {
  if (!currentVaultId) return 'no-vault'
  if (!isValidWorkspaceName(ws.name)) return 'invalid-name'
  return 'limit'
}

/**
 * Saves (upserts) a workspace and makes it the file's active one. A same-name entry (case-insensitive)
 * is overwritten; the caller confirms the overwrite first. Returns false when the cap is reached and
 * this would be a new entry, or the name cannot be used.
 */
export function saveWorkspace(ws: NamedWorkspace): boolean {
  const vaultId = currentVaultId
  if (!vaultId || !isValidWorkspaceName(ws.name)) return false
  const name = fileNameFor(ws.name.trim())
  if (!layouts.has(name) && layouts.size >= MAX_WORKSPACES) return false
  const layout = toLayout({ ...ws, name }, vaultId)
  layouts = new Map(layouts).set(name, layout)
  activeName = name
  notify()
  write(vaultId, { workspaces: { [name]: layout }, active: name })
  return true
}

/** Renames a workspace. No-op when `from` is missing or `to` collides or cannot be used. */
export function renameWorkspace(from: string, to: string): boolean {
  const vaultId = currentVaultId
  const trimmed = to.trim()
  if (!vaultId || !isValidWorkspaceName(trimmed)) return false
  if (findByLowerName(trimmed) !== null) return false
  const source = findByLowerName(from)
  if (source === null) return false
  const layout = layouts.get(source)!
  const next = new Map<string, Layout>()
  for (const [name, value] of layouts) next.set(name === source ? trimmed : name, value)
  layouts = next
  const patch: Record<string, unknown> = { workspaces: { [source]: null, [trimmed]: layout } }
  if (activeName === source) {
    activeName = trimmed
    patch['active'] = trimmed
  }
  notify()
  write(vaultId, patch)
  return true
}

/** Deletes a workspace by name. */
export function deleteWorkspace(name: string): void {
  const vaultId = currentVaultId
  const existing = findByLowerName(name)
  if (!vaultId || existing === null) return
  const next = new Map(layouts)
  next.delete(existing)
  layouts = next
  const patch: Record<string, unknown> = { workspaces: { [existing]: null } }
  if (activeName === existing) {
    activeName = null
    patch['active'] = null
  }
  notify()
  write(vaultId, patch)
}

/**
 * Forget all in-memory state; used by tests, which share this module-level store across cases.
 * @internal
 */
export function _reset(): void {
  disconnect()
  listeners.clear()
  reported.clear()
}
