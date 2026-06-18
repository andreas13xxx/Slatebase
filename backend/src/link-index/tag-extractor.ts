/**
 * Tag extraction utility for the link-index module.
 *
 * Extracts tags from markdown content, ignoring tags inside fenced code blocks,
 * indented code blocks, and inline code spans.
 *
 * Tag format: `#` followed by a letter (including Unicode), then any combination
 * of letters, digits, underscores, hyphens, and slashes (for nested tags).
 */

/**
 * Extracts all tags from markdown content.
 *
 * Rules:
 * - Tags start with `#` followed by a letter (Unicode-aware)
 * - Tags may contain letters, digits, underscores, hyphens, and slashes
 * - Nested tags like `#projekt/alpha` are returned as a single tag name
 * - Tags inside fenced code blocks (``` or ~~~) are ignored
 * - Tags inside indented code blocks (4 spaces or 1 tab) are ignored
 * - Tags inside inline code (backticks) are ignored
 * - Heading `#` characters are not recognized as tags
 * - Duplicates are deduplicated
 * - Returns tag names without the `#` prefix
 *
 * @param content - The markdown content to extract tags from
 * @returns Array of unique tag names (without `#` prefix)
 */
export function extractTags(content: string): string[] {
  const tags = new Set<string>()
  const lines = content.split('\n')

  let inFencedCodeBlock = false
  let fenceChar = ''
  let fenceLength = 0

  for (const line of lines) {
    // ─── Fenced Code Block Detection ─────────────────────────────────
    if (inFencedCodeBlock) {
      if (isClosingFence(line, fenceChar, fenceLength)) {
        inFencedCodeBlock = false
      }
      continue
    }

    const fenceInfo = getOpeningFence(line)
    if (fenceInfo !== null) {
      inFencedCodeBlock = true
      fenceChar = fenceInfo.char
      fenceLength = fenceInfo.length
      continue
    }

    // ─── Indented Code Block Detection ───────────────────────────────
    if (isIndentedCodeLine(line)) {
      continue
    }

    // ─── Extract tags from line (skipping inline code) ───────────────
    extractTagsFromLine(line, tags)
  }

  return Array.from(tags)
}

/**
 * Extracts tags from a single line, skipping content inside inline code spans.
 */
function extractTagsFromLine(line: string, tags: Set<string>): void {
  // Remove inline code spans before extracting tags
  const withoutInlineCode = removeInlineCode(line)

  // Match tags: # followed by a letter, then word chars + hyphens + slashes
  // Must not be preceded by a word character (avoids matching "C#", URLs with "#")
  const tagRegex = /(?<![a-zA-Z0-9])#([a-zA-Z\u00C0-\u024F\u1E00-\u1EFF][a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF_\-/]*)/g

  let match: RegExpExecArray | null
  while ((match = tagRegex.exec(withoutInlineCode)) !== null) {
    const tagName = match[1]
    if (tagName !== undefined) {
      tags.add(tagName)
    }
  }
}

/**
 * Removes inline code spans from a line, replacing them with spaces
 * (to preserve character positions for the tag regex).
 */
function removeInlineCode(line: string): string {
  // Replace all inline code spans with spaces of same length
  return line.replace(/`[^`]*`/g, (match) => ' '.repeat(match.length))
}

/**
 * Checks if a line opens a fenced code block.
 */
function getOpeningFence(line: string): { char: string; length: number } | null {
  // Count leading spaces (max 3 allowed)
  let indent = 0
  while (indent < line.length && indent < 3 && line[indent] === ' ') {
    indent++
  }

  const char = line[indent]
  if (char !== '`' && char !== '~') {
    return null
  }

  // Count consecutive fence characters
  let length = 0
  let i = indent
  while (i < line.length && line[i] === char) {
    length++
    i++
  }

  if (length < 3) {
    return null
  }

  // Backtick fences cannot have backticks in the info string
  if (char === '`') {
    const infoString = line.slice(i)
    if (infoString.includes('`')) {
      return null
    }
  }

  return { char, length }
}

/**
 * Checks if a line closes a fenced code block.
 */
function isClosingFence(line: string, fenceChar: string, fenceLength: number): boolean {
  let indent = 0
  while (indent < line.length && indent < 3 && line[indent] === ' ') {
    indent++
  }

  if (line[indent] !== fenceChar) {
    return false
  }

  let length = 0
  let i = indent
  while (i < line.length && line[i] === fenceChar) {
    length++
    i++
  }

  if (length < fenceLength) {
    return false
  }

  const remainder = line.slice(i).trim()
  return remainder.length === 0
}

/**
 * Checks if a line is an indented code block line (4 spaces or 1 tab).
 */
function isIndentedCodeLine(line: string): boolean {
  if (line.length === 0) return false
  if (line[0] === '\t') return true
  if (line.length >= 4 && line[0] === ' ' && line[1] === ' ' && line[2] === ' ' && line[3] === ' ') {
    return true
  }
  return false
}
