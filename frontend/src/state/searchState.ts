/**
 * Search state management for the search and discovery system.
 * Manages search queries, options, results, replace operations, and UI state.
 */

// ─── Data Models (mirror backend response types for the frontend) ────────────

/** A single search hit within a file. */
export interface SearchHit {
  line: number
  matchText: string
  contextBefore: string[]
  contextAfter: string[]
  matchLine: string
}

/** Search results grouped by file. */
export interface SearchFileResult {
  filePath: string
  fileName: string
  hits: SearchHit[]
  hitCount: number
}

/** Response from the replace endpoint. */
export interface ReplaceResponse {
  totalReplacements: number
  fileCount: number
  files: ReplaceFileResult[]
  failed: ReplaceFailure[]
}

/** A single file that was successfully replaced. */
export interface ReplaceFileResult {
  path: string
  replacements: number
}

/** A file that failed during replacement. */
export interface ReplaceFailure {
  path: string
  reason: string
}

/** Multi-vault search result per vault. */
export interface VaultSearchResult {
  vaultId: string
  vaultName: string
  results: SearchFileResult[]
  totalHits: number
}

// ─── State ───────────────────────────────────────────────────────────────────

/** Global search state. */
export interface SearchState {
  query: string
  replacement: string
  caseSensitive: boolean
  regex: boolean
  scope: 'single' | 'all'
  results: SearchFileResult[] | null
  vaultResults: Record<string, SearchFileResult[]> | null
  totalHits: number
  truncated: boolean
  truncationMessage: string | null
  loading: boolean
  error: string | null
  replaceLoading: boolean
  replaceError: string | null
  lastReplaceResult: ReplaceResponse | null
  activeResultId: string | null
}

/** Initial search state with no query or results. */
export const initialSearchState: SearchState = {
  query: '',
  replacement: '',
  caseSensitive: false,
  regex: false,
  scope: 'single',
  results: null,
  vaultResults: null,
  totalHits: 0,
  truncated: false,
  truncationMessage: null,
  loading: false,
  error: null,
  replaceLoading: false,
  replaceError: null,
  lastReplaceResult: null,
  activeResultId: null,
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/** Discriminated union of all search actions. */
export type SearchAction =
  | { type: 'SET_QUERY'; payload: string }
  | { type: 'SET_REPLACEMENT'; payload: string }
  | { type: 'SET_OPTION'; payload: { key: 'caseSensitive' | 'regex' | 'scope'; value: boolean | 'single' | 'all' } }
  | { type: 'SEARCH_STARTED' }
  | { type: 'SEARCH_SUCCESS'; payload: { results: SearchFileResult[]; totalHits: number; truncated: boolean; truncationMessage: string | null } }
  | { type: 'SEARCH_ERROR'; payload: string }
  | { type: 'REPLACE_STARTED' }
  | { type: 'REPLACE_SUCCESS'; payload: ReplaceResponse }
  | { type: 'REPLACE_ERROR'; payload: string }
  | { type: 'CLEAR_RESULTS' }
  | { type: 'SET_ACTIVE_RESULT'; payload: string | null }

// ─── Reducer ─────────────────────────────────────────────────────────────────

/**
 * Pure reducer handling all search state transitions.
 */
export function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case 'SET_QUERY':
      return {
        ...state,
        query: action.payload,
      }

    case 'SET_REPLACEMENT':
      return {
        ...state,
        replacement: action.payload,
      }

    case 'SET_OPTION': {
      const { key, value } = action.payload
      if (key === 'scope') {
        return { ...state, scope: value as 'single' | 'all' }
      }
      return { ...state, [key]: value as boolean }
    }

    case 'SEARCH_STARTED':
      return {
        ...state,
        loading: true,
        error: null,
      }

    case 'SEARCH_SUCCESS':
      return {
        ...state,
        results: action.payload.results,
        totalHits: action.payload.totalHits,
        truncated: action.payload.truncated,
        truncationMessage: action.payload.truncationMessage,
        loading: false,
        error: null,
      }

    case 'SEARCH_ERROR':
      return {
        ...state,
        loading: false,
        error: action.payload,
      }

    case 'REPLACE_STARTED':
      return {
        ...state,
        replaceLoading: true,
        replaceError: null,
      }

    case 'REPLACE_SUCCESS':
      return {
        ...state,
        replaceLoading: false,
        replaceError: null,
        lastReplaceResult: action.payload,
      }

    case 'REPLACE_ERROR':
      return {
        ...state,
        replaceLoading: false,
        replaceError: action.payload,
      }

    case 'CLEAR_RESULTS':
      return {
        ...state,
        results: null,
        vaultResults: null,
        totalHits: 0,
        truncated: false,
        truncationMessage: null,
        error: null,
        activeResultId: null,
      }

    case 'SET_ACTIVE_RESULT':
      return {
        ...state,
        activeResultId: action.payload,
      }
  }
}
