/**
 * FileNodeRenderer — Renders a file reference node with rich content preview.
 * - Images: renders the actual image inline
 * - Markdown: fetches and renders a preview of the file content
 * - PDF: shows a PDF icon with filename
 * - Other: shows file icon + name
 * Supports drag/move, resize, double-click to open, and edit mode for path editing.
 */

import { memo, useCallback, useState, useRef, useEffect, useMemo } from 'react'
import { FileText, ImageIcon, AlertTriangle, Film, Music, FileCode } from 'lucide-react'
import type { FileNode } from '../../canvas/types'
import type { DirectoryTree } from '../../types'
import { getCanvasColorClass } from './canvas-utils'
import { useNodeDrag } from './useNodeDrag'
import { useNodeResize } from './useNodeResize'
import { ResizeHandles } from './ResizeHandles'
import { NodeAnchors } from './NodeAnchors'
import { renderSimpleMarkdown } from './markdown-render.tsx'

export interface FileNodeRendererProps {
  node: FileNode
  selected: boolean
  onSelect: (additive: boolean) => void
  onFileOpen: (path: string) => void
  onFilePathChange?: (newPath: string) => void
  directoryTree: DirectoryTree | null
  readOnly: boolean
  /** Whether this node is in edit mode (editing the file path or content). */
  editing?: boolean
  /** When true, edit the file PATH even for markdown files (instead of content). */
  editPath?: boolean
  /** Callback when edit mode should end. */
  onEditEnd?: () => void
  /** Vault ID for constructing preview URLs. */
  vaultId?: string
  /** Auth token for fetching file content. */
  token?: string
  /** Callback to save file content (for inline MD editing). */
  onFileSave?: (filePath: string, content: string) => Promise<void>
}

/** Check if a file exists in the directory tree. */
function fileExistsInTree(tree: DirectoryTree | null, filePath: string): boolean {
  if (!tree) return false
  const normalized = filePath.replace(/\\/g, '/')
  function search(node: DirectoryTree): boolean {
    if (node.path.replace(/\\/g, '/') === normalized) return true
    if (node.children) {
      for (const child of node.children) {
        if (search(child)) return true
      }
    }
    return false
  }
  return search(tree)
}

/** Check file type category. */
function getFileCategory(path: string): 'image' | 'video' | 'audio' | 'pdf' | 'markdown' | 'other' {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  if (['md', 'markdown'].includes(ext)) return 'markdown'
  return 'other'
}

/** Get the icon for a file category. */
function getCategoryIcon(category: ReturnType<typeof getFileCategory>) {
  switch (category) {
    case 'image': return ImageIcon
    case 'video': return Film
    case 'audio': return Music
    case 'pdf': return FileCode
    case 'markdown': return FileText
    default: return FileText
  }
}

export const FileNodeRenderer = memo(function FileNodeRenderer({
  node, selected, onSelect, onFileOpen, onFilePathChange, directoryTree, readOnly,
  editing, editPath, onEditEnd, vaultId, token, onFileSave,
}: FileNodeRendererProps) {
  const colorClass = getCanvasColorClass(node.color)
  const exists = fileExistsInTree(directoryTree, node.file)
  const fileName = node.file.split('/').pop() ?? node.file
  const category = getFileCategory(node.file)
  const Icon = !exists ? AlertTriangle : getCategoryIcon(category)

  // When editing a markdown file, the textarea edits its CONTENT. For every
  // other category — or when path editing is explicitly requested — the input
  // edits the file PATH instead.
  const showPathEditor = !!editPath || category !== 'markdown'

  const [editValue, setEditValue] = useState(node.file)
  const [mdContent, setMdContent] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { onDragStart } = useNodeDrag(node.id, readOnly)
  const { onResizeStart } = useNodeResize(node.id, readOnly)

  // ── File search (path editor) ──────────────────────────────────────────────
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)

  /** Flat list of all file paths in the vault (directories excluded). */
  const allFilePaths = useMemo(() => {
    const out: string[] = []
    const walk = (n: DirectoryTree | null | undefined) => {
      if (!n) return
      if (n.type === 'file') out.push(n.path)
      n.children?.forEach(walk)
    }
    walk(directoryTree)
    return out.sort((a, b) => a.localeCompare(b))
  }, [directoryTree])

  /** Files matching the current query (case-insensitive substring), capped. */
  const suggestions = useMemo(() => {
    const q = editValue.trim().toLowerCase()
    const matches = q === ''
      ? allFilePaths
      : allFilePaths.filter((p) => p.toLowerCase().includes(q))
    return matches.slice(0, 30)
  }, [allFilePaths, editValue])

  // Fetch markdown file content for preview or editing
  useEffect(() => {
    if (category !== 'markdown' || !exists || !vaultId || !token) {
      setMdContent(null)
      return
    }
    let cancelled = false
    const url = `/api/v1/vaults/${vaultId}/files?path=${encodeURIComponent(node.file)}`
    fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed')
        return res.json()
      })
      .then((data: { content?: string }) => {
        if (!cancelled && data.content != null) {
          setMdContent(data.content)
          if (editing && !showPathEditor) setEditValue(data.content)
        }
      })
      .catch(() => {
        if (!cancelled) setMdContent(null)
      })
    return () => { cancelled = true }
  }, [category, exists, vaultId, token, node.file, editing, showPathEditor])

  // Focus the editor when entering edit mode. Deferred via rAF so focus wins
  // the race against the context menu (portal) unmounting in the same commit.
  useEffect(() => {
    if (!editing) return
    const raf = requestAnimationFrame(() => {
      if (showPathEditor) {
        inputRef.current?.focus()
        inputRef.current?.select()
      } else {
        const ta = textareaRef.current
        if (ta) {
          ta.focus()
          ta.setSelectionRange(ta.value.length, ta.value.length)
        }
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [editing, showPathEditor])

  // When entering path-edit mode, seed the buffer with the current path
  // (content-edit mode is seeded by the markdown fetch effect above) and open
  // the file search dropdown.
  useEffect(() => {
    if (editing && showPathEditor) {
      setEditValue(node.file)
      setSuggestionsOpen(true)
      setHighlightIndex(-1)
    } else {
      setSuggestionsOpen(false)
    }
  }, [editing, showPathEditor, node.file])

  useEffect(() => {
    setEditValue(node.file)
  }, [node.file])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || editing) return
    onSelect(e.shiftKey)
    onDragStart(e)
  }, [editing, onSelect, onDragStart])

  const commitEdit = useCallback(() => {
    if (showPathEditor) {
      // Editing the file PATH.
      const trimmed = editValue.trim()
      if (trimmed !== node.file && onFilePathChange) {
        onFilePathChange(trimmed)
      }
    } else {
      // Editing the markdown file CONTENT.
      if (mdContent != null && editValue !== mdContent && onFileSave && vaultId && token) {
        onFileSave(node.file, editValue)
        setMdContent(editValue) // optimistic: keep preview in sync
      }
    }
    onEditEnd?.()
  }, [showPathEditor, editValue, mdContent, node.file, onFilePathChange, onFileSave, vaultId, token, onEditEnd])

  // Prevent mouse events from closing edit mode prematurely
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Enter commits only in the single-line path editor; in the content
    // textarea Enter must insert a newline.
    if (e.key === 'Enter' && showPathEditor) {
      e.preventDefault()
      commitEdit()
    } else if (e.key === 'Escape') {
      // Reset to original value on escape
      if (!showPathEditor && mdContent != null) {
        setEditValue(mdContent)
      } else {
        setEditValue(node.file)
      }
      onEditEnd?.()
    }
  }, [commitEdit, showPathEditor, mdContent, node.file, onEditEnd])

  /** Apply a file path picked from the search dropdown and finish editing. */
  const selectSuggestion = useCallback((path: string) => {
    setEditValue(path)
    setSuggestionsOpen(false)
    if (path !== node.file && onFilePathChange) {
      onFilePathChange(path)
    }
    onEditEnd?.()
  }, [node.file, onFilePathChange, onEditEnd])

  /** Key handling for the path search input (suggestion navigation). */
  const handlePathKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (suggestions.length === 0) return
      setSuggestionsOpen(true)
      setHighlightIndex((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (suggestions.length === 0) return
      setSuggestionsOpen(true)
      setHighlightIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const picked = highlightIndex >= 0 ? suggestions[highlightIndex] : undefined
      if (picked) {
        selectSuggestion(picked)
      } else {
        commitEdit()
      }
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      if (suggestionsOpen) {
        setSuggestionsOpen(false)
      } else {
        setEditValue(node.file)
        onEditEnd?.()
      }
    }
  }, [suggestions, highlightIndex, suggestionsOpen, selectSuggestion, commitEdit, node.file, onEditEnd])

  /** Render the content preview based on file category. */
  const renderContent = () => {
    if (editing) {
      if (!showPathEditor) {
        return (
          <textarea
            ref={textareaRef}
            className="canvas-node__file-md-full-editor"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onPointerDown={handlePointerDown}
            spellCheck={false}
            aria-label="Markdown-Inhalt bearbeiten"
          />
        )
      }
      return (
        <div className="canvas-node__file-edit canvas-node__file-path-edit">
          <label className="canvas-node__edit-label">Datei suchen:</label>
          <div className="canvas-node__file-search">
            <input
              ref={inputRef}
              className="canvas-node__file-input"
              value={editValue}
              onChange={(e) => { setEditValue(e.target.value); setSuggestionsOpen(true); setHighlightIndex(-1) }}
              onFocus={() => setSuggestionsOpen(true)}
              onBlur={commitEdit}
              onKeyDown={handlePathKeyDown}
              onPointerDown={handlePointerDown}
              placeholder="Dateiname oder Pfad…"
              aria-label="Dateipfad bearbeiten"
              autoComplete="off"
            />
            {suggestionsOpen && suggestions.length > 0 && (
              <ul className="canvas-node__file-suggestions" role="listbox">
                {suggestions.map((path, i) => (
                  <li
                    key={path}
                    role="option"
                    aria-selected={i === highlightIndex}
                    className={`canvas-node__file-suggestion${i === highlightIndex ? ' canvas-node__file-suggestion--active' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); selectSuggestion(path) }}
                    onMouseEnter={() => setHighlightIndex(i)}
                    title={path}
                  >
                    <span className="canvas-node__file-suggestion-name">{path.split('/').pop()}</span>
                    {path.includes('/') && (
                      <span className="canvas-node__file-suggestion-dir">{path.slice(0, path.lastIndexOf('/'))}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )
    }

    if (!exists) {
      return (
        <div className="canvas-node__content canvas-node__file-content">
          <AlertTriangle size={16} className="canvas-node__file-icon canvas-node__file-icon--broken" />
          <span className="canvas-node__file-name canvas-node__file-name--broken">{fileName}</span>
        </div>
      )
    }

    if (category === 'image' && vaultId && token) {
      const imgSrc = `/api/v1/vaults/${vaultId}/files?path=${encodeURIComponent(node.file)}&raw=true&token=${encodeURIComponent(token)}`
      return (
        <div className="canvas-node__content canvas-node__file-preview">
          <img
            src={imgSrc}
            alt={fileName}
            className="canvas-node__file-image"
            draggable={false}
          />
        </div>
      )
    }

    if (category === 'markdown' && mdContent != null) {
      return (
        <div className="canvas-node__content canvas-node__file-preview">
          <div className="canvas-node__file-md-rendered">
            {renderSimpleMarkdown(mdContent)}
          </div>
        </div>
      )
    }

    return (
      <div className="canvas-node__content canvas-node__file-content">
        <Icon size={16} className="canvas-node__file-icon" />
        <span className="canvas-node__file-name">{fileName}</span>
        {node.subpath && <span className="canvas-node__file-subpath">{node.subpath}</span>}
      </div>
    )
  }

  return (
    <div
      className={`canvas-node canvas-node--file ${colorClass} ${selected ? 'canvas-node--selected' : ''} ${!exists ? 'canvas-node--broken' : ''} ${editing && showPathEditor ? 'canvas-node--editing-path' : ''}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
      }}
      data-node-id={node.id}
      onMouseDown={handleMouseDown}
      onDoubleClick={() => {
        if (exists && !editing) onFileOpen(node.file)
      }}
      role="button"
      tabIndex={0}
      aria-label={`Dateiknoten: ${fileName}`}
    >
      {renderContent()}
      <ResizeHandles visible={selected && !readOnly} onResizeStart={onResizeStart} />
      <NodeAnchors nodeId={node.id} width={node.width} height={node.height} visible={selected && !readOnly} />
    </div>
  )
})
