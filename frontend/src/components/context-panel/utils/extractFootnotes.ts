/**
 * Footnote extraction utility for the Context Panel Footnotes View.
 *
 * Parses markdown content and extracts every footnote the document carries —
 * its label, its 1-based number, the definition text, how many times it is
 * referenced, and whether a definition is referenced at all.
 *
 * Numbering follows the order footnotes are *referenced*, not the order their
 * definitions appear — the same rule the renderer's `remarkFootnotes`
 * transformer (`plugins/footnote/plugin.ts`) uses, so the sidebar list and the
 * rendered footnote list at the foot of the note always agree. Definitions that
 * nothing references are listed afterwards in document order (and flagged), the
 * same way the renderer keeps them rather than silently dropping their text.
 *
 * This is a deliberate regex port of the renderer's MDAST pass, not a reuse of
 * it: the panel needs a synchronous, dependency-free parse of the raw editor
 * buffer (same bar as `extractHeadings`), and fenced code blocks are skipped so
 * a `[^note]` written inside a code sample is not mistaken for a real footnote.
 */

/** One footnote entry for the Footnotes view, in rendered order. */
export interface FootnoteEntry {
  /** The label between `[^` and `]`, e.g. `1` or `quelle`. */
  identifier: string
  /** 1-based position in the rendered footnote list. */
  number: number
  /** The definition's plain text (first line / collapsed), for the list preview. */
  text: string
  /** How many `[^label]` references point at this footnote (0 for an orphan). */
  refCount: number
  /** False for a definition no reference in the document points at. */
  referenced: boolean
  /** Anchor of the first reference, used to scroll to it in the rendered note. */
  anchor: string
}

/** Matches a footnote definition line: `[^id]: text` (text may be empty). */
const DEFINITION_REGEX = /^\[\^([^\]]+)\]:\s?(.*)$/
/** Matches footnote references `[^id]` anywhere in a line. */
const REFERENCE_REGEX = /\[\^([^\]]+)\]/g
/** Matches a fenced code-block delimiter (``` or ~~~, any indent/info string). */
const FENCE_REGEX = /^\s*(```+|~~~+)/

/**
 * Strips inline formatting markers from definition text so the preview reads
 * as plain prose. Mirrors `extractHeadings`'s `stripInlineFormatting`.
 */
function stripInlineFormatting(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .trim()
}

/**
 * Extracts all footnotes from markdown content.
 *
 * @param content - Raw markdown content string
 * @returns Footnote entries in rendered order (referenced first, then orphans)
 */
export function extractFootnotes(content: string): FootnoteEntry[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')

  const definitions = new Map<string, string>()
  const refCounts = new Map<string, number>()
  const referenceOrder: string[] = []

  let inFence = false

  for (const line of lines) {
    // Track fenced code blocks so `[^x]` inside a sample is not counted.
    if (FENCE_REGEX.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    // A definition line also contains a `[^id]` token, but that is the
    // definition's own marker, not a reference — handle it first and skip the
    // reference scan for this line.
    const defMatch = line.match(DEFINITION_REGEX)
    if (defMatch) {
      const id = defMatch[1]!
      const text = defMatch[2] ?? ''
      // A duplicated label keeps the first definition, matching remark-gfm.
      if (!definitions.has(id)) definitions.set(id, stripInlineFormatting(text))
      continue
    }

    // Count every reference occurrence; remember first-seen order for numbering.
    REFERENCE_REGEX.lastIndex = 0
    let refMatch: RegExpExecArray | null
    while ((refMatch = REFERENCE_REGEX.exec(line)) !== null) {
      const id = refMatch[1]!
      refCounts.set(id, (refCounts.get(id) ?? 0) + 1)
      if (!referenceOrder.includes(id)) referenceOrder.push(id)
    }
  }

  const referenced = referenceOrder.filter((id) => definitions.has(id))
  const orphaned = [...definitions.keys()].filter((id) => !referenced.includes(id))

  return [...referenced, ...orphaned].map((identifier, i) => ({
    identifier,
    number: i + 1,
    text: definitions.get(identifier) ?? '',
    refCount: refCounts.get(identifier) ?? 0,
    referenced: referenced.includes(identifier),
    anchor: `fnref-${identifier}`,
  }))
}
