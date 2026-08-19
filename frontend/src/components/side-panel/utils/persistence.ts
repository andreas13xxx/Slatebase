/**
 * localStorage persistence utilities for side panel layouts (left and right).
 * Handles serialization, deserialization, and validation of persisted layout
 * data. Shared by both panels — callers pass their own storage-key prefix so
 * left/right layouts stay independent (and existing saved layouts from
 * before the unification aren't lost).
 */

import type { PanelViewId } from '../../../state/panelState'

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
 * Generates the localStorage key for a given user, scoped by the caller's
 * prefix (e.g. `slatebase_sidebar_panel_` or `slatebase_context_panel_`).
 */
function getStorageKey(prefix: string, userId: string): string {
  return `${prefix}${userId}`
}

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
  prefix: string,
  userId: string,
  layout: PersistedPanelLayout
): void {
  try {
    const key = getStorageKey(prefix, userId)
    const serialized = JSON.stringify(layout)
    localStorage.setItem(key, serialized)
  } catch {
    // localStorage unavailable or quota exceeded — silently ignore
  }
}

/**
 * Loads a side panel layout from localStorage.
 * Returns null if localStorage is unavailable, data is missing, or data is corrupted/invalid.
 *
 * @param prefix - Storage-key prefix identifying which panel (left/right)
 * @param userId - The current user's ID
 * @returns The persisted layout or null
 */
export function loadPanelLayout(
  prefix: string,
  userId: string
): PersistedPanelLayout | null {
  try {
    const key = getStorageKey(prefix, userId)
    const raw = localStorage.getItem(key)

    if (raw === null) {
      return null
    }

    const parsed: unknown = JSON.parse(raw)

    if (!isValidLayout(parsed)) {
      return null
    }

    return parsed
  } catch {
    // localStorage unavailable, JSON parse error, or any other error — return null
    return null
  }
}
