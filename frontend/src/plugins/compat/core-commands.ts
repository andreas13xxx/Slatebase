/**
 * core-commands — Obsidian's built-in `editor:*` commands.
 *
 * Real Obsidian ships a set of core commands (Toggle bold, Insert wikilink, Cycle
 * list/checklist, ...) that plugins commonly invoke via
 * `app.commands.executeCommandById('editor:toggle-code')` to reuse Obsidian's own
 * formatting logic instead of reimplementing it. Slatebase's CommandRegistry only
 * ever held commands plugins register themselves via `addCommand`, so any plugin
 * relying on these IDs found nothing — `executeCommandById` silently returns
 * `false` (see AppShim.commands.executeCommandById) and the button does nothing,
 * with no error to explain why.
 *
 * This registers every `editor:*` core command that only needs the `IEditor`
 * document API (formatting, lists, headings, tables, ...) under the `editor`
 * plugin namespace, so `commandRegistry.getCommand('editor:toggle-code')` resolves
 * exactly like a real Obsidian install. `editor:*` commands that need broader app
 * context (save-file, search, follow-link, toggle-source, ...) are registered by
 * `core-commands-app.ts` instead — see that module for the split rationale.
 *
 * A handful of real commands have no Slatebase equivalent at all (context menu,
 * code folding — Slatebase's CM6 setup has no folding extension configured,
 * spellcheck/readable-line-length settings, multi-pane focus). Those are
 * registered as literal no-ops so `executeCommandById` finds them (matching real
 * Obsidian, where a command can exist but not always be actionable) instead of
 * silently failing to resolve at all.
 *
 * @module core-commands
 */

import type { ICommandRegistry } from './command-registry'
import type { IEditor } from './editor-shim'
import type { Locale } from '../../i18n'
import { translateCoreCommandName } from './core-command-i18n'

/** Insert `before`/`after` around the current selection (or at the cursor if empty). */
function wrapSelection(editor: IEditor, before: string, after: string): void {
  const from = editor.getCursor('from')
  const to = editor.getCursor('to')
  const selected = editor.getRange(from, to)
  editor.replaceRange(before + selected + after, from, to)

  const fromOff = editor.posToOffset(from)
  if (selected.length === 0) {
    editor.setCursor(editor.offsetToPos(fromOff + before.length))
  } else {
    editor.setSelection(editor.offsetToPos(fromOff), editor.offsetToPos(fromOff + before.length + selected.length + after.length))
  }
}

/** Toggle a "> " blockquote prefix on each selected line. */
function toggleBlockquote(editor: IEditor): void {
  const fromLine = editor.getCursor('from').line
  const toLine = editor.getCursor('to').line
  const quoteRe = /^(\s*)>\s?/
  let allQuoted = true
  for (let i = fromLine; i <= toLine; i++) {
    if (!quoteRe.test(editor.getLine(i))) { allQuoted = false; break }
  }
  for (let i = fromLine; i <= toLine; i++) {
    const line = editor.getLine(i)
    editor.setLine(i, allQuoted ? line.replace(quoteRe, '$1') : `> ${line}`)
  }
}

/** Move the current line up or down by one, keeping the cursor on the moved line. */
function swapLine(editor: IEditor, direction: -1 | 1): void {
  const cursor = editor.getCursor('head')
  const target = cursor.line + direction
  if (target < 0 || target >= editor.lineCount()) return
  const currentLine = editor.getLine(cursor.line)
  const targetLine = editor.getLine(target)
  editor.setLine(cursor.line, targetLine)
  editor.setLine(target, currentLine)
  editor.setCursor({ line: target, ch: cursor.ch })
}

/** Strip common inline/block markdown syntax from the current selection. */
function clearFormatting(editor: IEditor): void {
  const from = editor.getCursor('from')
  const to = editor.getCursor('to')
  const text = editor.getRange(from, to)
  if (!text) return
  const cleaned = text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/(\*\*\*|___)(.+?)\1/g, '$2')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_]+?)_(?!_)/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/==(.+?)==/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
  editor.replaceRange(cleaned, from, to)
}

function insertTable(editor: IEditor): void {
  const from = editor.getCursor('from')
  const to = editor.getCursor('to')
  const table = '| Column 1 | Column 2 |\n| -------- | -------- |\n|          |          |\n'
  editor.replaceRange(table, from, to)
  editor.setCursor({ line: from.line + 2, ch: 2 })
}

function insertMathBlock(editor: IEditor): void {
  const from = editor.getCursor('from')
  const to = editor.getCursor('to')
  editor.replaceRange('$$\n\n$$', from, to)
  editor.setCursor({ line: from.line + 1, ch: 0 })
}

function insertCallout(editor: IEditor): void {
  const from = editor.getCursor('from')
  const to = editor.getCursor('to')
  const selected = editor.getRange(from, to)
  const body = selected ? selected.split('\n').map(l => `> ${l}`).join('\n') : '> '
  editor.replaceRange(`> [!note]\n${body}`, from, to)
}

function insertLink(editor: IEditor): void {
  const from = editor.getCursor('from')
  const to = editor.getCursor('to')
  const selected = editor.getRange(from, to)
  const text = `[${selected}]()`
  editor.replaceRange(text, from, to)
  const fromOff = editor.posToOffset(from)
  editor.setCursor(editor.offsetToPos(selected.length === 0 ? fromOff + 1 : fromOff + text.length - 1))
}

function insertHorizontalRule(editor: IEditor): void {
  editor.replaceRange('\n\n---\n\n', editor.getCursor('to'))
}

function insertCodeblock(editor: IEditor): void {
  wrapSelection(editor, '```\n', '\n```')
}

/** Insert a `[^n]` footnote marker at the cursor and its `[^n]: ` definition at the document end. */
function insertFootnote(editor: IEditor): void {
  const existing = [...editor.getValue().matchAll(/\[\^(\d+)\]/g)].map(m => parseInt(m[1]!, 10))
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1
  editor.replaceRange(`[^${next}]`, editor.getCursor('to'))

  const lastLine = editor.lastLine()
  editor.replaceRange(`\n\n[^${next}]: `, { line: lastLine, ch: editor.getLine(lastLine).length })
  const newLastLine = editor.lastLine()
  editor.setCursor({ line: newLastLine, ch: editor.getLine(newLastLine).length })
}

/** Delete the contiguous non-blank block of lines around the cursor. */
function deleteParagraph(editor: IEditor): void {
  const cursorLine = editor.getCursor('head').line
  let start = cursorLine
  while (start > 0 && editor.getLine(start - 1).trim() !== '') start--
  let end = cursorLine
  const last = editor.lastLine()
  while (end < last && editor.getLine(end + 1).trim() !== '') end++

  const from = { line: start, ch: 0 }
  const to = end < last ? { line: end + 1, ch: 0 } : { line: end, ch: editor.getLine(end).length }
  editor.replaceRange('', from, to)
}

/** Add an extra cursor one line above/below the current head, at the same column. */
function addCursor(editor: IEditor, direction: -1 | 1): void {
  const head = editor.getCursor('head')
  const targetLine = head.line + direction
  if (targetLine < 0 || targetLine > editor.lastLine()) return
  const targetCh = Math.min(head.ch, editor.getLine(targetLine).length)
  editor.setSelections([...editor.listSelections(), { anchor: { line: targetLine, ch: targetCh } }])
}

/** Set (or remove, for level 0) the heading level of the current line. */
function setHeadingLevel(editor: IEditor, level: number): void {
  const line = editor.getCursor('head').line
  const text = editor.getLine(line)
  const stripped = text.replace(/^\s*#{1,6}\s+/, '')
  editor.setLine(line, level === 0 ? stripped : `${'#'.repeat(level)} ${stripped}`)
}

/** Cycle the current line's heading level: none → 1 → 2 → ... → 6 → none. */
function cycleHeading(editor: IEditor): void {
  const line = editor.getCursor('head').line
  const match = editor.getLine(line).match(/^\s*(#{1,6})\s+/)
  const current = match ? match[1]!.length : 0
  setHeadingLevel(editor, current >= 6 ? 0 : current + 1)
}

/** Prompt for new heading text and replace it in place, keeping the "#" prefix. */
function renameHeading(editor: IEditor): void {
  const line = editor.getCursor('head').line
  const match = editor.getLine(line).match(/^(\s*#{1,6}\s+)(.*)$/)
  if (!match) return
  const [, prefix, headingText] = match
  const next = window.prompt('Rename heading', headingText)
  if (next === null) return
  editor.setLine(line, prefix + next)
}

// ─── Table editing ──────────────────────────────────────────────────────────
// Obsidian's table commands operate on the pipe-table block surrounding the
// cursor. These are string-only operations against IEditor's line API — no
// CM6 internals needed.

interface TableContext {
  startLine: number
  endLine: number
  rowIndex: number
  colIndex: number
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map(c => c.trim())
}

function buildTableRow(cells: string[]): string {
  return `| ${cells.join(' | ')} |`
}

function isSeparatorRow(line: string): boolean {
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c))
}

function findTable(editor: IEditor): TableContext | null {
  const cursor = editor.getCursor('head')
  const line = editor.getLine(cursor.line)
  if (!line.includes('|')) return null

  let startLine = cursor.line
  while (startLine > 0 && editor.getLine(startLine - 1).includes('|')) startLine--
  let endLine = cursor.line
  const lastLine = editor.lastLine()
  while (endLine < lastLine && editor.getLine(endLine + 1).includes('|')) endLine++

  if (endLine - startLine < 1 || !isSeparatorRow(editor.getLine(startLine + 1))) return null

  const before = line.slice(0, cursor.ch)
  const pipesBefore = before.match(/\|/g)?.length ?? 0
  const colIndex = Math.max(0, pipesBefore - (line.trimStart().startsWith('|') ? 1 : 0))

  return { startLine, endLine, rowIndex: cursor.line - startLine, colIndex }
}

function replaceTableBlock(editor: IEditor, ctx: TableContext, lines: string[]): void {
  editor.replaceRange(
    lines.join('\n'),
    { line: ctx.startLine, ch: 0 },
    { line: ctx.endLine, ch: editor.getLine(ctx.endLine).length },
  )
}

function tableColInsert(editor: IEditor, after: boolean): void {
  const ctx = findTable(editor)
  if (!ctx) return
  const insertAt = ctx.colIndex + (after ? 1 : 0)
  const lines: string[] = []
  for (let i = ctx.startLine; i <= ctx.endLine; i++) {
    const cells = splitTableRow(editor.getLine(i))
    cells.splice(insertAt, 0, i === ctx.startLine + 1 ? '---' : '')
    lines.push(buildTableRow(cells))
  }
  replaceTableBlock(editor, ctx, lines)
}

function tableColDelete(editor: IEditor): void {
  const ctx = findTable(editor)
  if (!ctx) return
  const lines: string[] = []
  for (let i = ctx.startLine; i <= ctx.endLine; i++) {
    const cells = splitTableRow(editor.getLine(i))
    if (cells.length <= 1) return
    cells.splice(ctx.colIndex, 1)
    lines.push(buildTableRow(cells))
  }
  replaceTableBlock(editor, ctx, lines)
}

function tableColCopy(editor: IEditor): void {
  const ctx = findTable(editor)
  if (!ctx) return
  const lines: string[] = []
  for (let i = ctx.startLine; i <= ctx.endLine; i++) {
    const cells = splitTableRow(editor.getLine(i))
    cells.splice(ctx.colIndex + 1, 0, cells[ctx.colIndex] ?? '')
    lines.push(buildTableRow(cells))
  }
  replaceTableBlock(editor, ctx, lines)
}

function tableColMove(editor: IEditor, direction: -1 | 1): void {
  const ctx = findTable(editor)
  if (!ctx) return
  const target = ctx.colIndex + direction
  const lines: string[] = []
  for (let i = ctx.startLine; i <= ctx.endLine; i++) {
    const cells = splitTableRow(editor.getLine(i))
    if (target < 0 || target >= cells.length) return
    const [moved] = cells.splice(ctx.colIndex, 1)
    cells.splice(target, 0, moved!)
    lines.push(buildTableRow(cells))
  }
  replaceTableBlock(editor, ctx, lines)
}

function tableColAlign(editor: IEditor, align: 'left' | 'center' | 'right'): void {
  const ctx = findTable(editor)
  if (!ctx) return
  const sepLine = ctx.startLine + 1
  const cells = splitTableRow(editor.getLine(sepLine))
  if (ctx.colIndex >= cells.length) return
  cells[ctx.colIndex] = align === 'left' ? ':---' : align === 'right' ? '---:' : ':---:'
  editor.setLine(sepLine, buildTableRow(cells))
}

function tableRowInsert(editor: IEditor, after: boolean): void {
  const ctx = findTable(editor)
  if (!ctx) return
  const colCount = splitTableRow(editor.getLine(ctx.startLine)).length
  const blankRow = buildTableRow(new Array<string>(colCount).fill(''))
  const currentLine = ctx.startLine + ctx.rowIndex
  const isHeaderOrSep = ctx.rowIndex <= 1
  const afterLine = isHeaderOrSep ? ctx.startLine + 1 : (after ? currentLine : currentLine - 1)
  editor.replaceRange('\n' + blankRow, { line: afterLine, ch: editor.getLine(afterLine).length })
}

function tableRowDelete(editor: IEditor): void {
  const ctx = findTable(editor)
  if (!ctx || ctx.rowIndex <= 1) return
  const line = ctx.startLine + ctx.rowIndex
  editor.replaceRange(
    '',
    { line: line - 1, ch: editor.getLine(line - 1).length },
    { line, ch: editor.getLine(line).length },
  )
}

function tableRowCopy(editor: IEditor): void {
  const ctx = findTable(editor)
  if (!ctx || ctx.rowIndex <= 1) return
  const line = ctx.startLine + ctx.rowIndex
  const text = editor.getLine(line)
  editor.replaceRange('\n' + text, { line, ch: text.length })
}

function tableRowMove(editor: IEditor, direction: -1 | 1): void {
  const ctx = findTable(editor)
  if (!ctx || ctx.rowIndex <= 1) return
  const line = ctx.startLine + ctx.rowIndex
  const target = line + direction
  if (target <= ctx.startLine + 1 || target > ctx.endLine) return
  const a = editor.getLine(line)
  const b = editor.getLine(target)
  editor.setLine(line, b)
  editor.setLine(target, a)
  editor.setCursor({ line: target, ch: 0 })
}

const noop = (): void => { /* no Slatebase equivalent — see module docstring */ }

/**
 * Register Obsidian's core `editor:*` commands under the `editor` namespace
 * (so IDs come out as `editor:toggle-code`, matching real Obsidian exactly).
 * Safe to call repeatedly — addCommand overwrites by namespaced ID, so re-running
 * this on every vault switch is idempotent.
 */
export function registerCoreEditorCommands(registry: ICommandRegistry, locale: Locale): void {
  const commands: Array<{ id: string; name: string; run: (editor: IEditor) => void }> = [
    // ── Already-shipped formatting/insertion commands ──
    { id: 'toggle-checklist-status', name: 'Cycle list and checklist', run: (e) => e.toggleCheckList() },
    { id: 'toggle-code', name: 'Toggle inline code', run: (e) => e.toggleMarkdownFormatting('code') },
    { id: 'toggle-blockquote', name: 'Toggle blockquote', run: toggleBlockquote },
    { id: 'toggle-comments', name: 'Toggle comment', run: (e) => wrapSelection(e, '%%', '%%') },
    { id: 'insert-wikilink', name: 'Insert internal link', run: (e) => wrapSelection(e, '[[', ']]') },
    { id: 'insert-embed', name: 'Insert embed', run: (e) => wrapSelection(e, '![[', ']]') },
    { id: 'insert-tag', name: 'Insert tag', run: (e) => e.replaceSelection('#') },
    { id: 'insert-link', name: 'Insert link', run: insertLink },
    { id: 'insert-table', name: 'Insert table', run: insertTable },
    { id: 'insert-mathblock', name: 'Insert math block', run: insertMathBlock },
    { id: 'insert-callout', name: 'Insert callout', run: insertCallout },
    { id: 'swap-line-up', name: 'Move line up', run: (e) => swapLine(e, -1) },
    { id: 'swap-line-down', name: 'Move line down', run: (e) => swapLine(e, 1) },
    { id: 'clear-formatting', name: 'Clear formatting', run: clearFormatting },

    // ── Inline formatting ──
    { id: 'toggle-bold', name: 'Toggle bold', run: (e) => e.toggleMarkdownFormatting('bold') },
    { id: 'toggle-italics', name: 'Toggle italic', run: (e) => e.toggleMarkdownFormatting('italic') },
    { id: 'toggle-strikethrough', name: 'Toggle strikethrough', run: (e) => e.toggleMarkdownFormatting('strikethrough') },
    { id: 'toggle-highlight', name: 'Toggle highlight', run: (e) => e.toggleMarkdownFormatting('highlight') },
    { id: 'toggle-inline-math', name: 'Toggle inline maths', run: (e) => e.toggleMarkdownFormatting('math') },

    // ── Lists ──
    { id: 'toggle-bullet-list', name: 'Toggle bullet list', run: (e) => e.toggleBulletList() },
    { id: 'toggle-numbered-list', name: 'Toggle numbered list', run: (e) => e.toggleNumberList() },
    { id: 'cycle-list-checklist', name: 'Cycle bullet/checkbox', run: (e) => e.toggleCheckList() },
    { id: 'indent-list', name: 'Indent list item', run: (e) => e.indentList() },
    { id: 'unindent-list', name: 'Unindent list item', run: (e) => e.unindentList() },

    // ── Headings ──
    { id: 'set-heading', name: 'Toggle heading', run: cycleHeading },
    { id: 'set-heading-0', name: 'Remove heading', run: (e) => setHeadingLevel(e, 0) },
    { id: 'set-heading-1', name: 'Set as heading 1', run: (e) => setHeadingLevel(e, 1) },
    { id: 'set-heading-2', name: 'Set as heading 2', run: (e) => setHeadingLevel(e, 2) },
    { id: 'set-heading-3', name: 'Set as heading 3', run: (e) => setHeadingLevel(e, 3) },
    { id: 'set-heading-4', name: 'Set as heading 4', run: (e) => setHeadingLevel(e, 4) },
    { id: 'set-heading-5', name: 'Set as heading 5', run: (e) => setHeadingLevel(e, 5) },
    { id: 'set-heading-6', name: 'Set as heading 6', run: (e) => setHeadingLevel(e, 6) },
    { id: 'rename-heading', name: 'Rename this heading...', run: renameHeading },

    // ── Insertion / block editing ──
    { id: 'insert-horizontal-rule', name: 'Insert horizontal rule', run: insertHorizontalRule },
    { id: 'insert-codeblock', name: 'Insert code block', run: insertCodeblock },
    { id: 'insert-footnote', name: 'Insert footnote', run: insertFootnote },
    { id: 'delete-paragraph', name: 'Delete paragraph', run: deleteParagraph },
    { id: 'add-cursor-above', name: 'Add cursor above', run: (e) => addCursor(e, -1) },
    { id: 'add-cursor-below', name: 'Add cursor below', run: (e) => addCursor(e, 1) },
    { id: 'focus', name: 'Focus on last note', run: (e) => e.focus() },

    // ── Tables ──
    { id: 'table-col-after', name: 'Table: Add column after', run: (e) => tableColInsert(e, true) },
    { id: 'table-col-before', name: 'Table: Add column before', run: (e) => tableColInsert(e, false) },
    { id: 'table-col-align-left', name: 'Table: Align left', run: (e) => tableColAlign(e, 'left') },
    { id: 'table-col-align-center', name: 'Table: Align centre', run: (e) => tableColAlign(e, 'center') },
    { id: 'table-col-align-right', name: 'Table: Align right', run: (e) => tableColAlign(e, 'right') },
    { id: 'table-col-copy', name: 'Table: Duplicate column', run: tableColCopy },
    { id: 'table-col-delete', name: 'Table: Delete column', run: tableColDelete },
    { id: 'table-col-left', name: 'Table: Move column left', run: (e) => tableColMove(e, -1) },
    { id: 'table-col-right', name: 'Table: Move column right', run: (e) => tableColMove(e, 1) },
    { id: 'table-row-after', name: 'Table: Add row after', run: (e) => tableRowInsert(e, true) },
    { id: 'table-row-before', name: 'Table: Add row before', run: (e) => tableRowInsert(e, false) },
    { id: 'table-row-copy', name: 'Table: Duplicate row', run: tableRowCopy },
    { id: 'table-row-delete', name: 'Table: Delete row', run: tableRowDelete },
    { id: 'table-row-down', name: 'Table: Move row down', run: (e) => tableRowMove(e, 1) },
    { id: 'table-row-up', name: 'Table: Move row up', run: (e) => tableRowMove(e, -1) },

    // ── No Slatebase equivalent — registered so lookups find a real (inert) command ──
    { id: 'attach-file', name: 'Insert attachment', run: noop },
    { id: 'context-menu', name: 'Show context menu under cursor', run: noop },
    { id: 'download-attachments', name: 'Download attachments for current file', run: noop },
    { id: 'fold-all', name: 'Fold all headings and lists', run: noop },
    { id: 'fold-less', name: 'Fold less', run: noop },
    { id: 'fold-more', name: 'Fold more', run: noop },
    { id: 'toggle-fold', name: 'Toggle fold on the current line', run: noop },
    { id: 'toggle-fold-properties', name: 'Toggle fold properties in current file', run: noop },
    { id: 'unfold-all', name: 'Unfold all headings and lists', run: noop },
    { id: 'toggle-readable-line-length', name: 'Toggle readable line length', run: noop },
    { id: 'toggle-spellcheck', name: 'Toggle spellcheck', run: noop },
    { id: 'focus-top', name: 'Focus on tab group above', run: noop },
    { id: 'focus-bottom', name: 'Focus on tab group below', run: noop },
    { id: 'focus-left', name: 'Focus on tab group to the left', run: noop },
    { id: 'focus-right', name: 'Focus on tab group to the right', run: noop },
  ]

  for (const { id, name, run } of commands) {
    registry.addCommand('editor', { id, name: translateCoreCommandName(`editor:${id}`, locale, name), editorCallback: (editor) => run(editor) })
  }
}
