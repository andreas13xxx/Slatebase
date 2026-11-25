/**
 * Cuts the section of one heading out of a Markdown note: the heading line and everything up to the
 * next heading of the same or a higher level. Used by previews that show a heading (outline, heading
 * bookmarks, `[[note#Heading]]`), not the whole note.
 *
 * Headings inside fenced code blocks do not count. The match is case-insensitive on the trimmed
 * heading text; the first match wins. Returns null when the note has no such heading.
 *
 * @module utils/headingSection
 */

const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/

export function extractHeadingSection(content: string, heading: string): string | null {
  const wanted = heading.trim().toLowerCase()
  if (!wanted) return null

  const lines = content.split(/\r?\n/)
  let fence: string | null = null
  let start = -1
  let level = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const fenceMatch = FENCE.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1] ?? ''
      if (fence === null) fence = marker[0] ?? null
      else if (marker[0] === fence) fence = null
      continue
    }
    if (fence !== null) continue

    const match = HEADING.exec(line)
    if (!match) continue
    const thisLevel = (match[1] ?? '').length
    if (start === -1) {
      if ((match[2] ?? '').trim().toLowerCase() === wanted) {
        start = i
        level = thisLevel
      }
    } else if (thisLevel <= level) {
      return lines.slice(start, i).join('\n').trimEnd()
    }
  }
  return start === -1 ? null : lines.slice(start).join('\n').trimEnd()
}
