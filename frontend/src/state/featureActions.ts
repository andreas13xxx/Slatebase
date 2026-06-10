import type { Dispatch } from 'react'
import type { IApiClient } from '../api/index'
import type { FeatureAction } from './featureState'

/**
 * Loads all features from the API and dispatches the result.
 * Uses the admin endpoint to get full feature details (type, description).
 */
export async function loadFeatures(dispatch: Dispatch<FeatureAction>, apiClient: IApiClient): Promise<void> {
  dispatch({ type: 'FEATURES_LOADING' })
  try {
    const features = await apiClient.loadAdminFeatures()
    dispatch({ type: 'FEATURES_LOADED', features })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message :
      (typeof error === 'object' && error !== null && 'message' in error) ?
        String((error as { message: unknown }).message) : 'Fehler beim Laden der Features'
    dispatch({ type: 'FEATURES_ERROR', error: message })
  }
}

/**
 * Toggles a feature with optimistic update and rollback on failure.
 * Dispatches FEATURE_UPDATED immediately, then calls API.
 * On API failure, dispatches FEATURE_UPDATE_FAILED with the previous state.
 */
export async function toggleFeature(
  dispatch: Dispatch<FeatureAction>,
  apiClient: IApiClient,
  name: string,
  enabled: boolean,
  previousEnabled: boolean,
): Promise<void> {
  // Optimistic update
  dispatch({ type: 'FEATURE_UPDATED', name, enabled })

  try {
    await apiClient.toggleAdminFeature(name, enabled)
  } catch (error: unknown) {
    // Rollback on failure
    const message = error instanceof Error ? error.message :
      (typeof error === 'object' && error !== null && 'message' in error) ?
        String((error as { message: unknown }).message) : 'Fehler beim Ändern des Features'
    dispatch({ type: 'FEATURE_UPDATE_FAILED', name, previousEnabled, error: message })
  }
}
