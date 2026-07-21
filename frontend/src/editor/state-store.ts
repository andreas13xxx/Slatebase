import { EditorState } from '@codemirror/state'
import { history } from '@codemirror/commands'

/**
 * Entry representing a tab's stored editor state.
 */
export interface EditorStateEntry {
  /** CM6 EditorState instance (contains doc, selections, history, extensions). */
  state: EditorState
  /** Scroll position (pixels from top). */
  scrollTop: number
  /** Scroll position (pixels from left). */
  scrollLeft: number
}

/**
 * Module-level store for per-tab EditorState instances.
 * Same pattern as recentFilesStore, favoritesStore — not in React state.
 * CM6 manages its own state internally.
 */
const editorStates = new Map<string, EditorStateEntry>()

/**
 * History extension configured with 300ms new-group delay.
 * Used internally to ensure updateEditorContent preserves undo history.
 */
export const editorHistoryExtension = history({ newGroupDelay: 300 })

/**
 * Get stored EditorState for a tab (or null if first open).
 */
export function getEditorState(tabId: string): EditorStateEntry | null {
  return editorStates.get(tabId) ?? null
}

/**
 * Save current editor state for a tab.
 */
export function saveEditorState(tabId: string, entry: EditorStateEntry): void {
  editorStates.set(tabId, entry)
}

/**
 * Remove state when tab is closed (memory cleanup).
 */
export function removeEditorState(tabId: string): void {
  editorStates.delete(tabId)
}

/**
 * Update document content without clearing undo history.
 * Uses a CM6 transaction to replace the entire document content,
 * which preserves the undo stack (content is inserted as a transaction, not a state replace).
 *
 * If no state exists for the given tabId, this is a no-op.
 */
export function updateEditorContent(tabId: string, newContent: string): void {
  const entry = editorStates.get(tabId)
  if (!entry) {
    return
  }

  const { state } = entry
  const transaction = state.update({
    changes: { from: 0, to: state.doc.length, insert: newContent }
  })

  editorStates.set(tabId, {
    ...entry,
    state: transaction.state
  })
}
