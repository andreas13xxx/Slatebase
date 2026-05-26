import { useState } from 'react'
import { useAppContext, deleteContent } from '../state'
import { useTabContext } from '../state/tabContext'
import { useTranslation } from '../i18n'
import { openTab } from '../state/tabActions'
import type { DirectoryTree } from '../types'
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Trash2 } from 'lucide-react'

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
  const { t } = useTranslation()
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
            title={node.path}
          >
            <span className="tree-node-chevron" aria-hidden="true">
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            {isExpanded ? <FolderOpen size={14} style={{ flexShrink: 0, color: 'var(--accent)' }} /> : <Folder size={14} style={{ flexShrink: 0, color: 'var(--sidebar-text)' }} />}
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
            aria-label={t('files.deleteFolderAriaLabel', { name: node.name })}
            title={t('files.deleteTitle', { name: node.name })}
            onClick={() => onDelete(node.path, node.name)}
          >
            <Trash2 size={12} />
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
          title={node.path}
          style={{ display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <FileText size={13} style={{ flexShrink: 0, opacity: 0.6 }} />
          {node.name}
        </button>
        <button
          type="button"
          className="tree-node-delete"
          aria-label={t('files.deleteFileAriaLabel', { name: node.name })}
          title={t('files.deleteTitle', { name: node.name })}
          onClick={() => onDelete(node.path, node.name)}
        >
          <Trash2 size={12} />
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
 * Provides delete actions on each tree node.
 */
export function FileExplorer() {
  const { state, dispatch, apiClient } = useAppContext()
  const { tabDispatch } = useTabContext()
  const { t } = useTranslation()
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())

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

  function handleDelete(path: string, name: string) {
    if (!vaultId || !apiClient) return
    const confirmed = window.confirm(t('files.deleteConfirm', { name }))
    if (confirmed) {
      deleteContent(dispatch, apiClient, vaultId, path)
    }
  }

  return (
    <div className="file-explorer-container">
      {/* Error banner */}
      {state.error && (
        <div className="file-explorer-error" role="alert">
          {state.error.message}
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
                onDelete={handleDelete}
              />
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
