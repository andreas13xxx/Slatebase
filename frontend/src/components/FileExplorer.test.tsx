import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { FileExplorer } from './FileExplorer'
import { AppContext } from '../state'
import { TabProvider } from '../state/tabContext'
import type { AppState, AppAction, DirectoryTree } from '../types'
import { initialState } from '../state'
import type { IApiClient } from '../api'
import type { Dispatch } from 'react'

/** Creates a mock API client with all required interface methods. */
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
    ...overrides,
  }
}

/** Helper to render FileExplorer with a custom state and capture dispatched actions. */
function renderFileExplorer(stateOverrides: Partial<AppState> = {}, apiClient?: IApiClient) {
  const dispatch = vi.fn() as Dispatch<AppAction> & ReturnType<typeof vi.fn>
  const state: AppState = { ...initialState, ...stateOverrides }

  render(
    React.createElement(
      AppContext.Provider,
      { value: { state, dispatch, apiClient: apiClient ?? null } },
      React.createElement(TabProvider, null, React.createElement(FileExplorer)),
    ),
  )

  return { dispatch }
}

/** Sample directory tree for testing. */
const sampleTree: DirectoryTree = {
  name: 'root',
  type: 'directory',
  path: '',
  itemCount: 3,
  children: [
    {
      name: 'Documents',
      type: 'directory',
      path: 'Documents',
      itemCount: 2,
      children: [
        { name: 'notes.md', type: 'file', path: 'Documents/notes.md', size: 1024 },
        { name: 'todo.md', type: 'file', path: 'Documents/todo.md', size: 512 },
      ],
    },
    {
      name: 'Images',
      type: 'directory',
      path: 'Images',
      itemCount: 0,
      children: [],
    },
    { name: 'readme.md', type: 'file', path: 'readme.md', size: 256 },
  ],
}

describe('FileExplorer', () => {
  describe('empty state', () => {
    it('shows "Vault ist leer" when directoryTree is null', () => {
      renderFileExplorer({ directoryTree: null })

      expect(screen.getByText('Vault ist leer')).toBeInTheDocument()
    })

    it('shows "Vault ist leer" when tree has no children', () => {
      const emptyTree: DirectoryTree = {
        name: 'root',
        type: 'directory',
        path: '',
        children: [],
      }
      renderFileExplorer({ directoryTree: emptyTree })

      expect(screen.getByText('Vault ist leer')).toBeInTheDocument()
    })

    it('shows "Vault ist leer" when tree children is undefined', () => {
      const noChildrenTree: DirectoryTree = {
        name: 'root',
        type: 'directory',
        path: '',
      }
      renderFileExplorer({ directoryTree: noChildrenTree })

      expect(screen.getByText('Vault ist leer')).toBeInTheDocument()
    })
  })

  describe('tree rendering', () => {
    it('renders a navigation landmark with tree role', () => {
      renderFileExplorer({ directoryTree: sampleTree })

      const nav = screen.getByRole('navigation', { name: 'File explorer' })
      expect(nav).toBeInTheDocument()
      expect(screen.getByRole('tree')).toBeInTheDocument()
    })

    it('renders folder names with item counts', () => {
      renderFileExplorer({ directoryTree: sampleTree })

      expect(screen.getByText('Documents')).toBeInTheDocument()
      expect(screen.getByText('(2)')).toBeInTheDocument()
      expect(screen.getByText('Images')).toBeInTheDocument()
      expect(screen.getByText('(0)')).toBeInTheDocument()
    })

    it('renders top-level files', () => {
      renderFileExplorer({ directoryTree: sampleTree })

      expect(screen.getByText('readme')).toBeInTheDocument()
    })

    it('renders folders as buttons', () => {
      renderFileExplorer({ directoryTree: sampleTree })

      const documentsButton = screen.getByRole('button', { name: /Documents.*\(2\)/ })
      expect(documentsButton).toBeInTheDocument()
    })
  })

  describe('folder collapse/expand', () => {
    it('all folders start collapsed (children not visible)', () => {
      renderFileExplorer({ directoryTree: sampleTree })

      // Nested files should not be visible initially
      expect(screen.queryByText('notes')).not.toBeInTheDocument()
      expect(screen.queryByText('todo')).not.toBeInTheDocument()
    })

    it('shows collapsed chevron for collapsed folders', () => {
      renderFileExplorer({ directoryTree: sampleTree })

      // Chevrons are now Lucide SVG icons (aria-hidden), verify folders are rendered as buttons
      const documentsButton = screen.getByRole('button', { name: /Documents.*\(2\)/ })
      expect(documentsButton).toBeInTheDocument()
    })

    it('expands folder on click, showing children and expanded chevron', async () => {
      const user = userEvent.setup()
      renderFileExplorer({ directoryTree: sampleTree })

      const documentsButton = screen.getByRole('button', { name: /Documents.*\(2\)/ })
      await user.click(documentsButton)

      // Children should now be visible
      expect(screen.getByText('notes')).toBeInTheDocument()
      expect(screen.getByText('todo')).toBeInTheDocument()
    })

    it('collapses folder on second click', async () => {
      const user = userEvent.setup()
      renderFileExplorer({ directoryTree: sampleTree })

      const documentsButton = screen.getByRole('button', { name: /Documents.*\(2\)/ })

      // Expand
      await user.click(documentsButton)
      expect(screen.getByText('notes')).toBeInTheDocument()

      // Collapse
      await user.click(documentsButton)
      expect(screen.queryByText('notes')).not.toBeInTheDocument()
    })

    it('sets aria-expanded attribute on folder buttons', async () => {
      const user = userEvent.setup()
      renderFileExplorer({ directoryTree: sampleTree })

      const documentsButton = screen.getByRole('button', { name: /Documents.*\(2\)/ })
      expect(documentsButton).toHaveAttribute('aria-expanded', 'false')

      await user.click(documentsButton)
      expect(documentsButton).toHaveAttribute('aria-expanded', 'true')
    })
  })

  describe('file selection', () => {
    it('calls openTab which fetches file content on file click when vault is selected', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({
        fetchFileContent: vi.fn().mockResolvedValue({
          path: 'readme.md',
          name: 'readme.md',
          content: '# Hello',
          size: 256,
          encoding: 'utf-8',
          isBinary: false,
          isTruncated: false,
        }),
      })
      renderFileExplorer(
        {
          directoryTree: sampleTree,
          selectedVaultId: 'vault-123',
        },
        mockApiClient,
      )

      // Click on a top-level file
      await user.click(screen.getByText('readme'))

      // openTab fetches file content via the API client
      expect(mockApiClient.fetchFileContent).toHaveBeenCalledWith('vault-123', 'readme.md')
    })

    it('highlights the currently selected file with aria-current', () => {
      renderFileExplorer({
        directoryTree: sampleTree,
        selectedVaultId: 'vault-123',
        selectedFile: {
          path: 'readme.md',
          name: 'readme.md',
          content: '# Hello',
          size: 256,
          encoding: 'utf-8',
          isBinary: false,
          isTruncated: false,
        },
      })

      const fileButton = screen.getByText('readme')
      expect(fileButton).toHaveAttribute('aria-current', 'true')
    })

    it('does not highlight non-selected files', () => {
      renderFileExplorer({
        directoryTree: sampleTree,
        selectedVaultId: 'vault-123',
        selectedFile: {
          path: 'readme.md',
          name: 'readme.md',
          content: '# Hello',
          size: 256,
          encoding: 'utf-8',
          isBinary: false,
          isTruncated: false,
        },
      })

      const readmeButton = screen.getByText('readme')
      expect(readmeButton).toHaveAttribute('aria-current', 'true')
    })

    it('applies selected CSS class to highlighted file', () => {
      renderFileExplorer({
        directoryTree: sampleTree,
        selectedVaultId: 'vault-123',
        selectedFile: {
          path: 'readme.md',
          name: 'readme.md',
          content: '# Hello',
          size: 256,
          encoding: 'utf-8',
          isBinary: false,
          isTruncated: false,
        },
      })

      const fileButton = screen.getByText('readme')
      expect(fileButton).toHaveClass('tree-node-file--selected')
    })
  })

  describe('delete actions', () => {
    it('renders delete buttons for files', () => {
      renderFileExplorer({ directoryTree: sampleTree, selectedVaultId: 'vault-123' })

      expect(screen.getByRole('button', { name: 'Datei "readme.md" l\u00f6schen' })).toBeInTheDocument()
    })

    it('renders delete buttons for folders', () => {
      renderFileExplorer({ directoryTree: sampleTree, selectedVaultId: 'vault-123' })

      expect(screen.getByRole('button', { name: 'Ordner "Documents" l\u00f6schen' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Ordner "Images" l\u00f6schen' })).toBeInTheDocument()
    })

    it('shows confirmation dialog on delete click', async () => {
      const user = userEvent.setup()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const mockApiClient = createMockApiClient()

      renderFileExplorer(
        { directoryTree: sampleTree, selectedVaultId: 'vault-123' },
        mockApiClient,
      )

      const deleteBtn = screen.getByRole('button', { name: 'Datei "readme.md" l\u00f6schen' })
      await user.click(deleteBtn)

      expect(confirmSpy).toHaveBeenCalledWith('"readme.md" wirklich löschen?')
      confirmSpy.mockRestore()
    })

    it('calls deleteContent when deletion is confirmed', async () => {
      const user = userEvent.setup()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      const mockApiClient = createMockApiClient({
        fetchVaultTree: vi.fn().mockResolvedValue({ name: 'root', type: 'directory', path: '', children: [] }),
        deleteContent: vi.fn().mockResolvedValue(undefined),
      })
      const { dispatch } = renderFileExplorer(
        { directoryTree: sampleTree, selectedVaultId: 'vault-123' },
        mockApiClient,
      )

      const deleteBtn = screen.getByRole('button', { name: 'Datei "readme.md" l\u00f6schen' })
      await user.click(deleteBtn)

      expect(dispatch).toHaveBeenCalledWith({ type: 'LOADING_STARTED' })
      expect(mockApiClient.deleteContent).toHaveBeenCalledWith('vault-123', 'readme.md')
      confirmSpy.mockRestore()
    })

    it('does not call deleteContent when deletion is cancelled', async () => {
      const user = userEvent.setup()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const mockApiClient = createMockApiClient()
      renderFileExplorer(
        { directoryTree: sampleTree, selectedVaultId: 'vault-123' },
        mockApiClient,
      )

      const deleteBtn = screen.getByRole('button', { name: 'Datei "readme.md" l\u00f6schen' })
      await user.click(deleteBtn)

      expect(mockApiClient.deleteContent).not.toHaveBeenCalled()
      confirmSpy.mockRestore()
    })
  })

  describe('error display', () => {
    it('shows error message when state.error is set', () => {
      renderFileExplorer({
        directoryTree: sampleTree,
        selectedVaultId: 'vault-123',
        error: { code: 'FILE_CONFLICT', message: 'A file with that name already exists' },
      })

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText('A file with that name already exists')).toBeInTheDocument()
    })

    it('does not show error banner when state.error is null', () => {
      renderFileExplorer({
        directoryTree: sampleTree,
        selectedVaultId: 'vault-123',
        error: null,
      })

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
