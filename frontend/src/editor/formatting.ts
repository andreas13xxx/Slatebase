import type { EditorView } from '@codemirror/view'
import type { EditorFormattingAction } from './types'

/**
 * Apply a formatting action to the current selection in the editor.
 * Handles all toolbar/command palette formatting operations using CM6 transactions.
 *
 * Note: 'toggleLineNumbers' is a no-op here — it is handled via compartment
 * reconfiguration in CodeMirrorEditor.
 */
export function applyFormatting(view: EditorView, action: EditorFormattingAction): void {
  switch (action) {
    case 'heading1':
      applyHeading(view, 1)
      break
    case 'heading2':
      applyHeading(view, 2)
      break
    case 'heading3':
      applyHeading(view, 3)
      break
    case 'bold':
      wrapSelection(view, '**', '**', 'bold')
      break
    case 'italic':
      wrapSelection(view, '*', '*', 'italic')
      break
    case 'strikethrough':
      wrapSelection(view, '~~', '~~', 'strikethrough')
      break
    case 'code':
      wrapSelection(view, '`', '`', 'code')
      break
    case 'link':
      applyLink(view)
      break
    case 'bulletList':
      prependToLines(view, () => '- ')
      break
    case 'numberedList':
      prependToLines(view, (_line, index) => `${index + 1}. `)
      break
    case 'task':
      prependToLines(view, () => '- [ ] ')
      break
    case 'quote':
      prependToLines(view, () => '> ')
      break
    case 'horizontalRule':
      insertHorizontalRule(view)
      break
    case 'table':
      insertTable(view)
      break
    case 'toggleLineNumbers':
      // No-op: handled by compartment in CodeMirrorEditor
      break
  }
}

/**
 * Apply a heading level to the current line.
 * If the line already starts with a heading marker, replace it with the target level.
 * Otherwise prepend the heading marker.
 */
function applyHeading(view: EditorView, level: number): void {
  const { state } = view
  const { from } = state.selection.main
  const line = state.doc.lineAt(from)
  const lineText = line.text

  const prefix = '#'.repeat(level) + ' '

  // Check if line already starts with a heading marker
  const headingMatch = lineText.match(/^(#{1,6})\s/)

  if (headingMatch) {
    // Replace existing heading marker with target level
    const existingMarkerLength = headingMatch[0].length
    view.dispatch({
      changes: {
        from: line.from,
        to: line.from + existingMarkerLength,
        insert: prefix,
      },
    })
  } else {
    // Prepend heading marker
    view.dispatch({
      changes: {
        from: line.from,
        insert: prefix,
      },
    })
  }
}

/**
 * Wrap the current selection with prefix/suffix markers.
 * If no text is selected, insert placeholder text and select it.
 */
function wrapSelection(
  view: EditorView,
  prefix: string,
  suffix: string,
  placeholder: string
): void {
  const { state } = view
  const { from, to } = state.selection.main
  const selectedText = state.sliceDoc(from, to)

  if (selectedText.length > 0) {
    // Wrap existing selection
    const replacement = prefix + selectedText + suffix
    view.dispatch({
      changes: { from, to, insert: replacement },
      selection: {
        anchor: from + prefix.length,
        head: from + prefix.length + selectedText.length,
      },
    })
  } else {
    // Insert placeholder and select it
    const replacement = prefix + placeholder + suffix
    view.dispatch({
      changes: { from, to: from, insert: replacement },
      selection: {
        anchor: from + prefix.length,
        head: from + prefix.length + placeholder.length,
      },
    })
  }
}

/**
 * Apply link formatting to the current selection.
 * If text is selected: wraps as [selection](url) and positions cursor at "url".
 * If no selection: inserts [text](url) and positions cursor at "url".
 */
function applyLink(view: EditorView): void {
  const { state } = view
  const { from, to } = state.selection.main
  const selectedText = state.sliceDoc(from, to)

  if (selectedText.length > 0) {
    const replacement = `[${selectedText}](url)`
    // Position cursor to select "url"
    const urlStart = from + 1 + selectedText.length + 2 // [text](
    view.dispatch({
      changes: { from, to, insert: replacement },
      selection: { anchor: urlStart, head: urlStart + 3 },
    })
  } else {
    const replacement = '[text](url)'
    const urlStart = from + 7 // [text](
    view.dispatch({
      changes: { from, to: from, insert: replacement },
      selection: { anchor: urlStart, head: urlStart + 3 },
    })
  }
}

/**
 * Prepend a prefix to each line in the current selection.
 * The prefixFn receives the line text and the 0-based index among selected lines.
 */
function prependToLines(
  view: EditorView,
  prefixFn: (lineText: string, index: number) => string
): void {
  const { state } = view
  const { from, to } = state.selection.main

  const startLine = state.doc.lineAt(from)
  const endLine = state.doc.lineAt(to)

  const changes: Array<{ from: number; to: number; insert: string }> = []
  let index = 0

  for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
    const line = state.doc.line(lineNum)
    const prefix = prefixFn(line.text, index)
    changes.push({ from: line.from, to: line.from, insert: prefix })
    index++
  }

  view.dispatch({ changes })
}

/**
 * Insert a horizontal rule at the current cursor position.
 */
function insertHorizontalRule(view: EditorView): void {
  const { state } = view
  const { from } = state.selection.main

  view.dispatch({
    changes: { from, insert: '\n---\n' },
    selection: { anchor: from + 5 },
  })
}

/**
 * Insert a 2x2 Markdown table template at the current cursor position.
 */
function insertTable(view: EditorView): void {
  const { state } = view
  const { from } = state.selection.main

  const table = [
    '| Header 1 | Header 2 |',
    '| -------- | -------- |',
    '| Cell 1   | Cell 2   |',
    '| Cell 3   | Cell 4   |',
  ].join('\n')

  view.dispatch({
    changes: { from, insert: table },
    selection: { anchor: from + table.length },
  })
}
