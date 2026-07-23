/**
 * Workspace Store — persists and restores UI layout state across page reloads.
 *
 * Persisted state:
 * - Open tabs (vaultId, filePath, mode)
 * - Active tab ID
 * - Expanded folders and vaults in the file explorer
 * - Panel sizes (sidebar width, right panel width)
 * - Panel visibility (sidebar, right panel)
 * - Active settings/navigation page
 *
 * Uses localStorage with debounced writes. No TTL — state is valid as long as
 * the user is logged in. Cleared on logout.
 */

import type { TabMode } from './tabState'
import type { AppPage } from '../App'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Persisted tab entry (minimal shape, no content/buffer). */
export interface PersistedTab {
  vaultId: string
  filePath: string
  fileName: string
  mode: TabMode
}

/** Full persisted workspace state. */
export interface WorkspaceState {
  /** Schema version for forward-compat migrations. */
  version: 1
  /** Open tabs in order. */
  tabs: PersistedTab[]
  /** Active tab ID (vaultId::filePath). */
  activeTabId: string | null
  /** Expanded directory paths in the file explorer (Set serialized as array). */
  expandedPaths: string[]
  /** Expanded vault IDs in the file explorer. */
  expandedVaults: string[]
  /** Left sidebar width in pixels. */
  sidebarWidth: number
  /** Right panel width in pixels. */
  rightPanelWidth: number
  /** Whether the left sidebar is visible. */
  sidebarVisible: boolean
  /** Whether the right panel is visible. */
  rightPanelVisible: boolean
  /** Currently active navigation/settings page (null = none). */
  activeSettingsPage: AppPage | null
  /** Selected vault ID. */
  selectedVaultId: string | null
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'slatebase_workspace'
const DEBOUNCE_MS = 500

// ─── Internal State ──────────────────────────────────────────────────────────

let currentState: WorkspaceState = createDefaultState()
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// ─── Subscribers (for React integration) ─────────────────────────────────────

type Subscriber = () => void
const subscribers = new Set<Subscriber>()

/** Subscribe to workspace state changes. Returns unsubscribe function. */
export function subscribe(callback: Subscriber): () => void {
  subscribers.add(callback)
  return () => { subscribers.delete(callback) }
}

function notifySubscribers(): void {
  for (const cb of subscribers) {
    cb()
  }
}

// ─── Default State ───────────────────────────────────────────────────────────

function createDefaultState(): WorkspaceState {
  return {
    version: 1,
    tabs: [],
    activeTabId: null,
    expandedPaths: [],
    expandedVaults: [],
    sidebarWidth: 260,
    rightPanelWidth: 240,
    sidebarVisible: true,
    rightPanelVisible: true,
    activeSettingsPage: null,
    selectedVaultId: null,
  }
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validates a parsed object as a valid WorkspaceState.
 * Returns the validated state or null if invalid.
 */
function validateState(data: unknown): WorkspaceState | null {
  if (data === null || typeof data !== 'object') return null

  const obj = data as Record<string, unknown>

  if (obj.version !== 1) return null
  if (!Array.isArray(obj.tabs)) return null
  if (obj.activeTabId !== null && typeof obj.activeTabId !== 'string') return null
  if (!Array.isArray(obj.expandedPaths)) return null
  if (!Array.isArray(obj.expandedVaults)) return null
  if (typeof obj.sidebarWidth !== 'number' || obj.sidebarWidth < 0) return null
  if (typeof obj.rightPanelWidth !== 'number' || obj.rightPanelWidth < 0) return null
  if (typeof obj.sidebarVisible !== 'boolean') return null
  if (typeof obj.rightPanelVisible !== 'boolean') return null
  if (obj.activeSettingsPage !== null && typeof obj.activeSettingsPage !== 'string') return null
  if (obj.selectedVaultId !== null && typeof obj.selectedVaultId !== 'string') return null

  // Validate each tab entry
  const validTabs: PersistedTab[] = []
  for (const tab of obj.tabs) {
    if (tab === null || typeof tab !== 'object') continue
    const t = tab as Record<string, unknown>
    if (typeof t.vaultId !== 'string') continue
    if (typeof t.filePath !== 'string') continue
    if (typeof t.fileName !== 'string') continue
    if (t.mode !== 'edit' && t.mode !== 'view') continue
    validTabs.push({
      vaultId: t.vaultId,
      filePath: t.filePath,
      fileName: t.fileName,
      mode: t.mode,
    })
  }

  // Validate expandedPaths (all strings)
  const validPaths = (obj.expandedPaths as unknown[]).filter(
    (p): p is string => typeof p === 'string'
  )

  // Validate expandedVaults (all strings)
  const validVaults = (obj.expandedVaults as unknown[]).filter(
    (v): v is string => typeof v === 'string'
  )

  return {
    version: 1,
    tabs: validTabs,
    activeTabId: typeof obj.activeTabId === 'string' ? obj.activeTabId : null,
    expandedPaths: validPaths,
    expandedVaults: validVaults,
    sidebarWidth: obj.sidebarWidth as number,
    rightPanelWidth: obj.rightPanelWidth as number,
    sidebarVisible: obj.sidebarVisible as boolean,
    rightPanelVisible: obj.rightPanelVisible as boolean,
    activeSettingsPage: (obj.activeSettingsPage as AppPage | null),
    selectedVaultId: (obj.selectedVaultId as string | null),
  }
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function persistToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState))
  } catch {
    // Storage full or unavailable — silently skip
  }
}

function schedulePersist(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    persistToStorage()
  }, DEBOUNCE_MS)
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Initialize workspace store by reading from localStorage.
 * Call once on app mount (after auth restore).
 */
export function initialize(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      currentState = createDefaultState()
      return
    }
    const parsed = JSON.parse(raw) as unknown
    const validated = validateState(parsed)
    if (validated) {
      currentState = validated
    } else {
      currentState = createDefaultState()
    }
  } catch {
    currentState = createDefaultState()
  }
}

/** Get the current workspace state (read-only snapshot). */
export function getState(): Readonly<WorkspaceState> {
  return currentState
}

/** Get a snapshot for useSyncExternalStore. */
export function getSnapshot(): WorkspaceState {
  return currentState
}

/**
 * Update workspace state partially. Merges the patch into current state,
 * notifies subscribers, and schedules a debounced localStorage write.
 */
export function update(patch: Partial<Omit<WorkspaceState, 'version'>>): void {
  currentState = { ...currentState, ...patch, version: 1 }
  notifySubscribers()
  schedulePersist()
}

/**
 * Update tabs state specifically (convenience helper).
 */
export function updateTabs(tabs: PersistedTab[], activeTabId: string | null): void {
  currentState = { ...currentState, tabs, activeTabId, version: 1 }
  notifySubscribers()
  schedulePersist()
}

/**
 * Update expanded paths and vaults (convenience helper).
 */
export function updateExpandedState(expandedPaths: string[], expandedVaults: string[]): void {
  currentState = { ...currentState, expandedPaths, expandedVaults, version: 1 }
  notifySubscribers()
  schedulePersist()
}

/**
 * Update panel layout (convenience helper).
 */
export function updateLayout(patch: {
  sidebarWidth?: number
  rightPanelWidth?: number
  sidebarVisible?: boolean
  rightPanelVisible?: boolean
}): void {
  currentState = { ...currentState, ...patch, version: 1 }
  notifySubscribers()
  schedulePersist()
}

/**
 * Clear all persisted workspace state (called on logout).
 */
export function clear(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  currentState = createDefaultState()
  localStorage.removeItem(STORAGE_KEY)
  notifySubscribers()
}

/**
 * Flush any pending debounced write immediately (e.g. before page unload).
 */
export function flush(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
    persistToStorage()
  }
}
