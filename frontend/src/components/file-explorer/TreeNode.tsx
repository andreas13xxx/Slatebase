import React from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, Star } from 'lucide-react'
import { getFileIcon, getFileIconClass, getDisplayName } from '../../utils/fileIcons'
import { InlineInput } from '../InlineInput'
import { validateFileName, normalizeFileName, getSelectionRange } from '../../utils/fileValidation'
import type { DirectoryTree } from '../../types'
import type { DragState, ExternalDropState, InlineInputState } from './types'

/**
 * Props for the recursive TreeNode component.
 */
export interface TreeNodeProps {
  node: DirectoryTree
  selectedFilePath: string | null
  expandedPaths: Set<string>
  onToggleFolder: (path: string) => void
  onSelectFile: (path: string, name: string) => void
  dragState: DragState
  externalDropState: ExternalDropState
  permission: 'owner' | 'read' | 'write' | undefined
  vaultId: string
  onDragStart: (e: React.DragEvent<HTMLDivElement>, nodePath: string, nodeType: 'file' | 'directory', vaultId: string) => void
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void
  onDragOver: (e: React.DragEvent<HTMLDivElement>, nodePath: string, vaultId: string) => void
  onDragLeave: (e: React.DragEvent<HTMLDivElement>, nodePath: string, vaultId: string) => void
  onDrop: (e: React.DragEvent<HTMLDivElement>, targetPath: string, vaultId: string) => void
  onContextMenu: (e: React.MouseEvent, node: DirectoryTree, vaultId: string) => void
  inlineInputState: InlineInputState
  onInlineConfirm: (value: string) => void
  onInlineCancel: () => void
  isFavorite: (path: string) => boolean
  onToggleFavorite: (path: string) => void
}

/**
 * Renders a single node in the directory tree.
 * Directories are rendered as collapsible folders; files as clickable items.
 * Supports drag & drop for moving files/folders.
 * Shows InlineInput when creating a new file or renaming.
 */
export function TreeNode({
  node,
  selectedFilePath,
  expandedPaths,
  onToggleFolder,
  onSelectFile,
  dragState,
  externalDropState,
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
  isFavorite,
  onToggleFavorite,
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
    const isExternalDropTarget = externalDropState.targetPath === node.path && externalDropState.targetVaultId === vaultId

    // Check if new file/folder inline input should appear in this directory
    const showNewFileInput = inlineInputState.visible
      && (inlineInputState.mode === 'newFile' || inlineInputState.mode === 'newFolder')
      && inlineInputState.parentPath === node.path
      && inlineInputState.vaultId === vaultId

    return (
      <li className="tree-node tree-node--directory">
        <div
          className={`tree-node-row${isDragged ? ' tree-node--dragging' : ''}${isValidTarget || isExternalDropTarget ? ' tree-node--drop-target' : ''}`}
          draggable={canDrag}
          onDragStart={(e) => onDragStart(e, node.path, node.type, vaultId)}
          onDragEnd={onDragEnd}
          onDragOver={(e) => onDragOver(e, node.path, vaultId)}
          onDragLeave={(e) => onDragLeave(e, node.path, vaultId)}
          onDrop={(e) => onDrop(e, node.path, vaultId)}
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
                externalDropState={externalDropState}
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
                isFavorite={isFavorite}
                onToggleFavorite={onToggleFavorite}
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
  const favorited = isFavorite(node.path)

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
            <span className="tree-node-file-name">{getDisplayName(node.name)}</span>
            <span
              className={`tree-node-star${favorited ? ' tree-node-star--active' : ''}`}
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(node.path) }}
              role="button"
              aria-label={favorited ? 'Favorit entfernen' : 'Als Favorit markieren'}
              tabIndex={-1}
            >
              <Star size={12} />
            </span>
          </button>
        )}
      </div>
    </li>
  )
}
