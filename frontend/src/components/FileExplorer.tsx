import { useState, useCallback, useEffect } from 'react'
import { useAppContext } from '../state'
import { useTabContext } from '../state/tabContext'
import { useTranslation } from '../i18n'
import { openTab } from '../state/tabActions'
import type { DirectoryTree } from '../types'
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react'
import { getFileIcon, getFileIconClass, getDisplayName } from '../utils/fileIcons'
import { getValidDropTargets } from '../utils/pathUtils'
import { ContextMenu } from './ContextMenu'
import { InlineInput } from './InlineInput'
import { validateFileName, normalizeFileName, getSelectionRange } from '../utils/fileValidation'

/**
 * Internal drag state for the FileExplorer.
 */
interface DragState {
  draggedPath: string | null
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
}

/**
 * State for the inline input (new file / rename).
 */
interface InlineInputState {
  visible: boolean
  mode: 'newFile' | 'rename'
  parentPath: string
  node: DirectoryTree | null
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
  onDragStart: (e: React.DragEvent<HTMLDivElement>, nodePath: string, nodeType: 'file' | 'directory') => void
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void
  onDragOver: (e: React.DragEvent<HTMLDivElement>, nodePath: string) => void
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void
  onDrop: (e: React.DragEvent<HTMLDivElement>, targetPath: string) => void
  onContextMenu: (e: React.MouseEvent, node: DirectoryTree) => void
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
  const isExpanded = expandedPaths.has(node.path)
  const isSelected = !isDirectory && node.path === selectedFilePath
  const isDragged = dragState.draggedPath === node.path
  const canDrag = permission !== 'read' && !dragState.isMoving

  // Check if this node is being renamed
  const isRenaming = inlineInputState.visible
    && inlineInputState.mode === 'rename'
    && inlineInputState.node?.path === node.path

  if (isDirectory) {
    const isValidTarget = dragState.draggedPath !== null && dragState.validTargets.has(node.path)

    // Check if new file inline input should appear in this directory
    const showNewFileInput = inlineInputState.visible
      && inlineInputState.mode === 'newFile'
      && inlineInputState.parentPath === node.path

    return (
      <li className="tree-node tree-node--directory">
        <div
          className={`tree-node-row${isDragged ? ' tree-node--dragging' : ''}${isValidTarget ? ' tree-node--drop-target' : ''}`}
          draggable={canDrag}
          onDragStart={(e) => onDragStart(e, node.path, node.type)}
          onDragEnd={onDragEnd}
          onDragOver={(e) => onDragOver(e, node.path)}
          onDragLeave={onDragLeave}
          onDrop={(e) => onDrop(e, node.path)}
          onContextMenu={(e) => onContextMenu(e, node)}
        >
          <button
            type="button"
            className="tree-node-toggle"
            aria-expanded={isExpanded}
            onClick={() => onToggleFolder(node.path)}
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

  const FileIcon = getFileIcon(node.name)
  const fileIconClass = getFileIconClass(node.name)

  return (
    <li className="tree-node tree-node--file">
      <div
        className={`tree-node-row${isDragged ? ' tree-node--dragging' : ''}`}
        draggable={canDrag}
        onDragStart={(e) => onDragStart(e, node.path, node.type)}
        onDragEnd={onDragEnd}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        {isRenaming ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1 }}>
            <FileIcon size={13} className={fileIconClass} style={{ flexShrink: 0 }} />
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
            <FileIcon size={13} className={fileIconClass} style={{ flexShrink: 0 }} />
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
}

/**
 * FileExplorer renders the vault's directory tree as a collapsible tree structure.
 * All folders start collapsed. Clicking a folder toggles its expanded state.
 * Clicking a file dispatches a file load action.
 * Shows "Vault ist leer" when the tree has no children.
 *
 * Provides context menu actions (new file, rename, delete) on each tree node.
 * Supports drag & drop for moving files and folders within the vault.
 */
export function FileExplorer({ onRegisterCreateFile }: FileExplorerProps = {}) {
  const { state, dispatch, apiClient } = useAppContext()
  const { tabDispatch } = useTabContext()
  const { t } = useTranslation()
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [dragState, setDragState] = useState<DragState>({
    draggedPath: null,
    validTargets: new Set(),
    isMoving: false,
  })
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    targetNode: null,
  })
  const [inlineInputState, setInlineInputState] = useState<InlineInputState>({
    visible: false,
    mode: 'newFile',
    parentPath: '',
    node: null,
  })

  const tree = state.directoryTree
  const selectedFilePath = state.selectedFile?.path ?? null
  const vaultId = state.selectedVaultId
  const currentVault = state.vaults.find((v) => v.id === vaultId)
  const permission = currentVault?.permission

  // Register the create file trigger for the toolbar button
  useEffect(() => {
    if (onRegisterCreateFile) {
      onRegisterCreateFile(() => {
        setInlineInputState({
          visible: true,
          mode: 'newFile',
          parentPath: '',
          node: null,
        })
      })
    }
  }, [onRegisterCreateFile])

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

  function handleSelectFile(filePath: string, fileName: string) {
    if (vaultId && apiClient) {
      openTab(tabDispatch, dispatch, apiClient, vaultId, filePath, fileName)
    }
  }

  // --- Context Menu Handlers ---

  function handleContextMenu(e: React.MouseEvent, node: DirectoryTree) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenuState({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      targetNode: node,
    })
  }

  function handleCloseContextMenu() {
    setContextMenuState((prev) => ({ ...prev, visible: false }))
  }

  function handleNewFile(parentPath: string) {
    // Expand the parent folder so the inline input is visible
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      next.add(parentPath)
      return next
    })
    setInlineInputState({
      visible: true,
      mode: 'newFile',
      parentPath,
      node: null,
    })
  }

  function handleRename(node: DirectoryTree) {
    setInlineInputState({
      visible: true,
      mode: 'rename',
      parentPath: '',
      node,
    })
  }

  function handleDelete(node: DirectoryTree) {
    if (!vaultId || !apiClient) return

    const message = node.type === 'directory'
      ? t('fileOps.deleteConfirmFolder', { name: node.name })
      : t('fileOps.deleteConfirmMessage', { name: node.name })

    const confirmed = window.confirm(message)
    if (!confirmed) return

    // Call delete API
    apiClient.deleteContent(vaultId, node.path).then(async () => {
      // Close affected tabs
      tabDispatch({
        type: 'CLOSE_TABS_BY_PATH',
        payload: { pathPrefix: node.path },
      })

      // Reload tree
      const newTree = await apiClient.fetchVaultTree(vaultId)
      dispatch({ type: 'TREE_LOADED', payload: newTree })
    }).catch((err: unknown) => {
      const message = err !== null && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : t('fileOps.deleteError')
      window.alert(message)
    })
  }

  // --- Inline Input Handlers ---

  async function handleInlineConfirm(value: string) {
    if (!vaultId || !apiClient) return

    if (inlineInputState.mode === 'newFile') {
      // New file flow
      const normalizedName = normalizeFileName(value)
      const validationError = validateFileName(normalizedName)
      if (validationError) {
        // This shouldn't happen since InlineInput validates, but just in case
        return
      }

      const filePath = inlineInputState.parentPath
        ? `${inlineInputState.parentPath}/${normalizedName}`
        : normalizedName

      try {
        await apiClient.saveFile(vaultId, filePath, '')

        // Reload tree
        const newTree = await apiClient.fetchVaultTree(vaultId)
        dispatch({ type: 'TREE_LOADED', payload: newTree })

        // Open the new file in a tab
        openTab(tabDispatch, dispatch, apiClient, vaultId, filePath, normalizedName)
      } catch (err: unknown) {
        const msg = err !== null && typeof err === 'object' && 'message' in err
          ? (err as { message: string }).message
          : t('fileOps.createError')
        window.alert(msg)
      }
    } else if (inlineInputState.mode === 'rename') {
      // Rename flow
      const node = inlineInputState.node
      if (!node) return

      let newName = value

      // If name unchanged, cancel
      if (newName === node.name) {
        setInlineInputState((prev) => ({ ...prev, visible: false }))
        return
      }

      // For files: if no extension provided, preserve original extension
      if (node.type === 'file') {
        const lastDot = node.name.lastIndexOf('.')
        if (lastDot > 0) {
          const originalExt = node.name.slice(lastDot)
          const newNameHasDot = newName.lastIndexOf('.')
          if (newNameHasDot <= 0) {
            // No extension in new name, preserve original
            newName = newName + originalExt
          }
        }
      }

      const validationError = validateFileName(newName, 255)
      if (validationError) {
        // Shouldn't happen since InlineInput validates, but just in case
        return
      }

      try {
        await apiClient.renameContent(vaultId, node.path, newName)

        // Reload tree
        const newTree = await apiClient.fetchVaultTree(vaultId)
        dispatch({ type: 'TREE_LOADED', payload: newTree })

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
        window.alert(msg)
      }
    }

    // Hide inline input
    setInlineInputState((prev) => ({ ...prev, visible: false }))
  }

  function handleInlineCancel() {
    setInlineInputState((prev) => ({ ...prev, visible: false }))
  }

  // --- Drag & Drop Handlers ---

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, nodePath: string, nodeType: 'file' | 'directory') => {
    if (permission === 'read' || dragState.isMoving) {
      e.preventDefault()
      return
    }

    if (!tree) {
      e.preventDefault()
      return
    }

    const validTargets = getValidDropTargets(tree, nodePath)

    setDragState({
      draggedPath: nodePath,
      validTargets,
      isMoving: false,
    })

    e.dataTransfer.effectAllowed = 'copyMove'
    e.dataTransfer.setData('application/x-slatebase-path', nodePath)
    e.dataTransfer.setData('application/x-slatebase-type', nodeType)

    // Apply opacity to the dragged element
    const target = e.currentTarget as HTMLElement
    target.style.opacity = '0.5'
  }, [permission, dragState.isMoving, tree])

  const handleDragEnd = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Restore opacity
    const target = e.currentTarget as HTMLElement
    target.style.opacity = ''

    setDragState((prev) => ({
      ...prev,
      draggedPath: null,
      validTargets: new Set(),
    }))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, folderPath: string) => {
    if (dragState.validTargets.has(folderPath)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
  }, [dragState.validTargets])

  const handleDragLeave = useCallback((_e: React.DragEvent<HTMLDivElement>) => {
    // No-op: the drop-target highlight is managed by React's className
    // based on dragState.validTargets, not by manual class manipulation.
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>, targetFolderPath: string) => {
    e.preventDefault()

    if (!dragState.validTargets.has(targetFolderPath)) return
    if (!dragState.draggedPath) return
    if (!vaultId || !apiClient) return

    const draggedPath = dragState.draggedPath
    const draggedFileName = draggedPath.split('/').pop() ?? draggedPath

    // Compute destination path
    const destinationPath = targetFolderPath
      ? `${targetFolderPath}/${draggedFileName}`
      : draggedFileName

    // Set moving state to disable further DnD
    setDragState({
      draggedPath: null,
      validTargets: new Set(),
      isMoving: true,
    })

    try {
      await apiClient.moveContent(vaultId, draggedPath, destinationPath)

      // Reload tree
      const newTree = await apiClient.fetchVaultTree(vaultId)
      dispatch({ type: 'TREE_LOADED', payload: newTree })

      // Update tab paths
      tabDispatch({
        type: 'UPDATE_TAB_PATHS',
        payload: { oldPathPrefix: draggedPath, newPathPrefix: destinationPath },
      })
    } catch (err: unknown) {
      const message = err !== null && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : t('fileOps.moveError')
      window.alert(message)
    } finally {
      setDragState({
        draggedPath: null,
        validTargets: new Set(),
        isMoving: false,
      })
    }
  }, [dragState.validTargets, dragState.draggedPath, vaultId, apiClient, dispatch, tabDispatch, t])

  // --- Root Drop Zone Handlers ---

  const handleRootDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Only accept drops on the root zone if root ('') is a valid target
    if (dragState.validTargets.has('')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
  }, [dragState.validTargets])

  const handleRootDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    handleDrop(e, '')
  }, [handleDrop])

  // Show new file input at root level
  const showRootNewFileInput = inlineInputState.visible
    && inlineInputState.mode === 'newFile'
    && inlineInputState.parentPath === ''

  const showRootDropZone = dragState.draggedPath !== null && dragState.validTargets.has('')

  return (
    <div className={`file-explorer-container${dragState.isMoving ? ' file-explorer--moving' : ''}`}>
      {/* Error banner */}
      {state.error && (
        <div className="file-explorer-error" role="alert">
          {state.error.message}
        </div>
      )}

      {/* Loading indicator while moving */}
      {dragState.isMoving && (
        <div className="file-explorer-moving-indicator">
          {t('fileOps.moving')}
        </div>
      )}

      {/* Tree content */}
      {!tree || !tree.children || tree.children.length === 0 ? (
        <p className="file-explorer-empty">{t('vault.empty')}</p>
      ) : (
        <nav className="file-explorer" aria-label="File explorer">
          <ul className="file-explorer-tree" role="tree">
            {tree.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                selectedFilePath={selectedFilePath}
                expandedPaths={expandedPaths}
                onToggleFolder={handleToggleFolder}
                onSelectFile={handleSelectFile}
                dragState={dragState}
                permission={permission}
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
            ))}
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
          </ul>
          {/* Root drop zone — visible when dragging to allow dropping at vault root */}
          {showRootDropZone && (
            <div
              className="file-explorer-root-drop-zone"
              onDragOver={handleRootDragOver}
              onDrop={handleRootDrop}
            >
              {t('fileOps.dropToRoot')}
            </div>
          )}
        </nav>
      )}

      {/* Context Menu */}
      {contextMenuState.visible && contextMenuState.targetNode && (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          node={contextMenuState.targetNode}
          permission={permission ?? 'read'}
          onClose={handleCloseContextMenu}
          onNewFile={handleNewFile}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
