/**
 * Standalone async action creators for the activity timeline.
 *
 * Each takes a dispatch + the ApiClient (the project's action-creator pattern),
 * calls `getActivity`, and dispatches into `activityReducer`.
 */

import type { Dispatch } from 'react'
import type { IApiClient } from '../api'
import type { ActivityEventType } from '../types'
import type { ActivityAction } from './activityState'
import { extractErrorMessage } from '../utils/error'

const PAGE_LIMIT = 50

/** Load the first page of activity for a vault (replaces any loaded events). */
export async function loadActivity(
  dispatch: Dispatch<ActivityAction>,
  apiClient: IApiClient,
  vaultId: string,
  types: ActivityEventType[],
): Promise<void> {
  dispatch({ type: 'LOAD_START' })
  try {
    const page = await apiClient.getActivity(vaultId, {
      limit: PAGE_LIMIT,
      ...(types.length > 0 ? { types } : {}),
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
): Promise<void> {
  dispatch({ type: 'LOAD_MORE_START' })
  try {
    const page = await apiClient.getActivity(vaultId, {
      limit: PAGE_LIMIT,
      cursor,
      ...(types.length > 0 ? { types } : {}),
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
): Promise<void> {
  try {
    const page = await apiClient.getActivity(vaultId, {
      limit: PAGE_LIMIT,
      ...(types.length > 0 ? { types } : {}),
    })
    dispatch({ type: 'PREPEND_RECENT', events: page.items })
  } catch {
    // Silent — a failed background refresh must not disturb the loaded view.
  }
}
