import { describe, it, expect, vi } from 'vitest'
import { openTab, saveTab, undoCloseTab } from './tabActions'
import type { IApiClient } from '../api'
import type { FileContent, FileSaveResult } from '../types'
import type { TabEntry } from './tabState'

function makeClosedTab(overrides: Partial<TabEntry> = {}): TabEntry {
  return {
    id: 'vault1::notes/closed.md',
    vaultId: 'vault1',
    filePath: 'notes/closed.md',
    fileName: 'closed.md',
    mode: 'view',
    isBinary: false,
    content: 'stale content',
    editBuffer: null,
    loading: false,
    error: null,
    pinned: false,
    ...overrides,
  }
}

function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    setToken: vi.fn(),
    getToken: vi.fn().mockReturnValue(null),
    setCsrfToken: vi.fn(),
    getCsrfToken: vi.fn().mockReturnValue(null),
    setOnSessionExpired: vi.fn(),
    fetchVaults: vi.fn(),
    fetchVaultTree: vi.fn(),
    fetchFileContent: vi.fn(),
    createVault: vi.fn(),
    deleteVault: vi.fn(),
    importFile: vi.fn(),
    importFolder: vi.fn(),
    deleteContent: vi.fn(),
    saveFile: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getSessions: vi.fn(),
    invalidateSession: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    deleteSelf: vi.fn(),
    searchUsers: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as IApiClient
}

describe('openTab', () => {
  it('dispatches OPEN_TAB then TAB_CONTENT_LOADED on success', async () => {
    const tabDispatch = vi.fn()
    const appDispatch = vi.fn()
    const fileContent: FileContent = {
      path: 'notes/hello.md',
      name: 'hello.md',
      content: '# Hello',
      size: 7,
      encoding: 'utf-8',
      isBinary: false,
      isTruncated: false,
    }
    const apiClient = createMockApiClient({
      fetchFileContent: vi.fn().mockResolvedValue(fileContent),
    })

    await openTab(tabDispatch, appDispatch, apiClient, 'vault1', 'notes/hello.md', 'hello.md')

    expect(tabDispatch).toHaveBeenCalledTimes(2)
    expect(tabDispatch).toHaveBeenNthCalledWith(1, {
      type: 'OPEN_TAB',
      payload: { vaultId: 'vault1', filePath: 'notes/hello.md', fileName: 'hello.md' },
    })
    expect(tabDispatch).toHaveBeenNthCalledWith(2, {
      type: 'TAB_CONTENT_LOADED',
      payload: { tabId: 'vault1::notes/hello.md', content: '# Hello', isBinary: false },
    })
    expect(apiClient.fetchFileContent).toHaveBeenCalledWith('vault1', 'notes/hello.md')
  })

  it('dispatches OPEN_TAB then TAB_ERROR on fetch failure', async () => {
    const tabDispatch = vi.fn()
    const appDispatch = vi.fn()
    const apiClient = createMockApiClient({
      fetchFileContent: vi.fn().mockRejectedValue({ code: 'NOT_FOUND', message: 'File not found' }),
    })

    await openTab(tabDispatch, appDispatch, apiClient, 'vault1', 'missing.md', 'missing.md')

    expect(tabDispatch).toHaveBeenCalledTimes(2)
    expect(tabDispatch).toHaveBeenNthCalledWith(1, {
      type: 'OPEN_TAB',
      payload: { vaultId: 'vault1', filePath: 'missing.md', fileName: 'missing.md' },
    })
    expect(tabDispatch).toHaveBeenNthCalledWith(2, {
      type: 'TAB_ERROR',
      payload: { tabId: 'vault1::missing.md', error: 'File not found' },
    })
  })

  it('handles binary files correctly', async () => {
    const tabDispatch = vi.fn()
    const appDispatch = vi.fn()
    const fileContent: FileContent = {
      path: 'images/photo.png',
      name: 'photo.png',
      content: '',
      size: 1024,
      encoding: 'utf-8',
      isBinary: true,
      isTruncated: false,
    }
    const apiClient = createMockApiClient({
      fetchFileContent: vi.fn().mockResolvedValue(fileContent),
    })

    await openTab(tabDispatch, appDispatch, apiClient, 'vault1', 'images/photo.png', 'photo.png')

    expect(tabDispatch).toHaveBeenNthCalledWith(2, {
      type: 'TAB_CONTENT_LOADED',
      payload: { tabId: 'vault1::images/photo.png', content: '', isBinary: true },
    })
  })
})

describe('saveTab', () => {
  it('dispatches SAVE_SUCCESS on successful save', async () => {
    const tabDispatch = vi.fn()
    const saveResult: FileSaveResult = { path: 'notes/hello.md', name: 'hello.md', size: 12 }
    const apiClient = createMockApiClient({
      saveFile: vi.fn().mockResolvedValue(saveResult),
    })

    await saveTab(tabDispatch, apiClient, 'vault1', 'notes/hello.md', '# Hello World')

    expect(tabDispatch).toHaveBeenCalledTimes(1)
    expect(tabDispatch).toHaveBeenCalledWith({
      type: 'SAVE_SUCCESS',
      payload: { tabId: 'vault1::notes/hello.md', content: '# Hello World' },
    })
    expect(apiClient.saveFile).toHaveBeenCalledWith('vault1', 'notes/hello.md', '# Hello World')
  })

  it('dispatches SAVE_ERROR on save failure', async () => {
    const tabDispatch = vi.fn()
    const apiClient = createMockApiClient({
      saveFile: vi.fn().mockRejectedValue({ code: 'PATH_TRAVERSAL', message: 'Invalid path' }),
    })

    await saveTab(tabDispatch, apiClient, 'vault1', '../etc/passwd', 'malicious')

    expect(tabDispatch).toHaveBeenCalledTimes(1)
    expect(tabDispatch).toHaveBeenCalledWith({
      type: 'SAVE_ERROR',
      payload: { tabId: 'vault1::../etc/passwd', error: 'Invalid path' },
    })
  })

  it('handles unexpected errors gracefully', async () => {
    const tabDispatch = vi.fn()
    const apiClient = createMockApiClient({
      saveFile: vi.fn().mockRejectedValue('network failure'),
    })

    await saveTab(tabDispatch, apiClient, 'vault1', 'file.md', 'content')

    expect(tabDispatch).toHaveBeenCalledWith({
      type: 'SAVE_ERROR',
      payload: { tabId: 'vault1::file.md', error: 'An unexpected error occurred' },
    })
  })
})

describe('undoCloseTab', () => {
  it('pops the most recent closed tab, then reopens it with fresh content', async () => {
    const tabDispatch = vi.fn()
    const appDispatch = vi.fn()
    const fileContent: FileContent = {
      path: 'notes/closed.md', name: 'closed.md', content: '# Fresh content',
      size: 16, encoding: 'utf-8', isBinary: false, isTruncated: false,
    }
    const apiClient = createMockApiClient({ fetchFileContent: vi.fn().mockResolvedValue(fileContent) })
    const history = [makeClosedTab({ id: 'vault1::a.md', filePath: 'a.md', fileName: 'a.md' }), makeClosedTab()]

    await undoCloseTab(tabDispatch, appDispatch, apiClient, history)

    expect(tabDispatch).toHaveBeenNthCalledWith(1, { type: 'POP_CLOSED_TAB' })
    expect(tabDispatch).toHaveBeenNthCalledWith(2, {
      type: 'OPEN_TAB',
      payload: { vaultId: 'vault1', filePath: 'notes/closed.md', fileName: 'closed.md' },
    })
    expect(tabDispatch).toHaveBeenNthCalledWith(3, {
      type: 'TAB_CONTENT_LOADED',
      payload: { tabId: 'vault1::notes/closed.md', content: '# Fresh content', isBinary: false },
    })
    // Not restored from the stale closed-tab snapshot's own content:
    expect(tabDispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ content: 'stale content' }),
    }))
  })

  it('restores the pinned flag for a reopened tab that was pinned', async () => {
    const tabDispatch = vi.fn()
    const appDispatch = vi.fn()
    const apiClient = createMockApiClient({ fetchFileContent: vi.fn().mockResolvedValue({
      path: 'notes/closed.md', name: 'closed.md', content: '', size: 0, encoding: 'utf-8', isBinary: false, isTruncated: false,
    }) })

    await undoCloseTab(tabDispatch, appDispatch, apiClient, [makeClosedTab({ pinned: true })])

    expect(tabDispatch).toHaveBeenCalledWith({ type: 'TOGGLE_PIN', payload: { tabId: 'vault1::notes/closed.md' } })
  })

  it('does not dispatch TOGGLE_PIN for a reopened tab that was not pinned', async () => {
    const tabDispatch = vi.fn()
    const appDispatch = vi.fn()
    const apiClient = createMockApiClient({ fetchFileContent: vi.fn().mockResolvedValue({
      path: 'notes/closed.md', name: 'closed.md', content: '', size: 0, encoding: 'utf-8', isBinary: false, isTruncated: false,
    }) })

    await undoCloseTab(tabDispatch, appDispatch, apiClient, [makeClosedTab({ pinned: false })])

    expect(tabDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'TOGGLE_PIN' }))
  })

  it('does nothing when history is empty', async () => {
    const tabDispatch = vi.fn()
    const appDispatch = vi.fn()
    const apiClient = createMockApiClient()

    await undoCloseTab(tabDispatch, appDispatch, apiClient, [])

    expect(tabDispatch).not.toHaveBeenCalled()
  })
})
