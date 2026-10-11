/**
 * Slash-menu trigger detection.
 *
 * Decides whether the cursor currently sits in a `/…` slash-command trigger:
 * a `/` at the line start or immediately after whitespace, followed by the
 * typed filter text up to the cursor (no intervening space). Returns the
 * replacement range (the `/` through the cursor) and the filter query, or
 * `null` when there is no active trigger.
 *
 * The trigger deliberately does NOT fire inside code, wikilinks or math, so a
 * `/` in a path (`a/b`), a fenced block or a `[[link]]` stays literal text.
 * Code regions are detected via the Lezer syntax tree the editor already
 * parses; wikilink/embed and inline `$…$` math are caught by a cheap same-line
 * scan (they are single-line constructs by Slatebase's own conventions, and
 * `@codemirror/lang-markdown` is wired without a math grammar, so the tree
 * carries no math nodes to lean on).
 *
 * @module editor/slash/slash-trigger
 */

import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'

/** Result of a positive trigger detection. */
export interface SlashTriggerInfo {
  /** Document offset of the `/` character. */
  from: number
  /** Document offset of the cursor (end of the trigger). */
  to: number
  /** The filter text typed after the `/` (may be empty). */
  query: string
}

/**
 * Lezer Markdown node names whose interior must not trigger the slash menu.
 * `FencedCode`/`CodeBlock` cover fenced + indented code; `InlineCode`/`CodeText`
 * cover backtick spans. Math has no entry here: Slatebase wires
 * `@codemirror/lang-markdown` without a math grammar (see editor/folding.ts),
 * so no `InlineMath`/`BlockMath` nodes are ever produced — inline math is
 * instead caught by the same-line `$…$` scan in `isInInlineConstruct`.
 */
const SUPPRESSED_NODES = new Set([
  'FencedCode',
  'CodeBlock',
  'InlineCode',
  'CodeText',
])

/**
 * Whether the given offset sits inside a code/math region per the syntax tree.
 */
function isInSuppressedRegion(state: EditorState, offset: number): boolean {
  let node: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(state).resolveInner(offset, -1)
  while (node) {
    if (SUPPRESSED_NODES.has(node.name)) return true
    node = node.parent
  }
  return false
}

/**
 * Whether the offset within `lineText` falls inside a `[[wikilink]]`, `![[embed]]`
 * or inline `$math$` on the same line. A cheap scan — these are single-line
 * constructs in Slatebase, so no multi-line state is needed.
 */
function isInInlineConstruct(lineText: string, chBeforeSlash: number): boolean {
  // Unclosed `[[` before the slash → inside a wikilink/embed target.
  const lastOpenLink = lineText.lastIndexOf('[[', chBeforeSlash)
  if (lastOpenLink !== -1) {
    const closeAfter = lineText.indexOf(']]', lastOpenLink)
    if (closeAfter === -1 || closeAfter >= chBeforeSlash) return true
  }
  // Inside an inline-math span `$…$`: the cursor sits after an opening `$`
  // whose matching closing `$` is at or after the slash — a real pair the
  // cursor is between. Mirrors the `[[…]]` pair logic above. A lone literal
  // `$` (a price like `$5`, a shell var like `$PATH`) has no closing partner
  // and must NOT block the menu, so raw $-parity is deliberately avoided.
  // Both delimiters must hug a non-space on their inner side, as inline math
  // is tight (`$x$`) — this also rejects two unrelated literal `$` straddling
  // the slash (e.g. `$5 /tab $9`), where the later `$` has a space before it.
  const openDollar = lineText.lastIndexOf('$', chBeforeSlash - 1)
  if (openDollar !== -1) {
    const afterOpen = lineText[openDollar + 1]
    if (afterOpen !== undefined && afterOpen !== ' ') {
      const closeDollar = lineText.indexOf('$', openDollar + 1)
      if (closeDollar !== -1 && closeDollar >= chBeforeSlash) {
        const beforeClose = lineText[closeDollar - 1]
        if (beforeClose !== undefined && beforeClose !== ' ') return true
      }
    }
  }
  return false
}

/**
 * Detect an active slash trigger at the given cursor offset.
 *
 * @param state - Current editor state.
 * @param cursor - Primary cursor document offset.
 * @returns Trigger info, or `null` when no slash trigger is active.
 */
export function detectSlashTrigger(state: EditorState, cursor: number): SlashTriggerInfo | null {
  const line = state.doc.lineAt(cursor)
  const col = cursor - line.from
  const text = line.text

  // Walk left from the cursor collecting the filter; stop at a space (closes
  // the trigger) or at the `/`.
  let i = col - 1
  while (i >= 0) {
    const c = text[i]
    if (c === '/') break
    // A space inside the candidate means the trigger is already closed.
    if (c === ' ' || c === '\t') return null
    i--
  }
  if (i < 0 || text[i] !== '/') return null

  // The `/` must be at the line start or immediately after whitespace.
  const before = i > 0 ? text[i - 1] : ''
  if (before !== '' && before !== ' ' && before !== '\t') return null

  const slashOffset = line.from + i

  // Not inside code/math (syntax tree) …
  if (isInSuppressedRegion(state, slashOffset)) return null
  // … and not inside a same-line wikilink/embed/inline-math.
  if (isInInlineConstruct(text, i)) return null

  return {
    from: slashOffset,
    to: cursor,
    query: text.slice(i + 1, col),
  }
}
