/**
 * Workspaces store — named layout snapshots, per user and per vault (R2).
 *
 * A workspace is a content-free snapshot of the current layout: the pane tree
 * (via `serializePaneTree`), the panel layouts (sidebar/context), and a name.
 * It is NOT vault content — it is a personal working preference that must travel
 * across devices — so it lives in `vaultSettingsStore.workspaces` alongside the
 * graph and panel layouts, server-backed, never in `.slatebase/`.
 *
 * This module owns capture + persistence + lenient parsing. The RESTORE path
 * (replacing the live pane tree and re-fetching tab content) needs React state
 * and lives in the command handler, which calls `getWorkspaces()`/`parseWorkspace`.
 *
 * @module state/workspacesStore
 */

import type { PersistedPaneTree } from './paneTreeState'
import type { PersistedPanelLayout } from '../components/side-panel/utils/persistence'
import { getVaultSettings, updateVaultSettings } from './vaultSettingsStore'

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

/** Max workspaces kept per vault (mirrors the backend array cap). */
export const MAX_WORKSPACES = 50

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

// ─── Lenient parsing ─────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object'
}

/**
 * Leniently parse one stored workspace, or null if it is structurally unusable.
 * The pane-tree/panel internals are NOT deep-validated here — a workspace whose
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

/** The active vault's saved workspaces (leniently parsed; bad entries dropped). */
export function getWorkspaces(): NamedWorkspace[] {
  const raw = getVaultSettings().workspaces
  if (!Array.isArray(raw)) return []
  return raw
    .map(parseWorkspace)
    .filter((w): w is NamedWorkspace => w !== null)
}

/** Finds a workspace by name (case-insensitive). */
export function findWorkspace(name: string): NamedWorkspace | null {
  const lower = name.toLowerCase()
  return getWorkspaces().find((w) => w.name.toLowerCase() === lower) ?? null
}

// ─── Mutations (persist to vaultSettings) ─────────────────────────────────────

function persist(list: NamedWorkspace[]): void {
  // Cast through unknown: the store field is the opaque backend shape.
  updateVaultSettings({ workspaces: list as unknown as Record<string, unknown>[] })
}

/**
 * Saves (upserts) a workspace. A same-name entry (case-insensitive) is
 * overwritten; the caller confirms the overwrite first. Returns false when the
 * cap is reached and this would be a new entry.
 */
export function saveWorkspace(ws: NamedWorkspace): boolean {
  const list = getWorkspaces()
  const idx = list.findIndex((w) => w.name.toLowerCase() === ws.name.toLowerCase())
  if (idx === -1) {
    if (list.length >= MAX_WORKSPACES) return false
    persist([...list, ws])
  } else {
    const next = [...list]
    next[idx] = ws
    persist(next)
  }
  return true
}

/** Renames a workspace. No-op when `from` is missing or `to` collides. */
export function renameWorkspace(from: string, to: string): boolean {
  const list = getWorkspaces()
  const trimmed = to.trim()
  if (trimmed.length === 0) return false
  if (list.some((w) => w.name.toLowerCase() === trimmed.toLowerCase())) return false
  const idx = list.findIndex((w) => w.name.toLowerCase() === from.toLowerCase())
  if (idx === -1) return false
  const next = [...list]
  next[idx] = { ...next[idx]!, name: trimmed }
  persist(next)
  return true
}

/** Deletes a workspace by name. */
export function deleteWorkspace(name: string): void {
  const lower = name.toLowerCase()
  persist(getWorkspaces().filter((w) => w.name.toLowerCase() !== lower))
}
