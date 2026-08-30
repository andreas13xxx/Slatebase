/**
 * toolbarStore — persisted user preferences for the app toolbar (Werkzeugleiste).
 *
 * Holds everything the user can customise about the toolbar: whether it is
 * shown at all, which side of the editor it sits on, the order of its buttons,
 * which buttons are hidden, and a per-button accent colour.
 *
 * Built-in buttons and plugin ribbon icons share this one store — a plugin
 * ribbon icon is just another entry id (`plugin:<pluginId>:<title>`), so
 * hiding/reordering/colouring works identically for both (that parity is the
 * whole point; see SidebarToolbar's `buildEntries`).
 *
 * Mirrors the module-level `useSyncExternalStore` pattern of
 * `hooks/useStatusBar.ts` — a single module-level snapshot every consumer
 * subscribes to, so a change made in a context menu is reflected everywhere
 * (toolbar, command palette, App layout) in the same commit.
 *
 * @module state/toolbarStore
 */

import { useSyncExternalStore } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Which side of the editor pane the toolbar is docked to. */
export type ToolbarPosition = 'left' | 'right'

/** The full persisted preference set. */
export interface ToolbarPrefs {
  /** Whether the toolbar is rendered at all. */
  visible: boolean
  /** Side of the editor pane the toolbar docks to. */
  position: ToolbarPosition
  /**
   * Explicit button order (entry ids). Ids that no longer exist are ignored,
   * entries not listed here are appended in their natural registration order —
   * see `resolveOrder`.
   */
  order: string[]
  /** Entry ids the user has hidden. */
  hidden: string[]
  /** Per-entry colour override (CSS colour string), keyed by entry id. */
  colors: Record<string, string>
}

/** Where an entry should move to, for the button context menu. */
export type MoveTarget = 'up' | 'down' | 'start' | 'end'

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'slatebase:toolbar'

/** Id prefix marking an entry as a plugin ribbon icon rather than a built-in. */
export const PLUGIN_ENTRY_PREFIX = 'plugin:'

/** Defaults used when nothing is persisted yet (or storage is unusable). */
export const DEFAULT_TOOLBAR_PREFS: ToolbarPrefs = {
  visible: true,
  position: 'left',
  order: [],
  hidden: [],
  colors: {},
}

/**
 * Colour choices offered in the "Farbe wählen" submenu.
 * `value: null` clears the override and restores the inherited toolbar colour.
 */
export const TOOLBAR_COLORS: Array<{ id: string; label: string; value: string | null }> = [
  { id: 'default', label: 'Standard', value: null },
  { id: 'red', label: 'Rot', value: '#ef4444' },
  { id: 'orange', label: 'Orange', value: '#f97316' },
  { id: 'yellow', label: 'Gelb', value: '#eab308' },
  { id: 'green', label: 'Grün', value: '#22c55e' },
  { id: 'cyan', label: 'Türkis', value: '#06b6d4' },
  { id: 'blue', label: 'Blau', value: '#3b82f6' },
  { id: 'purple', label: 'Violett', value: '#a855f7' },
  { id: 'pink', label: 'Pink', value: '#ec4899' },
]

// ─── Pure helpers (exported for tests and for callers that build orders) ─────

/**
 * Produces the effective display order for `presentIds`.
 *
 * Persisted ids that are no longer present (an uninstalled plugin, an
 * admin-only button for a non-admin) drop out; ids that are present but not in
 * the persisted order (a freshly added built-in, a newly registered ribbon
 * icon) are appended in their natural order. This is what keeps a saved
 * customisation from silently discarding new buttons.
 */
export function resolveOrder(order: string[], presentIds: string[]): string[] {
  const present = new Set(presentIds)
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of order) {
    if (present.has(id) && !seen.has(id)) {
      result.push(id)
      seen.add(id)
    }
  }
  for (const id of presentIds) {
    if (!seen.has(id)) {
      result.push(id)
      seen.add(id)
    }
  }
  return result
}

/**
 * Moves `id` within `ids` one step (`up`/`down`) or all the way
 * (`start`/`end`). Returns `ids` unchanged when the entry is unknown or
 * already at the requested edge.
 */
export function moveWithin(ids: string[], id: string, target: MoveTarget): string[] {
  const from = ids.indexOf(id)
  if (from === -1) return ids

  let to: number
  switch (target) {
    case 'up': to = from - 1; break
    case 'down': to = from + 1; break
    case 'start': to = 0; break
    case 'end': to = ids.length - 1; break
  }
  if (to < 0 || to >= ids.length || to === from) return ids

  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}

/**
 * Drops `dragId` at `targetId`'s slot — the drag-and-drop counterpart of
 * `moveWithin`. Dragging downwards lands *after* the target, upwards *before*
 * it, which is what the pointer visually suggests.
 */
export function moveToIndexOf(ids: string[], dragId: string, targetId: string): string[] {
  if (dragId === targetId) return ids
  const from = ids.indexOf(dragId)
  const to = ids.indexOf(targetId)
  if (from === -1 || to === -1) return ids

  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, dragId)
  return next
}

// ─── Module-level state ──────────────────────────────────────────────────────

let current: ToolbarPrefs = readFromStorage()
const subscribers = new Set<() => void>()

/**
 * Reads and validates persisted preferences. Any malformed field falls back to
 * its default individually, so one corrupted key never wipes the rest.
 */
function readFromStorage(): ToolbarPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { ...DEFAULT_TOOLBAR_PREFS }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_TOOLBAR_PREFS }
    const obj = parsed as Partial<Record<keyof ToolbarPrefs, unknown>>

    return {
      visible: typeof obj.visible === 'boolean' ? obj.visible : DEFAULT_TOOLBAR_PREFS.visible,
      position: obj.position === 'right' || obj.position === 'left' ? obj.position : DEFAULT_TOOLBAR_PREFS.position,
      order: isStringArray(obj.order) ? obj.order : [],
      hidden: isStringArray(obj.hidden) ? obj.hidden : [],
      colors: isColorMap(obj.colors) ? obj.colors : {},
    }
  } catch {
    return { ...DEFAULT_TOOLBAR_PREFS }
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

function isColorMap(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === 'string')
}

function persist(prefs: ToolbarPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // localStorage unavailable (private mode, quota) — state stays in memory
  }
}

function update(patch: Partial<ToolbarPrefs>): void {
  const next = { ...current, ...patch }
  current = next
  persist(next)
  for (const cb of subscribers) cb()
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback)
  return () => { subscribers.delete(callback) }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Current preferences snapshot (non-reactive — for command callbacks). */
export function getToolbarPrefs(): ToolbarPrefs {
  return current
}

/** Show or hide the whole toolbar. */
export function setToolbarVisible(visible: boolean): void {
  update({ visible })
}

/** Toggle the whole toolbar — backs the "Werkzeugleiste ein-/ausblenden" command. */
export function toggleToolbarVisible(): void {
  update({ visible: !current.visible })
}

/** Dock the toolbar to the left or right of the editor pane. */
export function setToolbarPosition(position: ToolbarPosition): void {
  update({ position })
}

/** Replace the persisted button order (callers pass a fully resolved id list). */
export function setToolbarOrder(order: string[]): void {
  update({ order })
}

/** Whether `id` is currently hidden. */
export function isEntryHidden(id: string): boolean {
  return current.hidden.includes(id)
}

/** Show or hide a single button. */
export function setEntryHidden(id: string, hidden: boolean): void {
  const already = current.hidden.includes(id)
  if (hidden === already) return
  update({ hidden: hidden ? [...current.hidden, id] : current.hidden.filter((x) => x !== id) })
}

/** Flip a single button's visibility. */
export function toggleEntryHidden(id: string): void {
  setEntryHidden(id, !isEntryHidden(id))
}

/** Set (or, with `null`, clear) a button's colour override. */
export function setEntryColor(id: string, color: string | null): void {
  const colors = { ...current.colors }
  if (color === null) delete colors[id]
  else colors[id] = color
  update({ colors })
}

/**
 * Move a button within the current display order.
 * `visibleIds` is the order as rendered right now, so a move is relative to
 * what the user actually sees rather than to hidden entries they cannot.
 */
export function moveEntry(id: string, target: MoveTarget, visibleIds: string[]): void {
  const moved = moveWithin(visibleIds, id, target)
  if (moved === visibleIds) return
  update({ order: mergeOrder(current.order, moved) })
}

/** Drag-and-drop reorder: drop `dragId` onto `targetId`'s slot. */
export function reorderEntry(dragId: string, targetId: string, visibleIds: string[]): void {
  const moved = moveToIndexOf(visibleIds, dragId, targetId)
  if (moved === visibleIds) return
  update({ order: mergeOrder(current.order, moved) })
}

/** Restore order, hidden state and colours (keeps visibility and position). */
export function resetToolbarLayout(): void {
  update({ order: [], hidden: [], colors: {} })
}

/**
 * Folds a newly computed visible order back into the persisted order.
 *
 * The persisted list also carries ids that are hidden right now or belong to a
 * plugin that isn't loaded in this session. Rewriting `order` to just the
 * visible ids would forget those, so hidden/absent entries keep their relative
 * slots and only the visible ones are re-sequenced.
 */
function mergeOrder(persisted: string[], visibleOrder: string[]): string[] {
  const visibleSet = new Set(visibleOrder)
  const result: string[] = []
  let cursor = 0

  for (const id of persisted) {
    if (visibleSet.has(id)) {
      // Slot occupied by a visible entry — fill it from the new sequence.
      const replacement = visibleOrder[cursor]
      if (replacement !== undefined) result.push(replacement)
      cursor += 1
    } else {
      result.push(id)
    }
  }
  // Entries the persisted list never knew about (first customisation, or a
  // button added since) go to the end in their new relative order.
  for (; cursor < visibleOrder.length; cursor++) {
    const id = visibleOrder[cursor]
    if (id !== undefined && !result.includes(id)) result.push(id)
  }
  return result
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/** Subscribe a component to the toolbar preferences. */
export function useToolbarPrefs(): ToolbarPrefs {
  return useSyncExternalStore(subscribe, getToolbarPrefs)
}

/** Test-only: reset the in-memory snapshot and stored value. */
export function __resetToolbarStoreForTests(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  current = { ...DEFAULT_TOOLBAR_PREFS }
  for (const cb of subscribers) cb()
}
