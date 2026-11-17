/**
 * Persistence for the two side panel layouts (left explorer, right context).
 *
 * Stored per user *and* per vault via `vaultSettingsStore`: a panel
 * arrangement is a personal working preference, not vault content, but the
 * layout that suits a project vault rarely suits a daily-notes vault. They
 * used to be one localStorage key per user per panel, shared across vaults and
 * never synced.
 *
 * Both panels share this module and pass their own side, so the two layouts
 * stay independent.
 */

import { isBuiltinViewId } from '../../../state/panelState'
import type { PanelViewId } from '../../../state/panelState'
import { getVaultSettings, updateVaultSettings } from '../../../state/vaultSettingsStore'

/** Which of the two side panels a layout belongs to. */
export type PanelSide = 'sidebar' | 'context'

/** Maps a panel to its field in the per-vault settings. */
const PANEL_SETTING_KEY = {
  sidebar: 'sidebarPanel',
  context: 'contextPanel',
} as const satisfies Record<PanelSide, 'sidebarPanel' | 'contextPanel'>

/** Persisted layout structure stored in localStorage. */
export interface PersistedPanelLayout {
  tabOrder: PanelViewId[]
  sections: Array<{
    viewIds: PanelViewId[]
    activeViewId: PanelViewId
    heightFraction: number
  }>
}

/**
 * Validates that a value is a valid PanelViewId.
 * Accepts built-in IDs and plugin IDs (prefixed with 'plugin:').
 *
 * Delegates the built-in check to `panelState.ts`'s own `isBuiltinViewId()` rather than a second,
 * hand-maintained list — a prior duplicate list here had silently drifted behind it (missing
 * 'footnotes' and 'activity'), which rejected any persisted layout naming either as corrupt the
 * moment a user's panel held one of those two tabs.
 */
function isValidViewId(value: unknown): value is PanelViewId {
  if (typeof value !== 'string') return false
  if (isBuiltinViewId(value)) return true
  if (value.startsWith('plugin:') && value.length > 7) return true
  return false
}

/**
 * Validates the structure of a persisted layout object.
 * Returns true only if the entire structure is valid.
 */
function isValidLayout(data: unknown): data is PersistedPanelLayout {
  if (data === null || typeof data !== 'object') {
    return false
  }

  const obj = data as Record<string, unknown>

  // Validate tabOrder
  if (!Array.isArray(obj['tabOrder'])) {
    return false
  }

  const tabOrder = obj['tabOrder'] as unknown[]
  if (tabOrder.length === 0) {
    return false
  }

  for (const id of tabOrder) {
    if (!isValidViewId(id)) {
      return false
    }
  }

  // Validate sections
  if (!Array.isArray(obj['sections'])) {
    return false
  }

  const sections = obj['sections'] as unknown[]
  if (sections.length === 0) {
    return false
  }

  for (const section of sections) {
    if (section === null || typeof section !== 'object') {
      return false
    }

    const sec = section as Record<string, unknown>

    // Validate viewIds
    if (!Array.isArray(sec['viewIds'])) {
      return false
    }

    const viewIds = sec['viewIds'] as unknown[]
    if (viewIds.length === 0) {
      return false
    }

    for (const viewId of viewIds) {
      if (!isValidViewId(viewId)) {
        return false
      }
    }

    // Validate activeViewId
    if (!isValidViewId(sec['activeViewId'])) {
      return false
    }

    // Validate heightFraction
    if (typeof sec['heightFraction'] !== 'number') {
      return false
    }

    if (sec['heightFraction'] <= 0 || sec['heightFraction'] > 1) {
      return false
    }
  }

  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Saves a side panel layout to localStorage.
 * Silently fails if localStorage is unavailable.
 *
 * Replaces the stored layout but carries over `basePath`, the one per-view
 * extra sharing the blob (which `.base` file a pinned Base tab shows, see
 * `saveBasePanelPath`/`loadBasePanelPath`) — a plain layout write must not
 * wipe it just because the user dragged a tab. Any other stored key is dropped,
 * so removed layout fields do not linger.
 *
 * @param prefix - Storage-key prefix identifying which panel (left/right)
 * @param userId - The current user's ID
 * @param layout - The layout to persist
 */
export function savePanelLayout(
  panel: PanelSide,
  layout: PersistedPanelLayout
): void {
  const current = getVaultSettings()[PANEL_SETTING_KEY[panel]]
  const basePath = isRecord(current) ? current['basePath'] : undefined
  updateVaultSettings({
    [PANEL_SETTING_KEY[panel]]: {
      ...layout,
      ...(typeof basePath === 'string' ? { basePath } : {}),
    } as unknown as Record<string, unknown>,
  })
}

/**
 * Persists which `.base` file a panel's "Base" tab shows (a per-view extra,
 * not part of the layout) — `null` clears the pinned file. Stored as a
 * sibling field in the same opaque per-panel blob `savePanelLayout` writes
 * (shape is client-owned, see `vaultSettingsStore`'s module doc), so no
 * backend schema change is needed for it.
 */
export function saveBasePanelPath(panel: PanelSide, path: string | null): void {
  const current = getVaultSettings()[PANEL_SETTING_KEY[panel]]
  const extra = isRecord(current) ? current : {}
  updateVaultSettings({
    [PANEL_SETTING_KEY[panel]]: { ...extra, basePath: path } as unknown as Record<string, unknown>,
  })
}

/** Reads the `.base` path a panel's "Base" tab was last showing, or null when none was pinned. */
export function loadBasePanelPath(panel: PanelSide): string | null {
  const current = getVaultSettings()[PANEL_SETTING_KEY[panel]]
  if (!isRecord(current)) return null
  const path = current['basePath']
  return typeof path === 'string' ? path : null
}

/**
 * Loads a side panel layout from localStorage.
 * Returns null if localStorage is unavailable, data is missing, or data is corrupted/invalid.
 *
 * @param prefix - Storage-key prefix identifying which panel (left/right)
 * @param userId - The current user's ID
 * @returns The persisted layout or null
 */
export function loadPanelLayout(panel: PanelSide): PersistedPanelLayout | null {
  const stored = getVaultSettings()[PANEL_SETTING_KEY[panel]]
  return isValidLayout(stored) ? stored : null
}
