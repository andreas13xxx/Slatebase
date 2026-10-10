/**
 * Reducer + types for the activity timeline view's local state.
 *
 * The timeline is a self-contained view (tab or sidebar), so its state lives
 * here rather than in the global app reducer — the pattern the context-panel
 * data uses. Action creators in `activityActions.ts` call the ApiClient and
 * dispatch these actions.
 */

import type { ActivityEvent, ActivityEventType } from '../types'

export interface ActivityState {
  /** Loaded events, newest first (may span multiple fetched pages). */
  events: ActivityEvent[]
  /** Cursor for the next (older) page, or null when exhausted. */
  nextCursor: string | null
  /** Active type-lane filter: the set of event types currently shown. Empty = all. */
  activeTypes: ActivityEventType[]
  /** True while the first page is loading. */
  loading: boolean
  /** True while a subsequent page is loading. */
  loadingMore: boolean
  /** Error message for the last failed load, or null. */
  error: string | null
}

export function createInitialActivityState(): ActivityState {
  return {
    events: [],
    nextCursor: null,
    activeTypes: [],
    loading: false,
    loadingMore: false,
    error: null,
  }
}

export type ActivityAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; events: ActivityEvent[]; nextCursor: string | null }
  | { type: 'LOAD_ERROR'; error: string }
  | { type: 'LOAD_MORE_START' }
  | { type: 'LOAD_MORE_SUCCESS'; events: ActivityEvent[]; nextCursor: string | null }
  | { type: 'LOAD_MORE_ERROR'; error: string }
  | { type: 'PREPEND_RECENT'; events: ActivityEvent[] }
  | { type: 'SET_ACTIVE_TYPES'; types: ActivityEventType[] }

/** Merge new events into existing ones, de-duplicating by id, newest first. */
function mergeNewestFirst(existing: ActivityEvent[], incoming: ActivityEvent[]): ActivityEvent[] {
  const seen = new Set(existing.map(e => e.id))
  const merged = [...incoming.filter(e => !seen.has(e.id)), ...existing]
  merged.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return b.timestamp.localeCompare(a.timestamp)
    return b.id.localeCompare(a.id)
  })
  return merged
}

export function activityReducer(state: ActivityState, action: ActivityAction): ActivityState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, loading: true, error: null }
    case 'LOAD_SUCCESS':
      return { ...state, loading: false, events: action.events, nextCursor: action.nextCursor, error: null }
    case 'LOAD_ERROR':
      return { ...state, loading: false, error: action.error }
    case 'LOAD_MORE_START':
      return { ...state, loadingMore: true }
    case 'LOAD_MORE_SUCCESS':
      return {
        ...state,
        loadingMore: false,
        events: [...state.events, ...action.events],
        nextCursor: action.nextCursor,
      }
    case 'LOAD_MORE_ERROR':
      return { ...state, loadingMore: false, error: action.error }
    case 'PREPEND_RECENT':
      return { ...state, events: mergeNewestFirst(state.events, action.events) }
    case 'SET_ACTIVE_TYPES':
      return { ...state, activeTypes: action.types }
    default:
      return state
  }
}
