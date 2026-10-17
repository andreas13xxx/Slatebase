/**
 * Standalone async action creators for the activity timeline.
 *
 * Each takes a dispatch + the ApiClient (the project's action-creator pattern),
 * calls `getActivity`, and dispatches into `activityReducer`.
 */

import type { Dispatch } from 'react'
import type { IApiClient } from '../api'
import type { ActivityEventType } from '../types'
import type { ActivityAction, ActivityRange } from './activityState'
import { HEATMAP_WEEKS } from './activityState'
import { extractErrorMessage } from '../utils/error'

const PAGE_LIMIT = 50

/** Milliseconds per range window, used to derive the `from` boundary. */
const RANGE_MS: Record<ActivityRange, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
}

/** ISO `from` boundary for a range, relative to now. */
function rangeFrom(range: ActivityRange, now: number = Date.now()): string {
  return new Date(now - RANGE_MS[range]).toISOString()
}

/** Load the first page of activity for a vault (replaces any loaded events). */
export async function loadActivity(
  dispatch: Dispatch<ActivityAction>,
  apiClient: IApiClient,
  vaultId: string,
  types: ActivityEventType[],
  range: ActivityRange,
  pathPrefix?: string,
): Promise<void> {
  dispatch({ type: 'LOAD_START' })
  try {
    const page = await apiClient.getActivity(vaultId, {
      limit: PAGE_LIMIT,
      from: rangeFrom(range),
      ...(types.length > 0 ? { types } : {}),
      ...(pathPrefix ? { pathPrefix } : {}),
    })
    dispatch({ type: 'LOAD_SUCCESS', events: page.items, nextCursor: page.nextCursor })
  } catch (err) {
    dispatch({ type: 'LOAD_ERROR', error: extractErrorMessage(err, 'Aktivität konnte nicht geladen werden') })
  }
}

/** Load the next (older) page via the given cursor. */
export async function loadMoreActivity(
  dispatch: Dispatch<ActivityAction>,
  apiClient: IApiClient,
  vaultId: string,
  cursor: string,
  types: ActivityEventType[],
  range: ActivityRange,
  pathPrefix?: string,
): Promise<void> {
  dispatch({ type: 'LOAD_MORE_START' })
  try {
    const page = await apiClient.getActivity(vaultId, {
      limit: PAGE_LIMIT,
      cursor,
      from: rangeFrom(range),
      ...(types.length > 0 ? { types } : {}),
      ...(pathPrefix ? { pathPrefix } : {}),
    })
    dispatch({ type: 'LOAD_MORE_SUCCESS', events: page.items, nextCursor: page.nextCursor })
  } catch (err) {
    dispatch({ type: 'LOAD_MORE_ERROR', error: extractErrorMessage(err, 'Weitere Aktivität konnte nicht geladen werden') })
  }
}

/**
 * Refresh just the newest slice after a vault:change, merging it to the head
 * without discarding already-loaded history.
 */
export async function refreshRecentActivity(
  dispatch: Dispatch<ActivityAction>,
  apiClient: IApiClient,
  vaultId: string,
  types: ActivityEventType[],
  range: ActivityRange,
  pathPrefix?: string,
): Promise<void> {
  try {
    const page = await apiClient.getActivity(vaultId, {
      limit: PAGE_LIMIT,
      from: rangeFrom(range),
      ...(types.length > 0 ? { types } : {}),
      ...(pathPrefix ? { pathPrefix } : {}),
    })
    dispatch({ type: 'PREPEND_RECENT', events: page.items })
  } catch {
    // Silent — a failed background refresh must not disturb the loaded view.
  }
}

/**
 * Load the heatmap window (fixed "last N weeks"), independent of the range
 * switcher (L4). A larger page cap than the list because the window spans many
 * days; one fetch of the existing read route, no new backend endpoint. The
 * caller guards against vault-switch races via the returned signal check.
 */
export async function loadActivityHeatmap(
  dispatch: Dispatch<ActivityAction>,
  apiClient: IApiClient,
  vaultId: string,
  signal?: { cancelled: boolean },
): Promise<void> {
  const from = new Date(Date.now() - HEATMAP_WEEKS * 7 * 24 * 60 * 60 * 1000).toISOString()
  try {
    const page = await apiClient.getActivity(vaultId, { limit: 200, from })
    if (signal?.cancelled) return
    dispatch({ type: 'HEATMAP_LOADED', events: page.items })
  } catch {
    // Silent — the heatmap is a secondary panel; a failed load leaves it empty.
  }
}
