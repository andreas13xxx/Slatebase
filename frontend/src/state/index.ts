import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import type { AppState, AppAction, AppError } from '../types'
import type { IApiClient } from '../api'

/** Initial application state. */
export const initialState: AppState = {
  vaults: [],
  selectedVaultId: null,
  directoryTree: null,
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
        loading: false,
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
      return {
        ...state,
        vaults: state.vaults.filter((v) => v.id !== deletedId),
        selectedVaultId: isSelectedDeleted ? null : state.selectedVaultId,
        directoryTree: isSelectedDeleted ? null : state.directoryTree,
        selectedFile: isSelectedDeleted ? null : state.selectedFile,
        loading: false,
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
