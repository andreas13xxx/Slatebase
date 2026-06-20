/**
 * CanvasView — Main container component for rendering Obsidian .canvas files.
 * Manages viewport (zoom/pan), wires CanvasProvider, and orchestrates rendering layers.
 */

import { useCallback, useRef, useState, useEffect } from 'react'
import { CanvasProvider, useCanvasContext } from '../../state/canvasContext'
import type { DirectoryTree } from '../../types'
import type { CanvasNode, CanvasEdge, TextNode, FileNode, LinkNode, GroupNode } from '../../canvas/types'
import { parseCanvas } from '../../canvas'
import { TextNodeRenderer } from './TextNodeRenderer'
import { FileNodeRenderer } from './FileNodeRenderer'
import { LinkNodeRenderer } from './LinkNodeRenderer'
import { GroupNodeRenderer } from './GroupNodeRenderer'
import { EdgeRenderer } from './EdgeRenderer'
import { CanvasMinimap } from './CanvasMinimap'
import { EdgeContextMenu } from './EdgeContextMenu'
import { CanvasContextMenu } from './CanvasContextMenu'
import type { CanvasContextAction } from './CanvasContextMenu'
import { CanvasToolbar } from './CanvasToolbar'
import type { CanvasViewMode } from './CanvasToolbar'
import { CanvasSourceView } from './CanvasSourceView'
import { useViewportCulling } from './useViewportCulling'
import { generateCanvasId } from './canvas-utils'
import './CanvasView.css'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CanvasViewProps {
  vaultId: string
  filePath: string
  /** Raw JSON content of the .canvas file. */
  content: string
  /** Whether the canvas is read-only (no editing). */
  readOnly: boolean
  /** Callback to save changes (receives serialized JSON). */
  onSave: (content: string) => Promise<void>
  /** Callback to open a vault file in a new tab. */
  onFileOpen: (path: string) => void
  /** Directory tree for resolving file references. */
  directoryTree: DirectoryTree | null
  /** Auth token for file previews. */
  token?: string
  /** Callback to save file content. */
  onFileSave?: (filePath: string, content: string) => Promise<void>
}

/**
 * CanvasView wraps the inner canvas with the CanvasProvider.
 */
export function CanvasView(props: CanvasViewProps) {
  return (
    <CanvasProvider content={props.content} readOnly={props.readOnly} onSave={props.onSave}>
      <CanvasViewInner {...props} />
    </CanvasProvider>
  )
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_ZOOM = 0.1
const MAX_ZOOM = 4.0
const ZOOM_STEP = 0.1
const GRID_SIZE = 20

// ─── Inner Component ──────────────────────────────────────────────────────────

function CanvasViewInner({ vaultId, readOnly, onFileOpen, directoryTree, token, onFileSave }: CanvasViewProps) {
  const { state, dispatch, save } = useCanvasContext()
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [showMinimap, setShowMinimap] = useState(true)
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 })
  const [edgeContextMenu, setEdgeContextMenu] = useState<{ edge: CanvasEdge; x: number; y: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetNodeId: string | null } | null>(null)
  const [viewMode, setViewMode] = useState<CanvasViewMode>('visual')
  const panStartRef = useRef<{ x: number; y: number; viewX: number; viewY: number } | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [hasClipboard, setHasClipboard] = useState(false)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editingMode, setEditingMode] = useState<'content' | 'path'>('content')
  const [isDragOver, setIsDragOver] = useState(false)

  const { document, viewport, parseError, dirty, selectedNodeIds, selectedEdgeIds } = state

  // ─── Track container size for viewport culling + minimap ──────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // ─── Clipboard for copy/paste ─────────────────────────────────────────────
  const clipboardRef = useRef<CanvasNode[]>([])

  // ─── Toolbar add-node handlers (center of visible viewport) ───────────────

  const addNodeAtCenter = useCallback((type: 'text' | 'file' | 'link' | 'group') => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = (rect.width / 2) / viewport.zoom - viewport.x
    const cy = (rect.height / 2) / viewport.zoom - viewport.y

    let node: CanvasNode
    switch (type) {
      case 'text':
        node = { id: generateCanvasId(), type: 'text', x: cx - 100, y: cy - 50, width: 200, height: 100, text: '' }
        break
      case 'file':
        node = { id: generateCanvasId(), type: 'file', x: cx - 100, y: cy - 40, width: 200, height: 80, file: '' }
        break
      case 'link':
        node = { id: generateCanvasId(), type: 'link', x: cx - 150, y: cy - 110, width: 300, height: 220, url: 'https://' }
        break
      case 'group':
        node = { id: generateCanvasId(), type: 'group', x: cx - 150, y: cy - 100, width: 300, height: 200, label: 'Gruppe' }
        break
    }
    dispatch({ type: 'ADD_NODE', payload: { node } })
  }, [viewport, dispatch])

  // ─── Keyboard Shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore keyboard shortcuts when focus is inside a textarea or input
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return

      if (e.key === ' ' && !e.repeat) {
        setSpaceHeld(true)
      }
      // Ctrl+Z / Cmd+Z → Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        dispatch({ type: 'UNDO' })
      }
      // Ctrl+Shift+Z / Cmd+Shift+Z → Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        dispatch({ type: 'REDO' })
      }
      // Ctrl+Y → Redo (alternative)
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        dispatch({ type: 'REDO' })
      }
      // Ctrl+S / Cmd+S → Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        void save()
      }
      // Ctrl+C / Cmd+C → Copy selected nodes
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !readOnly) {
        const selected = document?.nodes.filter((n) => selectedNodeIds.has(n.id)) ?? []
        if (selected.length > 0) {
          clipboardRef.current = selected
          setHasClipboard(true)
        }
      }
      // Ctrl+V / Cmd+V → Paste copied nodes
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !readOnly) {
        if (clipboardRef.current.length > 0) {
          const offset = 30
          const newIds: string[] = []
          for (const node of clipboardRef.current) {
            const newNode: CanvasNode = { ...node, id: generateCanvasId(), x: node.x + offset, y: node.y + offset }
            dispatch({ type: 'ADD_NODE', payload: { node: newNode } })
            newIds.push(newNode.id)
          }
          dispatch({ type: 'SELECT_NODES', payload: { nodeIds: newIds } })
        }
      }
      // Ctrl+A / Cmd+A → Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && document) {
        e.preventDefault()
        dispatch({ type: 'SELECT_NODES', payload: { nodeIds: document.nodes.map((n) => n.id) } })
      }
      // Delete / Backspace → Delete selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && !readOnly) {
        const nodeIds = [...selectedNodeIds]
        const edgeIds = [...selectedEdgeIds]
        if (nodeIds.length > 0) {
          dispatch({ type: 'DELETE_NODES', payload: { nodeIds } })
        }
        if (edgeIds.length > 0) {
          dispatch({ type: 'DELETE_EDGES', payload: { edgeIds } })
        }
      }
      // Escape → Deselect
      if (e.key === 'Escape') {
        dispatch({ type: 'DESELECT_ALL' })
        setContextMenu(null)
      }
      // T → Add text node at center
      if (e.key === 't' && !e.ctrlKey && !e.metaKey && !e.altKey && !readOnly) {
        addNodeAtCenter('text')
      }
      // F → Add file node at center (only without modifier)
      if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey && !readOnly) {
        addNodeAtCenter('file')
      }
      // G → Add group at center
      if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey && !readOnly) {
        addNodeAtCenter('group')
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === ' ') {
        setSpaceHeld(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [dispatch, save, readOnly, selectedNodeIds, selectedEdgeIds, document, addNodeAtCenter])

  // ─── Zoom ─────────────────────────────────────────────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Don't zoom when the wheel event originates inside any canvas node
    const target = e.target as HTMLElement
    if (target.closest('.canvas-node')) return

    e.preventDefault()
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom + delta))
    dispatch({ type: 'SET_VIEWPORT', payload: { ...viewport, zoom: newZoom } })
  }, [viewport, dispatch])

  // ─── Pan ──────────────────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Middle mouse button or space+left click for panning
    if (e.button === 1 || (spaceHeld && e.button === 0)) {
      e.preventDefault()
      setIsPanning(true)
      panStartRef.current = { x: e.clientX, y: e.clientY, viewX: viewport.x, viewY: viewport.y }
    }
    // Left click on background → deselect
    if (e.button === 0 && !spaceHeld && e.target === e.currentTarget) {
      dispatch({ type: 'DESELECT_ALL' })
    }
  }, [spaceHeld, viewport, dispatch])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !panStartRef.current) return
    const dx = e.clientX - panStartRef.current.x
    const dy = e.clientY - panStartRef.current.y
    dispatch({
      type: 'SET_VIEWPORT',
      payload: {
        ...viewport,
        x: panStartRef.current.viewX + dx / viewport.zoom,
        y: panStartRef.current.viewY + dy / viewport.zoom,
      },
    })
  }, [isPanning, viewport, dispatch])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
    panStartRef.current = null
  }, [])

  // ─── Double-click → Create new TextNode ───────────────────────────────────

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (readOnly || spaceHeld) return
    // Only trigger on the background (not on nodes)
    if (e.target !== e.currentTarget) return

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    // Convert screen coordinates to canvas coordinates
    const canvasX = (e.clientX - rect.left) / viewport.zoom - viewport.x
    const canvasY = (e.clientY - rect.top) / viewport.zoom - viewport.y

    const newNode: TextNode = {
      id: generateCanvasId(),
      type: 'text',
      x: canvasX - 100, // Center the node at click position
      y: canvasY - 50,
      width: 200,
      height: 100,
      text: '',
    }

    dispatch({ type: 'ADD_NODE', payload: { node: newNode } })
  }, [readOnly, spaceHeld, viewport, dispatch])

  // ─── Context Menu (Right-Click) ──────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    // Find if right-click is on a node
    const target = e.target as HTMLElement
    const nodeEl = target.closest('[data-node-id]') as HTMLElement | null
    const targetNodeId = nodeEl?.dataset['nodeId'] ?? null

    // If right-clicking a node, select it if not already selected
    if (targetNodeId && !selectedNodeIds.has(targetNodeId)) {
      dispatch({ type: 'SELECT_NODES', payload: { nodeIds: [targetNodeId] } })
    }

    setContextMenu({ x: e.clientX, y: e.clientY, targetNodeId })
  }, [selectedNodeIds, dispatch])

  /** Convert screen coordinates to canvas coordinates. */
  const screenToCanvas = useCallback((screenX: number, screenY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (screenX - rect.left) / viewport.zoom - viewport.x,
      y: (screenY - rect.top) / viewport.zoom - viewport.y,
    }
  }, [viewport])

  // ─── Fit to View ──────────────────────────────────────────────────────────

  const fitToView = useCallback(() => {
    if (!document || document.nodes.length === 0 || !containerRef.current) return
    const padding = 50
    const rect = containerRef.current.getBoundingClientRect()

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const node of document.nodes) {
      minX = Math.min(minX, node.x)
      minY = Math.min(minY, node.y)
      maxX = Math.max(maxX, node.x + node.width)
      maxY = Math.max(maxY, node.y + node.height)
    }

    const contentWidth = maxX - minX + padding * 2
    const contentHeight = maxY - minY + padding * 2
    const zoom = Math.min(
      rect.width / contentWidth,
      rect.height / contentHeight,
      1, // Don't zoom in beyond 100%
    )
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    dispatch({
      type: 'SET_VIEWPORT',
      payload: {
        x: -centerX + (rect.width / 2) / zoom,
        y: -centerY + (rect.height / 2) / zoom,
        zoom: Math.max(MIN_ZOOM, zoom),
      },
    })
  }, [document, dispatch])

  /** Handle context menu action. */
  const handleContextMenuAction = useCallback((action: CanvasContextAction) => {
    setContextMenu(null)

    const addPos = contextMenu ? screenToCanvas(contextMenu.x, contextMenu.y) : { x: 0, y: 0 }

    switch (action) {
      case 'edit-node': {
        // Enter edit mode for the targeted node
        if (contextMenu?.targetNodeId) {
          setEditingMode('content')
          setEditingNodeId(contextMenu.targetNodeId)
        }
        break
      }
      case 'edit-file-path': {
        // Enter path-edit mode for the targeted file node
        if (contextMenu?.targetNodeId) {
          setEditingMode('path')
          setEditingNodeId(contextMenu.targetNodeId)
        }
        break
      }
      case 'add-text': {
        const node: TextNode = { id: generateCanvasId(), type: 'text', x: addPos.x - 100, y: addPos.y - 50, width: 200, height: 100, text: '' }
        dispatch({ type: 'ADD_NODE', payload: { node } })
        break
      }
      case 'add-file': {
        const node: FileNode = { id: generateCanvasId(), type: 'file', x: addPos.x - 100, y: addPos.y - 40, width: 200, height: 80, file: '' }
        dispatch({ type: 'ADD_NODE', payload: { node } })
        break
      }
      case 'add-link': {
        const node: LinkNode = { id: generateCanvasId(), type: 'link', x: addPos.x - 150, y: addPos.y - 110, width: 300, height: 220, url: 'https://' }
        dispatch({ type: 'ADD_NODE', payload: { node } })
        break
      }
      case 'add-group': {
        const node: GroupNode = { id: generateCanvasId(), type: 'group', x: addPos.x - 150, y: addPos.y - 100, width: 300, height: 200, label: 'Gruppe' }
        dispatch({ type: 'ADD_NODE', payload: { node } })
        break
      }
      case 'copy': {
        const selected = document?.nodes.filter((n) => selectedNodeIds.has(n.id)) ?? []
        if (selected.length > 0) {
          clipboardRef.current = selected
          setHasClipboard(true)
        }
        break
      }
      case 'paste': {
        if (clipboardRef.current.length > 0) {
          const offset = 30
          const newIds: string[] = []
          for (const node of clipboardRef.current) {
            const newNode: CanvasNode = { ...node, id: generateCanvasId(), x: addPos.x + offset, y: addPos.y + offset }
            dispatch({ type: 'ADD_NODE', payload: { node: newNode } })
            newIds.push(newNode.id)
          }
          dispatch({ type: 'SELECT_NODES', payload: { nodeIds: newIds } })
        }
        break
      }
      case 'duplicate': {
        const selected = document?.nodes.filter((n) => selectedNodeIds.has(n.id)) ?? []
        const newIds: string[] = []
        for (const node of selected) {
          const newNode: CanvasNode = { ...node, id: generateCanvasId(), x: node.x + 30, y: node.y + 30 }
          dispatch({ type: 'ADD_NODE', payload: { node: newNode } })
          newIds.push(newNode.id)
        }
        if (newIds.length > 0) dispatch({ type: 'SELECT_NODES', payload: { nodeIds: newIds } })
        break
      }
      case 'select-all': {
        if (document) dispatch({ type: 'SELECT_NODES', payload: { nodeIds: document.nodes.map((n) => n.id) } })
        break
      }
      case 'fit-view': {
        fitToView()
        break
      }
      case 'undo': {
        dispatch({ type: 'UNDO' })
        break
      }
      case 'redo': {
        dispatch({ type: 'REDO' })
        break
      }
      case 'delete': {
        const nodeIds = [...selectedNodeIds]
        const edgeIds = [...selectedEdgeIds]
        if (nodeIds.length > 0) dispatch({ type: 'DELETE_NODES', payload: { nodeIds } })
        if (edgeIds.length > 0) dispatch({ type: 'DELETE_EDGES', payload: { edgeIds } })
        break
      }
      case 'color-1':
      case 'color-2':
      case 'color-3':
      case 'color-4':
      case 'color-5':
      case 'color-6': {
        const colorNum = action.replace('color-', '')
        for (const nodeId of selectedNodeIds) {
          dispatch({ type: 'UPDATE_NODE_COLOR', payload: { nodeId, color: colorNum } })
        }
        break
      }
      case 'color-none': {
        for (const nodeId of selectedNodeIds) {
          dispatch({ type: 'UPDATE_NODE_COLOR', payload: { nodeId, color: undefined } })
        }
        break
      }
    }
  }, [contextMenu, screenToCanvas, document, selectedNodeIds, selectedEdgeIds, dispatch, fitToView])

  // ─── Zoom handlers for toolbar ────────────────────────────────────────────

  const handleZoomIn = useCallback(() => {
    const newZoom = Math.min(MAX_ZOOM, viewport.zoom + ZOOM_STEP)
    dispatch({ type: 'SET_VIEWPORT', payload: { ...viewport, zoom: newZoom } })
  }, [viewport, dispatch])

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(MIN_ZOOM, viewport.zoom - ZOOM_STEP)
    dispatch({ type: 'SET_VIEWPORT', payload: { ...viewport, zoom: newZoom } })
  }, [viewport, dispatch])

  // ─── Source view apply handler ────────────────────────────────────────────

  const handleApplySource = useCallback((json: string) => {
    const result = parseCanvas(json)
    if (result.success && result.document) {
      dispatch({ type: 'LOAD_CANVAS', payload: { document: result.document } })
    }
  }, [dispatch])

  // ─── Drag-and-Drop from FileExplorer ──────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Accept drops with slatebase path data (from FileExplorer)
    if (e.dataTransfer.types.includes('application/x-slatebase-path')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only handle leave for the container itself, not children
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (readOnly) return

    const filePath = e.dataTransfer.getData('application/x-slatebase-path')
    const fileType = e.dataTransfer.getData('application/x-slatebase-type')
    if (!filePath) return

    // Convert drop position to canvas coordinates
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const canvasX = (e.clientX - rect.left) / viewport.zoom - viewport.x
    const canvasY = (e.clientY - rect.top) / viewport.zoom - viewport.y

    // Create a FileNode at the drop position
    if (fileType === 'file') {
      const node: FileNode = {
        id: generateCanvasId(),
        type: 'file',
        x: canvasX - 100,
        y: canvasY - 50,
        width: 250,
        height: 150,
        file: filePath,
      }
      dispatch({ type: 'ADD_NODE', payload: { node } })
    }
  }, [readOnly, viewport, dispatch])

  // ─── Node content change handlers ─────────────────────────────────────────

  const handleFilePathChange = useCallback((nodeId: string, newPath: string) => {
    dispatch({ type: 'UPDATE_NODE_FILE', payload: { nodeId, file: newPath } })
  }, [dispatch])

  const handleUrlChange = useCallback((nodeId: string, newUrl: string) => {
    dispatch({ type: 'UPDATE_NODE_URL', payload: { nodeId, url: newUrl } })
  }, [dispatch])

  // Auto fit-to-view on initial load
  const hasFitRef = useRef(false)
  useEffect(() => {
    if (document && document.nodes.length > 0 && !hasFitRef.current) {
      hasFitRef.current = true
      // Defer to allow container to measure
      requestAnimationFrame(() => fitToView())
    }
  }, [document, fitToView])

  // ─── Viewport culling + callbacks (must be above early returns per rules-of-hooks) ─

  const allGroupNodes = document ? document.nodes.filter((n) => n.type === 'group') : []
  const allContentNodes = document ? document.nodes.filter((n) => n.type !== 'group') : []
  const groupNodes = useViewportCulling(allGroupNodes, viewport, containerSize.width, containerSize.height)
  const contentNodes = useViewportCulling(allContentNodes, viewport, containerSize.width, containerSize.height)

  /** Minimap navigation handler. */
  const handleMinimapNavigate = useCallback((x: number, y: number) => {
    dispatch({ type: 'SET_VIEWPORT', payload: { ...viewport, x, y } })
  }, [viewport, dispatch])

  /** Edge context menu handlers. */
  const handleEdgeContextMenu = useCallback((edgeId: string, x: number, y: number) => {
    const edge = document?.edges.find((e) => e.id === edgeId)
    if (edge) setEdgeContextMenu({ edge, x, y })
  }, [document])

  const handleEdgeUpdateLabel = useCallback((edgeId: string, label: string) => {
    dispatch({ type: 'UPDATE_EDGE_LABEL', payload: { edgeId, label } })
  }, [dispatch])

  const handleEdgeUpdateArrows = useCallback((edgeId: string, fromEnd: 'none' | 'arrow' | undefined, toEnd: 'none' | 'arrow' | undefined) => {
    dispatch({ type: 'UPDATE_EDGE_ARROWS', payload: { edgeId, fromEnd, toEnd } })
  }, [dispatch])

  const handleEdgeDelete = useCallback((edgeId: string) => {
    dispatch({ type: 'DELETE_EDGES', payload: { edgeIds: [edgeId] } })
  }, [dispatch])

  // ─── Parse Error ──────────────────────────────────────────────────────────

  if (parseError) {
    return (
      <div className="canvas-view canvas-view--error">
        <div className="canvas-view__error-content">
          <h3>Canvas konnte nicht geladen werden</h3>
          <p className="canvas-view__error-message">{parseError}</p>
          <p className="canvas-view__error-hint">Die Datei enthält ungültiges JSON. Öffne sie im Texteditor um den Fehler zu beheben.</p>
        </div>
      </div>
    )
  }

  if (!document) {
    return (
      <div className="canvas-view canvas-view--loading">
        <span className="app-loading-spinner" aria-hidden="true" />
        <span>Canvas laden…</span>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const transform = `scale(${viewport.zoom}) translate(${viewport.x}px, ${viewport.y}px)`
  const cursorClass = isPanning ? 'canvas-view--panning' : spaceHeld ? 'canvas-view--pan-ready' : ''

  return (
    <div className="canvas-view__wrapper">
      {/* Enhanced Toolbar */}
      <CanvasToolbar
        zoom={viewport.zoom}
        dirty={dirty}
        readOnly={readOnly}
        showGrid={showGrid}
        showMinimap={showMinimap}
        canUndo={state.undoStack.length > 0}
        canRedo={state.redoStack.length > 0}
        viewMode={viewMode}
        onAddText={() => addNodeAtCenter('text')}
        onAddFile={() => addNodeAtCenter('file')}
        onAddLink={() => addNodeAtCenter('link')}
        onAddGroup={() => addNodeAtCenter('group')}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitView={fitToView}
        onToggleGrid={() => setShowGrid(!showGrid)}
        onToggleMinimap={() => setShowMinimap(!showMinimap)}
        onUndo={() => dispatch({ type: 'UNDO' })}
        onRedo={() => dispatch({ type: 'REDO' })}
        onSave={() => void save()}
        onSetViewMode={setViewMode}
      />

      {/* Source View Mode */}
      {viewMode === 'source' && document && (
        <CanvasSourceView
          document={document}
          readOnly={readOnly}
          onApplySource={handleApplySource}
        />
      )}

      {/* Visual Canvas (hidden in source mode) */}
      {viewMode === 'visual' && (
        <>
          {/* Canvas container */}
          <div
            ref={containerRef}
            className={`canvas-view ${cursorClass} ${isDragOver ? 'canvas-view--drag-over' : ''}`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            tabIndex={0}
            role="application"
            aria-label="Canvas-Ansicht"
          >
            {/* Grid background */}
            {showGrid && (
              <svg className="canvas-view__grid" aria-hidden="true">
                <defs>
                  <pattern
                    id="canvas-grid"
                    width={GRID_SIZE * viewport.zoom}
                    height={GRID_SIZE * viewport.zoom}
                    patternUnits="userSpaceOnUse"
                    x={(viewport.x * viewport.zoom) % (GRID_SIZE * viewport.zoom)}
                    y={(viewport.y * viewport.zoom) % (GRID_SIZE * viewport.zoom)}
                  >
                    <circle
                      cx={GRID_SIZE * viewport.zoom / 2}
                      cy={GRID_SIZE * viewport.zoom / 2}
                      r="1"
                      className="canvas-view__grid-dot"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#canvas-grid)" />
              </svg>
            )}

            {/* Transformed content layer */}
            <div className="canvas-view__transform-layer" style={{ transform }}>
              {/* SVG layer for edges */}
              <EdgeRenderer
                edges={document.edges}
                nodes={document.nodes}
                selectedEdgeIds={selectedEdgeIds}
                onSelectEdge={(edgeId, additive) => dispatch({ type: 'SELECT_EDGES', payload: { edgeIds: [edgeId], additive } })}
                onEdgeContextMenu={readOnly ? undefined : handleEdgeContextMenu}
                readOnly={readOnly}
              />

              {/* Group nodes (below content nodes) */}
              {groupNodes.map((node) => (
                node.type === 'group' && (
                  <GroupNodeRenderer
                    key={node.id}
                    node={node}
                    selected={selectedNodeIds.has(node.id)}
                    onSelect={(additive) => dispatch({ type: 'SELECT_NODES', payload: { nodeIds: [node.id], additive } })}
                    readOnly={readOnly}
                  />
                )
              ))}

              {/* Content nodes */}
              {contentNodes.map((node) => {
                switch (node.type) {
                  case 'text':
                    return (
                      <TextNodeRenderer
                        key={node.id}
                        node={node}
                        vaultId={vaultId}
                        selected={selectedNodeIds.has(node.id)}
                        onSelect={(additive) => dispatch({ type: 'SELECT_NODES', payload: { nodeIds: [node.id], additive } })}
                        onTextChange={(text) => dispatch({ type: 'UPDATE_NODE_TEXT', payload: { nodeId: node.id, text } })}
                        directoryTree={directoryTree}
                        readOnly={readOnly}
                        token={token}
                        editing={editingNodeId === node.id}
                        onEditEnd={() => setEditingNodeId(null)}
                      />
                    )
                  case 'file':
                    return (
                      <FileNodeRenderer
                        key={node.id}
                        node={node}
                        selected={selectedNodeIds.has(node.id)}
                        onSelect={(additive) => dispatch({ type: 'SELECT_NODES', payload: { nodeIds: [node.id], additive } })}
                        onFileOpen={onFileOpen}
                        onFilePathChange={(newPath) => handleFilePathChange(node.id, newPath)}
                        onFileSave={onFileSave}
                        directoryTree={directoryTree}
                        readOnly={readOnly}
                        editing={editingNodeId === node.id}
                        editPath={editingMode === 'path'}
                        onEditEnd={() => { setEditingNodeId(null); setEditingMode('content') }}
                        vaultId={vaultId}
                        token={token}
                      />
                    )
                  case 'link':
                    return (
                      <LinkNodeRenderer
                        key={node.id}
                        node={node}
                        selected={selectedNodeIds.has(node.id)}
                        onSelect={(additive) => dispatch({ type: 'SELECT_NODES', payload: { nodeIds: [node.id], additive } })}
                        onUrlChange={(newUrl) => handleUrlChange(node.id, newUrl)}
                        readOnly={readOnly}
                        editing={editingNodeId === node.id}
                        onEditEnd={() => setEditingNodeId(null)}
                      />
                    )
                  default:
                    return null
                }
              })}
            </div>
          </div>

          {/* Minimap */}
          <CanvasMinimap
            nodes={document.nodes}
            viewport={viewport}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
            onNavigate={handleMinimapNavigate}
            visible={showMinimap}
          />

          {/* Edge Context Menu */}
          {edgeContextMenu && (
            <EdgeContextMenu
              edge={edgeContextMenu.edge}
              position={{ x: edgeContextMenu.x, y: edgeContextMenu.y }}
              onClose={() => setEdgeContextMenu(null)}
              onUpdateLabel={handleEdgeUpdateLabel}
              onUpdateArrows={handleEdgeUpdateArrows}
              onDelete={handleEdgeDelete}
            />
          )}

          {/* Canvas Context Menu */}
          {contextMenu && (() => {
            const targetNode = contextMenu.targetNodeId
              ? document.nodes.find((n) => n.id === contextMenu.targetNodeId)
              : undefined
            const targetIsMarkdownFile = targetNode?.type === 'file'
              && /\.(md|markdown)$/i.test(targetNode.file)
            return (
              <CanvasContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                targetNodeId={contextMenu.targetNodeId}
                targetIsMarkdownFile={targetIsMarkdownFile}
                readOnly={readOnly}
                canUndo={state.undoStack.length > 0}
                canRedo={state.redoStack.length > 0}
                canPaste={hasClipboard}
                hasSelection={selectedNodeIds.size > 0 || selectedEdgeIds.size > 0}
                onClose={() => setContextMenu(null)}
                onAction={handleContextMenuAction}
              />
            )
          })()}
        </>
      )}
    </div>
  )
}
