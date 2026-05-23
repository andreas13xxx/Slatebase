import { useRef, useState } from 'react'
import { useAppContext, importFile, importFolder, deleteContent } from '../state'
import { useTabContext } from '../state/tabContext'
import { openTab } from '../state/tabActions'
import type { DirectoryTree } from '../types'

/**
 * Props for the recursive TreeNode component.
 */
interface TreeNodeProps {
  node: DirectoryTree
  selectedFilePath: string | null
  expandedPaths: Set<string>
  onToggleFolder: (path: string) => void
  onSelectFile: (path: string, name: string) => void
  onDelete: (path: string, name: string) => void
}

/**
 * Renders a single node in the directory tree.
 * Directories are rendered as collapsible folders; files as clickable items.
 * Each node has a delete button for content management.
 */
function TreeNode({ node, selectedFilePath, expandedPaths, onToggleFolder, onSelectFile, onDelete }: TreeNodeProps) {
  const isDirectory = node.type === 'directory'
  const isExpanded = expandedPaths.has(node.path)
  const isSelected = !isDirectory && node.path === selectedFilePath

  if (isDirectory) {
    return (
      <li className="tree-node tree-node--directory">
        <div className="tree-node-row">
          <button
            type="button"
            className="tree-node-toggle"
            aria-expanded={isExpanded}
            onClick={() => onToggleFolder(node.path)}
          >
            <span className="tree-node-chevron" aria-hidden="true">
              {isExpanded ? '▼' : '▶'}
            </span>
            <span className="tree-node-name">
              {node.name}
              {node.itemCount != null && (
                <span className="tree-node-count"> ({node.itemCount})</span>
              )}
            </span>
          </button>
          <button
            type="button"
            className="tree-node-delete"
            aria-label={`Delete folder ${node.name}`}
            onClick={() => onDelete(node.path, node.name)}
          >
            ×
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
                onDelete={onDelete}
              />
            ))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <li className="tree-node tree-node--file">
      <div className="tree-node-row">
        <button
          type="button"
          className={`tree-node-file${isSelected ? ' tree-node-file--selected' : ''}`}
          aria-current={isSelected ? 'true' : undefined}
          onClick={() => onSelectFile(node.path, node.name)}
        >
          {node.name}
        </button>
        <button
          type="button"
          className="tree-node-delete"
          aria-label={`Delete file ${node.name}`}
          onClick={() => onDelete(node.path, node.name)}
        >
          ×
        </button>
      </div>
    </li>
  )
}

/**
 * FileExplorer renders the vault's directory tree as a collapsible tree structure.
 * All folders start collapsed. Clicking a folder toggles its expanded state.
 * Clicking a file dispatches a file load action.
 * Shows "Vault ist leer" when the tree has no children.
 *
 * Provides import file/folder buttons and delete actions on each tree node.
 */
export function FileExplorer() {
  const { state, dispatch, apiClient } = useAppContext()
  const { tabDispatch } = useTabContext()
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const tree = state.directoryTree
  const selectedFilePath = state.selectedFile?.path ?? null
  const vaultId = state.selectedVaultId

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

  function handleImportFile() {
    fileInputRef.current?.click()
  }

  function handleImportFolder() {
    folderInputRef.current?.click()
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file && vaultId && apiClient) {
      importFile(dispatch, apiClient, vaultId, file)
    }
    // Reset input so the same file can be re-selected
    event.target.value = ''
  }

  function handleFolderSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (files && files.length > 0 && vaultId && apiClient) {
      importFolder(dispatch, apiClient, vaultId, files)
    }
    // Reset input so the same folder can be re-selected
    event.target.value = ''
  }

  function handleDelete(path: string, name: string) {
    if (!vaultId || !apiClient) return
    const confirmed = window.confirm(`Are you sure you want to delete "${name}"?`)
    if (confirmed) {
      deleteContent(dispatch, apiClient, vaultId, path)
    }
  }

  return (
    <div className="file-explorer-container">
      {/* Import actions toolbar */}
      <div className="file-explorer-toolbar">
        <button
          type="button"
          className="file-explorer-import-btn"
          onClick={handleImportFile}
          aria-label="Import file"
        >
          Import File
        </button>
        <button
          type="button"
          className="file-explorer-import-btn"
          onClick={handleImportFolder}
          aria-label="Import folder"
        >
          Import Folder
        </button>
        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileSelected}
          aria-hidden="true"
          tabIndex={-1}
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is a non-standard attribute
          webkitdirectory=""
          style={{ display: 'none' }}
          onChange={handleFolderSelected}
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>

      {/* Error banner */}
      {state.error && (
        <div className="file-explorer-error" role="alert">
          {state.error.message}
        </div>
      )}

      {/* Tree content */}
      {!tree || !tree.children || tree.children.length === 0 ? (
        <p className="file-explorer-empty">Vault ist leer</p>
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
                onDelete={handleDelete}
              />
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
