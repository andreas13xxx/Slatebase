/**
 * EditorShim — Obsidian-compatible Editor API emulation.
 *
 * Provides the Obsidian Editor interface that plugins use to:
 * - Read/write editor content (getValue, setValue, getLine, setLine, lineCount)
 * - Manipulate cursor/selection (getCursor, setCursor, getSelection, replaceSelection, replaceRange)
 * - Query editor state (getRange, lastLine, getDoc, somethingSelected, hasFocus)
 * - Undo/Redo, scrolling, focus management
 *
 * Backend priority:
 * 1. CM6 EditorView (if available via getActiveEditorView from plugin-extensions)
 * 2. Textarea fallback (for legacy plain-text mode)
 * 3. Internal string buffer (when no editor is mounted)
 *
 * Plugins access the editor via:
 * - `app.workspace.activeEditor?.editor` (MarkdownView pattern)
 * - The `editor` parameter in editorCallback commands
 *
 * @module editor-shim
 */

// CM6 modules backing the editor operations below. These are static imports:
// the same modules are already pulled into the bundle by CodeMirrorEditor and
// install-globals, so importing them dynamically bought no code splitting (the
// bundler reported it as INEFFECTIVE_DYNAMIC_IMPORT) and only made synchronous
// Obsidian APIs — undo, redo, exec, scrollIntoView — resolve a microtask late.
// Aliased: this module declares its own Obsidian-shaped `EditorSelection`.
import { EditorView } from '@codemirror/view'
import { EditorSelection as CmEditorSelection } from '@codemirror/state'
import * as CmCommands from '@codemirror/commands'

// Note: We import the getter function from plugin-extensions to access
// the active CM6 EditorView without creating a circular dependency.
// The import is deferred to avoid module initialization ordering issues.
let getEditorViewFn: (() => import('@codemirror/view').EditorView | null) | null = null

/**
 * Set the EditorView accessor function.
 * Called once during plugin system initialization to wire the dependency.
 */
export function setEditorViewAccessor(fn: () => import('@codemirror/view').EditorView | null): void {
  getEditorViewFn = fn
}

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * EditorPosition — Line/character position in the editor (0-indexed).
 * Matches Obsidian's EditorPosition interface.
 */
export interface EditorPosition {
  line: number
  ch: number
}

/**
 * EditorRange — A range defined by two positions.
 */
export interface EditorRange {
  from: EditorPosition
  to: EditorPosition
}

/**
 * EditorSelection — A selection with anchor and head.
 */
export interface EditorSelection {
  anchor: EditorPosition
  head: EditorPosition
}

/**
 * EditorChange — A single change in a transaction.
 */
export interface EditorChange {
  from: EditorPosition
  to?: EditorPosition
  text: string
}

/**
 * EditorTransaction — A batch of changes to apply atomically.
 */
export interface EditorTransaction {
  replaceSelection?: string
  selections?: Array<{ anchor: EditorPosition; head?: EditorPosition }>
  changes?: EditorChange[]
  selection?: { anchor: EditorPosition; head?: EditorPosition }
}

/**
 * IEditor — Obsidian-compatible Editor interface.
 * Full subset of the methods plugins commonly use.
 */
export interface IEditor {
  getDoc(): IEditor
  refresh(): void
  getValue(): string
  setValue(value: string): void
  getLine(line: number): string
  setLine(line: number, text: string): void
  lineCount(): number
  lastLine(): number
  getCursor(which?: 'from' | 'to' | 'head' | 'anchor'): EditorPosition
  setCursor(pos: EditorPosition | number, ch?: number): void
  getSelection(): string
  somethingSelected(): boolean
  replaceSelection(text: string): void
  getRange(from: EditorPosition, to: EditorPosition): string
  replaceRange(text: string, from: EditorPosition, to?: EditorPosition): void
  wordAt(pos: EditorPosition): EditorRange | null
  transaction(tx: EditorTransaction): void
  scrollIntoView(range: EditorRange, center?: boolean): void
  scrollTo(x?: number | null, y?: number | null): void
  getScrollInfo(): { top: number; left: number }
  focus(): void
  blur(): void
  hasFocus(): boolean
  listSelections(): EditorSelection[]
  setSelection(anchor: EditorPosition, head?: EditorPosition): void
  setSelections(selections: Array<{ anchor: EditorPosition; head?: EditorPosition }>, main?: number): void
  posToOffset(pos: EditorPosition): number
  offsetToPos(offset: number): EditorPosition
  undo(): void
  redo(): void
  exec(command: string): void
  toggleMarkdownFormatting(type: string): void
  toggleBulletList(): void
  toggleNumberList(): void
  toggleCheckList(checked?: boolean): void
  indentList(): void
  unindentList(): void
  processLines<T>(
    read: (line: number, lineText: string) => T | null,
    write: (line: number, lineText: string, value: T | null) => { from: EditorPosition; to?: EditorPosition; text: string } | void,
    ignoreEmpty?: boolean,
  ): void
}

// ─── EditorShim Implementation ─────────────────────────────────────────────────

/**
 * EditorShim — Dual-backend editor providing the Obsidian Editor API.
 *
 * Priority: CM6 EditorView > Textarea > Internal buffer.
 * When CM6 is available, all operations route through CM6's transaction system
 * for proper undo history, syntax highlighting updates, and extension awareness.
 */
export class EditorShim implements IEditor {
  private textarea: HTMLTextAreaElement | null
  private buffer: string

  constructor(textarea: HTMLTextAreaElement | null = null) {
    this.textarea = textarea
    this.buffer = textarea?.value ?? ''
  }

  /**
   * Update the wrapped textarea reference.
   * Called when the active editor changes.
   */
  setTextarea(textarea: HTMLTextAreaElement | null): void {
    this.textarea = textarea
    if (textarea) {
      this.buffer = textarea.value
    }
  }

  // ─── CM6 Access Helper ───────────────────────────────────────────────────

  /** Get the active CM6 EditorView, or null if unavailable. */
  private getCM6(): import('@codemirror/view').EditorView | null {
    return getEditorViewFn?.() ?? null
  }

  // ─── Obsidian Editor API ─────────────────────────────────────────────────

  /** Returns itself (Obsidian compat: editor.getDoc() === editor). */
  getDoc(): IEditor {
    return this
  }

  /** Refresh the editor display. No-op for CM6 (auto-updates). */
  refresh(): void {
    // CM6 auto-refreshes; no-op
  }

  /** Get the full editor content. */
  getValue(): string {
    const cm = this.getCM6()
    if (cm) return cm.state.doc.toString()
    return this.textarea?.value ?? this.buffer
  }

  /** Set the full editor content. */
  setValue(value: string): void {
    const cm = this.getCM6()
    if (cm) {
      cm.dispatch({
        changes: { from: 0, to: cm.state.doc.length, insert: value },
      })
      return
    }
    if (this.textarea) {
      this.textarea.value = value
      this.textarea.dispatchEvent(new Event('input', { bubbles: true }))
    }
    this.buffer = value
  }

  /** Get a single line (0-indexed). */
  getLine(line: number): string {
    const cm = this.getCM6()
    if (cm) {
      if (line < 0 || line >= cm.state.doc.lines) return ''
      return cm.state.doc.line(line + 1).text // CM6 is 1-indexed
    }
    const lines = this.getValue().split('\n')
    return lines[line] ?? ''
  }

  /** Set a single line (0-indexed). */
  setLine(line: number, text: string): void {
    const cm = this.getCM6()
    if (cm) {
      if (line < 0 || line >= cm.state.doc.lines) return
      const lineObj = cm.state.doc.line(line + 1)
      cm.dispatch({
        changes: { from: lineObj.from, to: lineObj.to, insert: text },
      })
      return
    }
    const lines = this.getValue().split('\n')
    if (line >= 0 && line < lines.length) {
      lines[line] = text
      this.setValue(lines.join('\n'))
    }
  }

  /** Get total line count. */
  lineCount(): number {
    const cm = this.getCM6()
    if (cm) return cm.state.doc.lines
    return this.getValue().split('\n').length
  }

  /** Get the last line index. */
  lastLine(): number {
    return this.lineCount() - 1
  }

  /** Get cursor position. */
  getCursor(which?: 'from' | 'to' | 'head' | 'anchor'): EditorPosition {
    const cm = this.getCM6()
    if (cm) {
      const sel = cm.state.selection.main
      let offset: number
      if (which === 'from') {
        offset = sel.from
      } else if (which === 'to') {
        offset = sel.to
      } else if (which === 'anchor') {
        offset = sel.anchor
      } else {
        offset = sel.head
      }
      return this.cm6OffsetToPos(cm, offset)
    }

    if (!this.textarea) return { line: 0, ch: 0 }
    let offset: number
    if (which === 'from') {
      offset = Math.min(this.textarea.selectionStart, this.textarea.selectionEnd)
    } else if (which === 'to') {
      offset = Math.max(this.textarea.selectionStart, this.textarea.selectionEnd)
    } else if (which === 'anchor') {
      offset = this.textarea.selectionStart
    } else {
      offset = this.textarea.selectionEnd
    }
    return this.offsetToPos(offset)
  }

  /** Set cursor position. */
  setCursor(pos: EditorPosition | number, ch?: number): void {
    let editorPos: EditorPosition
    if (typeof pos === 'number') {
      editorPos = { line: pos, ch: ch ?? 0 }
    } else {
      editorPos = pos
    }

    const cm = this.getCM6()
    if (cm) {
      const offset = this.cm6PosToOffset(cm, editorPos)
      cm.dispatch({ selection: { anchor: offset, head: offset } })
      return
    }

    const offset = this.posToOffset(editorPos)
    if (this.textarea) {
      this.textarea.selectionStart = offset
      this.textarea.selectionEnd = offset
    }
  }

  /** Get selected text. */
  getSelection(): string {
    const cm = this.getCM6()
    if (cm) {
      return cm.state.sliceDoc(cm.state.selection.main.from, cm.state.selection.main.to)
    }
    if (!this.textarea) return ''
    return this.getValue().slice(this.textarea.selectionStart, this.textarea.selectionEnd)
  }

  /** Whether there is a non-empty selection. */
  somethingSelected(): boolean {
    const cm = this.getCM6()
    if (cm) return !cm.state.selection.main.empty
    if (!this.textarea) return false
    return this.textarea.selectionStart !== this.textarea.selectionEnd
  }

  /** Replace the current selection with text. */
  replaceSelection(text: string): void {
    const cm = this.getCM6()
    if (cm) {
      cm.dispatch(cm.state.replaceSelection(text))
      return
    }
    if (!this.textarea) {
      this.buffer += text
      return
    }
    const start = this.textarea.selectionStart
    const end = this.textarea.selectionEnd
    const value = this.getValue()
    const newValue = value.slice(0, start) + text + value.slice(end)
    this.textarea.value = newValue
    this.buffer = newValue
    const newCursorPos = start + text.length
    this.textarea.selectionStart = newCursorPos
    this.textarea.selectionEnd = newCursorPos
    this.textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }

  /** Get text in a range. */
  getRange(from: EditorPosition, to: EditorPosition): string {
    const cm = this.getCM6()
    if (cm) {
      const startOffset = this.cm6PosToOffset(cm, from)
      const endOffset = this.cm6PosToOffset(cm, to)
      return cm.state.sliceDoc(startOffset, endOffset)
    }
    const startOffset = this.posToOffset(from)
    const endOffset = this.posToOffset(to)
    return this.getValue().slice(startOffset, endOffset)
  }

  /** Replace text in a range. */
  replaceRange(text: string, from: EditorPosition, to?: EditorPosition): void {
    const cm = this.getCM6()
    if (cm) {
      const startOffset = this.cm6PosToOffset(cm, from)
      const endOffset = to ? this.cm6PosToOffset(cm, to) : startOffset
      cm.dispatch({
        changes: { from: startOffset, to: endOffset, insert: text },
      })
      return
    }
    const startOffset = this.posToOffset(from)
    const endOffset = to ? this.posToOffset(to) : startOffset
    const value = this.getValue()
    const newValue = value.slice(0, startOffset) + text + value.slice(endOffset)
    if (this.textarea) {
      this.textarea.value = newValue
      const newCursorPos = startOffset + text.length
      this.textarea.selectionStart = newCursorPos
      this.textarea.selectionEnd = newCursorPos
      this.textarea.dispatchEvent(new Event('input', { bubbles: true }))
    }
    this.buffer = newValue
  }

  /** Get the word at position. */
  wordAt(pos: EditorPosition): EditorRange | null {
    const line = this.getLine(pos.line)
    if (!line || pos.ch > line.length) return null
    let start = pos.ch
    let end = pos.ch
    while (start > 0 && /\w/.test(line[start - 1]!)) start--
    while (end < line.length && /\w/.test(line[end]!)) end++
    if (start === end) return null
    return { from: { line: pos.line, ch: start }, to: { line: pos.line, ch: end } }
  }

  /** Execute a transaction. */
  transaction(tx: EditorTransaction): void {
    if (tx.changes) {
      // Apply changes in reverse offset order to preserve positions
      const sorted = [...tx.changes].sort((a, b) => {
        return this.posToOffset(b.from) - this.posToOffset(a.from)
      })
      for (const change of sorted) {
        this.replaceRange(change.text, change.from, change.to)
      }
    }
    if (tx.replaceSelection !== undefined) {
      this.replaceSelection(tx.replaceSelection)
    }
    if (tx.selection) {
      this.setSelection(tx.selection.anchor, tx.selection.head)
    }
    if (tx.selections && tx.selections.length > 0) {
      this.setSelections(tx.selections)
    }
  }

  /** Scroll position into view. */
  scrollIntoView(range: EditorRange, _center?: boolean): void {
    const cm = this.getCM6()
    if (cm) {
      const from = this.cm6PosToOffset(cm, range.from)
      const to = this.cm6PosToOffset(cm, range.to)
      // Use CM6's scrollIntoView effect from @codemirror/view
      const sel = CmEditorSelection.range(from, to)
      cm.dispatch({ effects: EditorView.scrollIntoView(sel) })
      return
    }
    this.textarea?.focus()
  }

  /** Scroll to a specific position. */
  scrollTo(x?: number | null, y?: number | null): void {
    const cm = this.getCM6()
    if (cm) {
      if (y != null) cm.scrollDOM.scrollTop = y
      if (x != null) cm.scrollDOM.scrollLeft = x
      return
    }
    if (this.textarea) {
      if (y != null) this.textarea.scrollTop = y
      if (x != null) this.textarea.scrollLeft = x
    }
  }

  /** Get current scroll information. */
  getScrollInfo(): { top: number; left: number } {
    const cm = this.getCM6()
    if (cm) {
      return { top: cm.scrollDOM.scrollTop, left: cm.scrollDOM.scrollLeft }
    }
    return {
      top: this.textarea?.scrollTop ?? 0,
      left: this.textarea?.scrollLeft ?? 0,
    }
  }

  /** Focus the editor. */
  focus(): void {
    const cm = this.getCM6()
    if (cm) { cm.focus(); return }
    this.textarea?.focus()
  }

  /** Blur the editor. */
  blur(): void {
    const cm = this.getCM6()
    if (cm) { cm.contentDOM.blur(); return }
    this.textarea?.blur()
  }

  /** Whether the editor has focus. */
  hasFocus(): boolean {
    const cm = this.getCM6()
    if (cm) return cm.hasFocus
    return document.activeElement === this.textarea
  }

  /** List selections (CM6 supports multi-cursor). */
  listSelections(): EditorSelection[] {
    const cm = this.getCM6()
    if (cm) {
      return cm.state.selection.ranges.map((r) => ({
        anchor: this.cm6OffsetToPos(cm, r.anchor),
        head: this.cm6OffsetToPos(cm, r.head),
      }))
    }
    const from = this.getCursor('from')
    const to = this.getCursor('to')
    return [{ anchor: from, head: to }]
  }

  /** Set a single selection (anchor + optional head). */
  setSelection(anchor: EditorPosition, head?: EditorPosition): void {
    const cm = this.getCM6()
    if (cm) {
      const anchorOffset = this.cm6PosToOffset(cm, anchor)
      const headOffset = head ? this.cm6PosToOffset(cm, head) : anchorOffset
      cm.dispatch({ selection: { anchor: anchorOffset, head: headOffset } })
      return
    }
    const anchorOffset = this.posToOffset(anchor)
    const headOffset = head ? this.posToOffset(head) : anchorOffset
    if (this.textarea) {
      this.textarea.selectionStart = Math.min(anchorOffset, headOffset)
      this.textarea.selectionEnd = Math.max(anchorOffset, headOffset)
    }
  }

  /** Set multiple selections (multi-cursor). Falls back to the first range for textarea. */
  setSelections(selections: Array<{ anchor: EditorPosition; head?: EditorPosition }>, main?: number): void {
    if (selections.length === 0) return
    const cm = this.getCM6()
    if (cm) {
      const ranges = selections.map((sel) => {
        const anchorOffset = this.cm6PosToOffset(cm, sel.anchor)
        const headOffset = sel.head ? this.cm6PosToOffset(cm, sel.head) : anchorOffset
        return CmEditorSelection.range(anchorOffset, headOffset)
      })
      cm.dispatch({ selection: CmEditorSelection.create(ranges, main) })
      return
    }
    const sel = selections[main ?? 0] ?? selections[0]!
    this.setSelection(sel.anchor, sel.head)
  }

  /** Convert a position to a character offset. */
  posToOffset(pos: EditorPosition): number {
    const cm = this.getCM6()
    if (cm) return this.cm6PosToOffset(cm, pos)
    const lines = this.getValue().split('\n')
    let offset = 0
    for (let i = 0; i < pos.line && i < lines.length; i++) {
      offset += lines[i]!.length + 1
    }
    offset += Math.min(pos.ch, (lines[pos.line] ?? '').length)
    return offset
  }

  /** Convert a character offset to a position. */
  offsetToPos(offset: number): EditorPosition {
    const cm = this.getCM6()
    if (cm) return this.cm6OffsetToPos(cm, offset)
    const value = this.getValue()
    let line = 0
    let ch = 0
    let currentOffset = 0
    for (let i = 0; i < value.length && currentOffset < offset; i++) {
      if (value[i] === '\n') {
        line++
        ch = 0
      } else {
        ch++
      }
      currentOffset++
    }
    return { line, ch }
  }

  /** Undo the last change. */
  undo(): void {
    const cm = this.getCM6()
    if (cm) {
      CmCommands.undo(cm)
      return
    }
    // Textarea has no undo API — no-op
  }

  /** Redo the last undone change. */
  redo(): void {
    const cm = this.getCM6()
    if (cm) {
      CmCommands.redo(cm)
      return
    }
  }

  /** Execute a named editor command. */
  exec(command: string): void {
    const cm = this.getCM6()
    if (!cm) return
    // Map Obsidian command names to CM6 commands
    const cmdMap: Record<string, (view: EditorView) => boolean> = {
      goUp: CmCommands.cursorLineUp,
      goDown: CmCommands.cursorLineDown,
      goLeft: CmCommands.cursorCharLeft,
      goRight: CmCommands.cursorCharRight,
      goStart: CmCommands.cursorDocStart,
      goEnd: CmCommands.cursorDocEnd,
      goWordLeft: CmCommands.cursorGroupLeft,
      goWordRight: CmCommands.cursorGroupRight,
      indentMore: CmCommands.indentMore,
      indentLess: CmCommands.indentLess,
      newlineAndIndent: CmCommands.insertNewlineAndIndent,
      deleteLine: CmCommands.deleteLine,
      swapLineUp: CmCommands.moveLineUp,
      swapLineDown: CmCommands.moveLineDown,
    }
    const fn = cmdMap[command]
    if (fn) fn(cm)
  }

  /** Toggle inline markdown formatting (bold/italic/highlight/strikethrough/math) around the selection. */
  toggleMarkdownFormatting(type: string): void {
    const markers: Record<string, [string, string]> = {
      bold: ['**', '**'],
      italic: ['*', '*'],
      highlight: ['==', '=='],
      strikethrough: ['~~', '~~'],
      math: ['$', '$'],
      code: ['`', '`'],
    }
    const pair = markers[type]
    if (!pair) return
    this.toggleWrap(pair[0], pair[1])
  }

  /** Wrap/unwrap the current selection with the given marker pair, toggling on repeated use. */
  private toggleWrap(before: string, after: string): void {
    const fromOff = this.posToOffset(this.getCursor('from'))
    const toOff = this.posToOffset(this.getCursor('to'))
    const beforeLen = before.length
    const afterLen = after.length
    const value = this.getValue()

    const selText = value.slice(fromOff, toOff)
    const preText = value.slice(Math.max(0, fromOff - beforeLen), fromOff)
    const postText = value.slice(toOff, toOff + afterLen)

    // Selection itself contains the markers (e.g. "**bold**" is selected) — unwrap.
    if (selText.length >= beforeLen + afterLen && selText.startsWith(before) && selText.endsWith(after)) {
      const inner = selText.slice(beforeLen, selText.length - afterLen)
      this.replaceRange(inner, this.offsetToPos(fromOff), this.offsetToPos(toOff))
      this.setSelection(this.offsetToPos(fromOff), this.offsetToPos(fromOff + inner.length))
      return
    }

    // Markers surround the selection — unwrap.
    if (preText === before && postText === after) {
      this.replaceRange(selText, this.offsetToPos(fromOff - beforeLen), this.offsetToPos(toOff + afterLen))
      this.setSelection(this.offsetToPos(fromOff - beforeLen), this.offsetToPos(fromOff - beforeLen + selText.length))
      return
    }

    // Not wrapped — wrap. With no selection this inserts an empty pair and places the cursor between them.
    this.replaceRange(before + selText + after, this.offsetToPos(fromOff), this.offsetToPos(toOff))
    this.setSelection(this.offsetToPos(fromOff + beforeLen), this.offsetToPos(toOff + beforeLen))
  }

  /** Toggle a "- " bullet prefix on each selected line. */
  toggleBulletList(): void {
    const fromLine = this.getCursor('from').line
    const toLine = this.getCursor('to').line
    const bulletRe = /^(\s*)([-*+])\s+/
    let allBulleted = true
    for (let i = fromLine; i <= toLine; i++) {
      if (!bulletRe.test(this.getLine(i))) { allBulleted = false; break }
    }
    for (let i = fromLine; i <= toLine; i++) {
      const line = this.getLine(i)
      if (allBulleted) {
        this.setLine(i, line.replace(bulletRe, '$1'))
      } else if (!bulletRe.test(line)) {
        const indent = line.match(/^\s*/)?.[0] ?? ''
        this.setLine(i, `${indent}- ${line.slice(indent.length)}`)
      }
    }
  }

  /** Toggle a "1. " numbered prefix on each selected line, renumbering sequentially. */
  toggleNumberList(): void {
    const fromLine = this.getCursor('from').line
    const toLine = this.getCursor('to').line
    const numRe = /^(\s*)\d+\.\s+/
    let allNumbered = true
    for (let i = fromLine; i <= toLine; i++) {
      if (!numRe.test(this.getLine(i))) { allNumbered = false; break }
    }
    let n = 1
    for (let i = fromLine; i <= toLine; i++) {
      const line = this.getLine(i)
      if (allNumbered) {
        this.setLine(i, line.replace(numRe, '$1'))
      } else {
        const indent = line.match(/^\s*/)?.[0] ?? ''
        const rest = numRe.test(line) ? line.replace(numRe, '') : line.slice(indent.length)
        this.setLine(i, `${indent}${n}. ${rest}`)
        n++
      }
    }
  }

  /** Toggle a "- [ ] " / "- [x] " checklist prefix on each selected line. */
  toggleCheckList(checked?: boolean): void {
    const fromLine = this.getCursor('from').line
    const toLine = this.getCursor('to').line
    const checkRe = /^(\s*)([-*+])\s+\[[ xX]\]\s+/
    const bulletRe = /^(\s*)([-*+])\s+/
    let allChecked = true
    for (let i = fromLine; i <= toLine; i++) {
      if (!checkRe.test(this.getLine(i))) { allChecked = false; break }
    }
    const mark = checked ? 'x' : ' '
    for (let i = fromLine; i <= toLine; i++) {
      const line = this.getLine(i)
      if (allChecked) {
        this.setLine(i, line.replace(checkRe, '$1'))
      } else if (checkRe.test(line)) {
        this.setLine(i, line.replace(checkRe, (_m, indent, bullet) => `${indent}${bullet} [${mark}] `))
      } else if (bulletRe.test(line)) {
        this.setLine(i, line.replace(bulletRe, (_m, indent, bullet) => `${indent}${bullet} [${mark}] `))
      } else {
        const indent = line.match(/^\s*/)?.[0] ?? ''
        this.setLine(i, `${indent}- [${mark}] ${line.slice(indent.length)}`)
      }
    }
  }

  /** Indent the selected lines by one level. */
  indentList(): void {
    const cm = this.getCM6()
    if (cm) { CmCommands.indentMore(cm); return }
    const fromLine = this.getCursor('from').line
    const toLine = this.getCursor('to').line
    for (let i = fromLine; i <= toLine; i++) {
      this.setLine(i, '\t' + this.getLine(i))
    }
  }

  /** Unindent the selected lines by one level. */
  unindentList(): void {
    const cm = this.getCM6()
    if (cm) { CmCommands.indentLess(cm); return }
    const fromLine = this.getCursor('from').line
    const toLine = this.getCursor('to').line
    for (let i = fromLine; i <= toLine; i++) {
      const line = this.getLine(i)
      if (line.startsWith('\t')) {
        this.setLine(i, line.slice(1))
      } else if (/^ {1,4}/.test(line)) {
        this.setLine(i, line.replace(/^ {1,4}/, ''))
      }
    }
  }

  /** Process lines: read values, then write changes. `ignoreEmpty` skips empty lines for both passes. */
  processLines<T>(
    read: (line: number, lineText: string) => T | null,
    write: (line: number, lineText: string, value: T | null) => EditorChange | void,
    ignoreEmpty?: boolean,
  ): void {
    const count = this.lineCount()
    const values: Array<T | null> = []
    for (let i = 0; i < count; i++) {
      const lineText = this.getLine(i)
      values.push(ignoreEmpty && lineText.length === 0 ? null : read(i, lineText))
    }
    // Apply writes in reverse order to preserve offsets
    for (let i = count - 1; i >= 0; i--) {
      const lineText = this.getLine(i)
      if (ignoreEmpty && lineText.length === 0) continue
      const change = write(i, lineText, values[i] ?? null)
      if (change) {
        this.replaceRange(change.text, change.from, change.to)
      }
    }
  }

  // ─── CM6 Position Helpers ──────────────────────────────────────────────────

  /** Convert EditorPosition to CM6 offset. */
  private cm6PosToOffset(view: import('@codemirror/view').EditorView, pos: EditorPosition): number {
    const lineNum = Math.min(pos.line + 1, view.state.doc.lines)
    const line = view.state.doc.line(Math.max(1, lineNum))
    return Math.min(line.from + pos.ch, line.to)
  }

  /** Convert CM6 offset to EditorPosition. */
  private cm6OffsetToPos(view: import('@codemirror/view').EditorView, offset: number): EditorPosition {
    const clampedOffset = Math.max(0, Math.min(offset, view.state.doc.length))
    const line = view.state.doc.lineAt(clampedOffset)
    return { line: line.number - 1, ch: clampedOffset - line.from }
  }
}
