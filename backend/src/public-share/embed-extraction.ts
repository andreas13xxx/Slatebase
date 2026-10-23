// ─── Public Share Links — Markdown embed helpers ─────────────────────────────
//
// Pure text functions. The heading/block excerpt logic is a port of
// `extractHeadingSection` / `extractBlockById` in frontend/src/components/ViewMode.tsx
// and must stay behaviorally identical, so a shared note shows the same excerpt
// the editor does.

/** An embed found in a Markdown string. */
export interface ParsedEmbed {
  /** Key under which the embed is stored in the resolved map (see {@link embedRef}). */
  ref: string
  /** File target without heading or block fragment, as written. */
  target: string
  heading: string | null
  blockRef: string | null
}

/** Builds the map key for an embed: `target`, `target#heading` or `target#^block`. */
export function embedRef(target: string, heading: string | null, blockRef: string | null): string {
  if (blockRef) return `${target}#^${blockRef}`
  if (heading) return `${target}#${heading}`
  return target
}

/** Removes a leading YAML frontmatter block. Content without one is returned unchanged. */
export function stripFrontmatter(markdown: string): string {
  const normalized = markdown.startsWith('﻿') ? markdown.slice(1) : markdown
  if (!/^---[ \t]*\r?\n/.test(normalized)) return markdown
  const match = /\r?\n---[ \t]*(?:\r?\n|$)/.exec(normalized.slice(3))
  if (match === null) return markdown
  return normalized.slice(3 + match.index + match[0].length)
}

/**
 * Returns the content under `heading` up to the next heading of the same or a
 * higher level. An unknown heading returns the full content (as the editor does).
 */
export function extractHeadingSection(content: string, heading: string): string {
  const lines = content.split('\n')
  const headingLower = heading.toLowerCase().trim()

  let startIndex = -1
  let startLevel = 0

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      if (match[2]!.trim().toLowerCase() === headingLower) {
        startIndex = i
        startLevel = match[1]!.length
        break
      }
    }
  }

  if (startIndex === -1) return content

  let endIndex = lines.length
  for (let i = startIndex + 1; i < lines.length; i++) {
    const match = lines[i]!.match(/^(#{1,6})\s+/)
    if (match && match[1]!.length <= startLevel) {
      endIndex = i
      break
    }
  }

  return lines.slice(startIndex, endIndex).join('\n')
}

/**
 * Returns the block (paragraph, list item or heading section) marked with
 * ` ^blockId`, or `null` if no such block exists.
 */
export function extractBlockById(content: string, blockId: string): string | null {
  const marker = ` ^${blockId}`
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (!line.endsWith(marker)) continue

    const headingMatch = line.match(/^(#{1,6})\s+/)
    if (headingMatch) {
      const level = headingMatch[1]!.length
      let endIndex = lines.length
      for (let j = i + 1; j < lines.length; j++) {
        const nextMatch = lines[j]!.match(/^(#{1,6})\s+/)
        if (nextMatch && nextMatch[1]!.length <= level) {
          endIndex = j
          break
        }
      }
      const headingLine = line.slice(0, line.length - marker.length)
      return [headingLine, ...lines.slice(i + 1, endIndex)].join('\n')
    }

    if (line.match(/^\s*[-*+]\s/) || line.match(/^\s*\d+[.)]\s/)) {
      return line.slice(0, line.length - marker.length)
    }

    let startIdx = i
    for (let j = i - 1; j >= 0; j--) {
      const prevLine = lines[j]!
      if (prevLine.trim() === '' || prevLine.match(/^(#{1,6})\s+/) || prevLine.match(/^\s*[-*+]\s/) || prevLine.match(/^\s*\d+[.)]\s/)) {
        break
      }
      startIdx = j
    }

    const paragraphLines = lines.slice(startIdx, i + 1)
    const lastLine = paragraphLines[paragraphLines.length - 1]!
    paragraphLines[paragraphLines.length - 1] = lastLine.slice(0, lastLine.length - marker.length)
    return paragraphLines.join('\n')
  }

  return null
}

/** Blanks out fenced code blocks and inline code so embeds inside them are ignored. */
function maskCode(markdown: string): string {
  const lines = markdown.split('\n')
  let fence: { char: string; length: number } | null = null
  const out: string[] = []

  for (const line of lines) {
    const trimmed = line.trimStart()
    const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed)
    if (fence !== null) {
      if (fenceMatch && fenceMatch[1]!.startsWith(fence.char) && fenceMatch[1]!.length >= fence.length && trimmed.slice(fenceMatch[1]!.length).trim() === '') {
        fence = null
      }
      out.push('')
      continue
    }
    if (fenceMatch) {
      fence = { char: fenceMatch[1]![0]!, length: fenceMatch[1]!.length }
      out.push('')
      continue
    }
    out.push(line.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length)))
  }

  return out.join('\n')
}

const WIKI_EMBED = /!\[\[([^\]\n]+)\]\]/g
const MARKDOWN_IMAGE = /!\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+"[^"\n]*")?\s*\)/g
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

/**
 * Finds the embeds of a note: `![[target]]`, `![[target#heading]]`,
 * `![[target#^block]]` (a trailing `|display` is dropped) and local Markdown
 * images `![alt](path)`. Embeds inside code are ignored; external URLs are not embeds.
 * Each distinct `ref` appears once, in order of first occurrence.
 */
export function extractEmbeds(markdown: string): ParsedEmbed[] {
  const masked = maskCode(markdown)
  const found = new Map<string, ParsedEmbed>()

  for (const match of masked.matchAll(WIKI_EMBED)) {
    const inner = match[1]!.split('|')[0]!.trim()
    if (inner === '') continue
    const hashIndex = inner.indexOf('#')
    const target = (hashIndex === -1 ? inner : inner.slice(0, hashIndex)).trim()
    const fragment = hashIndex === -1 ? '' : inner.slice(hashIndex + 1).trim()
    if (target === '') continue
    const blockRef = fragment.startsWith('^') && fragment.length > 1 ? fragment.slice(1) : null
    const heading = blockRef === null && fragment !== '' ? fragment : null
    const ref = embedRef(target, heading, blockRef)
    if (!found.has(ref)) found.set(ref, { ref, target, heading, blockRef })
  }

  for (const match of masked.matchAll(MARKDOWN_IMAGE)) {
    let target = match[1]!
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1)
    if (EXTERNAL.test(target)) continue
    try {
      target = decodeURIComponent(target)
    } catch {
      // keep the raw text; resolution will simply not find it
    }
    // Same normalization as the reading view's `normalizeImagePath`, so the key the client
    // derives from the Markdown matches the key the server stored.
    target = target.replace(/\\/g, '/')
    if (target.startsWith('./')) target = target.slice(2)
    target = target.replace(/\/+/g, '/').trim()
    if (target === '') continue
    if (!found.has(target)) found.set(target, { ref: target, target, heading: null, blockRef: null })
  }

  return [...found.values()]
}
