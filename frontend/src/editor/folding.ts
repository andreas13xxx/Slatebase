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
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import {
  foldService, foldEffect, unfoldEffect, foldedRanges, foldable, ensureSyntaxTree, LanguageSupport,
} from '@codemirror/language'
import { getAppConfigValue } from '../state/vaultAppConfigStore'
import { locateFrontmatterBlock } from '../utils/frontmatterWriter'
import { findMarkdownHeadingLines } from '../utils/markdownHeadings'

const LIST_ITEM_REGEX = /^(\s*)(?:[-*+]|\d+[.)])\s+/

/**
 * `markdown()` registers its own heading foldService, which reads the syntax tree and therefore also
 * folds headings inside fenced code (a ```markdown block is parsed as nested Markdown) and ignores the
 * vault's `foldHeading` setting. `markdownFoldService` replaces it, so the stock one is dropped here.
 * It is found by behaviour (does it fold a heading?) because lang-markdown does not export it.
 */
export function withoutNativeHeadingFold(support: LanguageSupport): LanguageSupport {
  const probeDoc = '# a\nb'
  const folds = (extension: Extension): boolean => {
    const state = EditorState.create({ doc: probeDoc, extensions: [support.language, extension] })
    ensureSyntaxTree(state, probeDoc.length, 1000)
    return foldable(state, 0, 3) !== null
  }
  const parts = Array.isArray(support.support) ? (support.support as Extension[]) : [support.support]
  return new LanguageSupport(support.language, parts.filter((part) => !folds(part)))
}

/** The fold gutter asks once per visible line, so the parse is cached per document version. */
const headingLevelCache = new WeakMap<object, Map<number, number>>()

function headingLevelsByLine(state: EditorState): Map<number, number> {
  const cached = headingLevelCache.get(state.doc)
  if (cached) return cached
  const levels = new Map(findMarkdownHeadingLines(state.doc.toString()).map(({ lineNumber, level }) => [lineNumber, level]))
  headingLevelCache.set(state.doc, levels)
  return levels
}

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
function computeHeadingFoldRange(
  state: EditorState,
  headingLineNo: number,
  level: number,
  headingLevels: ReadonlyMap<number, number>,
): { from: number; to: number } {
  const doc = state.doc
  let endLineNo = doc.lines
  for (let lineNo = headingLineNo + 1; lineNo <= doc.lines; lineNo++) {
    const nextLevel = headingLevels.get(lineNo)
    if (nextLevel !== undefined && nextLevel <= level) {
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
  const headingLevels = headingLevelsByLine(state)
  for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
    const level = headingLevels.get(lineNo)
    if (level === undefined) continue
    const { from, to } = computeHeadingFoldRange(state, lineNo, level, headingLevels)
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
  const headingLevels = headingLevelsByLine(state)
  const headingLevel = headingLevels.get(line.number)
  if (headingLevel !== undefined) {
    // app.json `foldHeading` / `foldIndent`: read when asked, so a change applies at once
    if (!getAppConfigValue('foldHeading')) return null
    const range = computeHeadingFoldRange(state, line.number, headingLevel, headingLevels)
    return range.to > range.from ? range : null
  }
  if (!getAppConfigValue('foldIndent')) return null
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

/** Matches the lines `extractHeadings` turns into outline entries, so ordinals line up. */
/** Line numbers + levels of every outline heading, in document order (same rule as the Outline view). */
function findOutlineHeadingLines(state: EditorState): Array<{ lineNo: number; level: number }> {
  return findMarkdownHeadingLines(state.doc.toString()).map(({ lineNumber, level }) => ({ lineNo: lineNumber, level }))
}

/**
 * Moves the cursor to the `index`-th outline heading and scrolls it to the top.
 * Returns false when the document has no such heading.
 */
export function jumpToOutlineHeading(view: EditorView, index: number): boolean {
  const heading = findOutlineHeadingLines(view.state)[index]
  if (!heading) return false
  const line = view.state.doc.line(heading.lineNo)
  view.dispatch({
    selection: { anchor: line.from },
    effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
  })
  view.focus()
  return true
}

/**
 * Folds or unfolds the section of the `index`-th outline heading, using the
 * same range as the fold gutter. Returns false when there is nothing to fold.
 */
export function setOutlineHeadingFolded(view: EditorView, index: number, folded: boolean): boolean {
  const heading = findOutlineHeadingLines(view.state)[index]
  if (!heading) return false
  const range = computeHeadingFoldRange(view.state, heading.lineNo, heading.level, headingLevelsByLine(view.state))
  if (range.to <= range.from) return false
  if (isRangeFolded(view.state, range.from, range.to) === folded) return true
  view.dispatch({ effects: folded ? foldEffect.of(range) : unfoldEffect.of(range) })
  return true
}
