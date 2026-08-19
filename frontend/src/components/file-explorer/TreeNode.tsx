import React, { useCallback } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, Star } from 'lucide-react'
import { getFileIcon, getFileIconClass, getDisplayName } from '../../utils/fileIcons'
import { InlineInput } from '../InlineInput'
import { validateFileName, normalizeFileName, getSelectionRange } from '../../utils/fileValidation'
import type { DirectoryTree } from '../../types'
import type { DragState, ExternalDropState, InlineInputState } from './types'
import { registerFileExplorerRow, unregisterFileExplorerRow } from '../../plugins/compat/file-explorer-dom-registry'

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

  // Registers this row's title element in the plugin-facing file-explorer DOM
  // registry (see file-explorer-dom-registry.ts) — backs
  // `workspace.getLeavesOfType('file-explorer')[0].view.fileItems`. Memoized
  // so it only fires on genuine mount/unmount, not on every re-render.
  const titleRef = useCallback((el: HTMLButtonElement | null) => {
    if (el) {
      registerFileExplorerRow(node.path, node.name, node.type, el)
    } else {
      unregisterFileExplorerRow(node.path)
    }
  }, [node.path, node.name, node.type])

  if (isDirectory) {
    const isValidTarget = dragState.draggedPath !== null && dragState.draggedVaultId === vaultId && dragState.validTargets.has(node.path)
    const isExternalDropTarget = externalDropState.targetPath === node.path && externalDropState.targetVaultId === vaultId

    // Check if new file/folder/canvas inline input should appear in this directory
    const showNewFileInput = inlineInputState.visible
      && (inlineInputState.mode === 'newFile' || inlineInputState.mode === 'newFolder' || inlineInputState.mode === 'newCanvas')
      && inlineInputState.parentPath === node.path
      && inlineInputState.vaultId === vaultId

    return (
      <li className="tree-node tree-node--directory" data-node-path={node.path}>
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
          {/*
            data-path + nav-folder-title mirror real Obsidian's DOM (where the
            row's title element is both the `[data-path]` anchor AND the direct
            parent of `.nav-folder-title-content`). Plugins that scrape the DOM
            directly instead of going through `fileItems` (Iconize's
            `createIconNode`/`getIconNodeFromPath` — see PLUGIN-COMPAT.md) do
            `document.querySelector('[data-path="..."]')` and then
            `node.insertBefore(iconEl, node.querySelector('.nav-folder-title-content'))`,
            which throws unless that title-content span is a *direct* child of
            the `[data-path]` element itself — hence both live on this <button>,
            not split across it and the outer <li>.

            The non-renaming branch below wraps the folder icon + name in one
            `.nav-folder-title-content` span rather than rendering them as
            separate direct children of the button: Iconize's own icon-restore
            pass on plugin load (`addAll()`) only touches a row when its title
            button has exactly 1 or 2 direct children — matching real
            Obsidian's pristine `nav-file-title`/`nav-folder-title` shape
            (title-content alone, or collapse-icon + title-content). A folder
            icon rendered as its own third sibling (as it used to be) fails
            that check and silently skips re-applying the icon after reload.
          */}
          <button
            type="button"
            className="tree-node-toggle nav-folder-title"
            ref={titleRef}
            data-path={node.path}
            aria-expanded={isExpanded}
            onClick={() => onToggleFolder(`${vaultId}::${node.path}`)}
            title={node.path}
          >
            <span className="tree-node-chevron" aria-hidden="true">
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            {isRenaming ? (
              <>
                {isExpanded ? <FolderOpen size={14} style={{ flexShrink: 0, color: 'var(--accent)' }} /> : <Folder size={14} style={{ flexShrink: 0, color: 'var(--sidebar-text)' }} />}
                <InlineInput
                  initialValue={node.name}
                  selectRange={getSelectionRange(node.name, true)}
                  onConfirm={onInlineConfirm}
                  onCancel={onInlineCancel}
                  validate={(value) => validateFileName(value, 255)}
                />
              </>
            ) : (
              <span className="tree-node-name-wrapper nav-folder-title-content">
                {isExpanded ? <FolderOpen size={14} style={{ flexShrink: 0, color: 'var(--accent)' }} /> : <Folder size={14} style={{ flexShrink: 0, color: 'var(--sidebar-text)' }} />}
                <span className="tree-node-name">
                  {node.name}
                  {node.itemCount != null && (
                    <span className="tree-node-count"> ({node.itemCount})</span>
                  )}
                </span>
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
          </ul>
        )}
      </li>
    )
  }

  const FileIconComponent = getFileIcon(node.name)
  const fileIconClass = getFileIconClass(node.name)
  const favorited = isFavorite(node.path)

  return (
    <li className="tree-node tree-node--file" data-node-path={node.path}>
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
          // data-path/nav-file-title(-content): see the analogous comment on the
          // directory branch's title button above. Icon + name + favorite star
          // are wrapped in one `.nav-file-title-content` span, giving the button
          // exactly 1 direct child — the shape Iconize's `addAll()` icon-restore
          // pass requires to touch a row at all (see the folder-branch comment
          // for the full rationale).
          <button
            type="button"
            className={`tree-node-file nav-file-title${isSelected ? ' tree-node-file--selected' : ''}`}
            ref={titleRef}
            data-path={node.path}
            aria-current={isSelected ? 'true' : undefined}
            onClick={() => onSelectFile(node.path, node.name)}
            title={node.path}
          >
            <span className="tree-node-name-wrapper nav-file-title-content">
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
            </span>
          </button>
        )}
      </div>
    </li>
  )
}
