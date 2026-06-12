import React, { useState, useCallback, useEffect } from 'react'
import { useAppContext } from '../state'
import { useTabContext } from '../state/tabContext'
import { useTranslation } from '../i18n'
import { openTab } from '../state/tabActions'
import type { DirectoryTree, VaultInfo } from '../types'
import { ChevronRight, ChevronDown, Folder, FolderOpen, Database, Eye, Pencil, RefreshCw, Users } from 'lucide-react'
import { getFileIcon, getFileIconClass, getDisplayName } from '../utils/fileIcons'
import { getValidDropTargets } from '../utils/pathUtils'
import { ContextMenu } from './ContextMenu'
import { InlineInput } from './InlineInput'
import { ConfirmModal } from './ConfirmModal'
import { useToast } from './Toast'
import { validateFileName, normalizeFileName, getSelectionRange } from '../utils/fileValidation'

/**
 * Internal drag state for the FileExplorer.
 */
interface DragState {
  draggedPath: string | null
  draggedVaultId: string | null
  validTargets: Set<string>
  isMoving: boolean
}

/**
 * State for the context menu.
 */
interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  targetNode: DirectoryTree | null
  vaultId: string | null
}

/**
 * State for the inline input (new file / rename).
 */
interface InlineInputState {
  visible: boolean
  mode: 'newFile' | 'rename'
  parentPath: string
  node: DirectoryTree | null
  vaultId: string | null
}

/**
 * Props for the recursive TreeNode component.
 */
interface TreeNodeProps {
  node: DirectoryTree
  selectedFilePath: string | null
  expandedPaths: Set<string>
  onToggleFolder: (path: string) => void
  onSelectFile: (path: string, name: string) => void
  dragState: DragState
  permission: 'owner' | 'read' | 'write' | undefined
  vaultId: string
  onDragStart: (e: React.DragEvent<HTMLDivElement>, nodePath: string, nodeType: 'file' | 'directory', vaultId: string) => void
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void
  onDragOver: (e: React.DragEvent<HTMLDivElement>, nodePath: string) => void
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void
  onDrop: (e: React.DragEvent<HTMLDivElement>, targetPath: string) => void
  onContextMenu: (e: React.MouseEvent, node: DirectoryTree, vaultId: string) => void
  inlineInputState: InlineInputState
  onInlineConfirm: (value: string) => void
  onInlineCancel: () => void
}

/**
 * Renders a single node in the directory tree.
 * Directories are rendered as collapsible folders; files as clickable items.
 * Supports drag & drop for moving files/folders.
 * Shows InlineInput when creating a new file or renaming.
 */
function TreeNode({
  node,
  selectedFilePath,
  expandedPaths,
  onToggleFolder,
  onSelectFile,
  dragState,
  permission,
  vaultId,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onContextMenu,
  inlineInputState,
  onInlineConfirm,
  onInlineCancel,
}: TreeNodeProps) {
  const isDirectory = node.type === 'directory'
  const isExpanded = expandedPaths.has(`${vaultId}::${node.path}`)
  const isSelected = !isDirectory && node.path === selectedFilePath
  const isDragged = dragState.draggedPath === node.path && dragState.draggedVaultId === vaultId
  const canDrag = permission !== 'read' && !dragState.isMoving

  // Check if this node is being renamed
  const isRenaming = inlineInputState.visible
    && inlineInputState.mode === 'rename'
    && inlineInputState.node?.path === node.path
    && inlineInputState.vaultId === vaultId

  if (isDirectory) {
    const isValidTarget = dragState.draggedPath !== null && dragState.draggedVaultId === vaultId && dragState.validTargets.has(node.path)

    // Check if new file inline input should appear in this directory
    const showNewFileInput = inlineInputState.visible
      && inlineInputState.mode === 'newFile'
      && inlineInputState.parentPath === node.path
      && inlineInputState.vaultId === vaultId

    return (
      <li className="tree-node tree-node--directory">
        <div
          className={`tree-node-row${isDragged ? ' tree-node--dragging' : ''}${isValidTarget ? ' tree-node--drop-target' : ''}`}
          draggable={canDrag}
          onDragStart={(e) => onDragStart(e, node.path, node.type, vaultId)}
          onDragEnd={onDragEnd}
          onDragOver={(e) => onDragOver(e, node.path)}
          onDragLeave={onDragLeave}
          onDrop={(e) => onDrop(e, node.path)}
          onContextMenu={(e) => onContextMenu(e, node, vaultId)}
        >
          <button
            type="button"
            className="tree-node-toggle"
            aria-expanded={isExpanded}
            onClick={() => onToggleFolder(`${vaultId}::${node.path}`)}
            title={node.path}
          >
            <span className="tree-node-chevron" aria-hidden="true">
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            {isExpanded ? <FolderOpen size={14} style={{ flexShrink: 0, color: 'var(--accent)' }} /> : <Folder size={14} style={{ flexShrink: 0, color: 'var(--sidebar-text)' }} />}
            {isRenaming ? (
              <InlineInput
                initialValue={node.name}
                selectRange={getSelectionRange(node.name, true)}
                onConfirm={onInlineConfirm}
                onCancel={onInlineCancel}
                validate={(value) => validateFileName(value, 255)}
              />
            ) : (
              <span className="tree-node-name">
                {node.name}
                {node.itemCount != null && (
                  <span className="tree-node-count"> ({node.itemCount})</span>
                )}
              </span>
            )}
          </button>
        </div>
        {isExpanded && node.children && node.children.length > 0 && (
          <ul className="tree-node-children" role="group">
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                selectedFilePath={selectedFilePath}
                expandedPaths={expandedPaths}
                onToggleFolder={onToggleFolder}
                onSelectFile={onSelectFile}
                dragState={dragState}
                permission={permission}
                vaultId={vaultId}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onContextMenu={onContextMenu}
                inlineInputState={inlineInputState}
                onInlineConfirm={onInlineConfirm}
                onInlineCancel={onInlineCancel}
              />
            ))}
          </ul>
        )}
        {showNewFileInput && (
          <ul className="tree-node-children" role="group">
            <li className="tree-node tree-node--file">
              <div className="tree-node-row">
                <InlineInput
                  initialValue=""
                  onConfirm={onInlineConfirm}
                  onCancel={onInlineCancel}
                  validate={(value) => {
                    const normalized = normalizeFileName(value)
                    return validateFileName(normalized)
                  }}
                />
              </div>
            </li>
          </ul>
        )}
      </li>
    )
  }

  const FileIconComponent = getFileIcon(node.name)
  const fileIconClass = getFileIconClass(node.name)

  return (
    <li className="tree-node tree-node--file">
      <div
        className={`tree-node-row${isDragged ? ' tree-node--dragging' : ''}`}
        draggable={canDrag}
        onDragStart={(e) => onDragStart(e, node.path, node.type, vaultId)}
        onDragEnd={onDragEnd}
        onContextMenu={(e) => onContextMenu(e, node, vaultId)}
      >
        {isRenaming ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1 }}>
            {React.createElement(FileIconComponent, { size: 13, className: fileIconClass, style: { flexShrink: 0 } })}
            <InlineInput
              initialValue={node.name}
              selectRange={getSelectionRange(node.name, false)}
              onConfirm={onInlineConfirm}
              onCancel={onInlineCancel}
              validate={(value) => validateFileName(value, 255)}
            />
          </div>
        ) : (
          <button
            type="button"
            className={`tree-node-file${isSelected ? ' tree-node-file--selected' : ''}`}
            aria-current={isSelected ? 'true' : undefined}
            onClick={() => onSelectFile(node.path, node.name)}
            title={node.path}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          >
            {React.createElement(FileIconComponent, { size: 13, className: fileIconClass, style: { flexShrink: 0 } })}
            {getDisplayName(node.name)}
          </button>
        )}
      </div>
    </li>
  )
}

/**
 * Props for the FileExplorer component.
 */
export interface FileExplorerProps {
  /** When set, registers a callback that triggers inline new file creation at root. */
  onRegisterCreateFile?: (trigger: () => void) => void
  /** When set, registers a callback that triggers vault creation. */
  onRegisterCreateVault?: (trigger: () => void) => void
}

/**
 * FileExplorer renders all vaults as expandable root-level entries.
 * Expanding a vault lazy-loads its directory tree.
 * Clicking a file opens it in a tab and implicitly selects the vault.
 *
 * Provides context menu actions (new file, rename, delete) on each tree node.
 * Supports drag & drop for moving files and folders within a vault.
 */
export function FileExplorer({ onRegisterCreateFile, onRegisterCreateVault }: FileExplorerProps = {}) {
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
      const msg = err !== null && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : t('common.error')
      setVaultValidationError(msg)
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

      // Reload tree for this vault
      const newTree = await apiClient.fetchVaultTree(vaultId)
      dispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId, tree: newTree } })
    }).catch((err: unknown) => {
      const message = err !== null && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : t('fileOps.deleteError')
      showToast(message, 'error')
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

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, folderPath: string) => {
    if (dragState.validTargets.has(folderPath)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
  }, [dragState.validTargets])

  const handleDragLeave = useCallback((_e: React.DragEvent<HTMLDivElement>) => { // eslint-disable-line @typescript-eslint/no-unused-vars
    // No-op
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>, targetFolderPath: string) => {
    e.preventDefault()

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
    } catch (err: unknown) {
      const message = err !== null && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : t('fileOps.moveError')
      showToast(message, 'error')
    } finally {
      setDragState({
        draggedPath: null,
        draggedVaultId: null,
        validTargets: new Set(),
        isMoving: false,
      })
    }
  }, [dragState.validTargets, dragState.draggedPath, dragState.draggedVaultId, apiClient, dispatch, tabDispatch, t, showToast])

  // --- Root Drop Zone Handlers (per vault) ---

  const handleRootDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (dragState.validTargets.has('')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
  }, [dragState.validTargets])

  const handleRootDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    handleDrop(e, '')
  }, [handleDrop])

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
        <nav className="file-explorer" aria-label="File explorer">
          <ul className="file-explorer-tree" role="tree">
            {state.vaults.map((vault) => {
              const isExpanded = expandedVaults.has(vault.id)
              const isSelected = state.selectedVaultId === vault.id
              const tree = state.vaultTrees[vault.id]
              const isLoading = state.vaultTreesLoading.has(vault.id)
              const permission = vault.permission

              // Show new file input at vault root level
              const showRootNewFileInput = inlineInputState.visible
                && inlineInputState.mode === 'newFile'
                && inlineInputState.parentPath === ''
                && inlineInputState.vaultId === vault.id

              const showRootDropZone = dragState.draggedPath !== null
                && dragState.draggedVaultId === vault.id
                && dragState.validTargets.has('')

              return (
                <li key={vault.id} className="tree-node tree-node--vault">
                  <div
                    className={`tree-node-row tree-node-row--vault${isSelected ? ' tree-node-row--vault-selected' : ''}`}
                    onContextMenu={(e) => handleVaultContextMenu(e, vault)}
                  >
                    <button
                      type="button"
                      className="tree-node-toggle tree-node-toggle--vault"
                      aria-expanded={isExpanded}
                      onClick={() => handleToggleVault(vault.id)}
                      title={vault.name}
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
                        tree.children.map((child) => (
                          <TreeNode
                            key={child.path}
                            node={child}
                            selectedFilePath={selectedFileVaultId === vault.id ? selectedFilePath : null}
                            expandedPaths={expandedPaths}
                            onToggleFolder={handleToggleFolder}
                            onSelectFile={(filePath, fileName) => handleSelectFile(vault.id, filePath, fileName)}
                            dragState={dragState}
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
                            onDragOver={handleRootDragOver}
                            onDrop={handleRootDrop}
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
      {contextMenuState.visible && contextMenuState.targetNode && (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          node={contextMenuState.targetNode}
          permission={state.vaults.find((v) => v.id === contextMenuState.vaultId)?.permission ?? 'read'}
          onClose={handleCloseContextMenu}
          onNewFile={handleNewFile}
          onRename={handleRename}
          onDelete={handleDelete}
          onNewVault={() => {
            setShowCreateVaultForm(true)
            setNewVaultName('')
            setVaultValidationError(null)
          }}
        />
      )}

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
    </div>
  )
}
