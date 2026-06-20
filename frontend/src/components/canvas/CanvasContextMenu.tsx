/**
 * CanvasContextMenu — Context menu for canvas background and node right-click.
 * Provides actions: add nodes, paste, select all, fit view (background),
 * and edit, duplicate, color, delete (node-specific).
 */

import { memo, useCallback } from 'react'
import {
  Type, FileText, Link2, SquareDashed, Copy, ClipboardPaste,
  Trash2, Palette, MousePointerSquareDashed, Maximize,
  Undo2, Redo2, Pencil,
} from 'lucide-react'
import { ContextMenu } from '../ContextMenu'
import type { ContextMenuItem } from '../ContextMenu'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CanvasContextMenuProps {
  /** Context menu position (viewport coordinates). */
  x: number
  y: number
  /** Whether menu targets a selected node (node-specific actions). */
  targetNodeId: string | null
  /** Whether the targeted node is a markdown file node (enables path editing). */
  targetIsMarkdownFile?: boolean
  /** Whether the canvas is read-only. */
  readOnly: boolean
  /** Whether undo is available. */
  canUndo: boolean
  /** Whether redo is available. */
  canRedo: boolean
  /** Whether clipboard has content for pasting. */
  canPaste: boolean
  /** Whether there are selected nodes to copy/delete. */
  hasSelection: boolean
  /** Close the context menu. */
  onClose: () => void
  /** Action handler. */
  onAction: (action: CanvasContextAction) => void
}

export type CanvasContextAction =
  | 'add-text'
  | 'add-file'
  | 'add-link'
  | 'add-group'
  | 'edit-node'
  | 'edit-file-path'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'select-all'
  | 'fit-view'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'color-1'
  | 'color-2'
  | 'color-3'
  | 'color-4'
  | 'color-5'
  | 'color-6'
  | 'color-none'

// ─── Component ────────────────────────────────────────────────────────────────

export const CanvasContextMenu = memo(function CanvasContextMenu({
  x, y, targetNodeId, targetIsMarkdownFile, readOnly, canUndo, canRedo, canPaste, hasSelection, onClose, onAction,
}: CanvasContextMenuProps) {

  const handleSelect = useCallback((action: string) => {
    onAction(action as CanvasContextAction)
  }, [onAction])

  const items: ContextMenuItem[] = []

  if (targetNodeId) {
    // ─── Node Context Menu ────────────────────────────────────────────────
    if (!readOnly) {
      items.push(
        { id: 'edit-node', label: 'Bearbeiten', icon: <Pencil size={14} /> },
      )
      // Markdown file nodes: "Bearbeiten" edits the content, so offer a
      // dedicated action to change the referenced file path.
      if (targetIsMarkdownFile) {
        items.push(
          { id: 'edit-file-path', label: 'Dateipfad ändern', icon: <FileText size={14} /> },
        )
      }
      items.push(
        { id: 'separator-0', label: '', separator: true },
        { id: 'copy', label: 'Kopieren', icon: <Copy size={14} /> },
        { id: 'duplicate', label: 'Duplizieren', icon: <Copy size={14} /> },
        { id: 'separator-1', label: '', separator: true },
        { id: 'color-1', label: '🔴 Rot', icon: <Palette size={14} /> },
        { id: 'color-2', label: '🟠 Orange', icon: <Palette size={14} /> },
        { id: 'color-3', label: '🟡 Gelb', icon: <Palette size={14} /> },
        { id: 'color-4', label: '🟢 Grün', icon: <Palette size={14} /> },
        { id: 'color-5', label: '🔵 Blau', icon: <Palette size={14} /> },
        { id: 'color-6', label: '🟣 Lila', icon: <Palette size={14} /> },
        { id: 'color-none', label: '⚪ Keine Farbe', icon: <Palette size={14} /> },
        { id: 'separator-2', label: '', separator: true },
        { id: 'delete', label: 'Löschen', icon: <Trash2 size={14} /> },
      )
    } else {
      items.push(
        { id: 'copy', label: 'Kopieren', icon: <Copy size={14} /> },
      )
    }
  } else {
    // ─── Background Context Menu ──────────────────────────────────────────
    if (!readOnly) {
      items.push(
        { id: 'add-text', label: 'Textknoten hinzufügen', icon: <Type size={14} /> },
        { id: 'add-file', label: 'Dateiknoten hinzufügen', icon: <FileText size={14} /> },
        { id: 'add-link', label: 'Linkknoten hinzufügen', icon: <Link2 size={14} /> },
        { id: 'add-group', label: 'Gruppe hinzufügen', icon: <SquareDashed size={14} /> },
        { id: 'separator-add', label: '', separator: true },
        { id: 'paste', label: 'Einfügen', icon: <ClipboardPaste size={14} />, disabled: !canPaste },
        { id: 'separator-edit', label: '', separator: true },
        { id: 'undo', label: 'Rückgängig', icon: <Undo2 size={14} />, disabled: !canUndo },
        { id: 'redo', label: 'Wiederherstellen', icon: <Redo2 size={14} />, disabled: !canRedo },
        { id: 'separator-view', label: '', separator: true },
      )
    }

    items.push(
      { id: 'select-all', label: 'Alles auswählen', icon: <MousePointerSquareDashed size={14} />, disabled: readOnly },
      { id: 'fit-view', label: 'Alles einpassen', icon: <Maximize size={14} /> },
    )

    if (!readOnly && hasSelection) {
      items.push(
        { id: 'separator-delete', label: '', separator: true },
        { id: 'delete', label: 'Auswahl löschen', icon: <Trash2 size={14} /> },
      )
    }
  }

  return (
    <ContextMenu
      x={x}
      y={y}
      items={items}
      onClose={onClose}
      onSelect={handleSelect}
    />
  )
})
