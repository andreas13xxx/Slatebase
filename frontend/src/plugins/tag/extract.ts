/**
 * Utility for extracting all tags from a Markdown string.
 *
 * Deliberately a port of the backend's `link-index/tag-extractor.ts` rather
 * than a reuse of this folder's micromark tokenizer: the result is used to
 * predict what the *indexer* will record for the document currently being
 * edited, so it has to match the indexer's rules, not the editor's. The two
 * differ in two places that matter — the tokenizer rejects a `#` at the start
 * of a line (heading syntax) and accepts a leading underscore, the indexer does
 * the opposite. Keep this file in sync with the backend one.
 *
 * Frontmatter `tags:`/`tag:` values are merged in, the way Obsidian and the
 * indexer both treat them: identical to an inline `#tag`.
 */

import { parseFrontmatter } from '../../components/context-panel/utils/parseFrontmatter'

/**
 * Extracts all inline tags from markdown content.
 *
 * Rules:
 * - Tags start with `#` followed by a letter (Unicode-aware)
 * - Tags may contain letters, digits, underscores, hyphens, and slashes
 * - Nested tags like `#rezepte/hauptspeise` are returned as a single tag name
 * - Tags inside fenced, indented, and inline code are ignored
 * - Duplicates are removed
 *
 * @param content - The markdown content to extract tags from
 * @returns Array of unique tag names (without `#` prefix)
 */
export function extractInlineTags(content: string): string[] {
  const tags = new Set<string>()
  const lines = content.split('\n')

  let inFencedCodeBlock = false
  let fenceChar = ''
  let fenceLength = 0

  for (const rawLine of lines) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine

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

    if (isIndentedCodeLine(line)) continue

    extractTagsFromLine(line, tags)
  }

  return Array.from(tags)
}

/**
 * Extracts the tag names a frontmatter block contributes.
 *
 * Obsidian treats the `tags` (and `tag`) property identically to an inline
 * `#tag`. Values may be a list or a single scalar, with or without a leading
 * `#`; a comma-separated scalar (`tags: a, b`) is split the way the inline
 * array form would be.
 *
 * @param content - The full markdown document content
 * @returns Array of tag names (without `#` prefix)
 */
export function extractFrontmatterTags(content: string): string[] {
  const { data } = parseFrontmatter(content)
  if (data === null) return []

  const raw = data['tags'] ?? data['tag']
  if (raw === null || raw === undefined) return []

  const values = Array.isArray(raw) ? raw : [raw]
  const result: string[] = []

  for (const value of values) {
    if (value === null || value === undefined || typeof value === 'object') continue
    for (const part of String(value).split(',')) {
      const trimmed = part.trim()
      const name = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed
      if (name !== '') result.push(name)
    }
  }

  return result
}

/**
 * All tags a document carries — inline plus frontmatter, deduplicated.
 *
 * @param content - The full markdown document content
 * @returns Array of unique tag names (without `#` prefix)
 */
export function extractTags(content: string): string[] {
  const tags = new Set(extractInlineTags(content))
  for (const tag of extractFrontmatterTags(content)) {
    tags.add(tag)
  }
  return Array.from(tags)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Matches `#` + a Unicode letter, then tag characters — see the port note above. */
const TAG_REGEX = /(?<![a-zA-Z0-9])#([a-zA-Z\u00C0-\u024F\u1E00-\u1EFF][a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF_\-/]*)/g

function extractTagsFromLine(line: string, tags: Set<string>): void {
  // Blank out inline code spans, preserving offsets so the regex sees the same
  // character positions.
  const withoutInlineCode = line.replace(/`[^`]*`/g, (match) => ' '.repeat(match.length))

  TAG_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TAG_REGEX.exec(withoutInlineCode)) !== null) {
    const tagName = match[1]
    if (tagName !== undefined) tags.add(tagName)
  }
}

function getOpeningFence(line: string): { char: string; length: number } | null {
  let indent = 0
  while (indent < line.length && indent < 3 && line[indent] === ' ') indent++

  const char = line[indent]
  if (char !== '`' && char !== '~') return null

  let length = 0
  let i = indent
  while (i < line.length && line[i] === char) {
    length++
    i++
  }

  if (length < 3) return null

  // A backtick fence's info string cannot itself contain a backtick.
  if (char === '`' && line.slice(i).includes('`')) return null

  return { char, length }
}

function isClosingFence(line: string, fenceChar: string, fenceLength: number): boolean {
  let indent = 0
  while (indent < line.length && indent < 3 && line[indent] === ' ') indent++

  if (line[indent] !== fenceChar) return false

  let length = 0
  let i = indent
  while (i < line.length && line[i] === fenceChar) {
    length++
    i++
  }

  if (length < fenceLength) return false

  return line.slice(i).trim().length === 0
}

function isIndentedCodeLine(line: string): boolean {
  if (line.length === 0) return false
  if (line[0] === '\t') return true
  return line.startsWith('    ')
}
