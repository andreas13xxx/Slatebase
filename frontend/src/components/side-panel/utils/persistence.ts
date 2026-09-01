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

const VALID_BUILTIN_VIEW_IDS: ReadonlySet<string> = new Set([
  'explorer', 'favorites', 'recent',
  'outline', 'links', 'tags', 'properties', 'search',
])

/**
 * Validates that a value is a valid PanelViewId.
 * Accepts built-in IDs and plugin IDs (prefixed with 'plugin:').
 */
function isValidViewId(value: unknown): value is PanelViewId {
  if (typeof value !== 'string') return false
  if (VALID_BUILTIN_VIEW_IDS.has(value)) return true
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

/**
 * Saves a side panel layout to localStorage.
 * Silently fails if localStorage is unavailable.
 *
 * @param prefix - Storage-key prefix identifying which panel (left/right)
 * @param userId - The current user's ID
 * @param layout - The layout to persist
 */
export function savePanelLayout(
  panel: PanelSide,
  layout: PersistedPanelLayout
): void {
  updateVaultSettings({
    [PANEL_SETTING_KEY[panel]]: layout as unknown as Record<string, unknown>,
  })
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
