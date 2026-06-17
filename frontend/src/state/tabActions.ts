import type { Dispatch } from 'react'
import type { IApiClient } from '../api'
import type { AppAction } from '../types'
import { generateTabId, type TabAction } from './tabState'
import { add as addRecentFile } from './recentFilesStore'

/**
 * Opens a tab for the given file. If the tab already exists, it is activated.
 * Otherwise, a new tab is created and file content is fetched from the API.
 *
 * Dispatches OPEN_TAB immediately, then fetches content and dispatches
 * TAB_CONTENT_LOADED on success or TAB_ERROR on failure.
 */
export async function openTab(
  tabDispatch: Dispatch<TabAction>,
  _appDispatch: Dispatch<AppAction>,
  apiClient: IApiClient,
  vaultId: string,
  filePath: string,
  fileName: string,
): Promise<void> {
  tabDispatch({ type: 'OPEN_TAB', payload: { vaultId, filePath, fileName } })

  // Track in recent files store (Requirements 6.1)
  addRecentFile(vaultId, filePath)

  const tabId = generateTabId(vaultId, filePath)

  try {
    const fileContent = await apiClient.fetchFileContent(vaultId, filePath)
    tabDispatch({
      type: 'TAB_CONTENT_LOADED',
      payload: { tabId, content: fileContent.content, isBinary: fileContent.isBinary },
    })
  } catch (err: unknown) {
    const message = toErrorMessage(err)
    tabDispatch({ type: 'TAB_ERROR', payload: { tabId, error: message } })
  }
}

/**
 * Saves the content of a tab via the API.
 *
 * Dispatches SAVE_SUCCESS with the persisted content on success,
 * or SAVE_ERROR with an error message on failure.
 */
export async function saveTab(
  tabDispatch: Dispatch<TabAction>,
  apiClient: IApiClient,
  vaultId: string,
  filePath: string,
  content: string,
): Promise<void> {
  const tabId = generateTabId(vaultId, filePath)

  try {
    await apiClient.saveFile(vaultId, filePath, content)
    tabDispatch({ type: 'SAVE_SUCCESS', payload: { tabId, content } })
  } catch (err: unknown) {
    const message = toErrorMessage(err)
    tabDispatch({ type: 'SAVE_ERROR', payload: { tabId, error: message } })
  }
}

/**
 * Converts an unknown error into a user-facing error message string.
 */
function toErrorMessage(err: unknown): string {
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
