/**
 * Canvas context provider — manages canvas state with auto-save.
 * Follows the project pattern: Provider + useContext hook + debounced persistence.
 */

import {
  createContext, useContext, useReducer, useCallback, useRef, useEffect,
  type Dispatch, type ReactNode,
} from 'react'
import React from 'react'
import { canvasReducer, initialCanvasState } from './canvasState'
import type { CanvasState, CanvasAction } from './canvasState'
import { parseCanvas, serializeCanvas } from '../canvas'
import type { CanvasDocument } from '../canvas'

// ─── Context Types ────────────────────────────────────────────────────────────

interface CanvasContextValue {
  state: CanvasState
  dispatch: Dispatch<CanvasAction>
  /** Manually trigger save (e.g., Ctrl+S). */
  save: () => Promise<void>
}

const CanvasContext = createContext<CanvasContextValue | null>(null)

// ─── Provider Props ───────────────────────────────────────────────────────────

interface CanvasProviderProps {
  /** Raw JSON content of the .canvas file. */
  content: string
  /** Whether the canvas is read-only. */
  readOnly: boolean
  /** Callback to persist changes. Receives serialized JSON. */
  onSave: (content: string) => Promise<void>
  /** React children. */
  children: ReactNode
}

/** Auto-save debounce delay in ms. */
const AUTO_SAVE_DELAY = 2000

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * CanvasProvider manages canvas document state, undo/redo, and auto-save.
 * Parses the initial content on mount and serializes/saves on changes.
 */
export function CanvasProvider({ content, readOnly, onSave, children }: CanvasProviderProps) {
  const [state, dispatch] = useReducer(canvasReducer, initialCanvasState)
  const onSaveRef = useRef(onSave)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSavingRef = useRef(false)
  const lastContentRef = useRef(content)

  // Keep onSave ref current
  useEffect(() => { onSaveRef.current = onSave })

  // Parse content on mount or when content changes externally
  useEffect(() => {
    if (content === lastContentRef.current && state.document !== null) return
    lastContentRef.current = content

    const result = parseCanvas(content)
    if (result.success && result.document) {
      dispatch({ type: 'LOAD_CANVAS', payload: { document: result.document } })
    } else {
      const errorMsg = result.errors?.map((e) => e.message).join('; ') ?? 'Unknown parse error'
      dispatch({ type: 'LOAD_CANVAS_ERROR', payload: { error: errorMsg } })
    }
  }, [content]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Performs the actual save operation. */
  const performSave = useCallback(async (doc: CanvasDocument) => {
    if (isSavingRef.current) return
    isSavingRef.current = true
    try {
      const serialized = serializeCanvas(doc)
      lastContentRef.current = serialized
      await onSaveRef.current(serialized)
      dispatch({ type: 'MARK_SAVED' })
    } catch (err) {
      console.error('Canvas auto-save failed:', err)
    } finally {
      isSavingRef.current = false
    }
  }, [])

  // Auto-save when dirty (debounced)
  useEffect(() => {
    if (!state.dirty || readOnly || !state.document) return

    const doc = state.document
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void performSave(doc)
    }, AUTO_SAVE_DELAY)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.dirty, state.document, readOnly, performSave])

  /** Manual save (Ctrl+S). */
  const save = useCallback(async () => {
    if (!state.document || readOnly) return
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    await performSave(state.document)
  }, [state.document, readOnly, performSave])

  const value: CanvasContextValue = { state, dispatch, save }

  return React.createElement(CanvasContext.Provider, { value }, children)
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Access the canvas context. Must be used within a CanvasProvider.
 */
export function useCanvasContext(): CanvasContextValue {
  const ctx = useContext(CanvasContext)
  if (!ctx) throw new Error('useCanvasContext must be used within a CanvasProvider')
  return ctx
}
