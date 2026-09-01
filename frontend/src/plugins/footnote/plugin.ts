/**
 * Remark plugin that numbers GFM footnotes for rendering.
 *
 * `remark-gfm` already parses `[^1]` into `footnoteReference` and `[^1]: text`
 * into `footnoteDefinition`, but it leaves both unnumbered and unconnected: the
 * reference knows only its label, and the definition sits wherever the author
 * put it. Rendering footnotes the way readers expect — a superscript number that
 * jumps to a numbered list at the foot of the note, and back again — needs that
 * mapping computed once over the whole document, which is what this transformer
 * does.
 *
 * Numbering follows the order footnotes are *referenced*, not the order their
 * definitions appear, so `[^b]` before `[^a]` still reads 1, 2. Definitions that
 * nothing references are appended afterwards in document order rather than
 * dropped — an unreferenced definition is usually a marker the author deleted by
 * accident, and silently swallowing its text is how footnote content goes
 * missing (see `renderFootnoteSection` in ViewMode for the visible half).
 *
 * Like `remarkBlockRef`, the results ride along on the nodes themselves
 * (`fnNumber`/`fnFirstRef` on references, `footnoteEntries` on the root) rather
 * than in a side channel, so the renderer needs no extra plumbing.
 */
import type { Plugin } from 'unified'
import type { Root, FootnoteDefinition, FootnoteReference } from 'mdast'
import { visit } from 'unist-util-visit'

/** One footnote, in the order it should appear under the note. */
export interface FootnoteEntry {
  /** The label between `[^` and `]`, e.g. `1` or `quelle`. */
  identifier: string
  /** 1-based position in the rendered footnote list. */
  number: number
  definition: FootnoteDefinition
  /** False for a definition no `[^label]` in the document points at. */
  referenced: boolean
}

/** A `footnoteReference` after numbering. */
export type NumberedFootnoteReference = FootnoteReference & {
  /** Absent when no definition matches the label — render the label as-is. */
  fnNumber?: number
  /** True on the first reference of a label: the one the back-link returns to. */
  fnFirstRef?: boolean
}

/** The root after numbering. Empty/absent when the document has no footnotes. */
export type FootnotedRoot = Root & { footnoteEntries?: FootnoteEntry[] }

/**
 * Reads the footnote list a `remarkFootnotes` pass left on the root.
 * Returns an empty array for trees that never went through the plugin
 * (the ViewMode fallback pipeline, for instance).
 */
export function getFootnoteEntries(tree: Root): FootnoteEntry[] {
  return (tree as FootnotedRoot).footnoteEntries ?? []
}

export const remarkFootnotes: Plugin<[], Root> = function () {
  return (tree: Root) => {
    const definitions = new Map<string, FootnoteDefinition>()
    const referenceOrder: string[] = []

    // One pass in document order collects both halves — a reference may well
    // appear before the definition it points at, so they're matched up after.
    visit(tree, (node) => {
      if (node.type === 'footnoteDefinition') {
        const def = node as FootnoteDefinition
        // A duplicated label is the first definition's; that's what remark-gfm
        // binds the references to as well.
        if (!definitions.has(def.identifier)) definitions.set(def.identifier, def)
      } else if (node.type === 'footnoteReference') {
        const ref = node as FootnoteReference
        if (!referenceOrder.includes(ref.identifier)) referenceOrder.push(ref.identifier)
      }
    })

    const referenced = referenceOrder.filter((id) => definitions.has(id))
    const orphaned = [...definitions.keys()].filter((id) => !referenced.includes(id))

    const entries: FootnoteEntry[] = [...referenced, ...orphaned].map((identifier, i) => ({
      identifier,
      number: i + 1,
      definition: definitions.get(identifier)!,
      referenced: referenced.includes(identifier),
    }))

    const numbers = new Map(entries.map((e) => [e.identifier, e.number]))
    const seen = new Set<string>()
    visit(tree, 'footnoteReference', (node: FootnoteReference) => {
      const ref = node as NumberedFootnoteReference
      const number = numbers.get(ref.identifier)
      // Undefined label: leave fnNumber unset so the renderer falls back to the
      // raw label instead of pointing at a list entry that doesn't exist.
      if (number === undefined) return
      ref.fnNumber = number
      if (!seen.has(ref.identifier)) {
        ref.fnFirstRef = true
        seen.add(ref.identifier)
      }
    })

    if (entries.length > 0) (tree as FootnotedRoot).footnoteEntries = entries
  }
}
