import type { EditorState, TransactionSpec } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

/**
 * All available formatting actions (maps to toolbar + command palette).
 */
export type EditorFormattingAction =
  | 'heading1' | 'heading2' | 'heading3'
  | 'bold' | 'italic' | 'strikethrough' | 'code'
  | 'link' | 'bulletList' | 'numberedList' | 'task'
  | 'quote' | 'horizontalRule' | 'table'
  | 'toggleLineNumbers'

/**
 * Imperative handle exposing editor operations to parent components
 * (toolbar, command palette, plugin compat layer).
 */
export interface IEditorHandle {
  /** Execute a transaction on the editor (for toolbar actions). */
  dispatch(tr: TransactionSpec): void
  /** Get current editor state. */
  getState(): EditorState
  /** Get the EditorView instance (for plugin compat). */
  getView(): EditorView | null
  /** Focus the editor. */
  focus(): void
  /** Apply a formatting command (bold, italic, heading, etc.). */
  applyFormatting(action: EditorFormattingAction): void
  /** Perform undo. */
  undo(): void
  /** Perform redo. */
  redo(): void
  /** Insert text at current cursor position. */
  insertAtCursor(text: string): void
}
