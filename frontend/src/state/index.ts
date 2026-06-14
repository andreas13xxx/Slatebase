import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import type { AppState, AppAction, AppError } from '../types'
import type { IApiClient } from '../api'

/** Initial application state. */
export const initialState: AppState = {
  vaults: [],
  selectedVaultId: null,
  directoryTree: null,
  vaultTrees: {},
  vaultTreesLoading: new Set(),
  selectedFile: null,
  loading: false,
  error: null,
}

/**
 * Pure reducer handling all application state transitions.
 *
 * - VAULTS_LOADED: stores vault list, clears loading
 * - VAULT_SELECTED: sets selectedVaultId, clears directoryTree and selectedFile
 * - TREE_LOADED: stores directory tree, clears loading
 * - FILE_LOADED: stores file content, clears loading
 * - LOADING_STARTED: sets loading true, clears error
 * - ERROR_OCCURRED: sets error, clears loading
 */
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'VAULTS_LOADED':
      return {
        ...state,
        vaults: action.payload,
        loading: false,
      }
    case 'VAULT_SELECTED':
      return {
        ...state,
        selectedVaultId: action.payload,
        directoryTree: null,
        selectedFile: null,
      }
    case 'VAULT_DESELECTED':
      return {
        ...state,
        selectedVaultId: null,
        directoryTree: null,
        selectedFile: null,
      }
    case 'TREE_LOADED':
      return {
        ...state,
        directoryTree: action.payload,
        // Also update the per-vault tree if a vault is selected
        vaultTrees: state.selectedVaultId
          ? { ...state.vaultTrees, [state.selectedVaultId]: action.payload }
          : state.vaultTrees,
        vaultTreesLoading: state.selectedVaultId
          ? new Set([...state.vaultTreesLoading].filter((id) => id !== state.selectedVaultId))
          : state.vaultTreesLoading,
        loading: false,
      }
    case 'VAULT_TREE_LOADED': {
      const { vaultId, tree } = action.payload
      const newLoading = new Set([...state.vaultTreesLoading].filter((id) => id !== vaultId))
      return {
        ...state,
        vaultTrees: { ...state.vaultTrees, [vaultId]: tree },
        vaultTreesLoading: newLoading,
        // Also update the legacy directoryTree if this is the selected vault
        directoryTree: state.selectedVaultId === vaultId ? tree : state.directoryTree,
      }
    }
    case 'VAULT_TREE_LOADING': {
      const newLoading = new Set(state.vaultTreesLoading)
      newLoading.add(action.payload)
      return {
        ...state,
        vaultTreesLoading: newLoading,
      }
    }
    case 'FILE_LOADED':
      return {
        ...state,
        selectedFile: action.payload,
        loading: false,
      }
    case 'LOADING_STARTED':
      return {
        ...state,
        loading: true,
        error: null,
      }
    case 'ERROR_OCCURRED':
      return {
        ...state,
        error: action.payload,
        loading: false,
      }
    case 'VAULT_CREATED':
      return {
        ...state,
        vaults: [...state.vaults, action.payload],
        loading: false,
      }
    case 'VAULT_DELETED': {
      const deletedId = action.payload
      const isSelectedDeleted = state.selectedVaultId === deletedId
      const { [deletedId]: _removed, ...remainingTrees } = state.vaultTrees // eslint-disable-line @typescript-eslint/no-unused-vars
      return {
        ...state,
        vaults: state.vaults.filter((v) => v.id !== deletedId),
        selectedVaultId: isSelectedDeleted ? null : state.selectedVaultId,
        directoryTree: isSelectedDeleted ? null : state.directoryTree,
        vaultTrees: remainingTrees,
        selectedFile: isSelectedDeleted ? null : state.selectedFile,
        loading: false,
      }
    }
    case 'VAULT_TREE_RELOAD_REQUESTED': {
      const newLoading = new Set(state.vaultTreesLoading)
      newLoading.add(action.payload.vaultId)
      return {
        ...state,
        vaultTreesLoading: newLoading,
      }
    }
    case 'CONTENT_DELETED':
      return {
        ...state,
        directoryTree: null,
        loading: false,
      }
  }
}

/** Context value shape exposing state and dispatch. */
export interface AppContextValue {
  state: AppState
  dispatch: Dispatch<AppAction>
  apiClient: IApiClient | null
}

/** React Context for global application state. */
export const AppContext = createContext<AppContextValue | null>(null)

/** Props for the AppProvider component. */
interface AppProviderProps {
  children: ReactNode
  /** Optional API client override (useful for testing). */
  apiClient?: IApiClient
}

/**
 * Provider component that wraps the app with state management.
 * Uses useReducer for predictable state transitions.
 */
export function AppProvider({ children, apiClient }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialState)

  return React.createElement(
    AppContext.Provider,
    { value: { state, dispatch, apiClient: apiClient ?? null } },
    children,
  )
}

/**
 * Hook to access the AppContext. Throws if used outside AppProvider.
 */
export function useAppContext(): AppContextValue {
  const context = useContext(AppContext)
  if (context === null) {
    throw new Error('useAppContext must be used within an AppProvider')
  }
  return context
}

// --- Action Creators ---
// These functions call the ApiClient and dispatch appropriate actions.
// They follow the pattern: dispatch LOADING_STARTED → call API → dispatch result or ERROR_OCCURRED.

/**
 * Fetches all vaults and dispatches VAULTS_LOADED or ERROR_OCCURRED.
 */
export async function loadVaults(
  dispatch: Dispatch<AppAction>,
  apiClient: IApiClient,
): Promise<void> {
  dispatch({ type: 'LOADING_STARTED' })
  try {
    const vaults = await apiClient.fetchVaults()
    dispatch({ type: 'VAULTS_LOADED', payload: vaults })
  } catch (err: unknown) {
    const error = toAppError(err)
    dispatch({ type: 'ERROR_OCCURRED', payload: error })
  }
}

/**
 * Reloads the directory tree for a specific vault.
 * On success, dispatches VAULT_TREE_LOADED to update state.
 * On failure, logs the error and keeps existing tree state unchanged.
 */
export async function reloadVaultTree(
  dispatch: Dispatch<AppAction>,
  apiClient: IApiClient,
  vaultId: string,
): Promise<void> {
  try {
    const tree = await apiClient.fetchVaultTree(vaultId)
    dispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId, tree } })
  } catch (error: unknown) {
    console.error('[reloadVaultTree] Failed to reload tree for vault', vaultId, error)
    // On failure: keep existing tree state unchanged (no dispatch)
  }
}

/**
 * Selects a vault and fetches its directory tree.
 * Dispatches VAULT_SELECTED, then LOADING_STARTED → TREE_LOADED or ERROR_OCCURRED.
 */
export async function selectVault(
  dispatch: Dispatch<AppAction>,
  apiClient: IApiClient,
  vaultId: string,
): Promise<void> {
  dispatch({ type: 'VAULT_SELECTED', payload: vaultId })
  dispatch({ type: 'LOADING_STARTED' })
  try {
    const tree = await apiClient.fetchVaultTree(vaultId)
    dispatch({ type: 'TREE_LOADED', payload: tree })
  } catch (err: unknown) {
    const error = toAppError(err)
    dispatch({ type: 'ERROR_OCCURRED', payload: error })
  }
}

/**
 * Fetches file content and dispatches FILE_LOADED or ERROR_OCCURRED.
 */
export async function loadFile(
  dispatch: Dispatch<AppAction>,
  apiClient: IApiClient,
  vaultId: string,
  filePath: string,
): Promise<void> {
  dispatch({ type: 'LOADING_STARTED' })
  try {
    const file = await apiClient.fetchFileContent(vaultId, filePath)
    dispatch({ type: 'FILE_LOADED', payload: file })
  } catch (err: unknown) {
    const error = toAppError(err)
    dispatch({ type: 'ERROR_OCCURRED', payload: error })
  }
}

/**
 * Creates a new vault and dispatches VAULT_CREATED or ERROR_OCCURRED.
 */
export async function createVault(
  dispatch: Dispatch<AppAction>,
  apiClient: IApiClient,
  name: string,
): Promise<void> {
  dispatch({ type: 'LOADING_STARTED' })
  try {
    const vault = await apiClient.createVault(name)
    dispatch({ type: 'VAULT_CREATED', payload: vault })
  } catch (err: unknown) {
    const error = toAppError(err)
    dispatch({ type: 'ERROR_OCCURRED', payload: error })
  }
}

/**
 * Deletes a vault and dispatches VAULT_DELETED or ERROR_OCCURRED.
 */
export async function deleteVault(
  dispatch: Dispatch<AppAction>,
  apiClient: IApiClient,
  vaultId: string,
): Promise<void> {
  dispatch({ type: 'LOADING_STARTED' })
  try {
    await apiClient.deleteVault(vaultId)
    dispatch({ type: 'VAULT_DELETED', payload: vaultId })
  } catch (err: unknown) {
    const error = toAppError(err)
    dispatch({ type: 'ERROR_OCCURRED', payload: error })
  }
}

/**
 * Imports a single file into a vault, then refreshes the tree.
 * Dispatches LOADING_STARTED → API call → fetch tree → TREE_LOADED or ERROR_OCCURRED.
 */
export async function importFile(
  dispatch: Dispatch<AppAction>,
  apiClient: IApiClient,
  vaultId: string,
  file: File,
): Promise<void> {
  dispatch({ type: 'LOADING_STARTED' })
  try {
    await apiClient.importFile(vaultId, file)
    const tree = await apiClient.fetchVaultTree(vaultId)
    dispatch({ type: 'TREE_LOADED', payload: tree })
  } catch (err: unknown) {
    const error = toAppError(err)
    dispatch({ type: 'ERROR_OCCURRED', payload: error })
  }
}

/**
 * Imports a folder (multiple files) into a vault, then refreshes the tree.
 * Dispatches LOADING_STARTED → API call → fetch tree → TREE_LOADED or ERROR_OCCURRED.
 */
export async function importFolder(
  dispatch: Dispatch<AppAction>,
  apiClient: IApiClient,
  vaultId: string,
  files: FileList,
): Promise<void> {
  dispatch({ type: 'LOADING_STARTED' })
  try {
    await apiClient.importFolder(vaultId, files)
    const tree = await apiClient.fetchVaultTree(vaultId)
    dispatch({ type: 'TREE_LOADED', payload: tree })
  } catch (err: unknown) {
    const error = toAppError(err)
    dispatch({ type: 'ERROR_OCCURRED', payload: error })
  }
}

/**
 * Deletes content (file or folder) within a vault, then refreshes the tree.
 * Dispatches LOADING_STARTED → API call → CONTENT_DELETED → fetch tree → TREE_LOADED or ERROR_OCCURRED.
 */
export async function deleteContent(
  dispatch: Dispatch<AppAction>,
  apiClient: IApiClient,
  vaultId: string,
  path: string,
): Promise<void> {
  dispatch({ type: 'LOADING_STARTED' })
  try {
    await apiClient.deleteContent(vaultId, path)
    dispatch({ type: 'CONTENT_DELETED', payload: path })
    const tree = await apiClient.fetchVaultTree(vaultId)
    dispatch({ type: 'TREE_LOADED', payload: tree })
  } catch (err: unknown) {
    const error = toAppError(err)
    dispatch({ type: 'ERROR_OCCURRED', payload: error })
  }
}

/**
 * Creates a new file in a vault with empty content, then refreshes the tree.
 * Returns the file path on success (so the caller can open it in a tab), or null on failure.
 */
export async function createFile(
  dispatch: Dispatch<AppAction>,
  apiClient: IApiClient,
  vaultId: string,
  filePath: string,
): Promise<string | null> {
  dispatch({ type: 'LOADING_STARTED' })
  try {
    await apiClient.saveFile(vaultId, filePath, '')
    const tree = await apiClient.fetchVaultTree(vaultId)
    dispatch({ type: 'TREE_LOADED', payload: tree })
    return filePath
  } catch (err: unknown) {
    const error = toAppError(err)
    dispatch({ type: 'ERROR_OCCURRED', payload: error })
    return null
  }
}

/**
 * Exports a vault to a local directory.
 *
 * Strategy:
 * 1. If the File System Access API is available (Chromium), use showDirectoryPicker
 *    to let the user choose a target folder and write files directly from the browser.
 * 2. Otherwise (Firefox etc.), download all files and package them as a ZIP in the browser,
 *    then trigger a single ZIP download. Shows a hint that Chrome provides a better experience.
 */
export async function exportVault(
  dispatch: Dispatch<AppAction>,
  apiClient: IApiClient,
  vaultId: string,
  vaultName?: string,
): Promise<void> {
  if ('showDirectoryPicker' in window) {
    await exportVaultViaFSA(dispatch, apiClient, vaultId)
  } else {
    await exportVaultViaZip(dispatch, apiClient, vaultId, vaultName)
  }
}

/**
 * Export using the File System Access API (Chromium browsers).
 */
async function exportVaultViaFSA(
  dispatch: Dispatch<AppAction>,
  apiClient: IApiClient,
  vaultId: string,
): Promise<void> {
  let dirHandle: FileSystemDirectoryHandle
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
  } catch (err: unknown) {
    // User cancelled the picker
    if (err instanceof Error && err.name === 'AbortError') return
    const error = toAppError(err)
    dispatch({ type: 'ERROR_OCCURRED', payload: error })
    return
  }

  dispatch({ type: 'LOADING_STARTED' })

  try {
    const tree = await apiClient.fetchVaultTree(vaultId)

    // Collect all file paths from the tree
    const filePaths: string[] = []
    const dirPaths: string[] = []

    function collectPaths(node: import('../types').DirectoryTree): void {
      if (node.type === 'file' && node.path) {
        filePaths.push(node.path)
      } else if (node.type === 'directory' && node.path) {
        dirPaths.push(node.path)
      }
      if (node.children) {
        for (const child of node.children) {
          collectPaths(child)
        }
      }
    }
    collectPaths(tree)

    // Create all directories first
    for (const dirPath of dirPaths) {
      const segments = dirPath.split('/').filter((s) => s.length > 0)
      let current = dirHandle
      for (const segment of segments) {
        current = await current.getDirectoryHandle(segment, { create: true })
      }
    }

    // Download and write each file
    const token = apiClient.getToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    for (const filePath of filePaths) {
      const encodedPath = encodeURIComponent(filePath)
      const response = await fetch(`/api/v1/vaults/${vaultId}/files?path=${encodedPath}&raw=true`, { headers })

      if (!response.ok) {
        // Skip files that can't be fetched
        continue
      }

      const blob = await response.blob()

      // Navigate to the correct directory
      const segments = filePath.split('/')
      const fileName = segments.pop()!
      let current = dirHandle
      for (const segment of segments) {
        if (segment) {
          current = await current.getDirectoryHandle(segment, { create: true })
        }
      }

      // Write the file
      const fileHandle = await current.getFileHandle(fileName, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()
    }

    // Done — clear loading state
    dispatch({ type: 'TREE_LOADED', payload: tree })
  } catch (err: unknown) {
    const error = toAppError(err)
    dispatch({ type: 'ERROR_OCCURRED', payload: error })
  }
}

/**
 * Fallback export for browsers without File System Access API (e.g. Firefox).
 * Downloads all vault files, packages them into a ZIP in the browser, and triggers download.
 */
async function exportVaultViaZip(
  dispatch: Dispatch<AppAction>,
  apiClient: IApiClient,
  vaultId: string,
  vaultName?: string,
): Promise<void> {
  const proceed = window.confirm(
    'Dein Browser unterstützt keinen direkten Ordner-Export.\n\n' +
    'Der Vault wird stattdessen als ZIP-Datei heruntergeladen.\n' +
    'Tipp: In Chrome/Edge kannst du direkt in einen Ordner exportieren.\n\n' +
    'Fortfahren?',
  )
  if (!proceed) return

  dispatch({ type: 'LOADING_STARTED' })

  try {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()

    const tree = await apiClient.fetchVaultTree(vaultId)

    // Collect all file paths from the tree
    const filePaths: string[] = []

    function collectPaths(node: import('../types').DirectoryTree): void {
      if (node.type === 'file' && node.path) {
        filePaths.push(node.path)
      }
      if (node.children) {
        for (const child of node.children) {
          collectPaths(child)
        }
      }
    }
    collectPaths(tree)

    // Download each file and add to ZIP
    const token = apiClient.getToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    for (const filePath of filePaths) {
      const encodedPath = encodeURIComponent(filePath)
      const response = await fetch(`/api/v1/vaults/${vaultId}/files?path=${encodedPath}&raw=true`, { headers })

      if (!response.ok) continue

      const blob = await response.blob()
      zip.file(filePath, blob)
    }

    // Generate ZIP and trigger download
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const fileName = `${vaultName ?? 'vault'}-export.zip`

    const url = URL.createObjectURL(zipBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    // Done — clear loading state
    dispatch({ type: 'TREE_LOADED', payload: tree })
  } catch (err: unknown) {
    const error = toAppError(err)
    dispatch({ type: 'ERROR_OCCURRED', payload: error })
  }
}

/**
 * Converts an unknown error into an AppError.
 * If the error already has code/message (thrown by ApiClient), use those.
 * Otherwise, wrap as INTERNAL_ERROR.
 */
function toAppError(err: unknown): AppError {
  if (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    'message' in err &&
    typeof (err as AppError).code === 'string' &&
    typeof (err as AppError).message === 'string'
  ) {
    return { code: (err as AppError).code, message: (err as AppError).message }
  }
  if (err instanceof Error) {
    return { code: 'INTERNAL_ERROR', message: err.message }
  }
  return { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }
}
