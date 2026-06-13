/**
 * Search action creators — standalone async functions that call the API
 * and dispatch appropriate SearchActions.
 *
 * Pattern: dispatch SEARCH_STARTED → call API → dispatch SEARCH_SUCCESS or SEARCH_ERROR.
 * For replace: dispatch REPLACE_STARTED → call API → dispatch REPLACE_SUCCESS or REPLACE_ERROR.
 */

import type { Dispatch } from 'react'
import type { SearchAction, SearchFileResult, ReplaceResponse } from './searchState'

/**
 * Interface for search-related API methods.
 * Returns Promise<unknown> to be compatible with the IApiClient implementation.
 */
export interface ISearchApiClient {
  searchVault(vaultId: string, params: Record<string, string>): Promise<unknown>
  searchMultiVault(params: Record<string, string>): Promise<unknown>
  replaceInVault(vaultId: string, body: ReplaceRequestBody): Promise<unknown>
}

/** Response shape from the search endpoints. */
interface SearchVaultResponse {
  results: SearchFileResult[]
  totalHits: number
  truncated: boolean
  truncationMessage: string | null
}

/** Request body for the replace endpoint. */
interface ReplaceRequestBody {
  query: string
  replacement: string
  caseSensitive: boolean
  regex: boolean
  paths?: string[]
}

/** Options for performing a search. */
export interface SearchOptions {
  query: string
  caseSensitive: boolean
  regex: boolean
  contextLines?: number
  maxResults?: number
}

/** Options for performing a multi-vault search. */
export interface MultiVaultSearchOptions extends SearchOptions {
  vaultIds?: string[]
}

/** Options for performing a replace operation. */
export interface ReplaceOptions {
  query: string
  replacement: string
  caseSensitive: boolean
  regex: boolean
  paths?: string[]
}

/**
 * Performs a single-vault search and dispatches results.
 * Supports request cancellation via AbortSignal.
 */
export async function performSearch(
  dispatch: Dispatch<SearchAction>,
  apiClient: ISearchApiClient,
  vaultId: string,
  options: SearchOptions,
  signal?: AbortSignal,
): Promise<void> {
  dispatch({ type: 'SEARCH_STARTED' })
  try {
    const params: Record<string, string> = {
      query: options.query,
      caseSensitive: String(options.caseSensitive),
      regex: String(options.regex),
    }
    if (options.contextLines !== undefined) {
      params['contextLines'] = String(options.contextLines)
    }
    if (options.maxResults !== undefined) {
      params['maxResults'] = String(options.maxResults)
    }

    if (signal?.aborted) return

    const rawResult = await apiClient.searchVault(vaultId, params)

    if (signal?.aborted) return

    const result = rawResult as SearchVaultResponse
    dispatch({
      type: 'SEARCH_SUCCESS',
      payload: {
        results: result.results,
        totalHits: result.totalHits,
        truncated: result.truncated,
        truncationMessage: result.truncationMessage,
      },
    })
  } catch (err: unknown) {
    if (isAbortError(err)) return
    const message = extractErrorMessage(err)
    dispatch({ type: 'SEARCH_ERROR', payload: message })
  }
}

/**
 * Performs a multi-vault search and dispatches results.
 * Supports request cancellation via AbortSignal.
 */
export async function performMultiVaultSearch(
  dispatch: Dispatch<SearchAction>,
  apiClient: ISearchApiClient,
  options: MultiVaultSearchOptions,
  signal?: AbortSignal,
): Promise<void> {
  dispatch({ type: 'SEARCH_STARTED' })
  try {
    const params: Record<string, string> = {
      query: options.query,
      caseSensitive: String(options.caseSensitive),
      regex: String(options.regex),
    }
    if (options.contextLines !== undefined) {
      params['contextLines'] = String(options.contextLines)
    }
    if (options.maxResults !== undefined) {
      params['maxResults'] = String(options.maxResults)
    }
    if (options.vaultIds && options.vaultIds.length > 0) {
      params['vaultIds'] = options.vaultIds.join(',')
    }

    if (signal?.aborted) return

    const rawResult = await apiClient.searchMultiVault(params)

    if (signal?.aborted) return

    const result = rawResult as SearchVaultResponse
    dispatch({
      type: 'SEARCH_SUCCESS',
      payload: {
        results: result.results,
        totalHits: result.totalHits,
        truncated: result.truncated,
        truncationMessage: result.truncationMessage,
      },
    })
  } catch (err: unknown) {
    if (isAbortError(err)) return
    const message = extractErrorMessage(err)
    dispatch({ type: 'SEARCH_ERROR', payload: message })
  }
}

/**
 * Performs a bulk replace operation across files matching the query.
 */
export async function performReplace(
  dispatch: Dispatch<SearchAction>,
  apiClient: ISearchApiClient,
  vaultId: string,
  options: ReplaceOptions,
): Promise<void> {
  dispatch({ type: 'REPLACE_STARTED' })
  try {
    const body: ReplaceRequestBody = {
      query: options.query,
      replacement: options.replacement,
      caseSensitive: options.caseSensitive,
      regex: options.regex,
    }
    if (options.paths && options.paths.length > 0) {
      body.paths = options.paths
    }

    const rawResult = await apiClient.replaceInVault(vaultId, body)
    dispatch({ type: 'REPLACE_SUCCESS', payload: rawResult as ReplaceResponse })
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    dispatch({ type: 'REPLACE_ERROR', payload: message })
  }
}

/**
 * Performs a single-file replace by restricting the paths array to one file.
 */
export async function performSingleReplace(
  dispatch: Dispatch<SearchAction>,
  apiClient: ISearchApiClient,
  vaultId: string,
  options: Omit<ReplaceOptions, 'paths'> & { filePath: string },
): Promise<void> {
  return performReplace(dispatch, apiClient, vaultId, {
    query: options.query,
    replacement: options.replacement,
    caseSensitive: options.caseSensitive,
    regex: options.regex,
    paths: [options.filePath],
  })
}

/**
 * Checks if an error is an AbortError (request was cancelled).
 */
function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof Error && err.name === 'AbortError') return true
  return false
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
