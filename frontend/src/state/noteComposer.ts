/**
 * Shared logic for the `note-composer:*` commands (`split-file`,
 * `extract-heading`, `merge-file`) — cutting a range of the active document
 * into a new file, linked back from where it was cut.
 */
import type { EditorView } from '@codemirror/view'
import type { IApiClient } from '../api'

/** A character-offset range plus the heading text it was found under (if any). */
export interface HeadingSectionRange {
  from: number
  to: number
  headingText: string
}

const HEADING_LINE_REGEX = /^(#{1,6})\s+(.+?)\s*#*$/

/**
 * Finds the Markdown heading at or above the cursor and the span of its
 * section — the heading line through the line before the next heading of the
 * same or higher level (fewer or equal `#`s), or end of document. Mirrors
 * core-commands-app.ts's `findHeadingBeforeCursor`'s upward line walk, then
 * extends it downward to find the section's end.
 */
export function findHeadingSectionAtCursor(view: EditorView): HeadingSectionRange | null {
  const doc = view.state.doc
  const cursorLine = doc.lineAt(view.state.selection.main.head).number

  let headingLineNo = -1
  let headingLevel = 0
  let headingText = ''
  for (let lineNo = cursorLine; lineNo >= 1; lineNo--) {
    const match = HEADING_LINE_REGEX.exec(doc.line(lineNo).text)
    if (match) {
      headingLineNo = lineNo
      headingLevel = match[1]!.length
      headingText = match[2]!.trim()
      break
    }
  }
  if (headingLineNo === -1) return null

  let endLineNo = doc.lines
  for (let lineNo = headingLineNo + 1; lineNo <= doc.lines; lineNo++) {
    const match = /^(#{1,6})\s+/.exec(doc.line(lineNo).text)
    if (match && match[1]!.length <= headingLevel) {
      endLineNo = lineNo - 1
      break
    }
  }

  return { from: doc.line(headingLineNo).from, to: doc.line(endLineNo).to, headingText }
}

/**
 * Turns heading text into a filesystem-safe filename: strips characters
 * invalid in vault paths and collapses whitespace.
 */
export function sanitizeFileNameFromHeading(headingText: string): string {
  const cleaned = headingText.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
  return cleaned === '' ? 'Untitled' : cleaned
}

/**
 * Cuts `range` out of `view`'s document, replaces it with a `[[fileName]]`
 * link, and creates a new file at `fileName` (same directory as `sourcePath`)
 * containing the cut text. Used by both `split-file` and `extract-heading` —
 * they differ only in how `range` and `fileName` are computed.
 */
export async function extractRangeToNewFile(
  view: EditorView,
  range: { from: number; to: number },
  sourcePath: string,
  fileName: string,
  vaultId: string,
  apiClient: IApiClient,
): Promise<void> {
  const extracted = view.state.doc.sliceString(range.from, range.to)
  const dir = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/') + 1) : ''
  const baseName = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName
  const newPath = `${dir}${baseName}.md`

  await apiClient.saveFile(vaultId, newPath, extracted)
  view.dispatch({ changes: { from: range.from, to: range.to, insert: `[[${baseName}]]` } })
}
