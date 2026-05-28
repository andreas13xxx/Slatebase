/**
 * Sync action creators — standalone async functions that call the API
 * and dispatch appropriate SyncActions.
 *
 * Pattern: dispatch SYNC_LOADING_STARTED → call API → dispatch result or SYNC_ERROR_OCCURRED.
 */

import type { Dispatch } from 'react'
import type { SyncAction, CreateSyncConfigInput, UpdateSyncConfigInput } from './syncState'
import type { IApiClient } from '../api'

/**
 * Loads the sync configuration for a vault and dispatches SYNC_CONFIG_LOADED.
 */
export async function loadSyncConfig(
  dispatch: Dispatch<SyncAction>,
  apiClient: IApiClient,
  vaultId: string,
): Promise<void> {
  dispatch({ type: 'SYNC_LOADING_STARTED' })
  try {
    const config = await apiClient.getSyncConfig(vaultId)
    dispatch({ type: 'SYNC_CONFIG_LOADED', payload: config })
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    dispatch({ type: 'SYNC_ERROR_OCCURRED', payload: message })
  }
}

/**
 * Creates a new sync configuration and dispatches SYNC_CONFIG_CREATED.
 */
export async function createSyncConfig(
  dispatch: Dispatch<SyncAction>,
  apiClient: IApiClient,
  vaultId: string,
  input: CreateSyncConfigInput,
): Promise<void> {
  dispatch({ type: 'SYNC_LOADING_STARTED' })
  try {
    const result = await apiClient.createSyncConfig(vaultId, input)
    dispatch({ type: 'SYNC_CONFIG_CREATED', payload: result })
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    dispatch({ type: 'SYNC_ERROR_OCCURRED', payload: message })
  }
}

/**
 * Updates an existing sync configuration and dispatches SYNC_CONFIG_UPDATED.
 */
export async function updateSyncConfig(
  dispatch: Dispatch<SyncAction>,
  apiClient: IApiClient,
  vaultId: string,
  input: UpdateSyncConfigInput,
): Promise<void> {
  dispatch({ type: 'SYNC_LOADING_STARTED' })
  try {
    const result = await apiClient.updateSyncConfig(vaultId, input)
    dispatch({ type: 'SYNC_CONFIG_UPDATED', payload: result })
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    dispatch({ type: 'SYNC_ERROR_OCCURRED', payload: message })
  }
}

/**
 * Disables the sync configuration and dispatches SYNC_DISABLED.
 */
export async function disableSyncConfig(
  dispatch: Dispatch<SyncAction>,
  apiClient: IApiClient,
  vaultId: string,
): Promise<void> {
  dispatch({ type: 'SYNC_LOADING_STARTED' })
  try {
    await apiClient.disableSyncConfig(vaultId)
    dispatch({ type: 'SYNC_DISABLED' })
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    dispatch({ type: 'SYNC_ERROR_OCCURRED', payload: message })
  }
}

/**
 * Enables the sync configuration and dispatches SYNC_ENABLED.
 */
export async function enableSyncConfig(
  dispatch: Dispatch<SyncAction>,
  apiClient: IApiClient,
  vaultId: string,
): Promise<void> {
  dispatch({ type: 'SYNC_LOADING_STARTED' })
  try {
    await apiClient.enableSyncConfig(vaultId)
    dispatch({ type: 'SYNC_ENABLED' })
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    dispatch({ type: 'SYNC_ERROR_OCCURRED', payload: message })
  }
}

/**
 * Removes the sync configuration and dispatches SYNC_CONFIG_REMOVED.
 */
export async function removeSyncConfig(
  dispatch: Dispatch<SyncAction>,
  apiClient: IApiClient,
  vaultId: string,
): Promise<void> {
  dispatch({ type: 'SYNC_LOADING_STARTED' })
  try {
    await apiClient.removeSyncConfig(vaultId)
    dispatch({ type: 'SYNC_CONFIG_REMOVED' })
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    dispatch({ type: 'SYNC_ERROR_OCCURRED', payload: message })
  }
}

/**
 * Triggers a manual sync and dispatches SYNC_TRIGGERED then SYNC_COMPLETED.
 */
export async function triggerSync(
  dispatch: Dispatch<SyncAction>,
  apiClient: IApiClient,
  vaultId: string,
): Promise<void> {
  dispatch({ type: 'SYNC_TRIGGERED' })
  try {
    const result = await apiClient.triggerSync(vaultId)
    dispatch({ type: 'SYNC_COMPLETED', payload: result })
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    dispatch({ type: 'SYNC_ERROR_OCCURRED', payload: message })
  }
}

/**
 * Triggers an analysis and dispatches ANALYSIS_STARTED then ANALYSIS_COMPLETED.
 */
export async function triggerAnalysis(
  dispatch: Dispatch<SyncAction>,
  apiClient: IApiClient,
  vaultId: string,
): Promise<void> {
  dispatch({ type: 'ANALYSIS_STARTED' })
  try {
    const result = await apiClient.triggerAnalysis(vaultId)
    dispatch({ type: 'ANALYSIS_COMPLETED', payload: result })
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    dispatch({ type: 'SYNC_ERROR_OCCURRED', payload: message })
  }
}

/**
 * Loads the sync log (paginated) and dispatches SYNC_LOG_LOADED.
 */
export async function loadSyncLog(
  dispatch: Dispatch<SyncAction>,
  apiClient: IApiClient,
  vaultId: string,
  page?: number,
  pageSize?: number,
): Promise<void> {
  dispatch({ type: 'SYNC_LOADING_STARTED' })
  try {
    const log = await apiClient.getSyncLog(vaultId, page, pageSize)
    dispatch({ type: 'SYNC_LOG_LOADED', payload: log })
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    dispatch({ type: 'SYNC_ERROR_OCCURRED', payload: message })
  }
}

/**
 * Loads all open conflicts and dispatches CONFLICTS_LOADED.
 */
export async function loadConflicts(
  dispatch: Dispatch<SyncAction>,
  apiClient: IApiClient,
  vaultId: string,
): Promise<void> {
  dispatch({ type: 'SYNC_LOADING_STARTED' })
  try {
    const conflicts = await apiClient.getSyncConflicts(vaultId)
    dispatch({ type: 'CONFLICTS_LOADED', payload: conflicts })
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    dispatch({ type: 'SYNC_ERROR_OCCURRED', payload: message })
  }
}

/**
 * Resolves a conflict and dispatches CONFLICT_RESOLVED.
 */
export async function resolveConflict(
  dispatch: Dispatch<SyncAction>,
  apiClient: IApiClient,
  vaultId: string,
  documentPath: string,
  resolution: string,
): Promise<void> {
  try {
    await apiClient.resolveSyncConflict(vaultId, documentPath, resolution)
    dispatch({ type: 'CONFLICT_RESOLVED', payload: documentPath })
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    dispatch({ type: 'SYNC_ERROR_OCCURRED', payload: message })
  }
}

/**
 * Extracts a human-readable error message from an unknown error.
 * Handles the { code, message } shape thrown by ApiClient as well as standard Error instances.
 */
function extractErrorMessage(err: unknown): string {
  if (
    err !== null &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  ) {
    return (err as { message: string }).message
  }
  if (err instanceof Error) {
    return err.message
  }
  return 'An unexpected error occurred'
}
