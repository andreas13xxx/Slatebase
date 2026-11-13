/**
 * Finds a heading or block anchor in Markdown source and returns where its line starts — what the
 * editor needs to scroll to it (the reading view scrolls by DOM id instead, see `scrollToAnchor`).
 *
 * @module utils/findAnchorOffset
 */
import type { DeepLinkAnchor } from '../deep-link/deepLink'

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/
// Closing hashes (`## Title ##`) only count when separated by whitespace: `# C#` is the heading "C#".
const HEADING_RE = /^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/

function normalizeHeading(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Offset of the first line after a leading `---` frontmatter block (0 when there is none). */
function bodyStart(content: string): number {
  if (!/^---\r?\n/.test(content)) return 0
  const close = /\r?\n---[ \t]*(?:\r?\n|$)/.exec(content.slice(3))
  return close ? 3 + close.index + close[0].length : 0
}

/**
 * @param content - Markdown source.
 * @param anchor - Heading text (nested `Parent#Child` falls back to its last segment) or block id.
 * @returns Offset of the start of the matching line, or `null` when nothing matches. Frontmatter and
 *   fenced code blocks are skipped, so a `# comment` in YAML or a code sample is not a heading.
 */
export function findAnchorOffset(content: string, anchor: DeepLinkAnchor): number | null {
  const start = bodyStart(content)
  const wanted = anchor.kind === 'heading' ? normalizeHeading(anchor.text) : ''
  const lastSegment = anchor.kind === 'heading' ? normalizeHeading(anchor.text.split('#').filter(Boolean).pop() ?? '') : ''
  const blockRe = anchor.kind === 'block' ? new RegExp(`(?:^|\\s)\\^${anchor.id.replace(/[^A-Za-z0-9-]/g, '')}\\s*$`) : null

  let fence: string | null = null
  let fallback: number | null = null
  let offset = start
  for (const line of content.slice(start).split('\n')) {
    const lineStart = offset
    offset += line.length + 1
    const text = line.replace(/\r$/, '')

    const fenceMatch = FENCE_RE.exec(text)
    if (fenceMatch) {
      const marker = fenceMatch[1] ?? ''
      if (fence === null) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null
      continue
    }
    if (fence !== null) continue

    if (blockRe) {
      if (blockRe.test(text)) return lineStart
      continue
    }
    const heading = HEADING_RE.exec(text)
    if (!heading) continue
    const normalized = normalizeHeading(heading[1] ?? '')
    if (normalized === wanted) return lineStart
    if (fallback === null && lastSegment !== '' && normalized === lastSegment) fallback = lineStart
  }
  return fallback
}
