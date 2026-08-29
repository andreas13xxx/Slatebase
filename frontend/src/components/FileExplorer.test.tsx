import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { FileExplorer } from './FileExplorer'
import { AppContext } from '../state'
import { TabProvider } from '../state/tabContext'
import type { AppState, AppAction, DirectoryTree, VaultInfo } from '../types'
import { initialState } from '../state'
import type { IApiClient } from '../api'
import type { Dispatch } from 'react'
import { clear as clearWorkspaceStore } from '../state/workspaceStore'

/** Creates a mock API client with all required interface methods. */
function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    setToken: vi.fn(),
    getToken: vi.fn().mockReturnValue(null),
    setCsrfToken: vi.fn(),
    getCsrfToken: vi.fn().mockReturnValue(null),
    setOnSessionExpired: vi.fn(),
    fetchVaults: vi.fn(),
    fetchAllVaults: vi.fn(),
    fetchVaultTree: vi.fn(),
    fetchFileContent: vi.fn(),
    createVault: vi.fn(),
    deleteVault: vi.fn(),
    importFile: vi.fn(),
    importFolder: vi.fn(),
    deleteContent: vi.fn(),
    saveFile: vi.fn(),
    moveContent: vi.fn(),
    renameContent: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getSessions: vi.fn(),
    invalidateSession: vi.fn(),
    invalidateAllOtherSessions: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    deleteSelf: vi.fn(),
    searchUsers: vi.fn(),
    ...overrides,
  }
}

/** Default test vault. */
const testVault: VaultInfo = {
  id: 'vault-123',
  name: 'Test Vault',
  permission: 'owner',
  ownerName: 'admin',
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
  beforeEach(() => {
    clearWorkspaceStore()
  })

  describe('empty state', () => {
    it('shows "Keine Vaults vorhanden" when no vaults exist', () => {
      renderFileExplorer({ vaults: [] })

      expect(screen.getByText('Keine Vaults vorhanden')).toBeInTheDocument()
    })
  })

  describe('vault list rendering', () => {
    it('renders vault names as expandable entries', () => {
      renderFileExplorer({
        vaults: [testVault],
        vaultTrees: {},
        vaultTreesLoading: new Set(),
      })

      expect(screen.getByText('Test Vault')).toBeInTheDocument()
    })

    it('renders multiple vaults', () => {
      renderFileExplorer({
        vaults: [
          testVault,
          { id: 'vault-456', name: 'Second Vault', permission: 'read', ownerName: 'other' },
        ],
        vaultTrees: {},
        vaultTreesLoading: new Set(),
      })

      expect(screen.getByText('Test Vault')).toBeInTheDocument()
      expect(screen.getByText('Second Vault')).toBeInTheDocument()
    })

    it('renders a navigation landmark with tree role', () => {
      renderFileExplorer({
        vaults: [testVault],
        vaultTrees: { 'vault-123': sampleTree },
        vaultTreesLoading: new Set(),
      })

      const nav = screen.getByRole('navigation', { name: 'File explorer' })
      expect(nav).toBeInTheDocument()
      expect(screen.getByRole('tree')).toBeInTheDocument()
    })
  })

  describe('vault expand/collapse', () => {
    it('vault starts collapsed (tree content not visible)', () => {
      const mockApiClient = createMockApiClient({
        fetchVaultTree: vi.fn().mockResolvedValue(sampleTree),
      })
      renderFileExplorer(
        {
          vaults: [testVault],
          vaultTrees: { 'vault-123': sampleTree },
          vaultTreesLoading: new Set(),
        },
        mockApiClient,
      )

      // Tree content should not be visible initially
      expect(screen.queryByText('Documents')).not.toBeInTheDocument()
      expect(screen.queryByText('readme')).not.toBeInTheDocument()
    })

    it('expands vault on click, showing tree content', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({
        fetchVaultTree: vi.fn().mockResolvedValue(sampleTree),
      })
      renderFileExplorer(
        {
          vaults: [testVault],
          vaultTrees: { 'vault-123': sampleTree },
          vaultTreesLoading: new Set(),
        },
        mockApiClient,
      )

      // Click vault to expand
      await user.click(screen.getByText('Test Vault'))

      // Tree content should now be visible
      expect(screen.getByText('Documents')).toBeInTheDocument()
      expect(screen.getByText('readme')).toBeInTheDocument()
    })

    it('collapses vault on second click', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({
        fetchVaultTree: vi.fn().mockResolvedValue(sampleTree),
      })
      renderFileExplorer(
        {
          vaults: [testVault],
          vaultTrees: { 'vault-123': sampleTree },
          vaultTreesLoading: new Set(),
        },
        mockApiClient,
      )

      const vaultButton = screen.getByText('Test Vault')

      // Expand
      await user.click(vaultButton)
      expect(screen.getByText('Documents')).toBeInTheDocument()

      // Collapse
      await user.click(vaultButton)
      expect(screen.queryByText('Documents')).not.toBeInTheDocument()
    })

    it('lazy-loads tree when vault is expanded and tree not yet loaded', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({
        fetchVaultTree: vi.fn().mockResolvedValue(sampleTree),
      })
      const { dispatch } = renderFileExplorer(
        {
          vaults: [testVault],
          vaultTrees: {},
          vaultTreesLoading: new Set(),
        },
        mockApiClient,
      )

      await user.click(screen.getByText('Test Vault'))

      expect(dispatch).toHaveBeenCalledWith({ type: 'VAULT_TREE_LOADING', payload: 'vault-123' })
      expect(mockApiClient.fetchVaultTree).toHaveBeenCalledWith('vault-123')
    })
  })

  describe('Iconize-compatible DOM shape (data-path / nav-*-title-content)', () => {
    // Real Iconize (obsidian-icon-folder v2.14.7, verified via static analysis
    // of the installed bundle) scrapes the file explorer directly rather than
    // going through `fileItems`: `document.querySelector('[data-path="…"]')`,
    // then inserts an icon element immediately before
    // `.nav-folder-title-content`/`.nav-file-title-content` via `insertBefore`
    // — which throws unless that span is a *direct* child of the `[data-path]`
    // element. Its icon-restore pass on plugin load additionally only touches
    // a row whose title button has exactly 1 (file) or 2 (folder) direct
    // children, matching real Obsidian's pristine title shape. See
    // PLUGIN-COMPAT.md for the full writeup.

    it('folder title button has data-path, nav-folder-title class, and exactly 2 direct children', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({ fetchVaultTree: vi.fn().mockResolvedValue(sampleTree) })
      renderFileExplorer(
        { vaults: [testVault], vaultTrees: { 'vault-123': sampleTree }, vaultTreesLoading: new Set() },
        mockApiClient,
      )
      await user.click(screen.getByText('Test Vault'))

      const titleButton = screen.getByText('Documents').closest('button')
      expect(titleButton).not.toBeNull()
      expect(titleButton).toHaveAttribute('data-path', 'Documents')
      expect(titleButton).toHaveClass('nav-folder-title')
      expect(titleButton!.children).toHaveLength(2)

      const titleContent = titleButton!.querySelector('.nav-folder-title-content')
      expect(titleContent).not.toBeNull()
      expect(titleContent!.parentElement).toBe(titleButton)
    })

    it('file title button has data-path, nav-file-title class, and exactly 1 direct child', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({ fetchVaultTree: vi.fn().mockResolvedValue(sampleTree) })
      renderFileExplorer(
        { vaults: [testVault], vaultTrees: { 'vault-123': sampleTree }, vaultTreesLoading: new Set() },
        mockApiClient,
      )
      await user.click(screen.getByText('Test Vault'))

      const titleButton = screen.getByText('readme').closest('button')
      expect(titleButton).not.toBeNull()
      expect(titleButton).toHaveAttribute('data-path', 'readme.md')
      expect(titleButton).toHaveClass('nav-file-title')
      expect(titleButton!.children).toHaveLength(1)

      const titleContent = titleButton!.querySelector('.nav-file-title-content')
      expect(titleContent).not.toBeNull()
      expect(titleContent!.parentElement).toBe(titleButton)
    })

    it('data-path resolves uniquely (the outer <li> carries data-node-path instead)', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({ fetchVaultTree: vi.fn().mockResolvedValue(sampleTree) })
      renderFileExplorer(
        { vaults: [testVault], vaultTrees: { 'vault-123': sampleTree }, vaultTreesLoading: new Set() },
        mockApiClient,
      )
      await user.click(screen.getByText('Test Vault'))

      const li = screen.getByText('Documents').closest('li.tree-node--directory')
      expect(li).not.toBeNull()
      expect(li).toHaveAttribute('data-node-path', 'Documents')
      expect(li).not.toHaveAttribute('data-path')
      // A bare `document.querySelector('[data-path="…"]')` (Iconize's actual
      // call) must resolve to exactly the title button, not also match an
      // ancestor <li> — otherwise it'd hit the <li> first (document order)
      // and its insertBefore(iconEl, titleContentSpan) would throw, since
      // titleContentSpan isn't a direct child of the <li>.
      expect(document.querySelectorAll('[data-path="Documents"]')).toHaveLength(1)
    })
  })

  describe('Obsidian-compatible structural classes (CSS snippet compatibility)', () => {
    // Added alongside Slatebase's own tree-node-* classes (never replacing
    // them) so that community CSS snippets targeting real Obsidian's file
    // explorer selectors apply unmodified. See the structural comment in
    // TreeNode.tsx for what's covered — including why .tree-item-self is a
    // direct child of .tree-item (the drag-wrapper div that used to sit
    // between them was folded into the title button itself).

    it('folder row carries tree-item/nav-folder, tree-item-self/is-clickable, collapse-icon and tree-item-inner', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({ fetchVaultTree: vi.fn().mockResolvedValue(sampleTree) })
      renderFileExplorer(
        { vaults: [testVault], vaultTrees: { 'vault-123': sampleTree }, vaultTreesLoading: new Set() },
        mockApiClient,
      )
      await user.click(screen.getByText('Test Vault'))

      const li = screen.getByText('Documents').closest('li.tree-node--directory')
      expect(li).toHaveClass('tree-item', 'nav-folder', 'is-collapsed')

      const titleButton = screen.getByText('Documents').closest('button')
      expect(titleButton).toHaveClass('tree-item-self', 'is-clickable')
      expect(titleButton!.querySelector('.tree-item-icon.collapse-icon')).not.toBeNull()
      expect(titleButton!.querySelector('.nav-folder-title-content.tree-item-inner')).not.toBeNull()
    })

    it('expanding a folder drops is-collapsed and exposes tree-item-children/nav-folder-children', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({ fetchVaultTree: vi.fn().mockResolvedValue(sampleTree) })
      renderFileExplorer(
        { vaults: [testVault], vaultTrees: { 'vault-123': sampleTree }, vaultTreesLoading: new Set() },
        mockApiClient,
      )
      await user.click(screen.getByText('Test Vault'))
      await user.click(screen.getByText('Documents'))

      const li = screen.getByText('Documents').closest('li.tree-node--directory')
      expect(li).toHaveClass('tree-item', 'nav-folder')
      expect(li).not.toHaveClass('is-collapsed')
      expect(li!.querySelector(':scope > .tree-item-children.nav-folder-children')).not.toBeNull()
    })

    it('file row carries tree-item/nav-file, tree-item-self/is-clickable and tree-item-inner', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({ fetchVaultTree: vi.fn().mockResolvedValue(sampleTree) })
      renderFileExplorer(
        { vaults: [testVault], vaultTrees: { 'vault-123': sampleTree }, vaultTreesLoading: new Set() },
        mockApiClient,
      )
      await user.click(screen.getByText('Test Vault'))

      const li = screen.getByText('readme').closest('li.tree-node--file')
      expect(li).toHaveClass('tree-item', 'nav-file')

      const titleButton = screen.getByText('readme').closest('button')
      expect(titleButton).toHaveClass('tree-item-self', 'is-clickable')
      expect(titleButton!.querySelector('.nav-file-title-content.tree-item-inner')).not.toBeNull()
    })

    it('the top-level tree carries nav-files-container', async () => {
      const mockApiClient = createMockApiClient()
      renderFileExplorer(
        { vaults: [testVault], vaultTrees: {}, vaultTreesLoading: new Set() },
        mockApiClient,
      )
      expect(document.querySelector('ul.file-explorer-tree.nav-files-container')).not.toBeNull()
    })

    it('.tree-item-self is a direct child of .tree-item for both folders and files (no wrapper div between them)', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({ fetchVaultTree: vi.fn().mockResolvedValue(sampleTree) })
      renderFileExplorer(
        { vaults: [testVault], vaultTrees: { 'vault-123': sampleTree }, vaultTreesLoading: new Set() },
        mockApiClient,
      )
      await user.click(screen.getByText('Test Vault'))

      const folderLi = screen.getByText('Documents').closest('li.tree-item.nav-folder')
      expect(folderLi!.querySelector(':scope > .tree-item-self.nav-folder-title')).not.toBeNull()

      const fileLi = screen.getByText('readme').closest('li.tree-item.nav-file')
      expect(fileLi!.querySelector(':scope > .tree-item-self.nav-file-title')).not.toBeNull()
    })

    it('marks the open file is-active on its nav-file-title', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({
        fetchVaultTree: vi.fn().mockResolvedValue(sampleTree),
        fetchFileContent: vi.fn().mockResolvedValue({ content: '', isBinary: false }),
      })
      renderFileExplorer(
        { vaults: [testVault], vaultTrees: { 'vault-123': sampleTree }, vaultTreesLoading: new Set() },
        mockApiClient,
      )
      await user.click(screen.getByText('Test Vault'))

      const readmeButton = screen.getByText('readme').closest('button')!
      expect(readmeButton).not.toHaveClass('is-active')

      await user.click(readmeButton)
      expect(readmeButton).toHaveClass('is-active')
      expect(readmeButton).toHaveAttribute('aria-current', 'true')
    })

    it('marks a folder is-being-renamed on its tree-item while the inline rename input is open', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({ fetchVaultTree: vi.fn().mockResolvedValue(sampleTree) })
      renderFileExplorer(
        { vaults: [testVault], vaultTrees: { 'vault-123': sampleTree }, vaultTreesLoading: new Set() },
        mockApiClient,
      )
      await user.click(screen.getByText('Test Vault'))

      const folderLi = screen.getByText('Documents').closest('li.tree-item.nav-folder')!
      expect(folderLi).not.toHaveClass('is-being-renamed')

      await user.pointer({ keys: '[MouseRight]', target: screen.getByText('Documents') })
      await user.click(screen.getByText('Umbenennen'))

      expect(folderLi).toHaveClass('is-being-renamed')
    })

    it('marks a file is-being-renamed on its tree-item while the inline rename input is open', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({ fetchVaultTree: vi.fn().mockResolvedValue(sampleTree) })
      renderFileExplorer(
        { vaults: [testVault], vaultTrees: { 'vault-123': sampleTree }, vaultTreesLoading: new Set() },
        mockApiClient,
      )
      await user.click(screen.getByText('Test Vault'))

      const fileLi = screen.getByText('readme').closest('li.tree-item.nav-file')!
      expect(fileLi).not.toHaveClass('is-being-renamed')

      await user.pointer({ keys: '[MouseRight]', target: screen.getByText('readme') })
      await user.click(screen.getByText('Umbenennen'))

      expect(fileLi).toHaveClass('is-being-renamed')
    })
  })

  describe('folder collapse/expand within vault', () => {
    it('folders within vault start collapsed', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({
        fetchVaultTree: vi.fn().mockResolvedValue(sampleTree),
      })
      renderFileExplorer(
        {
          vaults: [testVault],
          vaultTrees: { 'vault-123': sampleTree },
          vaultTreesLoading: new Set(),
        },
        mockApiClient,
      )

      // Expand vault first
      await user.click(screen.getByText('Test Vault'))

      // Nested files should not be visible
      expect(screen.queryByText('notes')).not.toBeInTheDocument()
    })

    it('expands folder on click, showing children', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({
        fetchVaultTree: vi.fn().mockResolvedValue(sampleTree),
      })
      renderFileExplorer(
        {
          vaults: [testVault],
          vaultTrees: { 'vault-123': sampleTree },
          vaultTreesLoading: new Set(),
        },
        mockApiClient,
      )

      // Expand vault
      await user.click(screen.getByText('Test Vault'))

      // Expand Documents folder
      const documentsButton = screen.getByRole('button', { name: /Documents.*\(2\)/ })
      await user.click(documentsButton)

      expect(screen.getByText('notes')).toBeInTheDocument()
      expect(screen.getByText('todo')).toBeInTheDocument()
    })

    it('sets aria-expanded attribute on folder buttons', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({
        fetchVaultTree: vi.fn().mockResolvedValue(sampleTree),
      })
      renderFileExplorer(
        {
          vaults: [testVault],
          vaultTrees: { 'vault-123': sampleTree },
          vaultTreesLoading: new Set(),
        },
        mockApiClient,
      )

      // Expand vault
      await user.click(screen.getByText('Test Vault'))

      const documentsButton = screen.getByRole('button', { name: /Documents.*\(2\)/ })
      expect(documentsButton).toHaveAttribute('aria-expanded', 'false')

      await user.click(documentsButton)
      expect(documentsButton).toHaveAttribute('aria-expanded', 'true')
    })
  })

  describe('file selection', () => {
    it('calls openTab which fetches file content on file click', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({
        fetchVaultTree: vi.fn().mockResolvedValue(sampleTree),
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
          vaults: [testVault],
          vaultTrees: { 'vault-123': sampleTree },
          vaultTreesLoading: new Set(),
          selectedVaultId: 'vault-123',
        },
        mockApiClient,
      )

      // Expand vault
      await user.click(screen.getByText('Test Vault'))

      // Click on a top-level file
      await user.click(screen.getByText('readme'))

      expect(mockApiClient.fetchFileContent).toHaveBeenCalledWith('vault-123', 'readme.md')
    })
  })

  describe('delete actions', () => {
    it('shows delete option in context menu on right-click', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({
        fetchVaultTree: vi.fn().mockResolvedValue(sampleTree),
      })
      renderFileExplorer(
        {
          vaults: [testVault],
          vaultTrees: { 'vault-123': sampleTree },
          vaultTreesLoading: new Set(),
          selectedVaultId: 'vault-123',
        },
        mockApiClient,
      )

      // Expand vault
      await user.click(screen.getByText('Test Vault'))

      const fileButton = screen.getByText('readme')
      await user.pointer({ keys: '[MouseRight]', target: fileButton })

      expect(screen.getByText('Löschen')).toBeInTheDocument()
    })

    it('calls deleteContent when deletion is confirmed via context menu', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({
        fetchVaultTree: vi.fn().mockResolvedValue({ name: 'root', type: 'directory', path: '', children: [] }),
        deleteContent: vi.fn().mockResolvedValue(undefined),
      })
      renderFileExplorer(
        {
          vaults: [testVault],
          vaultTrees: { 'vault-123': sampleTree },
          vaultTreesLoading: new Set(),
          selectedVaultId: 'vault-123',
        },
        mockApiClient,
      )

      // Expand vault
      await user.click(screen.getByText('Test Vault'))

      // Right-click on the file
      const fileButton = screen.getByText('readme')
      await user.pointer({ keys: '[MouseRight]', target: fileButton })

      // Click "Löschen" in context menu
      const deleteOption = screen.getByText('Löschen')
      await user.click(deleteOption)

      // Confirm in the modal
      const confirmBtn = screen.getByRole('button', { name: 'Löschen' })
      await user.click(confirmBtn)

      expect(mockApiClient.deleteContent).toHaveBeenCalledWith('vault-123', 'readme.md')
    })

    it('does not call deleteContent when deletion is cancelled', async () => {
      const user = userEvent.setup()
      const mockApiClient = createMockApiClient({
        fetchVaultTree: vi.fn().mockResolvedValue(sampleTree),
      })
      renderFileExplorer(
        {
          vaults: [testVault],
          vaultTrees: { 'vault-123': sampleTree },
          vaultTreesLoading: new Set(),
          selectedVaultId: 'vault-123',
        },
        mockApiClient,
      )

      // Expand vault
      await user.click(screen.getByText('Test Vault'))

      // Right-click on the file
      const fileButton = screen.getByText('readme')
      await user.pointer({ keys: '[MouseRight]', target: fileButton })

      // Click "Löschen" in context menu
      const deleteOption = screen.getByText('Löschen')
      await user.click(deleteOption)

      // Cancel in the modal
      const cancelBtn = screen.getByRole('button', { name: 'Abbrechen' })
      await user.click(cancelBtn)

      expect(mockApiClient.deleteContent).not.toHaveBeenCalled()
    })
  })
})
