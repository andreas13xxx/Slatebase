/**
 * Parses `^block-id` markers out of a Markdown document.
 *
 * Obsidian's `CachedMetadata.blocks` maps each block id to the region of the
 * document it labels, which is what resolves a `[[note#^some-id]]` link and what
 * plugins read to find or rewrite a specific block. The type was declared here
 * but never populated, so `blocks` was always undefined and every block id
 * looked unknown.
 *
 * A marker labels the *block* it belongs to, not just its own line, so the
 * recorded position spans the whole block. That is what makes the range usable:
 * slicing the source with it reproduces the block a link points at.
 *
 * @module block-cache
 */

import type { BlockCache, Pos } from './types'
import { scanFencedCodeBlocks } from './markdown-sections'

/** A block id at the end of a line: ` ^my-id`. Obsidian allows letters, digits and dashes. */
const TRAILING_MARKER_RE = /\s\^([a-zA-Z0-9-]+)\s*$/
/** A marker sitting alone on its own line, which labels the block above it. */
const STANDALONE_MARKER_RE = /^\s*\^([a-zA-Z0-9-]+)\s*$/

const HEADING_RE = /^ {0,3}#{1,6}\s/
const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s/

/** Line indices covered by fenced code blocks, where markers are literal text. */
function fencedLines(content: string): Set<number> {
  const covered = new Set<number>()
  for (const block of scanFencedCodeBlocks(content)) {
    for (let line = block.lineStart; line <= block.lineEnd; line++) covered.add(line)
  }
  return covered
}

/** Lines occupied by the YAML frontmatter block, if present. */
function frontmatterLines(lines: string[]): Set<number> {
  const covered = new Set<number>()
  if (lines[0]?.trim() !== '---') return covered
  for (let i = 1; i < lines.length; i++) {
    covered.add(i)
    if (lines[i]!.trim() === '---') {
      covered.add(0)
      return covered
    }
  }
  // Unterminated frontmatter: treat nothing as frontmatter rather than the file.
  return new Set<number>()
}

/** Byte offset of the start of each line. */
function lineOffsets(lines: string[]): number[] {
  const offsets: number[] = []
  let offset = 0
  for (const line of lines) {
    offsets.push(offset)
    offset += line.length + 1 // + newline
  }
  return offsets
}

/**
 * First line of the block ending at `markerLine`.
 *
 * Headings and list items label only themselves. A paragraph extends backwards
 * over the contiguous run of non-blank lines, stopping before a blank line, a
 * heading, or the start of a list item.
 */
function blockStartLine(lines: string[], markerLine: number, skip: Set<number>): number {
  const own = lines[markerLine]!
  if (HEADING_RE.test(own) || LIST_ITEM_RE.test(own)) return markerLine

  let start = markerLine
  for (let i = markerLine - 1; i >= 0; i--) {
    const line = lines[i]!
    if (line.trim() === '' || skip.has(i)) break
    start = i
    // The heading or list item that opens the block belongs to it, but nothing
    // above it does.
    if (HEADING_RE.test(line) || LIST_ITEM_RE.test(line)) break
  }
  return start
}

/** Last non-blank line at or above `from`, or null if there is none. */
function previousContentLine(lines: string[], from: number, skip: Set<number>): number | null {
  for (let i = from; i >= 0; i--) {
    if (skip.has(i)) continue
    if (lines[i]!.trim() !== '') return i
  }
  return null
}

function makePos(lines: string[], offsets: number[], startLine: number, endLine: number): Pos {
  return {
    start: { line: startLine, col: 0, offset: offsets[startLine]! },
    end: {
      line: endLine,
      col: lines[endLine]!.length,
      offset: offsets[endLine]! + lines[endLine]!.length,
    },
  }
}

/**
 * Extract every block id in the document.
 *
 * Markers inside fenced code blocks and inside frontmatter are ignored — there
 * they are literal text, not block ids. When the same id appears twice the first
 * one wins; duplicate block ids are a mistake in the note, and picking the first
 * keeps the result stable as the file grows.
 */
export function parseBlocks(content: string): Record<string, BlockCache> {
  const normalized = content.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const offsets = lineOffsets(lines)

  const skip = fencedLines(normalized)
  for (const line of frontmatterLines(lines)) skip.add(line)

  const blocks: Record<string, BlockCache> = {}

  for (let i = 0; i < lines.length; i++) {
    if (skip.has(i)) continue
    const line = lines[i]!

    const standalone = STANDALONE_MARKER_RE.exec(line)
    if (standalone) {
      const id = standalone[1]!
      if (blocks[id]) continue
      // Labels the block above it — used for tables and code blocks, which
      // cannot carry a trailing marker themselves.
      const above = previousContentLine(lines, i - 1, new Set())
      if (above === null) continue
      const start = skip.has(above)
        ? // The block above is a fenced block: take it whole.
          [...scanFencedCodeBlocks(normalized)].find(
            (b) => above >= b.lineStart && above <= b.lineEnd,
          )?.lineStart ?? above
        : blockStartLine(lines, above, skip)
      blocks[id] = { id, position: makePos(lines, offsets, start, i) }
      continue
    }

    const trailing = TRAILING_MARKER_RE.exec(line)
    if (!trailing) continue
    const id = trailing[1]!
    if (blocks[id]) continue

    const start = blockStartLine(lines, i, skip)
    blocks[id] = { id, position: makePos(lines, offsets, start, i) }
  }

  return blocks
}
