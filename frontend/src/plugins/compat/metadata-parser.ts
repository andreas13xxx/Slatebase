/**
 * Parses Markdown source into Obsidian-shaped `CachedMetadata`.
 *
 * This is the single place that turns a file's raw content into everything
 * `MetadataCacheShim.getFileCache()` can return. Before this module existed,
 * that path only ever produced `frontmatter`, `tags`, `links` and `blocks` —
 * every other field the type declares (`headings`, `embeds`, `sections`,
 * `listItems`, `footnotes`, `footnoteRefs`, `referenceLinks`,
 * `frontmatterLinks`) was always `undefined`, even though plugins are free to
 * read them straight off `getFileCache()`.
 *
 * None of this is a spec-compliant Markdown parser — like {@link scanFencedCodeBlocks}
 * and {@link parseBlocks} before it, it follows CommonMark closely enough that
 * ordinary notes produce the shape a plugin expects, not that adversarial input
 * survives byte-for-byte.
 *
 * @module metadata-parser
 */

import { parse as parseYamlDoc } from 'yaml'
import type {
  BlockCache,
  CachedMetadata,
  EmbedCache,
  FootnoteCache,
  FootnoteRefCache,
  FrontmatterLinkCache,
  HeadingCache,
  LinkCache,
  ListItemCache,
  Pos,
  ReferenceLinkCache,
  SectionCache,
  TagCache,
} from './types'
import { parseBlocks } from './block-cache'
import { scanFencedCodeBlocks, type FencedCodeBlock } from './markdown-sections'

// ─── Shared position helpers ────────────────────────────────────────────────

function lineOffsets(lines: string[]): number[] {
  const offsets: number[] = []
  let offset = 0
  for (const line of lines) {
    offsets.push(offset)
    offset += line.length + 1
  }
  return offsets
}

/** A position spanning one or more whole lines. */
function lineSpan(lines: string[], offsets: number[], startLine: number, endLine: number): Pos {
  return {
    start: { line: startLine, col: 0, offset: offsets[startLine]! },
    end: {
      line: endLine,
      col: lines[endLine]!.length,
      offset: offsets[endLine]! + lines[endLine]!.length,
    },
  }
}

/** A position spanning a column range within a single line. */
function colSpan(offsets: number[], line: number, colStart: number, colEnd: number): Pos {
  return {
    start: { line, col: colStart, offset: offsets[line]! + colStart },
    end: { line, col: colEnd, offset: offsets[line]! + colEnd },
  }
}

/** Whether `index` on `line` sits inside an inline code span (odd number of backticks before it). */
function insideInlineCode(line: string, index: number): boolean {
  const backtickCount = (line.slice(0, index).match(/`/g) ?? []).length
  return backtickCount % 2 !== 0
}

// ─── Frontmatter ─────────────────────────────────────────────────────────────

interface FrontmatterResult {
  frontmatter: Record<string, unknown>
  position: Pos
  links: FrontmatterLinkCache[]
  /** 0-indexed line of the closing `---`; the body starts on the next line. */
  endLine: number
}

const WIKILINK_RE = /(!)?\[\[([^\]]+)\]\]/g

function extractWikilinks(
  text: string,
): Array<{ link: string; displayText?: string; original: string; embed: boolean; index: number }> {
  const found: Array<{ link: string; displayText?: string; original: string; embed: boolean; index: number }> = []
  WIKILINK_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = WIKILINK_RE.exec(text)) !== null) {
    const inner = match[2]!
    const pipeIdx = inner.indexOf('|')
    const link = pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner
    const displayText = pipeIdx >= 0 ? inner.slice(pipeIdx + 1) : undefined
    found.push({ link, displayText, original: match[0], embed: match[1] === '!', index: match.index })
  }
  return found
}

/**
 * Parses the YAML frontmatter block, if the document opens with one.
 *
 * The value shape comes from the real `yaml` parser (matching real Obsidian,
 * which wraps js-yaml) so nested objects/arrays round-trip correctly —
 * plugins are free to store structured data in frontmatter (e.g. Day
 * Planner's `planner: { log: [...] }` clock entries), not just flat scalars.
 * On malformed YAML, frontmatter comes back empty — the same "can't resolve
 * it" outcome real Obsidian's cache has for unparsable frontmatter.
 *
 * Wikilink extraction below stays a line-by-line scan independent of the
 * parsed value shape, matching the scope it has always had.
 */
function parseFrontmatter(lines: string[], offsets: number[]): FrontmatterResult | null {
  if (lines[0]?.trim() !== '---') return null

  let endLine = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '---') {
      endLine = i
      break
    }
  }
  if (endLine === -1) return null

  const frontmatter = parseFrontmatterYaml(lines.slice(1, endLine).join('\n'))
  const links: FrontmatterLinkCache[] = []
  const linkCounts = new Map<string, number>()
  let currentKey: string | null = null

  for (let i = 1; i < endLine; i++) {
    const line = lines[i]!
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/)
    if (kvMatch) {
      currentKey = kvMatch[1]!
    }

    if (currentKey && line.includes('[[')) {
      for (const found of extractWikilinks(line)) {
        if (found.embed) continue
        const count = linkCounts.get(currentKey) ?? 0
        linkCounts.set(currentKey, count + 1)
        links.push({
          key: count === 0 ? currentKey : `${currentKey}.${count}`,
          link: found.link,
          original: found.original,
          displayText: found.displayText,
        })
      }
    }
  }

  return {
    frontmatter,
    position: {
      start: { line: 0, col: 0, offset: 0 },
      end: { line: endLine, col: 3, offset: offsets[endLine]! + 3 },
    },
    links,
    endLine,
  }
}

/** Parses a frontmatter YAML block; malformed YAML resolves to `{}` rather than throwing. */
function parseFrontmatterYaml(yamlStr: string): Record<string, unknown> {
  try {
    const parsed: unknown = parseYamlDoc(yamlStr)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

// ─── Block-level line classifiers (shared by sections + listItems) ─────────

const HEADING_RE = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*$/
const THEMATIC_BREAK_RE = /^ {0,3}(?:-\s*){3,}$|^ {0,3}(?:\*\s*){3,}$|^ {0,3}(?:_\s*){3,}$/
const FOOTNOTE_DEF_RE = /^ {0,3}\[\^([^\]]+)\]:/
const LIST_ITEM_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/
const TABLE_DELIM_RE = /^ {0,3}\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/
const LIST_ITEM_BLOCK_ID_RE = /\s\^([a-zA-Z0-9-]+)\s*$/

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Parses Markdown content into `CachedMetadata`.
 *
 * Every field is populated on a best-effort basis and omitted when empty, so
 * callers can rely on `Object.keys()`/truthiness checks the way plugins do
 * against real Obsidian.
 */
export function parseMetadata(rawContent: string): CachedMetadata {
  const content = rawContent.replace(/\r\n/g, '\n')
  const lines = content.split('\n')
  const offsets = lineOffsets(lines)
  const metadata: CachedMetadata = {}

  const fm = parseFrontmatter(lines, offsets)
  let bodyStart = 0
  const tags: TagCache[] = []

  if (fm) {
    if (Object.keys(fm.frontmatter).length > 0) metadata.frontmatter = fm.frontmatter
    metadata.frontmatterPosition = fm.position
    if (fm.links.length > 0) metadata.frontmatterLinks = fm.links
    bodyStart = fm.endLine + 1

    const fmTags = fm.frontmatter['tags'] ?? fm.frontmatter['tag']
    if (fmTags) {
      const tagArray = Array.isArray(fmTags) ? fmTags : [fmTags]
      for (const t of tagArray) {
        const tagStr = String(t).trim()
        if (!tagStr) continue
        tags.push({
          tag: tagStr.startsWith('#') ? tagStr : '#' + tagStr,
          position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } },
        })
      }
    }
  }

  const fencedBlocks = scanFencedCodeBlocks(content)
  const fencedByStart = new Map(fencedBlocks.map((b) => [b.lineStart, b] as const))
  const fencedLines = new Set<number>()
  for (const b of fencedBlocks) for (let l = b.lineStart; l <= b.lineEnd; l++) fencedLines.add(l)

  const links: LinkCache[] = []
  const embeds: EmbedCache[] = []
  const headings: HeadingCache[] = []
  const headingLines = new Set<number>()
  const footnotes: FootnoteCache[] = []
  const footnoteRefs: FootnoteRefCache[] = []
  const referenceLinks: ReferenceLinkCache[] = []
  const listItems: ListItemCache[] = []
  const listStack: Array<{ indent: number; line: number }> = []

  const tagRegex = /(?:^|(?<=\s))#([a-zA-ZÀ-ɏ][\wÀ-ɏ/-]*)/g

  for (let lineNum = bodyStart; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!

    // Fenced code blocks are opaque to every inline scan below.
    if (fencedLines.has(lineNum)) {
      if (fencedByStart.get(lineNum)?.lineStart === lineNum) listStack.length = 0
      continue
    }

    // ── Headings ──────────────────────────────────────────────────────────
    const headingMatch = HEADING_RE.exec(line)
    if (headingMatch) {
      const hashes = headingMatch[1]!
      let text = (headingMatch[2] ?? '').trim()
      // Strip an optional closing ATX sequence: "## Heading ##" -> "Heading"
      text = text.replace(/\s+#+\s*$/, '')
      headings.push({ heading: text, level: hashes.length, position: lineSpan(lines, offsets, lineNum, lineNum) })
      headingLines.add(lineNum)
      listStack.length = 0
      // Fall through: heading text can itself carry tags/links/footnote refs.
    }

    // ── Tags (outside code spans) ────────────────────────────────────────
    tagRegex.lastIndex = 0
    let tagMatch: RegExpExecArray | null
    while ((tagMatch = tagRegex.exec(line)) !== null) {
      if (insideInlineCode(line, tagMatch.index)) continue
      tags.push({
        tag: '#' + tagMatch[1],
        position: colSpan(offsets, lineNum, tagMatch.index, tagMatch.index + tagMatch[0].length),
      })
    }

    // ── Wikilinks and embeds ─────────────────────────────────────────────
    for (const found of extractWikilinks(line)) {
      if (insideInlineCode(line, found.index)) continue
      const position = colSpan(offsets, lineNum, found.index, found.index + found.original.length)
      if (found.embed) {
        embeds.push({ link: found.link, displayText: found.displayText, original: found.original, position })
      } else {
        links.push({ link: found.link, displayText: found.displayText, original: found.original, position })
      }
    }

    // ── Footnotes / footnote references ──────────────────────────────────
    const defMatch = FOOTNOTE_DEF_RE.exec(line)
    if (defMatch) {
      const id = defMatch[1]!
      const markerEnd = line.indexOf(']', line.indexOf('[^')) + 1
      footnotes.push({ id, position: colSpan(offsets, lineNum, line.indexOf('[^'), markerEnd) })
    }
    const footnoteRefRegex = /\[\^([^\]]+)\]/g
    let footnoteMatch: RegExpExecArray | null
    while ((footnoteMatch = footnoteRefRegex.exec(line)) !== null) {
      if (defMatch && footnoteMatch.index === line.indexOf('[^')) continue // the definition's own marker
      if (insideInlineCode(line, footnoteMatch.index)) continue
      footnoteRefs.push({
        id: footnoteMatch[1]!,
        position: colSpan(offsets, lineNum, footnoteMatch.index, footnoteMatch.index + footnoteMatch[0].length),
      })
    }

    // ── Reference-style link definitions: [id]: url ──────────────────────
    const refMatch = /^ {0,3}\[([^\]]+)\]:\s*<?([^\s>]+)>?/.exec(line)
    if (refMatch && !refMatch[1]!.startsWith('^')) {
      const id = refMatch[1]!
      const bracketEnd = line.indexOf(']') + 1
      referenceLinks.push({
        id,
        link: refMatch[2]!,
        position: colSpan(offsets, lineNum, line.indexOf('['), bracketEnd),
      })
    }

    // ── List items ────────────────────────────────────────────────────────
    const listMatch = LIST_ITEM_RE.exec(line)
    if (listMatch) {
      const indent = listMatch[1]!.length
      while (listStack.length > 0 && listStack[listStack.length - 1]!.indent >= indent) listStack.pop()
      const parent = listStack.length > 0 ? listStack[listStack.length - 1]!.line : -1

      const itemText = listMatch[2]!
      const taskMatch = /^\[(.)\]\s*/.exec(itemText)
      const idMatch = LIST_ITEM_BLOCK_ID_RE.exec(line)

      const entry: ListItemCache = { position: lineSpan(lines, offsets, lineNum, lineNum), parent }
      if (taskMatch) entry.task = taskMatch[1]
      if (idMatch) entry.id = idMatch[1]
      listItems.push(entry)
      listStack.push({ indent, line: lineNum })
      continue
    }
    // A genuine top-level, non-continuation line ends the current list run.
    if (line.trim() !== '' && !/^\s/.test(line)) listStack.length = 0
  }

  if (tags.length > 0) metadata.tags = tags
  if (links.length > 0) metadata.links = links
  if (embeds.length > 0) metadata.embeds = embeds
  if (headings.length > 0) metadata.headings = headings
  if (footnotes.length > 0) metadata.footnotes = footnotes
  if (footnoteRefs.length > 0) metadata.footnoteRefs = footnoteRefs
  if (referenceLinks.length > 0) metadata.referenceLinks = referenceLinks
  if (listItems.length > 0) metadata.listItems = listItems

  const blocks = parseBlocks(content)
  if (Object.keys(blocks).length > 0) metadata.blocks = blocks

  const sections = computeSections(lines, offsets, fencedBlocks, bodyStart, headingLines, fm?.position ?? null, blocks)
  if (sections.length > 0) metadata.sections = sections

  return metadata
}

// ─── Sections ────────────────────────────────────────────────────────────────

function computeSections(
  lines: string[],
  offsets: number[],
  fencedBlocks: FencedCodeBlock[],
  bodyStart: number,
  headingLines: Set<number>,
  frontmatterPosition: Pos | null,
  blocks: Record<string, BlockCache>,
): SectionCache[] {
  const sections: SectionCache[] = []
  if (frontmatterPosition) sections.push({ type: 'yaml', position: frontmatterPosition })

  const fencedByStart = new Map(fencedBlocks.map((b) => [b.lineStart, b] as const))
  const n = lines.length
  let i = bodyStart

  const startsNewBlock = (l: string, idx: number): boolean =>
    fencedByStart.has(idx) ||
    headingLines.has(idx) ||
    THEMATIC_BREAK_RE.test(l) ||
    /^ {0,3}>/.test(l) ||
    LIST_ITEM_RE.test(l) ||
    FOOTNOTE_DEF_RE.test(l)

  while (i < n) {
    const line = lines[i]!
    if (line.trim() === '') {
      i++
      continue
    }

    const fenced = fencedByStart.get(i)
    if (fenced) {
      sections.push(makeSection('code', lines, offsets, fenced.lineStart, fenced.lineEnd))
      i = fenced.lineEnd + 1
      continue
    }

    if (headingLines.has(i)) {
      sections.push(makeSection('heading', lines, offsets, i, i))
      i++
      continue
    }

    if (THEMATIC_BREAK_RE.test(line)) {
      sections.push(makeSection('thematicBreak', lines, offsets, i, i))
      i++
      continue
    }

    if (FOOTNOTE_DEF_RE.test(line)) {
      let end = i
      let j = i + 1
      while (j < n && lines[j]!.trim() !== '' && /^(\s{4}|\t)/.test(lines[j]!)) {
        end = j
        j++
      }
      sections.push(makeSection('footnoteDefinition', lines, offsets, i, end))
      i = j
      continue
    }

    if (/^ {0,3}>/.test(line)) {
      let end = i
      let j = i + 1
      while (j < n) {
        if (/^ {0,3}>/.test(lines[j]!)) {
          end = j
          j++
          continue
        }
        if (lines[j]!.trim() === '' && j + 1 < n && /^ {0,3}>/.test(lines[j + 1]!)) {
          j++
          continue
        }
        break
      }
      sections.push(makeSection('blockquote', lines, offsets, i, end))
      i = j
      continue
    }

    if (i + 1 < n && line.includes('|') && TABLE_DELIM_RE.test(lines[i + 1]!) && lines[i + 1]!.includes('-')) {
      let end = i + 1
      let j = i + 2
      while (j < n && lines[j]!.trim() !== '' && lines[j]!.includes('|')) {
        end = j
        j++
      }
      sections.push(makeSection('table', lines, offsets, i, end))
      i = j
      continue
    }

    if (LIST_ITEM_RE.test(line)) {
      let end = i
      let j = i + 1
      while (j < n) {
        const l = lines[j]!
        if (LIST_ITEM_RE.test(l) || /^\s+\S/.test(l)) {
          end = j
          j++
          continue
        }
        if (l.trim() === '' && j + 1 < n && (LIST_ITEM_RE.test(lines[j + 1]!) || /^\s+\S/.test(lines[j + 1]!))) {
          j++
          continue
        }
        break
      }
      sections.push(makeSection('list', lines, offsets, i, end))
      i = j
      continue
    }

    // Paragraph: consume contiguous lines that don't start a different block.
    {
      let end = i
      let j = i + 1
      while (j < n && lines[j]!.trim() !== '' && !startsNewBlock(lines[j]!, j)) {
        end = j
        j++
      }
      sections.push(makeSection('paragraph', lines, offsets, i, end))
      i = j
    }
  }

  // A block id trailing the last line of a section is that section's id,
  // mirroring how a `^ref` at the end of a paragraph labels the paragraph.
  for (const section of sections) {
    for (const block of Object.values(blocks)) {
      if (block.position.end.line === section.position.end.line) {
        section.id = block.id
        break
      }
    }
  }

  return sections
}

function makeSection(type: string, lines: string[], offsets: number[], startLine: number, endLine: number): SectionCache {
  return { type, position: lineSpan(lines, offsets, startLine, endLine) }
}
