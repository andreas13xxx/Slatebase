/**
 * Canvas state management — reducer with undo/redo for the canvas editor.
 * Follows the project pattern: separate reducer per feature with discriminated union actions.
 */

import type { CanvasDocument, CanvasNode, CanvasEdge } from '../canvas/types'

// ─── Viewport ─────────────────────────────────────────────────────────────────

/** Viewport state for zoom/pan. */
export interface CanvasViewport {
  /** Pan offset X (in canvas coordinates). */
  x: number
  /** Pan offset Y (in canvas coordinates). */
  y: number
  /** Zoom level (1.0 = 100%). Range: 0.1–4.0. */
  zoom: number
}

// ─── Canvas State ─────────────────────────────────────────────────────────────

/** Full canvas editor state. */
export interface CanvasState {
  /** The current canvas document. */
  document: CanvasDocument | null
  /** IDs of currently selected nodes. */
  selectedNodeIds: Set<string>
  /** IDs of currently selected edges. */
  selectedEdgeIds: Set<string>
  /** Current viewport (zoom/pan). */
  viewport: CanvasViewport
  /** Whether there are unsaved changes. */
  dirty: boolean
  /** Parse error if document failed to load. */
  parseError: string | null
  /** Undo stack (previous states). */
  undoStack: CanvasDocument[]
  /** Redo stack (states after undo). */
  redoStack: CanvasDocument[]
}

/** Maximum undo/redo history entries. */
const MAX_HISTORY = 50

/** Initial canvas state. */
export const initialCanvasState: CanvasState = {
  document: null,
  selectedNodeIds: new Set(),
  selectedEdgeIds: new Set(),
  viewport: { x: 0, y: 0, zoom: 1 },
  dirty: false,
  parseError: null,
  undoStack: [],
  redoStack: [],
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type CanvasAction =
  | { type: 'LOAD_CANVAS'; payload: { document: CanvasDocument } }
  | { type: 'LOAD_CANVAS_ERROR'; payload: { error: string } }
  | { type: 'MOVE_NODE'; payload: { nodeId: string; x: number; y: number } }
  | { type: 'MOVE_NODES'; payload: { moves: Array<{ nodeId: string; x: number; y: number }> } }
  | { type: 'RESIZE_NODE'; payload: { nodeId: string; width: number; height: number; x?: number; y?: number } }
  | { type: 'ADD_NODE'; payload: { node: CanvasNode } }
  | { type: 'DELETE_NODES'; payload: { nodeIds: string[] } }
  | { type: 'UPDATE_NODE_TEXT'; payload: { nodeId: string; text: string } }
  | { type: 'UPDATE_NODE_COLOR'; payload: { nodeId: string; color: string | undefined } }
  | { type: 'ADD_EDGE'; payload: { edge: CanvasEdge } }
  | { type: 'DELETE_EDGES'; payload: { edgeIds: string[] } }
  | { type: 'UPDATE_EDGE_LABEL'; payload: { edgeId: string; label: string } }
  | { type: 'UPDATE_EDGE_ARROWS'; payload: { edgeId: string; fromEnd?: 'none' | 'arrow'; toEnd?: 'none' | 'arrow' } }
  | { type: 'UPDATE_NODE_FILE'; payload: { nodeId: string; file: string } }
  | { type: 'UPDATE_NODE_URL'; payload: { nodeId: string; url: string } }
  | { type: 'SELECT_NODES'; payload: { nodeIds: string[]; additive?: boolean } }
  | { type: 'SELECT_EDGES'; payload: { edgeIds: string[]; additive?: boolean } }
  | { type: 'DESELECT_ALL' }
  | { type: 'SET_VIEWPORT'; payload: CanvasViewport }
  | { type: 'MARK_SAVED' }
  | { type: 'UNDO' }
  | { type: 'REDO' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pushes current document to undo stack, clears redo stack.
 * Returns new undo/redo stacks.
 */
function pushUndo(state: CanvasState): { undoStack: CanvasDocument[]; redoStack: CanvasDocument[] } {
  if (!state.document) return { undoStack: state.undoStack, redoStack: state.redoStack }
  const undoStack = [...state.undoStack, state.document]
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift()
  }
  return { undoStack, redoStack: [] }
}

/**
 * Updates a node in the document's nodes array.
 */
function updateNode(doc: CanvasDocument, nodeId: string, updater: (node: CanvasNode) => CanvasNode): CanvasDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => n.id === nodeId ? updater(n) : n),
  }
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

/**
 * Canvas state reducer. Handles all canvas mutations with undo/redo support.
 */
export function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case 'LOAD_CANVAS': {
      return {
        ...initialCanvasState,
        document: action.payload.document,
        viewport: state.viewport, // Preserve viewport on reload
      }
    }

    case 'LOAD_CANVAS_ERROR': {
      return {
        ...initialCanvasState,
        parseError: action.payload.error,
      }
    }

    case 'MOVE_NODE': {
      if (!state.document) return state
      const { nodeId, x, y } = action.payload
      const { undoStack, redoStack } = pushUndo(state)
      const document = updateNode(state.document, nodeId, (n) => ({ ...n, x, y }))
      return { ...state, document, dirty: true, undoStack, redoStack }
    }

    case 'MOVE_NODES': {
      if (!state.document) return state
      const { moves } = action.payload
      const { undoStack, redoStack } = pushUndo(state)
      const moveMap = new Map(moves.map((m) => [m.nodeId, m]))
      const document: CanvasDocument = {
        ...state.document,
        nodes: state.document.nodes.map((n) => {
          const move = moveMap.get(n.id)
          return move ? { ...n, x: move.x, y: move.y } : n
        }),
      }
      return { ...state, document, dirty: true, undoStack, redoStack }
    }

    case 'RESIZE_NODE': {
      if (!state.document) return state
      const { nodeId, width, height, x, y } = action.payload
      const { undoStack, redoStack } = pushUndo(state)
      const document = updateNode(state.document, nodeId, (n) => ({
        ...n,
        width: Math.max(100, width),
        height: Math.max(60, height),
        ...(x !== undefined ? { x } : {}),
        ...(y !== undefined ? { y } : {}),
      }))
      return { ...state, document, dirty: true, undoStack, redoStack }
    }

    case 'ADD_NODE': {
      if (!state.document) return state
      const { undoStack, redoStack } = pushUndo(state)
      const document: CanvasDocument = {
        ...state.document,
        nodes: [...state.document.nodes, action.payload.node],
      }
      return { ...state, document, dirty: true, undoStack, redoStack, selectedNodeIds: new Set([action.payload.node.id]) }
    }

    case 'DELETE_NODES': {
      if (!state.document) return state
      const { nodeIds } = action.payload
      const nodeIdSet = new Set(nodeIds)
      const { undoStack, redoStack } = pushUndo(state)
      const document: CanvasDocument = {
        ...state.document,
        nodes: state.document.nodes.filter((n) => !nodeIdSet.has(n.id)),
        // Remove edges connected to deleted nodes
        edges: state.document.edges.filter((e) => !nodeIdSet.has(e.fromNode) && !nodeIdSet.has(e.toNode)),
      }
      const selectedNodeIds = new Set([...state.selectedNodeIds].filter((id) => !nodeIdSet.has(id)))
      return { ...state, document, dirty: true, undoStack, redoStack, selectedNodeIds }
    }

    case 'UPDATE_NODE_TEXT': {
      if (!state.document) return state
      const { nodeId, text } = action.payload
      const { undoStack, redoStack } = pushUndo(state)
      const document = updateNode(state.document, nodeId, (n) => {
        if (n.type === 'text') return { ...n, text }
        return n
      })
      return { ...state, document, dirty: true, undoStack, redoStack }
    }

    case 'UPDATE_NODE_COLOR': {
      if (!state.document) return state
      const { nodeId, color } = action.payload
      const { undoStack, redoStack } = pushUndo(state)
      const document = updateNode(state.document, nodeId, (n) => ({ ...n, color }))
      return { ...state, document, dirty: true, undoStack, redoStack }
    }

    case 'UPDATE_NODE_FILE': {
      if (!state.document) return state
      const { nodeId, file } = action.payload
      const { undoStack, redoStack } = pushUndo(state)
      const document = updateNode(state.document, nodeId, (n) => {
        if (n.type === 'file') return { ...n, file }
        return n
      })
      return { ...state, document, dirty: true, undoStack, redoStack }
    }

    case 'UPDATE_NODE_URL': {
      if (!state.document) return state
      const { nodeId, url } = action.payload
      const { undoStack, redoStack } = pushUndo(state)
      const document = updateNode(state.document, nodeId, (n) => {
        if (n.type === 'link') return { ...n, url }
        return n
      })
      return { ...state, document, dirty: true, undoStack, redoStack }
    }

    case 'ADD_EDGE': {
      if (!state.document) return state
      const { undoStack, redoStack } = pushUndo(state)
      const document: CanvasDocument = {
        ...state.document,
        edges: [...state.document.edges, action.payload.edge],
      }
      return { ...state, document, dirty: true, undoStack, redoStack }
    }

    case 'DELETE_EDGES': {
      if (!state.document) return state
      const { edgeIds } = action.payload
      const edgeIdSet = new Set(edgeIds)
      const { undoStack, redoStack } = pushUndo(state)
      const document: CanvasDocument = {
        ...state.document,
        edges: state.document.edges.filter((e) => !edgeIdSet.has(e.id)),
      }
      const selectedEdgeIds = new Set([...state.selectedEdgeIds].filter((id) => !edgeIdSet.has(id)))
      return { ...state, document, dirty: true, undoStack, redoStack, selectedEdgeIds }
    }

    case 'UPDATE_EDGE_LABEL': {
      if (!state.document) return state
      const { edgeId, label } = action.payload
      const { undoStack, redoStack } = pushUndo(state)
      const document: CanvasDocument = {
        ...state.document,
        edges: state.document.edges.map((e) => e.id === edgeId ? { ...e, label } : e),
      }
      return { ...state, document, dirty: true, undoStack, redoStack }
    }

    case 'UPDATE_EDGE_ARROWS': {
      if (!state.document) return state
      const { edgeId, fromEnd, toEnd } = action.payload
      const { undoStack, redoStack } = pushUndo(state)
      const document: CanvasDocument = {
        ...state.document,
        edges: state.document.edges.map((e) => {
          if (e.id !== edgeId) return e
          return {
            ...e,
            ...(fromEnd !== undefined ? { fromEnd } : {}),
            ...(toEnd !== undefined ? { toEnd } : {}),
          }
        }),
      }
      return { ...state, document, dirty: true, undoStack, redoStack }
    }

    case 'SELECT_NODES': {
      const { nodeIds, additive } = action.payload
      const selectedNodeIds = additive
        ? new Set([...state.selectedNodeIds, ...nodeIds])
        : new Set(nodeIds)
      return { ...state, selectedNodeIds, selectedEdgeIds: additive ? state.selectedEdgeIds : new Set() }
    }

    case 'SELECT_EDGES': {
      const { edgeIds, additive } = action.payload
      const selectedEdgeIds = additive
        ? new Set([...state.selectedEdgeIds, ...edgeIds])
        : new Set(edgeIds)
      return { ...state, selectedEdgeIds, selectedNodeIds: additive ? state.selectedNodeIds : new Set() }
    }

    case 'DESELECT_ALL': {
      return { ...state, selectedNodeIds: new Set(), selectedEdgeIds: new Set() }
    }

    case 'SET_VIEWPORT': {
      return { ...state, viewport: action.payload }
    }

    case 'MARK_SAVED': {
      return { ...state, dirty: false }
    }

    case 'UNDO': {
      if (!state.document || state.undoStack.length === 0) return state
      const undoStack = [...state.undoStack]
      const previous = undoStack.pop()!
      const redoStack = [...state.redoStack, state.document]
      if (redoStack.length > MAX_HISTORY) redoStack.shift()
      return { ...state, document: previous, undoStack, redoStack, dirty: true }
    }

    case 'REDO': {
      if (!state.document || state.redoStack.length === 0) return state
      const redoStack = [...state.redoStack]
      const next = redoStack.pop()!
      const undoStack = [...state.undoStack, state.document]
      if (undoStack.length > MAX_HISTORY) undoStack.shift()
      return { ...state, document: next, undoStack, redoStack, dirty: true }
    }

    default:
      return state
  }
}
