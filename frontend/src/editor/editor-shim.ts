import { EditorView } from '@codemirror/view'
import type { EditorState, ChangeSpec, SelectionRange } from '@codemirror/state'
import { EditorSelection } from '@codemirror/state'
import { undo as cmUndo, redo as cmRedo } from '@codemirror/commands'

/**
 * Position type following Obsidian/CM5 conventions.
 * line: 1-indexed, ch: 0-indexed within the line.
 */
export interface Pos {
  line: number
  ch: number
}

/**
 * Interface for the Obsidian-compatible Editor API.
 * Wraps CM6 EditorView with CM5-style position semantics.
 */
export interface IEditor {
  getCursor(where?: 'from' | 'to' | 'head' | 'anchor'): Pos
  setCursor(pos: Pos): void
  getSelection(): string
  replaceSelection(replacement: string): void
  replaceRange(replacement: string, from: Pos, to?: Pos): void
  getRange(from: Pos, to: Pos): string
  getValue(): string
  setValue(content: string): void
  getLine(n: number): string
  lineCount(): number
  lastLine(): number
  getDoc(): { getValue(): string; lineCount(): number }
  somethingSelected(): boolean
  listSelections(): Array<{ anchor: Pos; head: Pos }>
  setSelection(anchor: Pos, head?: Pos): void
  focus(): void
  scrollIntoView(range: { from: Pos; to: Pos }): void
  getScrollInfo(): { top: number; left: number }
  exec(command: string): void
  undo(): void
  redo(): void
  wordAt(pos: Pos): { from: Pos; to: Pos } | null
  transaction(): IEditorTransaction
}

/**
 * Transaction wrapper for batch operations.
 * Accumulates changes and applies them all in one CM6 dispatch.
 */
export interface IEditorTransaction {
  replaceRange(replacement: string, from: Pos, to?: Pos): IEditorTransaction
  setCursor(pos: Pos): IEditorTransaction
  commit(): void
}

/**
 * Convert a Pos (1-indexed line, 0-indexed ch) to a CM6 absolute offset.
 */
export function posToOffset(state: EditorState, pos: Pos): number {
  const line = state.doc.line(pos.line)
  return line.from + pos.ch
}

/**
 * Convert a CM6 absolute offset to a Pos (1-indexed line, 0-indexed ch).
 */
export function offsetToPos(state: EditorState, offset: number): Pos {
  const line = state.doc.lineAt(offset)
  return { line: line.number, ch: offset - line.from }
}

/**
 * EditorShim wraps a CM6 EditorView and provides the Obsidian Editor interface.
 * All IEditor methods delegate to CM6 State/Dispatch.
 */
export class EditorShim implements IEditor {
  private readonly view: EditorView

  constructor(view: EditorView) {
    this.view = view
  }

  /** Get the current EditorState. */
  private get state(): EditorState {
    return this.view.state
  }

  /** Get the primary selection range. */
  private get sel(): SelectionRange {
    return this.state.selection.main
  }

  /**
   * Get cursor position.
   * @param where - 'head' (default), 'anchor', 'from' (min), 'to' (max)
   */
  getCursor(where?: 'from' | 'to' | 'head' | 'anchor'): Pos {
    const sel = this.sel
    let offset: number

    switch (where) {
      case 'from':
        offset = sel.from
        break
      case 'to':
        offset = sel.to
        break
      case 'anchor':
        offset = sel.anchor
        break
      case 'head':
      default:
        offset = sel.head
        break
    }

    return offsetToPos(this.state, offset)
  }

  /**
   * Move the cursor to a specific position, collapsing any selection.
   */
  setCursor(pos: Pos): void {
    const offset = posToOffset(this.state, pos)
    this.view.dispatch({
      selection: EditorSelection.cursor(offset),
    })
  }

  /**
   * Get the currently selected text.
   * Returns empty string if nothing is selected.
   */
  getSelection(): string {
    return this.state.sliceDoc(this.sel.from, this.sel.to)
  }

  /**
   * Replace the current selection with the given text.
   */
  replaceSelection(replacement: string): void {
    this.view.dispatch(this.state.replaceSelection(replacement))
  }

  /**
   * Replace text in the given range.
   * If `to` is omitted, inserts at `from` without replacing anything.
   */
  replaceRange(replacement: string, from: Pos, to?: Pos): void {
    const fromOffset = posToOffset(this.state, from)
    const toOffset = to ? posToOffset(this.state, to) : fromOffset
    this.view.dispatch({
      changes: { from: fromOffset, to: toOffset, insert: replacement },
    })
  }

  /**
   * Get text in the given range.
   */
  getRange(from: Pos, to: Pos): string {
    const fromOffset = posToOffset(this.state, from)
    const toOffset = posToOffset(this.state, to)
    return this.state.sliceDoc(fromOffset, toOffset)
  }

  /**
   * Get the entire document content.
   */
  getValue(): string {
    return this.state.doc.toString()
  }

  /**
   * Replace the entire document content.
   */
  setValue(content: string): void {
    this.view.dispatch({
      changes: { from: 0, to: this.state.doc.length, insert: content },
    })
  }

  /**
   * Get the text of a specific line (1-indexed).
   */
  getLine(n: number): string {
    return this.state.doc.line(n).text
  }

  /**
   * Get the total number of lines in the document.
   */
  lineCount(): number {
    return this.state.doc.lines
  }

  /**
   * Get the number of the last line (same as lineCount for 1-indexed lines).
   */
  lastLine(): number {
    return this.state.doc.lines
  }

  /**
   * Get a document-like object with getValue and lineCount methods.
   * Provides compatibility with plugins expecting a doc object.
   */
  getDoc(): { getValue(): string; lineCount(): number } {
    return {
      getValue: () => this.getValue(),
      lineCount: () => this.lineCount(),
    }
  }

  /**
   * Check whether any text is currently selected.
   */
  somethingSelected(): boolean {
    return this.sel.from !== this.sel.to
  }

  /**
   * List all selection ranges (supports multi-cursor).
   */
  listSelections(): Array<{ anchor: Pos; head: Pos }> {
    return this.state.selection.ranges.map((range) => ({
      anchor: offsetToPos(this.state, range.anchor),
      head: offsetToPos(this.state, range.head),
    }))
  }

  /**
   * Set the editor selection.
   * If head is omitted, creates a cursor at anchor.
   */
  setSelection(anchor: Pos, head?: Pos): void {
    const anchorOffset = posToOffset(this.state, anchor)
    const headOffset = head ? posToOffset(this.state, head) : anchorOffset
    this.view.dispatch({
      selection: EditorSelection.single(anchorOffset, headOffset),
    })
  }

  /**
   * Focus the editor.
   */
  focus(): void {
    this.view.focus()
  }

  /**
   * Scroll the given range into view.
   */
  scrollIntoView(range: { from: Pos; to: Pos }): void {
    const fromOffset = posToOffset(this.state, range.from)
    const toOffset = posToOffset(this.state, range.to)
    this.view.dispatch({
      effects: EditorView.scrollIntoView(
        EditorSelection.range(fromOffset, toOffset)
      ),
    })
  }

  /**
   * Get current scroll position.
   */
  getScrollInfo(): { top: number; left: number } {
    return {
      top: this.view.scrollDOM.scrollTop,
      left: this.view.scrollDOM.scrollLeft,
    }
  }

  /**
   * Execute a named command.
   * Maps known command names to CM6 commands. Unknown commands are no-ops.
   */
  exec(command: string): void {
    switch (command) {
      case 'undo':
        this.undo()
        break
      case 'redo':
        this.redo()
        break
      default:
        // Unknown commands are no-ops for forward compatibility
        break
    }
  }

  /**
   * Undo the last edit.
   */
  undo(): void {
    cmUndo(this.view)
  }

  /**
   * Redo a previously undone edit.
   */
  redo(): void {
    cmRedo(this.view)
  }

  /**
   * Get the word at a given position.
   * Returns null if no word boundary is found at the position.
   */
  wordAt(pos: Pos): { from: Pos; to: Pos } | null {
    const offset = posToOffset(this.state, pos)
    const word = this.state.wordAt(offset)
    if (!word) return null
    return {
      from: offsetToPos(this.state, word.from),
      to: offsetToPos(this.state, word.to),
    }
  }

  /**
   * Create a transaction object for accumulating batch operations.
   * Changes are applied atomically when commit() is called.
   */
  transaction(): IEditorTransaction {
    return new EditorTransaction(this.view)
  }
}

/**
 * EditorTransaction accumulates changes and applies them as a single
 * CM6 dispatch when commit() is called.
 *
 * Changes are tracked as ChangeSpecs and composed so that offsets
 * are relative to the document state before the transaction starts.
 */
class EditorTransaction implements IEditorTransaction {
  private changes: ChangeSpec[] = []
  private cursorPos: number | null = null
  private readonly startState: EditorState
  private readonly view: EditorView

  constructor(view: EditorView) {
    this.view = view
    this.startState = view.state
  }

  /**
   * Queue a replaceRange operation.
   * Offsets are computed against the initial state (before any changes in this transaction).
   */
  replaceRange(replacement: string, from: Pos, to?: Pos): IEditorTransaction {
    const fromOffset = posToOffset(this.startState, from)
    const toOffset = to ? posToOffset(this.startState, to) : fromOffset
    this.changes.push({ from: fromOffset, to: toOffset, insert: replacement })
    return this
  }

  /**
   * Queue a cursor position change.
   * The position is computed against the initial state.
   */
  setCursor(pos: Pos): IEditorTransaction {
    this.cursorPos = posToOffset(this.startState, pos)
    return this
  }

  /**
   * Commit all accumulated changes in a single CM6 dispatch.
   * CM6 handles composing multiple ChangeSpecs correctly.
   */
  commit(): void {
    if (this.changes.length === 0 && this.cursorPos === null) return

    const spec: { changes?: ChangeSpec; selection?: { anchor: number } } = {}

    if (this.changes.length > 0) {
      spec.changes = this.changes
    }

    if (this.cursorPos !== null) {
      // If there are changes, we need to map the cursor position through them
      if (this.changes.length > 0) {
        const changeSet = this.startState.changes(this.changes)
        const mappedPos = changeSet.mapPos(this.cursorPos)
        spec.selection = { anchor: mappedPos }
      } else {
        spec.selection = { anchor: this.cursorPos }
      }
    }

    this.view.dispatch(spec)
  }
}
