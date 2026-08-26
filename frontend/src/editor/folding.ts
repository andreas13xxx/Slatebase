/**
 * Markdown code folding — backs `fold-all`/`fold-less`/`fold-more`/
 * `toggle-fold`/`toggle-fold-properties`/`unfold-all`.
 *
 * CM6's built-in folding is syntax-node-based (`foldNodeProp`), which suits
 * languages with an AST but not Markdown's flat, line-oriented structure —
 * Slatebase's CM6 setup uses `@codemirror/lang-markdown` without a full
 * "foldable block" grammar. Instead, this registers a `foldService` that
 * answers "can folding start on this line" for two Markdown-specific cases:
 * a heading (folds its section, i.e. through the next heading of the same or
 * higher level) and a list item with a nested sub-list (folds the nested
 * block). `foldAll`/`unfoldAll`/`toggleFold`/`foldCode`/`unfoldCode` from
 * `@codemirror/language` all consult `foldable()`, which in turn consults
 * every registered `foldService` — so those stock commands work unmodified
 * once this service is registered via `codeFolding()` in CodeMirrorEditor.tsx.
 *
 * `fold-less`/`fold-more` (incremental fold-by-heading-level) and
 * `toggle-fold-properties` (frontmatter-block-specific) have no stock CM6
 * equivalent and are implemented here directly against `foldEffect`/
 * `unfoldEffect`/`foldedRanges`.
 */
import type { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { foldService, foldEffect, unfoldEffect, foldedRanges } from '@codemirror/language'
import { locateFrontmatterBlock } from '../utils/frontmatterWriter'

const HEADING_LINE_REGEX = /^(#{1,6})\s+(.+?)\s*#*$/
const LIST_ITEM_REGEX = /^(\s*)(?:[-*+]|\d+[.)])\s+/

function lineIndent(text: string): number {
  return /^[ \t]*/.exec(text)![0].length
}

/** A heading's section range: from the end of its own line through the end of its content. */
export interface HeadingFoldRange {
  level: number
  from: number
  to: number
}

/**
 * The Markdown-specific fold range for a heading line: from the end of the
 * heading line itself (so the heading text stays visible when folded)
 * through the end of the last line before the next heading of the same or
 * higher level (or end of document).
 */
function computeHeadingFoldRange(state: EditorState, headingLineNo: number, level: number): { from: number; to: number } {
  const doc = state.doc
  let endLineNo = doc.lines
  for (let lineNo = headingLineNo + 1; lineNo <= doc.lines; lineNo++) {
    const match = HEADING_LINE_REGEX.exec(doc.line(lineNo).text)
    if (match && match[1]!.length <= level) {
      endLineNo = lineNo - 1
      break
    }
  }
  return { from: doc.line(headingLineNo).to, to: doc.line(endLineNo).to }
}

/** Every heading's section range in the document, in document order. */
export function findAllHeadingSections(state: EditorState): HeadingFoldRange[] {
  const doc = state.doc
  const sections: HeadingFoldRange[] = []
  for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
    const match = HEADING_LINE_REGEX.exec(doc.line(lineNo).text)
    if (!match) continue
    const level = match[1]!.length
    const { from, to } = computeHeadingFoldRange(state, lineNo, level)
    if (to > from) sections.push({ level, from, to })
  }
  return sections
}

/**
 * The fold range for a list item with a nested sub-block: from the end of
 * the item's own line through the end of the last consecutive following line
 * that is either blank or indented more than the item, trimmed of trailing
 * blank lines. Returns null when there's nothing nested to fold.
 */
function computeListFoldRange(state: EditorState, lineNo: number): { from: number; to: number } | null {
  const doc = state.doc
  const line = doc.line(lineNo)
  const match = LIST_ITEM_REGEX.exec(line.text)
  if (!match) return null
  const baseIndent = match[1]!.length

  let endLineNo = lineNo
  for (let n = lineNo + 1; n <= doc.lines; n++) {
    const text = doc.line(n).text
    if (text.trim() === '') { endLineNo = n; continue }
    if (lineIndent(text) > baseIndent) { endLineNo = n; continue }
    break
  }
  while (endLineNo > lineNo && doc.line(endLineNo).text.trim() === '') endLineNo--
  if (endLineNo === lineNo) return null

  return { from: line.to, to: doc.line(endLineNo).to }
}

/**
 * The `foldService` extension registering Markdown's two foldable
 * constructs. Add alongside `codeFolding()` in the editor's extensions.
 */
export const markdownFoldService = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart)
  const headingMatch = HEADING_LINE_REGEX.exec(line.text)
  if (headingMatch) {
    const range = computeHeadingFoldRange(state, line.number, headingMatch[1]!.length)
    return range.to > range.from ? range : null
  }
  return computeListFoldRange(state, line.number)
})

/** Whether a fold starting exactly at `from` (through `to`) currently exists. */
function isRangeFolded(state: EditorState, from: number, to: number): boolean {
  let found = false
  foldedRanges(state).between(from, to, (rFrom, rTo) => {
    if (rFrom === from && rTo === to) {
      found = true
      return false
    }
    return undefined
  })
  return found
}

/**
 * `toggle-fold-properties` — folds/unfolds the frontmatter block as a single
 * unit (the opening `---` line stays visible; the YAML content and closing
 * `---` collapse together), independent of the heading/list fold service.
 */
export function toggleFoldProperties(view: EditorView): void {
  const content = view.state.doc.toString()
  const location = locateFrontmatterBlock(content)
  if (!location) return

  const blockEnd = content.indexOf('\n', location.to + 1)
  const from = location.from
  const to = blockEnd === -1 ? content.length : blockEnd

  if (to <= from) return

  view.dispatch({
    effects: isRangeFolded(view.state, from, to) ? unfoldEffect.of({ from, to }) : foldEffect.of({ from, to }),
  })
}

/**
 * `fold-more` — folds every heading section at the deepest heading level
 * that still has at least one unfolded section (iterating H6 down to H1), so
 * repeated presses collapse progressively shallower levels.
 */
export function foldMore(view: EditorView): void {
  const sections = findAllHeadingSections(view.state)
  const levels = [...new Set(sections.map((s) => s.level))].sort((a, b) => b - a)

  for (const level of levels) {
    const toFold = sections.filter((s) => s.level === level && !isRangeFolded(view.state, s.from, s.to))
    if (toFold.length > 0) {
      view.dispatch({ effects: toFold.map((s) => foldEffect.of({ from: s.from, to: s.to })) })
      return
    }
  }
}

/**
 * `fold-less` — unfolds every heading section at the shallowest heading
 * level that still has at least one folded section (iterating H1 up to H6),
 * reversing `fold-more` one level at a time.
 */
export function foldLess(view: EditorView): void {
  const sections = findAllHeadingSections(view.state)
  const levels = [...new Set(sections.map((s) => s.level))].sort((a, b) => a - b)

  for (const level of levels) {
    const toUnfold = sections.filter((s) => s.level === level && isRangeFolded(view.state, s.from, s.to))
    if (toUnfold.length > 0) {
      view.dispatch({ effects: toUnfold.map((s) => unfoldEffect.of({ from: s.from, to: s.to })) })
      return
    }
  }
}
