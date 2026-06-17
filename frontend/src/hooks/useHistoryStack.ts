import { useCallback, useRef, useState } from 'react'

/** A single entry in the undo/redo history stack. */
export interface HistoryEntry {
  text: string
  selectionStart: number
  selectionEnd: number
}

/** Return value of the useHistoryStack hook. */
export interface UseHistoryStackReturn {
  /** Saves the current state before an action (pushes to undo stack, clears redo). */
  pushState(entry: HistoryEntry): void
  /** Restores the previous state from the undo stack. */
  undo(): HistoryEntry | null
  /** Restores the next state from the redo stack. */
  redo(): HistoryEntry | null
  /** Whether there is an undo entry available. */
  canUndo: boolean
  /** Whether there is a redo entry available. */
  canRedo: boolean
  /** Clears both stacks (call on file switch). */
  clear(): void
}

/**
 * Custom hook providing undo/redo history for the editor.
 *
 * Uses useRef for the stacks (fast push/pop without re-renders on every mutation)
 * and useState for the boolean flags (triggers re-renders for button disable state).
 *
 * @param maxEntries Maximum number of entries in the undo stack (default 100). FIFO eviction of oldest.
 */
export function useHistoryStack(maxEntries = 100): UseHistoryStackReturn {
  const undoStackRef = useRef<HistoryEntry[]>([])
  const redoStackRef = useRef<HistoryEntry[]>([])

  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const pushState = useCallback((entry: HistoryEntry) => {
    const stack = undoStackRef.current
    stack.push(entry)

    // FIFO eviction: remove oldest if exceeding max
    if (stack.length > maxEntries) {
      stack.splice(0, stack.length - maxEntries)
    }

    // Clear redo on new action
    redoStackRef.current = []

    setCanUndo(true)
    setCanRedo(false)
  }, [maxEntries])

  const undo = useCallback((): HistoryEntry | null => {
    const undoStack = undoStackRef.current
    if (undoStack.length === 0) {
      return null
    }

    const entry = undoStack.pop()!
    redoStackRef.current.push(entry)

    setCanUndo(undoStack.length > 0)
    setCanRedo(true)

    return entry
  }, [])

  const redo = useCallback((): HistoryEntry | null => {
    const redoStack = redoStackRef.current
    if (redoStack.length === 0) {
      return null
    }

    const entry = redoStack.pop()!
    undoStackRef.current.push(entry)

    setCanUndo(true)
    setCanRedo(redoStack.length > 0)

    return entry
  }, [])

  const clear = useCallback(() => {
    undoStackRef.current = []
    redoStackRef.current = []
    setCanUndo(false)
    setCanRedo(false)
  }, [])

  return { pushState, undo, redo, canUndo, canRedo, clear }
}
