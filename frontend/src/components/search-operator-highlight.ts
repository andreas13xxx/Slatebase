/**
 * Client-side search operator highlighting utility.
 * Mirrors the backend's query-parser regex to identify operator tokens
 * in the search input and produce colored segments for the shadow overlay.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Segment type for visual rendering. */
export type HighlightSegmentType = 'operator-keyword' | 'operator-value' | 'operator-negation' | 'freetext'

/** A single segment of highlighted text. */
export interface HighlightedSegment {
  text: string
  type: HighlightSegmentType
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Known operator keywords (must match backend's query-parser.ts). */
const KNOWN_OPERATORS = new Set(['path', 'file', 'tag', 'property'])

/**
 * Regex matching operator tokens.
 * Same pattern as backend's OPERATOR_REGEX.
 */
const OPERATOR_REGEX = /(-?)(path|file|tag|property):("(?:[^"\\]|\\.)*"|[^\s]+)/g

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parses a query string into highlighted segments for visual rendering.
 * Segments cover the entire string without gaps.
 */
export function highlightSearchQuery(query: string): HighlightedSegment[] {
  if (!query) return []

  const segments: HighlightedSegment[] = []
  let lastIndex = 0

  OPERATOR_REGEX.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = OPERATOR_REGEX.exec(query)) !== null) {
    const keyword = match[2]!
    if (!KNOWN_OPERATORS.has(keyword)) continue

    const fullMatch = match[0]
    const matchStart = match.index
    const negationPrefix = match[1]!
    const rawValue = match[3]!

    // Add freetext segment before this operator (if any)
    if (matchStart > lastIndex) {
      const before = query.slice(lastIndex, matchStart)
      segments.push({ text: before, type: 'freetext' })
    }

    // Negation prefix (-)
    if (negationPrefix === '-') {
      segments.push({ text: '-', type: 'operator-negation' })
    }

    // Keyword + colon
    segments.push({ text: `${keyword}:`, type: 'operator-keyword' })

    // Value
    segments.push({ text: rawValue, type: 'operator-value' })

    lastIndex = matchStart + fullMatch.length
  }

  // Trailing freetext
  if (lastIndex < query.length) {
    segments.push({ text: query.slice(lastIndex), type: 'freetext' })
  }

  return segments
}
