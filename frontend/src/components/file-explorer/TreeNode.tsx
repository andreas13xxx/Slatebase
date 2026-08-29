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
  // HTMLElement, not HTMLDivElement: the drag-wrapper div that used to host
  // these handlers was folded into the title <button> below (see the merge
  // comment on the directory branch), so these now fire on a <button>.
  onDragStart: (e: React.DragEvent<HTMLElement>, nodePath: string, nodeType: 'file' | 'directory', vaultId: string) => void
  onDragEnd: (e: React.DragEvent<HTMLElement>) => void
  onDragOver: (e: React.DragEvent<HTMLElement>, nodePath: string, vaultId: string) => void
  onDragLeave: (e: React.DragEvent<HTMLElement>, nodePath: string, vaultId: string) => void
  onDrop: (e: React.DragEvent<HTMLElement>, targetPath: string, vaultId: string) => void
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
      <li
        className={`tree-node tree-node--directory tree-item nav-folder${isExpanded ? '' : ' is-collapsed'}${isRenaming ? ' is-being-renamed' : ''}`}
        data-node-path={node.path}
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
          the `[data-path]` element itself — hence both live on this <button>.

          `tree-item`/`nav-folder` (on the <li>), `tree-item-self`/
          `is-clickable`, `tree-item-icon`/`collapse-icon`, `tree-item-inner`,
          and `tree-item-children`/`nav-folder-children` (below, on the
          children <ul>) are added alongside Slatebase's own `tree-node-*`
          classes so that Obsidian CSS snippets targeting the file explorer's
          real class names apply unmodified. They're additive only — no
          element is renamed, so Slatebase's own styling and the Iconize
          compat above are unaffected. `is-collapsed` mirrors real Obsidian's
          collapse-state class on the <li> itself; `is-being-renamed` (also on
          the <li>) mirrors its rename-state class — real Obsidian keeps
          nav-folder-title present with content hidden during rename, while
          Slatebase swaps the title-content span for an InlineInput inside
          the same button, so `is-being-renamed` is the only reliable anchor
          for a snippet wanting to style the row during a rename. The file
          branch below adds the file-explorer equivalent, `is-active`, to the
          currently-open file's nav-file-title — real Obsidian's own
          convention for "this is the open file," used far more often in
          published snippets than the (unofficial, unverified) drag-state
          class we deliberately did *not* guess at.

          This button also carries `tree-node-row` and all of what used to be
          a separate drag/drop wrapper <div>'s props (draggable, the five
          drag handlers, onContextMenu): real Obsidian's `.tree-item-self`
          and `.nav-folder-title` are one and the same element, so folding
          the wrapper into the button — rather than leaving nav-folder-title
          nested inside it — makes `.tree-item > .tree-item-self` (a `>`
          child combinator some snippets use) match here too. A <button> can
          be `draggable` and carry drag handlers the same as a <div>; nothing
          about drag-and-drop requires a non-interactive element.

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
          className={`tree-node-row tree-node-toggle nav-folder-title tree-item-self is-clickable${isDragged ? ' tree-node--dragging' : ''}${isValidTarget || isExternalDropTarget ? ' tree-node--drop-target' : ''}`}
          ref={titleRef}
          data-path={node.path}
          aria-expanded={isExpanded}
          draggable={canDrag}
          onClick={() => onToggleFolder(`${vaultId}::${node.path}`)}
          onDragStart={(e) => onDragStart(e, node.path, node.type, vaultId)}
          onDragEnd={onDragEnd}
          onDragOver={(e) => onDragOver(e, node.path, vaultId)}
          onDragLeave={(e) => onDragLeave(e, node.path, vaultId)}
          onDrop={(e) => onDrop(e, node.path, vaultId)}
          onContextMenu={(e) => onContextMenu(e, node, vaultId)}
          title={node.path}
        >
          <span className="tree-node-chevron tree-item-icon collapse-icon" aria-hidden="true">
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
            <span className="tree-node-name-wrapper nav-folder-title-content tree-item-inner">
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
        {isExpanded && node.children && node.children.length > 0 && (
          <ul className="tree-node-children tree-item-children nav-folder-children" role="group">
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
          <ul className="tree-node-children tree-item-children nav-folder-children" role="group">
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

  // While renaming there's no title button at all (matches real Obsidian,
  // which also swaps the row for a bare edit control) — dragging or
  // right-clicking a row mid-rename isn't a supported interaction, so this
  // branch only needs a plain wrapper, not the drag/drop props below.
  if (isRenaming) {
    return (
      <li className="tree-node tree-node--file tree-item nav-file is-being-renamed" data-node-path={node.path}>
        <div className="tree-node-row" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {React.createElement(FileIconComponent, { size: 13, className: fileIconClass, style: { flexShrink: 0 } })}
          <InlineInput
            initialValue={node.name}
            selectRange={getSelectionRange(node.name, false)}
            onConfirm={onInlineConfirm}
            onCancel={onInlineCancel}
            validate={(value) => validateFileName(value, 255)}
          />
        </div>
      </li>
    )
  }

  return (
    <li className="tree-node tree-node--file tree-item nav-file" data-node-path={node.path}>
      {/*
        data-path/nav-file-title(-content): see the analogous comment on the
        directory branch's title button above, including why this button also
        carries tree-node-row plus the drag/drop props that used to live on a
        separate wrapper <div> (folding .tree-item-self and .nav-folder-title
        onto one element, matching real Obsidian). Icon + name + favorite
        star are wrapped in one `.nav-file-title-content` span, giving the
        button exactly 1 direct child — the shape Iconize's `addAll()`
        icon-restore pass requires to touch a row at all.
      */}
      <button
        type="button"
        className={`tree-node-row tree-node-file nav-file-title tree-item-self is-clickable${isSelected ? ' tree-node-file--selected is-active' : ''}${isDragged ? ' tree-node--dragging' : ''}`}
        ref={titleRef}
        data-path={node.path}
        aria-current={isSelected ? 'true' : undefined}
        draggable={canDrag}
        onClick={() => onSelectFile(node.path, node.name)}
        onDragStart={(e) => onDragStart(e, node.path, node.type, vaultId)}
        onDragEnd={onDragEnd}
        onContextMenu={(e) => onContextMenu(e, node, vaultId)}
        title={node.path}
      >
        <span className="tree-node-name-wrapper nav-file-title-content tree-item-inner">
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
    </li>
  )
}
