import { describe, it, expect, vi } from 'vitest'
import { openTab, saveTab } from './tabActions'
import type { IApiClient } from '../api'
import type { FileContent, FileSaveResult } from '../types'

function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    fetchVaults: vi.fn(),
    fetchVaultTree: vi.fn(),
    fetchFileContent: vi.fn(),
    createVault: vi.fn(),
    deleteVault: vi.fn(),
    importFile: vi.fn(),
    importFolder: vi.fn(),
    deleteContent: vi.fn(),
    saveFile: vi.fn(),
    ...overrides,
  }
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
