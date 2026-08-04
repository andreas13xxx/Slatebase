import { Decoration } from '@codemirror/view'
import type { EditorState, Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

/**
 * Decoration ranges that should be hidden when cursor is outside them.
 * These are the marker characters (**, *, ~~, `) that get hidden in live preview.
 *
 * `groupFrom`/`groupTo` define the full extent of the parent formatting node.
 * When the cursor is anywhere inside `[groupFrom, groupTo]`, ALL hideable ranges
 * sharing the same group boundaries are revealed (markers become visible).
 */
export interface HideableRange {
  from: number
  to: number
  /** Start of the parent formatting node (for group reveal). */
  groupFrom: number
  /** End of the parent formatting node (for group reveal). */
  groupTo: number
}

/**
 * Result of building inline decorations from the syntax tree.
 */
export interface InlineDecorationResult {
  decorations: Range<Decoration>[]
  hideableRanges: HideableRange[]
}

/**
 * Build inline decorations from the Lezer Markdown syntax tree.
 * Returns both the decorations and a list of hideable marker ranges.
 *
 * Handles: ATXHeading1-6, StrongEmphasis, Emphasis, Strikethrough, InlineCode.
 */
export function buildInlineDecorations(state: EditorState): InlineDecorationResult {
  const decorations: Range<Decoration>[] = []
  const hideableRanges: HideableRange[] = []
  const tree = syntaxTree(state)

  tree.iterate({
    enter(node) {
      // --- ATXHeading1-6 ---
      if (
        node.name === 'ATXHeading1' || node.name === 'ATXHeading2' ||
        node.name === 'ATXHeading3' || node.name === 'ATXHeading4' ||
        node.name === 'ATXHeading5' || node.name === 'ATXHeading6'
      ) {
        const level = parseInt(node.name.replace('ATXHeading', ''), 10)
        const line = state.doc.lineAt(node.from)

        // Line decoration for heading font size
        decorations.push(
          Decoration.line({ attributes: { class: `cm-lp-h${level}` } }).range(line.from)
        )

        // Find HeaderMark child nodes and add marker decorations + hideable ranges
        const cursor = node.node.cursor()
        if (cursor.firstChild()) {
          do {
            if (cursor.name === 'HeaderMark') {
              const markFrom = cursor.from
              const markTo = cursor.to

              // Mark the header marker characters with a specific class
              decorations.push(
                Decoration.mark({ class: 'cm-lp-heading-marker' }).range(markFrom, markTo)
              )

              // Hide the marker (# characters + trailing space)
              // The hideable range covers from the mark start to the content start
              // We include the space after the # mark
              const spaceAfter = markTo < line.to && state.doc.sliceString(markTo, markTo + 1) === ' '
                ? markTo + 1
                : markTo

              hideableRanges.push({ from: markFrom, to: spaceAfter, groupFrom: line.from, groupTo: line.to })
              decorations.push(
                Decoration.replace({}).range(markFrom, spaceAfter)
              )
            }
          } while (cursor.nextSibling())
        }
      }

      // --- StrongEmphasis (bold **text** or __text__) ---
      if (node.name === 'StrongEmphasis') {
        const from = node.from
        const to = node.to

        // Determine marker length (** = 2 chars on each side)
        const markerLen = 2
        const contentFrom = from + markerLen
        const contentTo = to - markerLen

        if (contentFrom < contentTo) {
          // Mark the content with bold class
          decorations.push(
            Decoration.mark({ class: 'cm-lp-bold' }).range(contentFrom, contentTo)
          )

          // Opening marker
          hideableRanges.push({ from, to: contentFrom, groupFrom: from, groupTo: to })
          decorations.push(
            Decoration.replace({}).range(from, contentFrom)
          )

          // Closing marker
          hideableRanges.push({ from: contentTo, to, groupFrom: from, groupTo: to })
          decorations.push(
            Decoration.replace({}).range(contentTo, to)
          )
        }
      }

      // --- Emphasis (italic *text* or _text_) ---
      if (node.name === 'Emphasis') {
        const from = node.from
        const to = node.to

        // Determine marker length (* = 1 char on each side)
        const markerLen = 1
        const contentFrom = from + markerLen
        const contentTo = to - markerLen

        if (contentFrom < contentTo) {
          // Mark the content with italic class
          decorations.push(
            Decoration.mark({ class: 'cm-lp-italic' }).range(contentFrom, contentTo)
          )

          // Opening marker
          hideableRanges.push({ from, to: contentFrom, groupFrom: from, groupTo: to })
          decorations.push(
            Decoration.replace({}).range(from, contentFrom)
          )

          // Closing marker
          hideableRanges.push({ from: contentTo, to, groupFrom: from, groupTo: to })
          decorations.push(
            Decoration.replace({}).range(contentTo, to)
          )
        }
      }

      // --- Strikethrough (~~text~~) ---
      if (node.name === 'Strikethrough') {
        const from = node.from
        const to = node.to

        // Determine marker length (~~ = 2 chars on each side)
        const markerLen = 2
        const contentFrom = from + markerLen
        const contentTo = to - markerLen

        if (contentFrom < contentTo) {
          // Mark the content with strikethrough class
          decorations.push(
            Decoration.mark({ class: 'cm-lp-strikethrough' }).range(contentFrom, contentTo)
          )

          // Opening marker
          hideableRanges.push({ from, to: contentFrom, groupFrom: from, groupTo: to })
          decorations.push(
            Decoration.replace({}).range(from, contentFrom)
          )

          // Closing marker
          hideableRanges.push({ from: contentTo, to, groupFrom: from, groupTo: to })
          decorations.push(
            Decoration.replace({}).range(contentTo, to)
          )
        }
      }

      // --- InlineCode (`code`) ---
      if (node.name === 'InlineCode') {
        const from = node.from
        const to = node.to

        // Mark the full range with inline-code class (including backticks for styling)
        decorations.push(
          Decoration.mark({ class: 'cm-lp-inline-code' }).range(from, to)
        )

        // Find the backtick markers via child nodes (CodeMark)
        const cursor = node.node.cursor()
        if (cursor.firstChild()) {
          do {
            if (cursor.name === 'CodeMark') {
              hideableRanges.push({ from: cursor.from, to: cursor.to, groupFrom: from, groupTo: to })
              decorations.push(
                Decoration.replace({}).range(cursor.from, cursor.to)
              )
            }
          } while (cursor.nextSibling())
        }
      }
    }
  })

  // --- Highlight (==text==) ---
  // Not in Lezer grammar — detect via regex on the full document text
  const docText = state.doc.toString()
  const HIGHLIGHT_REGEX = /==((?:[^=]|=[^=])+)==/g
  let hlMatch: RegExpExecArray | null

  HIGHLIGHT_REGEX.lastIndex = 0
  while ((hlMatch = HIGHLIGHT_REGEX.exec(docText)) !== null) {
    const from = hlMatch.index
    const to = from + hlMatch[0].length
    const markerLen = 2
    const contentFrom = from + markerLen
    const contentTo = to - markerLen

    // Skip if inside a code block (check if the range intersects any FencedCode or InlineCode node)
    let insideCode = false
    tree.iterate({
      from, to,
      enter(n) {
        if (n.name === 'FencedCode' || n.name === 'InlineCode' || n.name === 'CodeBlock') {
          insideCode = true
          return false
        }
      }
    })
    if (insideCode) continue

    if (contentFrom < contentTo) {
      // Mark the content with highlight class
      decorations.push(
        Decoration.mark({ class: 'cm-lp-highlight' }).range(contentFrom, contentTo)
      )

      // Opening marker ==
      hideableRanges.push({ from, to: contentFrom, groupFrom: from, groupTo: to })
      decorations.push(
        Decoration.replace({}).range(from, contentFrom)
      )

      // Closing marker ==
      hideableRanges.push({ from: contentTo, to, groupFrom: from, groupTo: to })
      decorations.push(
        Decoration.replace({}).range(contentTo, to)
      )
    }
  }

  // --- Inline Tags (#tag, #nested/tag) ---
  // Not in Lezer grammar — detect via regex on the full document text.
  // Tags start with # preceded by whitespace, line start, or punctuation,
  // followed by a letter or underscore, then letters/digits/underscores/hyphens/slashes.
  const TAG_REGEX = /(?:^|(?<=[\s([\]{}"',;:.!?><]))#([A-Za-z\u00C0-\u024F\u1E00-\u1EFF_][A-Za-z\u00C0-\u024F\u1E00-\u1EFF0-9_\-/]*)/gm
  let tagMatch: RegExpExecArray | null

  TAG_REGEX.lastIndex = 0
  while ((tagMatch = TAG_REGEX.exec(docText)) !== null) {
    const fullFrom = tagMatch.index + (tagMatch[0].length - tagMatch[1]!.length - 1) // position of #
    const fullTo = fullFrom + 1 + tagMatch[1]!.length // # + tag value

    // Skip if this is a heading marker at line start (# followed by space)
    const line = state.doc.lineAt(fullFrom)
    const linePrefix = docText.slice(line.from, fullFrom)
    if (/^#{0,5}$/.test(linePrefix)) {
      // This # is part of a heading marker sequence — skip
      continue
    }

    // Skip if inside a code block
    let insideCodeBlock = false
    tree.iterate({
      from: fullFrom, to: fullTo,
      enter(n) {
        if (n.name === 'FencedCode' || n.name === 'InlineCode' || n.name === 'CodeBlock') {
          insideCodeBlock = true
          return false
        }
      }
    })
    if (insideCodeBlock) continue

    // Mark the entire tag (#value) with the tag class
    decorations.push(
      Decoration.mark({ class: 'cm-lp-tag' }).range(fullFrom, fullTo)
    )
  }

  return { decorations, hideableRanges }
}
