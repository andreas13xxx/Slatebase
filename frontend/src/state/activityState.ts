/**
 * Reducer + types for the activity timeline view's local state.
 *
 * The timeline is a self-contained view (tab or sidebar), so its state lives
 * here rather than in the global app reducer — the pattern the context-panel
 * data uses. Action creators in `activityActions.ts` call the ApiClient and
 * dispatch these actions.
 */

import type { ActivityEvent, ActivityEventType } from '../types'

/** Time range for the list + by-type stats (NOT the heatmap, which has its own fixed window). */
export type ActivityRange = 'day' | 'week' | 'month' | 'year'

/** Default list/stats range. */
export const DEFAULT_ACTIVITY_RANGE: ActivityRange = 'week'

/** Fixed heatmap window, independent of the range switcher (L4). */
export const HEATMAP_WEEKS = 10

export interface ActivityState {
  /** Loaded events, newest first (may span multiple fetched pages). */
  events: ActivityEvent[]
  /** Cursor for the next (older) page, or null when exhausted. */
  nextCursor: string | null
  /** Active type-lane filter: the set of event types currently shown. Empty = all. */
  activeTypes: ActivityEventType[]
  /** Selected list/stats time range. */
  range: ActivityRange
  /** Heatmap-window events, loaded separately from the range (L4). */
  heatmapEvents: ActivityEvent[]
  /** Folder prefix filter ('' = all folders). */
  pathPrefix: string
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
    range: DEFAULT_ACTIVITY_RANGE,
    heatmapEvents: [],
    pathPrefix: '',
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
  | { type: 'SET_RANGE'; range: ActivityRange }
  | { type: 'HEATMAP_LOADED'; events: ActivityEvent[] }
  | { type: 'SET_PATH_PREFIX'; pathPrefix: string }

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
    case 'SET_RANGE':
      return { ...state, range: action.range }
    case 'HEATMAP_LOADED':
      return { ...state, heatmapEvents: action.events }
    case 'SET_PATH_PREFIX':
      return { ...state, pathPrefix: action.pathPrefix }
    default:
      return state
  }
}
