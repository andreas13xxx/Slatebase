import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useAppContext, exportVault } from '../state'
import { useTabContext } from '../state/tabContext'
import { useTranslation } from '../i18n'
import { openTab } from '../state/tabActions'
import type { DirectoryTree, VaultInfo } from '../types'
import { extractErrorMessage } from '../utils/error'
import { ChevronRight, ChevronDown, Database, Eye, Pencil, RefreshCw, Users, FilePlus, FolderPlus, Trash2, Copy, Move, Download, Star, FileText, History, LayoutDashboard } from 'lucide-react'
import { getValidDropTargets } from '../utils/pathUtils'
import { ContextMenu } from './ContextMenu'
import type { ContextMenuItem } from './ContextMenu'
import { InlineInput } from './InlineInput'
import { ConfirmModal } from './ConfirmModal'
import { useToast } from './Toast'
import { validateFileName, normalizeFileName } from '../utils/fileValidation'
import { showToast as showGlobalToast } from './ToastNotification'
import { favoritesStore } from '../state/favoritesStore'
import { TemplateSelector } from './TemplateSelector'
import { getCachedStatistics, fetchVaultStatistics, invalidateStatisticsCache, formatStatisticsTooltip } from '../state/vaultStatisticsCache'
import { onRealtimeVaultChange } from '../state/realtimeVaultBridge'
import { TreeNode } from './file-explorer'
import type { DragState, ExternalDropState, ContextMenuState, InlineInputState } from './file-explorer'

/**
 * Props for the FileExplorer component.
 */
export interface FileExplorerProps {
  /** When set, registers a callback that triggers inline new file creation at root. */
  onRegisterCreateFile?: (trigger: () => void) => void
  /** When set, registers a callback that triggers vault creation. */
  onRegisterCreateVault?: (trigger: () => void) => void
  /** When set, registers a callback that triggers canvas creation at root. */
  onRegisterCreateCanvas?: (trigger: () => void) => void
  /** Callback to open the version browser for a specific file. */
  onOpenVersions?: (vaultId: string, filePath: string) => void
}

/**
 * FileExplorer renders all vaults as expandable root-level entries.
 * Expanding a vault lazy-loads its directory tree.
 * Clicking a file opens it in a tab and implicitly selects the vault.
 *
 * Provides context menu actions (new file, rename, delete) on each tree node.
 * Supports drag & drop for moving files and folders within a vault.
 */
export function FileExplorer({ onRegisterCreateFile, onRegisterCreateVault, onRegisterCreateCanvas, onOpenVersions }: FileExplorerProps = {}) {
  const { state, dispatch, apiClient } = useAppContext()
  const { tabState, tabDispatch } = useTabContext()
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [expandedVaults, setExpandedVaults] = useState<Set<string>>(new Set())
  const [showCreateVaultForm, setShowCreateVaultForm] = useState(false)
  const [newVaultName, setNewVaultName] = useState('')
  const [vaultValidationError, setVaultValidationError] = useState<string | null>(null)
  const [dragState, setDragState] = useState<DragState>({
    draggedPath: null,
    draggedVaultId: null,
    validTargets: new Set(),
    isMoving: false,
  })
  const [externalDropState, setExternalDropState] = useState<ExternalDropState>({
    targetPath: null,
    targetVaultId: null,
  })
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    targetNode: null,
    vaultId: null,
  })
  const [inlineInputState, setInlineInputState] = useState<InlineInputState>({
    visible: false,
    mode: 'newFile',
    parentPath: '',
    node: null,
    vaultId: null,
  })
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; node: DirectoryTree | null; vaultId: string | null }>({
    open: false,
    node: null,
    vaultId: null,
  })

  // Template selector state
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false)
  const [templateSelectorVaultId, setTemplateSelectorVaultId] = useState<string | null>(null)

  // Vault statistics tooltip state
  const [vaultTooltips, setVaultTooltips] = useState<Record<string, string>>({})
  const tooltipFetchRef = useRef<Set<string>>(new Set())

  // Counter to force re-render when favorites change
  const [, setFavoritesVersion] = useState(0)

  /** Check if a file is a favorite for a given vault. */
  const checkIsFavorite = useCallback((vaultId: string, path: string): boolean => {
    return favoritesStore.isFavorite(vaultId, path)
  }, [])

  /** Toggle favorite status for a file. Triggers re-render via version counter. */
  const handleToggleFavorite = useCallback((vaultId: string, path: string) => {
    if (favoritesStore.isFavorite(vaultId, path)) {
      favoritesStore.remove(vaultId, path)
    } else {
      favoritesStore.add(vaultId, path)
    }
    setFavoritesVersion((v) => v + 1)
  }, [])

  // Determine the active file path (from the active tab)
  const activeTab = tabState.tabs.find((tab) => tab.id === tabState.activeTabId)
  const selectedFilePath = activeTab?.filePath ?? null
  const selectedFileVaultId = activeTab?.vaultId ?? null

  // Register the create file trigger for the toolbar button
  useEffect(() => {
    if (onRegisterCreateFile) {
      onRegisterCreateFile(() => {
        const vaultId = state.selectedVaultId
        if (!vaultId) return
        setInlineInputState({
          visible: true,
          mode: 'newFile',
          parentPath: '',
          node: null,
          vaultId,
        })
        // Ensure the vault is expanded
        setExpandedVaults((prev) => {
          const next = new Set(prev)
          next.add(vaultId)
          return next
        })
      })
    }
  }, [onRegisterCreateFile, state.selectedVaultId])

  // Register the create vault trigger for the toolbar button
  useEffect(() => {
    if (onRegisterCreateVault) {
      onRegisterCreateVault(() => {
        setShowCreateVaultForm(true)
        setNewVaultName('')
        setVaultValidationError(null)
      })
    }
  }, [onRegisterCreateVault])

  /** Creates a new .canvas file with empty content and opens it. */
  async function createCanvasFile(vaultId: string, parentPath: string) {
    if (!apiClient) return
    setInlineInputState({
      visible: true,
      mode: 'newCanvas',
      parentPath,
      node: null,
      vaultId,
    })
    // Ensure the vault is expanded so the inline input is visible
    setExpandedVaults((prev) => {
      const next = new Set(prev)
      next.add(vaultId)
      return next
    })
  }

  // Register the create canvas trigger for the toolbar button
  useEffect(() => {
    if (onRegisterCreateCanvas) {
      onRegisterCreateCanvas(() => {
        const vaultId = state.selectedVaultId
        if (!vaultId || !apiClient) return
        void createCanvasFile(vaultId, '')
      })
    }
  }, [onRegisterCreateCanvas, state.selectedVaultId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to vault:change events for statistics cache invalidation
  useEffect(() => {
    return onRealtimeVaultChange((event) => {
      invalidateStatisticsCache(event.vaultId)
      // Clear the tooltip text so it re-fetches on next hover
      setVaultTooltips((prev) => {
        const next = { ...prev }
        delete next[event.vaultId]
        return next
      })
      tooltipFetchRef.current.delete(event.vaultId)
    })
  }, [])

  /** Handle mouse entering a vault entry row — fetch and display statistics tooltip. */
  const handleVaultMouseEnter = useCallback((vaultId: string) => {
    // If we already have a tooltip or fetch is in-flight, use cached
    const cached = getCachedStatistics(vaultId)
    if (cached) {
      setVaultTooltips((prev) => ({ ...prev, [vaultId]: formatStatisticsTooltip(cached) }))
      return
    }

    // Avoid multiple fetches for the same vault
    if (tooltipFetchRef.current.has(vaultId)) return
    tooltipFetchRef.current.add(vaultId)

    if (!apiClient) return

    fetchVaultStatistics(apiClient, vaultId).then((entry) => {
      if (entry) {
        setVaultTooltips((prev) => ({ ...prev, [vaultId]: formatStatisticsTooltip(entry) }))
      } else {
        // Show error text only if no cached value exists
        setVaultTooltips((prev) => {
          if (prev[vaultId]) return prev // Keep existing tooltip
          return { ...prev, [vaultId]: t('fileOps.statisticsUnavailable') }
        })
      }
    }).catch(() => {
      setVaultTooltips((prev) => {
        if (prev[vaultId]) return prev
        return { ...prev, [vaultId]: t('fileOps.statisticsUnavailable') }
      })
    })
  }, [apiClient])

  /** Handle vault creation form submission. */
  async function handleCreateVaultSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newVaultName.trim()
    if (trimmed.length === 0) {
      setVaultValidationError(t('vault.nameEmpty'))
      return
    }
    if (trimmed.length > 128) {
      setVaultValidationError(t('vault.nameTooLong', { max: 128 }))
      return
    }
    if (state.vaults.some((v) => v.name === trimmed)) {
      setVaultValidationError(t('vault.nameExists', { name: trimmed }))
      return
    }
    if (!apiClient) return

    try {
      const vault = await apiClient.createVault(trimmed)
      dispatch({ type: 'VAULT_CREATED', payload: vault })
      setShowCreateVaultForm(false)
      setNewVaultName('')
      setVaultValidationError(null)
      // Auto-expand the new vault
      setExpandedVaults((prev) => {
        const next = new Set(prev)
        next.add(vault.id)
        return next
      })
      // Select the new vault
      dispatch({ type: 'VAULT_SELECTED', payload: vault.id })
    } catch (err: unknown) {
      setVaultValidationError(extractErrorMessage(err, t('common.error')))
    }
  }

  /** Toggle a vault's expanded state and lazy-load its tree. */
  function handleToggleVault(vaultId: string) {
    // Select this vault on click
    if (state.selectedVaultId !== vaultId) {
      dispatch({ type: 'VAULT_SELECTED', payload: vaultId })
      // Update legacy directoryTree
      const tree = state.vaultTrees[vaultId]
      if (tree) {
        dispatch({ type: 'TREE_LOADED', payload: tree })
      }
    }

    setExpandedVaults((prev) => {
      const next = new Set(prev)
      if (next.has(vaultId)) {
        next.delete(vaultId)
      } else {
        next.add(vaultId)
        // Lazy-load tree if not yet loaded
        if (!state.vaultTrees[vaultId] && apiClient && !state.vaultTreesLoading.has(vaultId)) {
          dispatch({ type: 'VAULT_TREE_LOADING', payload: vaultId })
          apiClient.fetchVaultTree(vaultId).then(
            (tree) => dispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId, tree } }),
            () => { /* silently ignore — vault will show empty */ },
          )
        }
      }
      return next
    })
  }

  function handleToggleFolder(path: string) {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  function handleSelectFile(vaultId: string, filePath: string, fileName: string) {
    if (apiClient) {
      // Implicitly select this vault
      if (state.selectedVaultId !== vaultId) {
        dispatch({ type: 'VAULT_SELECTED', payload: vaultId })
        // Update the legacy directoryTree
        const tree = state.vaultTrees[vaultId]
        if (tree) {
          dispatch({ type: 'TREE_LOADED', payload: tree })
        }
      }
      openTab(tabDispatch, dispatch, apiClient, vaultId, filePath, fileName)
    }
  }

  // --- Context Menu Handlers ---

  function handleContextMenu(e: React.MouseEvent, node: DirectoryTree, vaultId: string) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenuState({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      targetNode: node,
      vaultId,
    })
  }

  /** Handle right-click on vault row (show context menu with vault root as target). */
  function handleVaultContextMenu(e: React.MouseEvent, vault: VaultInfo) {
    e.preventDefault()
    e.stopPropagation()
    // Create a synthetic root node representing the vault root
    const rootNode: DirectoryTree = {
      name: vault.name,
      path: '',
      type: 'directory',
      children: [],
    }
    setContextMenuState({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      targetNode: rootNode,
      vaultId: vault.id,
    })
  }

  /** Handle right-click on empty area of the file explorer. */
  function handleEmptyAreaContextMenu(e: React.MouseEvent) {
    // Don't override context menu if it bubbled from a child node
    // (child handlers call stopPropagation, so if we get here, it's the empty area)
    e.preventDefault()

    // Use selected vault, or fall back to first vault
    const vaultId = state.selectedVaultId ?? state.vaults[0]?.id
    if (!vaultId) return

    const vault = state.vaults.find((v) => v.id === vaultId)
    if (!vault) return

    // Create a synthetic root node for the selected vault
    const rootNode: DirectoryTree = {
      name: vault.name,
      path: '',
      type: 'directory',
      children: [],
    }
    setContextMenuState({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      targetNode: rootNode,
      vaultId,
    })
  }

  function handleCloseContextMenu() {
    setContextMenuState((prev) => ({ ...prev, visible: false }))
  }

  function handleNewFile(parentPath: string) {
    const vaultId = contextMenuState.vaultId
    if (!vaultId) return
    // Expand the parent folder so the inline input is visible
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      next.add(`${vaultId}::${parentPath}`)
      return next
    })
    setInlineInputState({
      visible: true,
      mode: 'newFile',
      parentPath,
      node: null,
      vaultId,
    })
  }

  function handleNewFolder(parentPath: string) {
    const vaultId = contextMenuState.vaultId
    if (!vaultId) return
    // Expand the parent folder so the inline input is visible
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      next.add(`${vaultId}::${parentPath}`)
      return next
    })
    setInlineInputState({
      visible: true,
      mode: 'newFolder',
      parentPath,
      node: null,
      vaultId,
    })
  }

  async function handleCopyFile(node: DirectoryTree) {
    const vaultId = contextMenuState.vaultId
    if (!vaultId || !apiClient) return

    // Determine a target path for the copy (same directory, with suffix)
    const parentDir = node.path.lastIndexOf('/') === -1
      ? ''
      : node.path.slice(0, node.path.lastIndexOf('/'))
    const ext = node.name.lastIndexOf('.') > 0 ? node.name.slice(node.name.lastIndexOf('.')) : ''
    const baseName = ext ? node.name.slice(0, node.name.lastIndexOf('.')) : node.name
    const copyName = `${baseName}-Kopie${ext}`
    const copyPath = parentDir ? `${parentDir}/${copyName}` : copyName

    try {
      // Read the source file content and save as a copy
      const fileContent = await apiClient.fetchFileContent(vaultId, node.path)
      await apiClient.saveFile(vaultId, copyPath, fileContent.content)
      const newTree = await apiClient.fetchVaultTree(vaultId)
      dispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId, tree: newTree } })
      showToast(`${copyName}`, 'success')
    } catch (err: unknown) {
      showToast(extractErrorMessage(err, t('fileOps.copyError')), 'error')
    }
  }

  async function handleMoveFile(node: DirectoryTree) {
    const vaultId = contextMenuState.vaultId
    if (!vaultId || !apiClient) return

    // Prompt for destination path using a simple approach: move to root
    // We use the existing drag/drop mechanism implicitly — 
    // For the context menu version, we trigger inline input for a move destination
    const destination = window.prompt(t('fileOps.movePrompt'), '')
    if (destination === null) return // Cancelled

    const trimmedDest = destination.trim()
    const fileName = node.path.split('/').pop() ?? node.name
    const destinationPath = trimmedDest ? `${trimmedDest}/${fileName}` : fileName

    if (destinationPath === node.path) return

    try {
      await apiClient.moveContent(vaultId, node.path, destinationPath)
      const newTree = await apiClient.fetchVaultTree(vaultId)
      dispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId, tree: newTree } })
      tabDispatch({
        type: 'UPDATE_TAB_PATHS',
        payload: { oldPathPrefix: node.path, newPathPrefix: destinationPath },
      })

      // Update favorites path on move
      favoritesStore.updatePath(vaultId, node.path, destinationPath)
      setFavoritesVersion((v) => v + 1)
    } catch (err: unknown) {
      showToast(extractErrorMessage(err, t('fileOps.moveError')), 'error')
    }
  }

  function handleExportVault() {
    const vaultId = contextMenuState.vaultId
    if (!vaultId || !apiClient) return
    const vault = state.vaults.find((v) => v.id === vaultId)
    void exportVault(dispatch, apiClient, vaultId, vault?.name)
  }

  function handleNewFromTemplate() {
    const vaultId = contextMenuState.vaultId
    if (!vaultId) return
    setTemplateSelectorVaultId(vaultId)
    setTemplateSelectorOpen(true)
  }

  function handleTemplateFileCreated(filePath: string, fileName: string) {
    const vaultId = templateSelectorVaultId
    if (!vaultId || !apiClient) return
    // Open the created file in a tab
    openTab(tabDispatch, dispatch, apiClient, vaultId, filePath, fileName.endsWith('.md') ? fileName : `${fileName}.md`)
    // Refresh file tree
    apiClient.fetchVaultTree(vaultId).then(
      (tree) => dispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId, tree } }),
      () => { /* ignore */ }
    )
  }

  function handleRename(node: DirectoryTree) {
    setInlineInputState({
      visible: true,
      mode: 'rename',
      parentPath: '',
      node,
      vaultId: contextMenuState.vaultId,
    })
  }

  function handleDelete(node: DirectoryTree) {
    setDeleteConfirm({ open: true, node, vaultId: contextMenuState.vaultId })
  }

  function handleDeleteConfirmed() {
    const node = deleteConfirm.node
    const vaultId = deleteConfirm.vaultId
    setDeleteConfirm({ open: false, node: null, vaultId: null })
    if (!node || !vaultId || !apiClient) return

    apiClient.deleteContent(vaultId, node.path).then(async () => {
      // Close affected tabs
      tabDispatch({
        type: 'CLOSE_TABS_BY_PATH',
        payload: { pathPrefix: node.path },
      })

      // Remove from favorites on delete
      favoritesStore.removeByPath(vaultId, node.path)
      setFavoritesVersion((v) => v + 1)

      // Reload tree for this vault
      const newTree = await apiClient.fetchVaultTree(vaultId)
      dispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId, tree: newTree } })
    }).catch((err: unknown) => {
      showToast(extractErrorMessage(err, t('fileOps.deleteError')), 'error')
    })
  }

  function handleDeleteCancelled() {
    setDeleteConfirm({ open: false, node: null, vaultId: null })
  }

  // --- Inline Input Handlers ---

  async function handleInlineConfirm(value: string) {
    const vaultId = inlineInputState.vaultId
    if (!vaultId || !apiClient) return

    if (inlineInputState.mode === 'newFile') {
      const normalizedName = normalizeFileName(value)
      const validationError = validateFileName(normalizedName)
      if (validationError) return

      const filePath = inlineInputState.parentPath
        ? `${inlineInputState.parentPath}/${normalizedName}`
        : normalizedName

      try {
        await apiClient.saveFile(vaultId, filePath, '')
        const newTree = await apiClient.fetchVaultTree(vaultId)
        dispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId, tree: newTree } })
        // Implicitly select this vault and open the file
        if (state.selectedVaultId !== vaultId) {
          dispatch({ type: 'VAULT_SELECTED', payload: vaultId })
        }
        openTab(tabDispatch, dispatch, apiClient, vaultId, filePath, normalizedName)
      } catch (err: unknown) {
        const msg = err !== null && typeof err === 'object' && 'message' in err
          ? (err as { message: string }).message
          : t('fileOps.createError')
        showToast(msg, 'error')
      }
    } else if (inlineInputState.mode === 'newFolder') {
      const normalizedName = normalizeFileName(value)
      const validationError = validateFileName(normalizedName)
      if (validationError) return

      const folderPath = inlineInputState.parentPath
        ? `${inlineInputState.parentPath}/${normalizedName}`
        : normalizedName

      // Create a folder by creating a placeholder file inside it, then the folder exists
      // We use saveFile with a .gitkeep or directly with a trailing path that implies directory
      const placeholderPath = `${folderPath}/.gitkeep`

      try {
        await apiClient.saveFile(vaultId, placeholderPath, '')
        // Delete the placeholder — the folder now exists on the backend
        await apiClient.deleteContent(vaultId, placeholderPath)
        const newTree = await apiClient.fetchVaultTree(vaultId)
        dispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId, tree: newTree } })
        // Expand the new folder
        setExpandedPaths((prev) => {
          const next = new Set(prev)
          next.add(`${vaultId}::${folderPath}`)
          return next
        })
      } catch (err: unknown) {
        const msg = err !== null && typeof err === 'object' && 'message' in err
          ? (err as { message: string }).message
          : t('fileOps.createError')
        showToast(msg, 'error')
      }
    } else if (inlineInputState.mode === 'newCanvas') {
      const trimmedName = value.trim()
      if (!trimmedName) return
      const validationError = validateFileName(trimmedName.endsWith('.canvas') ? trimmedName : `${trimmedName}.canvas`)
      if (validationError) return

      // Ensure .canvas extension
      const canvasName = trimmedName.endsWith('.canvas') ? trimmedName : `${trimmedName}.canvas`
      const filePath = inlineInputState.parentPath
        ? `${inlineInputState.parentPath}/${canvasName}`
        : canvasName
      const emptyCanvas = '{\n\t"nodes": [],\n\t"edges": []\n}'

      try {
        await apiClient.saveFile(vaultId, filePath, emptyCanvas)
        const newTree = await apiClient.fetchVaultTree(vaultId)
        dispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId, tree: newTree } })
        if (state.selectedVaultId !== vaultId) {
          dispatch({ type: 'VAULT_SELECTED', payload: vaultId })
        }
        openTab(tabDispatch, dispatch, apiClient, vaultId, filePath, canvasName)
        showToast(t('fileOps.created', { name: canvasName }), 'success')
      } catch (err: unknown) {
        showToast(extractErrorMessage(err, t('fileOps.canvasCreateError')), 'error')
      }
    } else if (inlineInputState.mode === 'rename') {
      const node = inlineInputState.node
      if (!node) return

      let newName = value
      if (newName === node.name) {
        setInlineInputState((prev) => ({ ...prev, visible: false }))
        return
      }

      // For files: preserve original extension if none provided
      if (node.type === 'file') {
        const lastDot = node.name.lastIndexOf('.')
        if (lastDot > 0) {
          const originalExt = node.name.slice(lastDot)
          const newNameHasDot = newName.lastIndexOf('.')
          if (newNameHasDot <= 0) {
            newName = newName + originalExt
          }
        }
      }

      const validationError = validateFileName(newName, 255)
      if (validationError) return

      try {
        await apiClient.renameContent(vaultId, node.path, newName)
        const newTree = await apiClient.fetchVaultTree(vaultId)
        dispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId, tree: newTree } })

        // Update tab paths
        const oldPath = node.path
        const parentDir = oldPath.lastIndexOf('/') === -1
          ? ''
          : oldPath.slice(0, oldPath.lastIndexOf('/'))
        const newPath = parentDir ? `${parentDir}/${newName}` : newName

        tabDispatch({
          type: 'UPDATE_TAB_PATHS',
          payload: { oldPathPrefix: oldPath, newPathPrefix: newPath },
        })

        // Update favorites path on rename
        favoritesStore.updatePath(vaultId, oldPath, newPath)
        setFavoritesVersion((v) => v + 1)
      } catch (err: unknown) {
        const msg = err !== null && typeof err === 'object' && 'message' in err
          ? (err as { message: string }).message
          : t('fileOps.renameError')
        showToast(msg, 'error')
      }
    }

    setInlineInputState((prev) => ({ ...prev, visible: false }))
  }

  function handleInlineCancel() {
    setInlineInputState((prev) => ({ ...prev, visible: false }))
  }

  // --- Drag & Drop Handlers ---

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, nodePath: string, nodeType: 'file' | 'directory', vaultId: string) => {
    const vault = state.vaults.find((v) => v.id === vaultId)
    if (vault?.permission === 'read' || dragState.isMoving) {
      e.preventDefault()
      return
    }

    const tree = state.vaultTrees[vaultId]
    if (!tree) {
      e.preventDefault()
      return
    }

    const validTargets = getValidDropTargets(tree, nodePath)

    setDragState({
      draggedPath: nodePath,
      draggedVaultId: vaultId,
      validTargets,
      isMoving: false,
    })

    e.dataTransfer.effectAllowed = 'copyMove'
    e.dataTransfer.setData('application/x-slatebase-path', nodePath)
    e.dataTransfer.setData('application/x-slatebase-type', nodeType)
    e.dataTransfer.setData('application/x-slatebase-vaultid', vaultId)

    const target = e.currentTarget as HTMLElement
    target.style.opacity = '0.5'
  }, [state.vaults, state.vaultTrees, dragState.isMoving])

  const handleDragEnd = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const target = e.currentTarget as HTMLElement
    target.style.opacity = ''
    setDragState((prev) => ({
      ...prev,
      draggedPath: null,
      draggedVaultId: null,
      validTargets: new Set(),
    }))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, folderPath: string, vaultId: string) => {
    // Internal DnD (moving files within the explorer)
    if (dragState.validTargets.has(folderPath)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      return
    }

    // External file drag from OS (no internal drag in progress)
    if (!dragState.draggedPath && e.dataTransfer.types.includes('Files')) {
      // Don't accept external drops on read-only vaults
      const vault = state.vaults.find((v) => v.id === vaultId)
      if (vault?.permission === 'read') return

      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'

      setExternalDropState((prev) => {
        if (prev.targetPath === folderPath && prev.targetVaultId === vaultId) return prev
        return { targetPath: folderPath, targetVaultId: vaultId }
      })
    }
  }, [dragState.validTargets, dragState.draggedPath, state.vaults])

  const handleDragLeave = useCallback((_e: React.DragEvent<HTMLDivElement>, folderPath: string, vaultId: string) => {
    // Clear external drop target when leaving a folder
    setExternalDropState((prev) => {
      if (prev.targetPath === folderPath && prev.targetVaultId === vaultId) {
        return { targetPath: null, targetVaultId: null }
      }
      return prev
    })
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>, targetFolderPath: string, dropVaultId: string) => {
    e.preventDefault()

    // Clear external drop state
    setExternalDropState({ targetPath: null, targetVaultId: null })

    // Check if this is an external file drop from OS
    if (!dragState.draggedPath && e.dataTransfer.files.length > 0) {
      e.stopPropagation()
      if (!apiClient) return

      const vault = state.vaults.find((v) => v.id === dropVaultId)
      if (!vault || vault.permission === 'read') return

      const droppedFiles = Array.from(e.dataTransfer.files)

      // Validate: max 50 files
      if (droppedFiles.length > 50) {
        showGlobalToast('error', `Maximal 50 Dateien pro Drop-Vorgang erlaubt (${droppedFiles.length} ausgewählt)`)
        return
      }

      // Validate individual file sizes (100 MB max)
      const maxFileSize = 104857600
      const validFiles: File[] = []
      for (const file of droppedFiles) {
        if (file.size > maxFileSize) {
          showGlobalToast('error', `"${file.name}" überschreitet die maximale Dateigröße von 100 MB`)
          continue
        }
        validFiles.push(file)
      }

      if (validFiles.length === 0) return

      try {
        await apiClient.uploadFiles(dropVaultId, validFiles, targetFolderPath)
        const newTree = await apiClient.fetchVaultTree(dropVaultId)
        dispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId: dropVaultId, tree: newTree } })
      } catch (err) {
        for (const file of validFiles) {
          const reason = err instanceof Error ? err.message : 'Upload fehlgeschlagen'
          showGlobalToast('error', `"${file.name}": ${reason}`)
        }
      }
      return
    }

    // Internal DnD: move file/folder within vault
    if (!dragState.validTargets.has(targetFolderPath)) return
    if (!dragState.draggedPath || !dragState.draggedVaultId) return
    if (!apiClient) return

    const vaultId = dragState.draggedVaultId
    const draggedPath = dragState.draggedPath
    const draggedFileName = draggedPath.split('/').pop() ?? draggedPath

    const destinationPath = targetFolderPath
      ? `${targetFolderPath}/${draggedFileName}`
      : draggedFileName

    setDragState({
      draggedPath: null,
      draggedVaultId: null,
      validTargets: new Set(),
      isMoving: true,
    })

    try {
      await apiClient.moveContent(vaultId, draggedPath, destinationPath)
      const newTree = await apiClient.fetchVaultTree(vaultId)
      dispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId, tree: newTree } })
      tabDispatch({
        type: 'UPDATE_TAB_PATHS',
        payload: { oldPathPrefix: draggedPath, newPathPrefix: destinationPath },
      })

      // Update favorites path on drag-drop move
      favoritesStore.updatePath(vaultId, draggedPath, destinationPath)
      setFavoritesVersion((v) => v + 1)
    } catch (err: unknown) {
      showToast(extractErrorMessage(err, t('fileOps.moveError')), 'error')
    } finally {
      setDragState({
        draggedPath: null,
        draggedVaultId: null,
        validTargets: new Set(),
        isMoving: false,
      })
    }
  }, [dragState.validTargets, dragState.draggedPath, dragState.draggedVaultId, apiClient, state.vaults, dispatch, tabDispatch, t, showToast])

  // --- Root Drop Zone Handlers (per vault) ---

  const handleRootDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, vaultId: string) => {
    // Internal DnD
    if (dragState.validTargets.has('')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      return
    }
    // External file drag
    if (!dragState.draggedPath && e.dataTransfer.types.includes('Files')) {
      const vault = state.vaults.find((v) => v.id === vaultId)
      if (vault?.permission === 'read') return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
      setExternalDropState((prev) => {
        if (prev.targetPath === '' && prev.targetVaultId === vaultId) return prev
        return { targetPath: '', targetVaultId: vaultId }
      })
    }
  }, [dragState.validTargets, dragState.draggedPath, state.vaults])

  const handleRootDrop = useCallback((e: React.DragEvent<HTMLDivElement>, vaultId: string) => {
    e.preventDefault()
    handleDrop(e, '', vaultId)
  }, [handleDrop])

  /** Clear external drop state when dragging leaves the explorer entirely. */
  const handleExplorerDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Only clear if leaving the container itself (not bubbling from children)
    const container = e.currentTarget
    const relatedTarget = e.relatedTarget as Node | null
    if (relatedTarget && container.contains(relatedTarget)) return
    setExternalDropState({ targetPath: null, targetVaultId: null })
  }, [])

  /** Render vault status badges. */
  function renderVaultBadges(vault: VaultInfo) {
    return (
      <>
        {vault.permission === 'read' && (
          <span className="vault-status-icon vault-status-icon--read" title={t('vault.permissionRead')}>
            <Eye size={11} />
          </span>
        )}
        {vault.permission === 'write' && (
          <span className="vault-status-icon vault-status-icon--write" title={t('vault.permissionWrite')}>
            <Pencil size={11} />
          </span>
        )}
        {vault.syncEnabled && (
          <span className="vault-status-icon vault-status-icon--sync" title={t('vault.syncActive')}>
            <RefreshCw size={11} />
          </span>
        )}
        {(vault.shareCount ?? 0) > 0 && (
          <span className="vault-status-icon vault-status-icon--shared" title={t('vault.shared', { count: vault.shareCount ?? 0 })}>
            <Users size={11} />
          </span>
        )}
      </>
    )
  }

  return (
    <div
      className={`file-explorer-container${dragState.isMoving ? ' file-explorer--moving' : ''}`}
      onContextMenu={handleEmptyAreaContextMenu}
      onDragLeave={handleExplorerDragLeave}
    >
      {/* Loading indicator while moving */}
      {dragState.isMoving && (
        <div className="file-explorer-moving-indicator">
          {t('fileOps.moving')}
        </div>
      )}

      {/* Vault list as tree */}
      {state.vaults.length === 0 ? (
        <p className="file-explorer-empty">{t('vault.noVaults')}</p>
      ) : (
        <>
          <nav className="file-explorer" aria-label="File explorer">
          <ul className="file-explorer-tree" role="tree">
            {state.vaults.map((vault) => {
              const isExpanded = expandedVaults.has(vault.id)
              const isSelected = state.selectedVaultId === vault.id
              const tree = state.vaultTrees[vault.id]
              const isLoading = state.vaultTreesLoading.has(vault.id)
              const permission = vault.permission

              // Show new file/folder/canvas input at vault root level
              const showRootNewFileInput = inlineInputState.visible
                && (inlineInputState.mode === 'newFile' || inlineInputState.mode === 'newFolder' || inlineInputState.mode === 'newCanvas')
                && inlineInputState.parentPath === ''
                && inlineInputState.vaultId === vault.id

              const showRootDropZone = dragState.draggedPath !== null
                && dragState.draggedVaultId === vault.id
                && dragState.validTargets.has('')

              return (
                <li key={vault.id} className="tree-node tree-node--vault">
                  <div
                    className={`tree-node-row tree-node-row--vault${isSelected ? ' tree-node-row--vault-selected' : ''}${externalDropState.targetPath === '' && externalDropState.targetVaultId === vault.id ? ' tree-node--drop-target' : ''}`}
                    onContextMenu={(e) => handleVaultContextMenu(e, vault)}
                    onMouseEnter={() => handleVaultMouseEnter(vault.id)}
                    onDragOver={(e) => handleRootDragOver(e, vault.id)}
                    onDragLeave={() => setExternalDropState((prev) => prev.targetPath === '' && prev.targetVaultId === vault.id ? { targetPath: null, targetVaultId: null } : prev)}
                    onDrop={(e) => handleRootDrop(e, vault.id)}
                  >
                    <button
                      type="button"
                      className="tree-node-toggle tree-node-toggle--vault"
                      aria-expanded={isExpanded}
                      onClick={() => handleToggleVault(vault.id)}
                      title={vaultTooltips[vault.id] || vault.name}
                    >
                      <span className="tree-node-chevron" aria-hidden="true">
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </span>
                      <Database size={14} style={{ flexShrink: 0, color: isSelected ? 'var(--accent)' : 'var(--sidebar-text)' }} />
                      <span className="tree-node-name tree-node-name--vault">
                        {vault.name}
                      </span>
                      {renderVaultBadges(vault)}
                    </button>
                  </div>

                  {/* Vault content (expanded) */}
                  {isExpanded && (
                    <ul className="tree-node-children tree-node-children--vault" role="group">
                      {isLoading && (
                        <li className="tree-node tree-node--loading">
                          <span className="tree-node-loading-text">{t('common.loading')}</span>
                        </li>
                      )}
                      {!isLoading && tree && tree.children && tree.children.length > 0 && (
                        tree.children
                          .filter((child) => child.name !== '.trash' && child.name !== '.versions')
                          .map((child) => (
                          <TreeNode
                            key={child.path}
                            node={child}
                            selectedFilePath={selectedFileVaultId === vault.id ? selectedFilePath : null}
                            expandedPaths={expandedPaths}
                            onToggleFolder={handleToggleFolder}
                            onSelectFile={(filePath, fileName) => handleSelectFile(vault.id, filePath, fileName)}
                            dragState={dragState}
                            externalDropState={externalDropState}
                            permission={permission}
                            vaultId={vault.id}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onContextMenu={handleContextMenu}
                            inlineInputState={inlineInputState}
                            onInlineConfirm={handleInlineConfirm}
                            onInlineCancel={handleInlineCancel}
                            isFavorite={(path) => checkIsFavorite(vault.id, path)}
                            onToggleFavorite={(path) => handleToggleFavorite(vault.id, path)}
                          />
                        ))
                      )}
                      {!isLoading && tree && (!tree.children || tree.children.length === 0) && (
                        <li className="tree-node tree-node--empty">
                          <span className="tree-node-empty-text">{t('vault.empty')}</span>
                        </li>
                      )}
                      {showRootNewFileInput && (
                        <li className="tree-node tree-node--file">
                          <div className="tree-node-row">
                            <InlineInput
                              initialValue=""
                              onConfirm={handleInlineConfirm}
                              onCancel={handleInlineCancel}
                              validate={(value) => {
                                if (inlineInputState.mode === 'newCanvas') {
                                  const name = value.trim().endsWith('.canvas') ? value.trim() : `${value.trim()}.canvas`
                                  return validateFileName(name)
                                }
                                const normalized = normalizeFileName(value)
                                return validateFileName(normalized)
                              }}
                            />
                          </div>
                        </li>
                      )}
                      {showRootDropZone && (
                        <li className="tree-node">
                          <div
                            className="file-explorer-root-drop-zone"
                            onDragOver={(e) => handleRootDragOver(e, vault.id)}
                            onDrop={(e) => handleRootDrop(e, vault.id)}
                          >
                            {t('fileOps.dropToRoot')}
                          </div>
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>
        </>
      )}

      {/* Create Vault Form */}
      {showCreateVaultForm && (
        <div className="file-explorer-create-vault">
          <form className="file-explorer-create-vault-form" onSubmit={handleCreateVaultSubmit}>
            <input
              type="text"
              className="file-explorer-create-vault-input"
              placeholder={t('vault.vaultNamePlaceholder')}
              value={newVaultName}
              onChange={(e) => setNewVaultName(e.target.value)}
              maxLength={128}
              aria-label={t('vault.vaultNameLabel')}
              autoFocus
            />
            <div className="file-explorer-create-vault-actions">
              <button type="submit" className="file-explorer-create-vault-submit">OK</button>
              <button type="button" className="file-explorer-create-vault-cancel" onClick={() => setShowCreateVaultForm(false)}>×</button>
            </div>
            {vaultValidationError && (
              <p className="file-explorer-create-vault-error" role="alert">{vaultValidationError}</p>
            )}
          </form>
        </div>
      )}

      {/* Context Menu */}
      {contextMenuState.visible && contextMenuState.targetNode && (() => {
        const node = contextMenuState.targetNode!
        const permission = state.vaults.find((v) => v.id === contextMenuState.vaultId)?.permission ?? 'read'
        const isReadOnly = permission === 'read'
        const isRoot = node.path === ''
        const isFile = node.type === 'file'
        const isFolder = node.type === 'directory' && !isRoot

        let menuItems: ContextMenuItem[]

        if (isReadOnly) {
          // Read-only users: no write actions, show hint
          menuItems = [{ id: 'no-actions', label: t('contextMenu.noActions'), disabled: true }]
        } else if (isFile) {
          // File context menu: Umbenennen, Löschen, Kopieren, Verschieben, Favorit, Versionen
          const fileFavorited = contextMenuState.vaultId
            ? favoritesStore.isFavorite(contextMenuState.vaultId, node.path)
            : false
          menuItems = [
            {
              id: 'toggleFavorite',
              label: fileFavorited ? t('contextMenu.removeFavorite') : t('contextMenu.addFavorite'),
              icon: <Star size={14} />,
            },
            { id: 'separator-fav', label: '', separator: true },
            { id: 'rename', label: t('contextMenu.rename'), icon: <Pencil size={14} /> },
            { id: 'delete', label: t('contextMenu.delete'), icon: <Trash2 size={14} /> },
            { id: 'separator-1', label: '', separator: true },
            { id: 'copy', label: t('contextMenu.copy'), icon: <Copy size={14} /> },
            { id: 'move', label: t('contextMenu.move'), icon: <Move size={14} /> },
            { id: 'separator-2', label: '', separator: true },
            { id: 'versions', label: 'Versionen', icon: <History size={14} /> },
          ]
        } else if (isFolder) {
          // Folder context menu: Neuer Ordner, Neue Datei, Neues Canvas, Umbenennen, Löschen
          menuItems = [
            { id: 'newFolder', label: t('contextMenu.newFolder'), icon: <FolderPlus size={14} /> },
            { id: 'newFile', label: t('contextMenu.newFile'), icon: <FilePlus size={14} /> },
            { id: 'newCanvas', label: 'Neues Canvas', icon: <LayoutDashboard size={14} /> },
            { id: 'separator-1', label: '', separator: true },
            { id: 'rename', label: t('contextMenu.rename'), icon: <Pencil size={14} /> },
            { id: 'delete', label: t('contextMenu.delete'), icon: <Trash2 size={14} /> },
          ]
        } else {
          // Vault entry context menu: Neuer Ordner, Neue Datei, Neues Canvas, Neue Notiz aus Vorlage, Export
          menuItems = [
            { id: 'newFolder', label: t('contextMenu.newFolder'), icon: <FolderPlus size={14} /> },
            { id: 'newFile', label: t('contextMenu.newFile'), icon: <FilePlus size={14} /> },
            { id: 'newCanvas', label: 'Neues Canvas', icon: <LayoutDashboard size={14} /> },
            { id: 'newFromTemplate', label: 'Neue Notiz aus Vorlage', icon: <FileText size={14} /> },
            { id: 'separator-1', label: '', separator: true },
            { id: 'export', label: t('contextMenu.export'), icon: <Download size={14} /> },
          ]
        }

        function handleMenuSelect(action: string) {
          switch (action) {
            case 'newFile': {
              const parentPath = node.type === 'directory'
                ? node.path
                : node.path.lastIndexOf('/') === -1 ? '' : node.path.slice(0, node.path.lastIndexOf('/'))
              handleNewFile(parentPath)
              break
            }
            case 'newFolder': {
              const parentPath = node.type === 'directory'
                ? node.path
                : node.path.lastIndexOf('/') === -1 ? '' : node.path.slice(0, node.path.lastIndexOf('/'))
              handleNewFolder(parentPath)
              break
            }
            case 'newCanvas': {
              const vaultId = contextMenuState.vaultId
              if (!vaultId) break
              const parentPath = node.type === 'directory'
                ? node.path
                : node.path.lastIndexOf('/') === -1 ? '' : node.path.slice(0, node.path.lastIndexOf('/'))
              void createCanvasFile(vaultId, parentPath)
              break
            }
            case 'rename':
              handleRename(node)
              break
            case 'delete':
              handleDelete(node)
              break
            case 'copy':
              void handleCopyFile(node)
              break
            case 'move':
              void handleMoveFile(node)
              break
            case 'export':
              handleExportVault()
              break
            case 'newFromTemplate':
              handleNewFromTemplate()
              break
            case 'toggleFavorite':
              if (contextMenuState.vaultId) {
                handleToggleFavorite(contextMenuState.vaultId, node.path)
              }
              break
            case 'versions':
              if (contextMenuState.vaultId && onOpenVersions) {
                onOpenVersions(contextMenuState.vaultId, node.path)
              }
              break
          }
        }

        return (
          <ContextMenu
            x={contextMenuState.x}
            y={contextMenuState.y}
            items={menuItems}
            onClose={handleCloseContextMenu}
            onSelect={handleMenuSelect}
          />
        )
      })()}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={deleteConfirm.open}
        title={t('fileOps.deleteConfirmTitle')}
        message={
          deleteConfirm.node?.type === 'directory'
            ? t('fileOps.deleteConfirmFolder', { name: deleteConfirm.node?.name ?? '' })
            : t('fileOps.deleteConfirmMessage', { name: deleteConfirm.node?.name ?? '' })
        }
        confirmLabel={t('common.delete')}
        variant="danger"
        onConfirm={handleDeleteConfirmed}
        onCancel={handleDeleteCancelled}
      />

      {/* Template Selector Modal */}
      {templateSelectorVaultId && apiClient && (
        <TemplateSelector
          isOpen={templateSelectorOpen}
          onClose={() => setTemplateSelectorOpen(false)}
          apiClient={apiClient}
          vaultId={templateSelectorVaultId}
          targetDir=""
          onFileCreated={handleTemplateFileCreated}
        />
      )}
    </div>
  )
}
