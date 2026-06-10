/**
 * Feature toggle state management.
 * Manages the list of feature toggles, loading state, and optimistic updates with rollback.
 */

// ─── Data Models ─────────────────────────────────────────────────────────────

/** Information about a single feature toggle. */
export interface FeatureToggleInfo {
  name: string
  enabled: boolean
  type: 'hot' | 'cold'
  description: string
}

// ─── State ───────────────────────────────────────────────────────────────────

/** Feature toggle state. */
export interface FeatureState {
  features: FeatureToggleInfo[]
  isLoading: boolean
  error: string | null
}

/** Initial feature state with no features loaded. */
export const initialFeatureState: FeatureState = {
  features: [],
  isLoading: false,
  error: null,
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/** Discriminated union of all feature toggle actions. */
export type FeatureAction =
  | { type: 'FEATURES_LOADING' }
  | { type: 'FEATURES_LOADED'; features: FeatureToggleInfo[] }
  | { type: 'FEATURES_ERROR'; error: string }
  | { type: 'FEATURE_UPDATED'; name: string; enabled: boolean }
  | { type: 'FEATURE_UPDATE_FAILED'; name: string; previousEnabled: boolean; error: string }

// ─── Reducer ─────────────────────────────────────────────────────────────────

/**
 * Pure reducer handling all feature toggle state transitions.
 *
 * - FEATURES_LOADING: Set loading state, clear error
 * - FEATURES_LOADED: Replace features array, clear loading and error
 * - FEATURES_ERROR: Set error, clear loading
 * - FEATURE_UPDATED: Optimistically update a specific feature's enabled field
 * - FEATURE_UPDATE_FAILED: Rollback a specific feature to previousEnabled, set error
 */
export function featureReducer(state: FeatureState, action: FeatureAction): FeatureState {
  switch (action.type) {
    case 'FEATURES_LOADING':
      return {
        ...state,
        isLoading: true,
        error: null,
      }

    case 'FEATURES_LOADED':
      return {
        ...state,
        features: action.features,
        isLoading: false,
        error: null,
      }

    case 'FEATURES_ERROR':
      return {
        ...state,
        isLoading: false,
        error: action.error,
      }

    case 'FEATURE_UPDATED':
      return {
        ...state,
        features: state.features.map(f =>
          f.name === action.name ? { ...f, enabled: action.enabled } : f
        ),
      }

    case 'FEATURE_UPDATE_FAILED':
      return {
        ...state,
        features: state.features.map(f =>
          f.name === action.name ? { ...f, enabled: action.previousEnabled } : f
        ),
        error: action.error,
      }
  }
}
