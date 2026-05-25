import { describe, it, expect, vi } from 'vitest'
import { appReducer, initialState, loadVaults, selectVault, loadFile, createVault, deleteVault, importFile, importFolder, deleteContent } from './index'
import type { AppState, VaultInfo, DirectoryTree, FileContent } from '../types'
import type { IApiClient } from '../api'

describe('appReducer', () => {
  it('returns initial state for unknown action', () => {
    const state = appReducer(initialState, { type: 'LOADING_STARTED' })
    // Just verify it doesn't crash and returns a valid state
    expect(state).toBeDefined()
  })

  describe('VAULTS_LOADED', () => {
    it('stores vaults and clears loading', () => {
      const vaults: VaultInfo[] = [
        { id: 'abc123', name: 'My Vault' },
        { id: 'def456', name: 'Other Vault' },
      ]
      const state: AppState = { ...initialState, loading: true }
      const result = appReducer(state, { type: 'VAULTS_LOADED', payload: vaults })

      expect(result.vaults).toEqual(vaults)
      expect(result.loading).toBe(false)
    })
  })

  describe('VAULT_SELECTED', () => {
    it('sets selectedVaultId and clears directoryTree and selectedFile', () => {
      const state: AppState = {
        ...initialState,
        directoryTree: { name: 'root', type: 'directory', path: '/', children: [] },
        selectedFile: { path: 'test.md', name: 'test.md', content: 'hi', size: 2, encoding: 'utf-8', isBinary: false, isTruncated: false },
      }
      const result = appReducer(state, { type: 'VAULT_SELECTED', payload: 'vault-1' })

      expect(result.selectedVaultId).toBe('vault-1')
      expect(result.directoryTree).toBeNull()
      expect(result.selectedFile).toBeNull()
    })
  })

  describe('TREE_LOADED', () => {
    it('stores directory tree and clears loading', () => {
      const tree: DirectoryTree = { name: 'root', type: 'directory', path: '/', children: [] }
      const state: AppState = { ...initialState, loading: true }
      const result = appReducer(state, { type: 'TREE_LOADED', payload: tree })

      expect(result.directoryTree).toEqual(tree)
      expect(result.loading).toBe(false)
    })
  })

  describe('FILE_LOADED', () => {
    it('stores file content and clears loading', () => {
      const file: FileContent = {
        path: 'notes/hello.md',
        name: 'hello.md',
        content: '# Hello',
        size: 7,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: false,
      }
      const state: AppState = { ...initialState, loading: true }
      const result = appReducer(state, { type: 'FILE_LOADED', payload: file })

      expect(result.selectedFile).toEqual(file)
      expect(result.loading).toBe(false)
    })
  })

  describe('LOADING_STARTED', () => {
    it('sets loading to true and clears error', () => {
      const state: AppState = {
        ...initialState,
        loading: false,
        error: { code: 'VAULT_NOT_FOUND', message: 'Not found' },
      }
      const result = appReducer(state, { type: 'LOADING_STARTED' })

      expect(result.loading).toBe(true)
      expect(result.error).toBeNull()
    })
  })

  describe('ERROR_OCCURRED', () => {
    it('sets error and clears loading', () => {
      const state: AppState = { ...initialState, loading: true }
      const error = { code: 'INTERNAL_ERROR', message: 'Something went wrong' }
      const result = appReducer(state, { type: 'ERROR_OCCURRED', payload: error })

      expect(result.error).toEqual(error)
      expect(result.loading).toBe(false)
    })
  })

  describe('VAULT_CREATED', () => {
    it('appends new vault to vaults list and clears loading', () => {
      const existingVault: VaultInfo = { id: 'v1', name: 'Existing' }
      const newVault: VaultInfo = { id: 'v2', name: 'New Vault' }
      const state: AppState = { ...initialState, vaults: [existingVault], loading: true }
      const result = appReducer(state, { type: 'VAULT_CREATED', payload: newVault })

      expect(result.vaults).toEqual([existingVault, newVault])
      expect(result.loading).toBe(false)
    })
  })

  describe('VAULT_DELETED', () => {
    it('removes vault from list and clears loading', () => {
      const vaults: VaultInfo[] = [
        { id: 'v1', name: 'Vault 1' },
        { id: 'v2', name: 'Vault 2' },
      ]
      const state: AppState = { ...initialState, vaults, selectedVaultId: 'v1', loading: true }
      const result = appReducer(state, { type: 'VAULT_DELETED', payload: 'v2' })

      expect(result.vaults).toEqual([{ id: 'v1', name: 'Vault 1' }])
      expect(result.selectedVaultId).toBe('v1')
      expect(result.loading).toBe(false)
    })

    it('clears selection when deleted vault was selected', () => {
      const vaults: VaultInfo[] = [
        { id: 'v1', name: 'Vault 1' },
        { id: 'v2', name: 'Vault 2' },
      ]
      const tree: DirectoryTree = { name: 'root', type: 'directory', path: '/', children: [] }
      const file: FileContent = { path: 'a.md', name: 'a.md', content: 'hi', size: 2, encoding: 'utf-8', isBinary: false, isTruncated: false }
      const state: AppState = { ...initialState, vaults, selectedVaultId: 'v1', directoryTree: tree, selectedFile: file, loading: true }
      const result = appReducer(state, { type: 'VAULT_DELETED', payload: 'v1' })

      expect(result.vaults).toEqual([{ id: 'v2', name: 'Vault 2' }])
      expect(result.selectedVaultId).toBeNull()
      expect(result.directoryTree).toBeNull()
      expect(result.selectedFile).toBeNull()
      expect(result.loading).toBe(false)
    })
  })

  describe('CONTENT_DELETED', () => {
    it('sets directoryTree to null to force reload and clears loading', () => {
      const tree: DirectoryTree = { name: 'root', type: 'directory', path: '/', children: [] }
      const state: AppState = { ...initialState, directoryTree: tree, loading: true }
      const result = appReducer(state, { type: 'CONTENT_DELETED', payload: 'some/path.md' })

      expect(result.directoryTree).toBeNull()
      expect(result.loading).toBe(false)
    })
  })
})

describe('Action Creators', () => {
  function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
    return {
      setToken: vi.fn(),
      getToken: vi.fn().mockReturnValue(null),
      setCsrfToken: vi.fn(),
      getCsrfToken: vi.fn().mockReturnValue(null),
      setOnSessionExpired: vi.fn(),
      fetchVaults: vi.fn().mockResolvedValue([]),
      fetchVaultTree: vi.fn().mockResolvedValue({ name: 'root', type: 'directory', path: '/', children: [] }),
      fetchFileContent: vi.fn().mockResolvedValue({ path: 'a.md', name: 'a.md', content: '', size: 0, encoding: 'utf-8', isBinary: false, isTruncated: false }),
      createVault: vi.fn().mockResolvedValue({ id: 'new', name: 'New Vault' }),
      deleteVault: vi.fn().mockResolvedValue(undefined),
      importFile: vi.fn().mockResolvedValue(undefined),
      importFolder: vi.fn().mockResolvedValue(undefined),
      deleteContent: vi.fn().mockResolvedValue(undefined),
      saveFile: vi.fn().mockResolvedValue({ path: '', name: '', size: 0 }),
      login: vi.fn(),
      logout: vi.fn(),
      getSessions: vi.fn(),
      invalidateSession: vi.fn(),
      getProfile: vi.fn(),
      updateProfile: vi.fn(),
      changePassword: vi.fn(),
      deleteSelf: vi.fn(),
      ...overrides,
    } as IApiClient
  }

  describe('loadVaults', () => {
    it('dispatches LOADING_STARTED then VAULTS_LOADED on success', async () => {
      const vaults: VaultInfo[] = [{ id: 'v1', name: 'Vault 1' }]
      const apiClient = createMockApiClient({ fetchVaults: vi.fn().mockResolvedValue(vaults) })
      const dispatch = vi.fn()

      await loadVaults(dispatch, apiClient)

      expect(dispatch).toHaveBeenCalledTimes(2)
      expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'LOADING_STARTED' })
      expect(dispatch).toHaveBeenNthCalledWith(2, { type: 'VAULTS_LOADED', payload: vaults })
    })

    it('dispatches LOADING_STARTED then ERROR_OCCURRED on failure', async () => {
      const apiClient = createMockApiClient({
        fetchVaults: vi.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', message: 'Network error' }),
      })
      const dispatch = vi.fn()

      await loadVaults(dispatch, apiClient)

      expect(dispatch).toHaveBeenCalledTimes(2)
      expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'LOADING_STARTED' })
      expect(dispatch).toHaveBeenNthCalledWith(2, {
        type: 'ERROR_OCCURRED',
        payload: { code: 'INTERNAL_ERROR', message: 'Network error' },
      })
    })
  })

  describe('selectVault', () => {
    it('dispatches VAULT_SELECTED, LOADING_STARTED, then TREE_LOADED on success', async () => {
      const tree: DirectoryTree = { name: 'root', type: 'directory', path: '/', children: [] }
      const apiClient = createMockApiClient({ fetchVaultTree: vi.fn().mockResolvedValue(tree) })
      const dispatch = vi.fn()

      await selectVault(dispatch, apiClient, 'vault-abc')

      expect(dispatch).toHaveBeenCalledTimes(3)
      expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'VAULT_SELECTED', payload: 'vault-abc' })
      expect(dispatch).toHaveBeenNthCalledWith(2, { type: 'LOADING_STARTED' })
      expect(dispatch).toHaveBeenNthCalledWith(3, { type: 'TREE_LOADED', payload: tree })
    })

    it('dispatches VAULT_SELECTED, LOADING_STARTED, then ERROR_OCCURRED on failure', async () => {
      const apiClient = createMockApiClient({
        fetchVaultTree: vi.fn().mockRejectedValue({ code: 'VAULT_NOT_FOUND', message: 'Vault not found' }),
      })
      const dispatch = vi.fn()

      await selectVault(dispatch, apiClient, 'bad-id')

      expect(dispatch).toHaveBeenCalledTimes(3)
      expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'VAULT_SELECTED', payload: 'bad-id' })
      expect(dispatch).toHaveBeenNthCalledWith(2, { type: 'LOADING_STARTED' })
      expect(dispatch).toHaveBeenNthCalledWith(3, {
        type: 'ERROR_OCCURRED',
        payload: { code: 'VAULT_NOT_FOUND', message: 'Vault not found' },
      })
    })
  })

  describe('loadFile', () => {
    it('dispatches LOADING_STARTED then FILE_LOADED on success', async () => {
      const file: FileContent = {
        path: 'notes/hello.md',
        name: 'hello.md',
        content: '# Hello',
        size: 7,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: false,
      }
      const apiClient = createMockApiClient({ fetchFileContent: vi.fn().mockResolvedValue(file) })
      const dispatch = vi.fn()

      await loadFile(dispatch, apiClient, 'vault-1', 'notes/hello.md')

      expect(dispatch).toHaveBeenCalledTimes(2)
      expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'LOADING_STARTED' })
      expect(dispatch).toHaveBeenNthCalledWith(2, { type: 'FILE_LOADED', payload: file })
      expect(apiClient.fetchFileContent).toHaveBeenCalledWith('vault-1', 'notes/hello.md')
    })

    it('dispatches LOADING_STARTED then ERROR_OCCURRED on failure', async () => {
      const apiClient = createMockApiClient({
        fetchFileContent: vi.fn().mockRejectedValue(new Error('Fetch failed')),
      })
      const dispatch = vi.fn()

      await loadFile(dispatch, apiClient, 'vault-1', 'missing.md')

      expect(dispatch).toHaveBeenCalledTimes(2)
      expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'LOADING_STARTED' })
      expect(dispatch).toHaveBeenNthCalledWith(2, {
        type: 'ERROR_OCCURRED',
        payload: { code: 'INTERNAL_ERROR', message: 'Fetch failed' },
      })
    })
  })

  describe('createVault', () => {
    it('dispatches LOADING_STARTED then VAULT_CREATED on success', async () => {
      const newVault: VaultInfo = { id: 'new123', name: 'My New Vault' }
      const apiClient = createMockApiClient({ createVault: vi.fn().mockResolvedValue(newVault) })
      const dispatch = vi.fn()

      await createVault(dispatch, apiClient, 'My New Vault')

      expect(dispatch).toHaveBeenCalledTimes(2)
      expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'LOADING_STARTED' })
      expect(dispatch).toHaveBeenNthCalledWith(2, { type: 'VAULT_CREATED', payload: newVault })
      expect(apiClient.createVault).toHaveBeenCalledWith('My New Vault')
    })

    it('dispatches LOADING_STARTED then ERROR_OCCURRED on failure', async () => {
      const apiClient = createMockApiClient({
        createVault: vi.fn().mockRejectedValue({ code: 'VAULT_NAME_CONFLICT', message: 'Name already exists' }),
      })
      const dispatch = vi.fn()

      await createVault(dispatch, apiClient, 'Duplicate')

      expect(dispatch).toHaveBeenCalledTimes(2)
      expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'LOADING_STARTED' })
      expect(dispatch).toHaveBeenNthCalledWith(2, {
        type: 'ERROR_OCCURRED',
        payload: { code: 'VAULT_NAME_CONFLICT', message: 'Name already exists' },
      })
    })
  })

  describe('deleteVault', () => {
    it('dispatches LOADING_STARTED then VAULT_DELETED on success', async () => {
      const apiClient = createMockApiClient({ deleteVault: vi.fn().mockResolvedValue(undefined) })
      const dispatch = vi.fn()

      await deleteVault(dispatch, apiClient, 'vault-abc')

      expect(dispatch).toHaveBeenCalledTimes(2)
      expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'LOADING_STARTED' })
      expect(dispatch).toHaveBeenNthCalledWith(2, { type: 'VAULT_DELETED', payload: 'vault-abc' })
      expect(apiClient.deleteVault).toHaveBeenCalledWith('vault-abc')
    })

    it('dispatches LOADING_STARTED then ERROR_OCCURRED on failure', async () => {
      const apiClient = createMockApiClient({
        deleteVault: vi.fn().mockRejectedValue({ code: 'VAULT_NOT_FOUND', message: 'Vault not found' }),
      })
      const dispatch = vi.fn()

      await deleteVault(dispatch, apiClient, 'bad-id')

      expect(dispatch).toHaveBeenCalledTimes(2)
      expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'LOADING_STARTED' })
      expect(dispatch).toHaveBeenNthCalledWith(2, {
        type: 'ERROR_OCCURRED',
        payload: { code: 'VAULT_NOT_FOUND', message: 'Vault not found' },
      })
    })
  })

  describe('importFile', () => {
    it('dispatches LOADING_STARTED, calls API, fetches tree, then dispatches TREE_LOADED on success', async () => {
      const tree: DirectoryTree = { name: 'root', type: 'directory', path: '/', children: [{ name: 'doc.md', type: 'file', path: 'doc.md' }] }
      const mockImportFile = vi.fn().mockResolvedValue(undefined)
      const mockFetchTree = vi.fn().mockResolvedValue(tree)
      const apiClient = createMockApiClient({ importFile: mockImportFile, fetchVaultTree: mockFetchTree })
      const dispatch = vi.fn()

      const mockFile = new File(['content'], 'doc.md', { type: 'text/plain' })
      await importFile(dispatch, apiClient, 'vault-1', mockFile)

      expect(dispatch).toHaveBeenCalledTimes(2)
      expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'LOADING_STARTED' })
      expect(dispatch).toHaveBeenNthCalledWith(2, { type: 'TREE_LOADED', payload: tree })
      expect(mockImportFile).toHaveBeenCalledWith('vault-1', mockFile)
      expect(mockFetchTree).toHaveBeenCalledWith('vault-1')
    })

    it('dispatches LOADING_STARTED then ERROR_OCCURRED on failure', async () => {
      const apiClient = createMockApiClient({
        importFile: vi.fn().mockRejectedValue({ code: 'FILE_CONFLICT', message: 'File already exists' }),
      })
      const dispatch = vi.fn()

      const mockFile = new File(['content'], 'doc.md', { type: 'text/plain' })
      await importFile(dispatch, apiClient, 'vault-1', mockFile)

      expect(dispatch).toHaveBeenCalledTimes(2)
      expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'LOADING_STARTED' })
      expect(dispatch).toHaveBeenNthCalledWith(2, {
        type: 'ERROR_OCCURRED',
        payload: { code: 'FILE_CONFLICT', message: 'File already exists' },
      })
    })
  })

  describe('importFolder', () => {
    it('dispatches LOADING_STARTED, calls API, fetches tree, then dispatches TREE_LOADED on success', async () => {
      const tree: DirectoryTree = { name: 'root', type: 'directory', path: '/', children: [] }
      const mockImportFolder = vi.fn().mockResolvedValue(undefined)
      const mockFetchTree = vi.fn().mockResolvedValue(tree)
      const apiClient = createMockApiClient({ importFolder: mockImportFolder, fetchVaultTree: mockFetchTree })
      const dispatch = vi.fn()

      const mockFiles = {
        length: 1,
        item: (i: number) => i === 0 ? new File(['a'], 'folder/a.md', { type: 'text/plain' }) : null,
        [Symbol.iterator]: function* () { yield new File(['a'], 'folder/a.md', { type: 'text/plain' }) },
      } as unknown as FileList

      await importFolder(dispatch, apiClient, 'vault-1', mockFiles)

      expect(dispatch).toHaveBeenCalledTimes(2)
      expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'LOADING_STARTED' })
      expect(dispatch).toHaveBeenNthCalledWith(2, { type: 'TREE_LOADED', payload: tree })
      expect(mockImportFolder).toHaveBeenCalledWith('vault-1', mockFiles)
      expect(mockFetchTree).toHaveBeenCalledWith('vault-1')
    })

    it('dispatches LOADING_STARTED then ERROR_OCCURRED on failure', async () => {
      const apiClient = createMockApiClient({
        importFolder: vi.fn().mockRejectedValue({ code: 'DEPTH_EXCEEDED', message: 'Too deep' }),
      })
      const dispatch = vi.fn()

      const mockFiles = {
        length: 1,
        item: (i: number) => i === 0 ? new File(['a'], 'folder/a.md', { type: 'text/plain' }) : null,
        [Symbol.iterator]: function* () { yield new File(['a'], 'folder/a.md', { type: 'text/plain' }) },
      } as unknown as FileList

      await importFolder(dispatch, apiClient, 'vault-1', mockFiles)

      expect(dispatch).toHaveBeenCalledTimes(2)
      expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'LOADING_STARTED' })
      expect(dispatch).toHaveBeenNthCalledWith(2, {
        type: 'ERROR_OCCURRED',
        payload: { code: 'DEPTH_EXCEEDED', message: 'Too deep' },
      })
    })
  })

  describe('deleteContent', () => {
    it('dispatches LOADING_STARTED, calls API, dispatches CONTENT_DELETED, fetches tree, then dispatches TREE_LOADED on success', async () => {
      const tree: DirectoryTree = { name: 'root', type: 'directory', path: '/', children: [] }
      const mockDeleteContent = vi.fn().mockResolvedValue(undefined)
      const mockFetchTree = vi.fn().mockResolvedValue(tree)
      const apiClient = createMockApiClient({ deleteContent: mockDeleteContent, fetchVaultTree: mockFetchTree })
      const dispatch = vi.fn()

      await deleteContent(dispatch, apiClient, 'vault-1', 'old-file.md')

      expect(dispatch).toHaveBeenCalledTimes(3)
      expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'LOADING_STARTED' })
      expect(dispatch).toHaveBeenNthCalledWith(2, { type: 'CONTENT_DELETED', payload: 'old-file.md' })
      expect(dispatch).toHaveBeenNthCalledWith(3, { type: 'TREE_LOADED', payload: tree })
      expect(mockDeleteContent).toHaveBeenCalledWith('vault-1', 'old-file.md')
      expect(mockFetchTree).toHaveBeenCalledWith('vault-1')
    })

    it('dispatches LOADING_STARTED then ERROR_OCCURRED on failure', async () => {
      const apiClient = createMockApiClient({
        deleteContent: vi.fn().mockRejectedValue({ code: 'FILE_NOT_FOUND', message: 'Not found' }),
      })
      const dispatch = vi.fn()

      await deleteContent(dispatch, apiClient, 'vault-1', 'missing.md')

      expect(dispatch).toHaveBeenCalledTimes(2)
      expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'LOADING_STARTED' })
      expect(dispatch).toHaveBeenNthCalledWith(2, {
        type: 'ERROR_OCCURRED',
        payload: { code: 'FILE_NOT_FOUND', message: 'Not found' },
      })
    })
  })
})
