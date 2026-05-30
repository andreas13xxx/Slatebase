/**
 * Heading extraction utility for the Context Panel Outline View.
 *
 * Parses markdown content and extracts all headings (h1–h6) with their
 * plain text content and normalized anchors for navigation.
 */

import { createAnchorTracker } from '../../../plugins/heading-anchor'

/** Heading entry for the outline view */
export interface OutlineHeading {
  text: string
  level: 1 | 2 | 3 | 4 | 5 | 6
  anchor: string
}

/** Regex to match markdown headings (lines starting with 1-6 # followed by space and text) */
const HEADING_REGEX = /^(#{1,6})\s+(.+)$/gm

/**
 * Strips inline formatting markers from heading text.
 *
 * Removes bold (`**`, `__`), italic (`*`, `_`), and inline code (`` ` ``)
 * markers while preserving the text content within them.
 */
function stripInlineFormatting(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // bold **text**
    .replace(/__(.+?)__/g, '$1')        // bold __text__
    .replace(/\*(.+?)\*/g, '$1')        // italic *text*
    .replace(/_(.+?)_/g, '$1')          // italic _text_
    .replace(/`(.+?)`/g, '$1')          // inline code `text`
}

/**
 * Extracts all headings from markdown content in document order.
 *
 * Each heading includes its plain text (without # markers or inline formatting),
 * its level (1–6), and a normalized anchor for navigation. Duplicate headings
 * receive numeric suffixes (-1, -2, etc.) via the anchor tracker.
 *
 * @param content - Raw markdown content string
 * @returns Array of OutlineHeading entries in document order
 */
export function extractHeadings(content: string): OutlineHeading[] {
  const headings: OutlineHeading[] = []
  const tracker = createAnchorTracker()

  let match: RegExpExecArray | null
  while ((match = HEADING_REGEX.exec(content)) !== null) {
    const hashes = match[1]
    const rawText = match[2]
    if (!hashes || !rawText) continue

    const level = hashes.length as 1 | 2 | 3 | 4 | 5 | 6
    const text = stripInlineFormatting(rawText.trim())
    const anchor = tracker.getAnchor(text)

    headings.push({ text, level, anchor })
  }

  return headings
}
