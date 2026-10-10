/**
 * remark plugin: `==text==` highlights, with Obsidian 1.14 color support.
 *
 * `==highlight==` is not part of CommonMark or GFM, so reading view rendered it
 * as literal text before this plugin existed (Live Preview already decorated it
 * via a regex pass). This transformer walks the parsed MDAST and splits every
 * `text` node's `==...==` runs into dedicated `highlight` nodes, so the reading
 * view renders a real `<mark>` — matching what Live Preview shows.
 *
 * A leading color emoji inside the markers (🔴🟠🟢🔵🟣) selects the color; the
 * emoji is kept in the rendered content (as Obsidian does) so the text stays
 * portable Markdown. The color -> class mapping lives in
 * `plugins/highlight-colors.ts`, shared with Live Preview and the autocomplete.
 *
 * Transformer-only (no micromark tokenizer), the same approach as
 * `remarkBreaks`/`remarkBlockRef`: `==` needs no new block grammar, only a
 * post-parse rewrite of inline text.
 *
 * @module highlight/plugin
 */

import type { Root, Text, PhrasingContent, Parent } from 'mdast'
import { visit } from 'unist-util-visit'
import type { HighlightColorName } from '../highlight-colors'
import { matchHighlightColor } from '../highlight-colors'

/** MDAST node produced for a `==...==` highlight. */
export interface HighlightNode {
  type: 'highlight'
  /** Resolved color (default `yellow` when no leading emoji). */
  color: HighlightColorName
  children: PhrasingContent[]
  data?: { hName?: string; hProperties?: Record<string, unknown> }
}

declare module 'mdast' {
  interface PhrasingContentMap {
    highlight: HighlightNode
  }
  interface RootContentMap {
    highlight: HighlightNode
  }
}

// `==content==` where content has no `==` inside it. The content is captured so
// a leading color emoji can be inspected per match.
const HIGHLIGHT_RE = /==([^=]+(?:=[^=]+)*)==/g

/**
 * Splits a single text node's value into alternating plain-text and highlight
 * nodes. Returns `null` when the value contains no highlight (the common case),
 * so the caller can leave the original node untouched.
 */
function splitHighlights(value: string): PhrasingContent[] | null {
  HIGHLIGHT_RE.lastIndex = 0
  if (!HIGHLIGHT_RE.test(value)) return null

  const out: PhrasingContent[] = []
  let lastIndex = 0
  HIGHLIGHT_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = HIGHLIGHT_RE.exec(value)) !== null) {
    const inner = m[1]!
    // Empty / whitespace-only highlights are not highlights.
    if (inner.trim() === '') continue

    if (m.index > lastIndex) {
      out.push({ type: 'text', value: value.slice(lastIndex, m.index) } as Text)
    }

    const { color } = matchHighlightColor(inner)
    out.push({
      type: 'highlight',
      color,
      // The emoji stays in the rendered text, as in Obsidian.
      children: [{ type: 'text', value: inner } as Text],
      data: { hName: 'mark', hProperties: { className: `hl-${color}` } },
    })
    lastIndex = m.index + m[0].length
  }

  if (lastIndex === 0) return null
  if (lastIndex < value.length) {
    out.push({ type: 'text', value: value.slice(lastIndex) } as Text)
  }
  return out
}

/**
 * remark transformer: rewrites `==...==` runs in text nodes into `highlight`
 * nodes. Code spans and code blocks are skipped by `visit` only entering
 * `text` nodes (inline/fenced code hold their content in `inlineCode`/`code`
 * nodes, never `text`), so `==` inside code stays literal.
 */
export function remarkHighlight() {
  return (tree: Root): void => {
    visit(tree, 'text', (node: Text, index: number | undefined, parent: Parent | undefined) => {
      if (parent === undefined || index === undefined) return
      const replacement = splitHighlights(node.value)
      if (!replacement) return
      parent.children.splice(index, 1, ...(replacement as Parent['children']))
      // Skip the nodes we just inserted.
      return index + replacement.length
    })
  }
}
