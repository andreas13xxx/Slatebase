/**
 * Maps rendered code blocks back to their line range in the Markdown source.
 *
 * Obsidian's `MarkdownPostProcessorContext.getSectionInfo(el)` tells a plugin
 * which lines of the source document produced the element it is rendering into.
 * Plugins such as Tasks and Dataview need it to write edits back to the right
 * place — without it they can render, but not modify the note.
 *
 * Slatebase renders Markdown to React elements and then walks the resulting DOM
 * looking for code blocks, so the source positions are not carried through the
 * pipeline. This module recovers them by scanning the source for fenced code
 * blocks and matching them to the rendered blocks in document order.
 *
 * @module markdown-sections
 */

/** Obsidian's `MarkdownSectionInformation`. */
export interface MarkdownSectionInformation {
  /** The full source text of the document. */
  text: string
  /** 0-indexed line of the opening fence. */
  lineStart: number
  /** 0-indexed line of the closing fence. */
  lineEnd: number
}

/** A fenced code block located in the Markdown source. */
export interface FencedCodeBlock {
  /** Language from the info string, lowercased. Empty when none was given. */
  language: string
  /** The block body, excluding both fence lines. */
  content: string
  /** 0-indexed line of the opening fence. */
  lineStart: number
  /** 0-indexed line of the closing fence, or the last line if never closed. */
  lineEnd: number
}

/** Matches an opening or closing fence: up to 3 spaces, then ``` or ~~~ (or longer). */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/

/**
 * Find every fenced code block in a Markdown document.
 *
 * Follows CommonMark closely enough for section mapping: a fence is closed by a
 * fence of the same character that is at least as long and carries no info
 * string, which is what makes nested fences work. An unclosed fence runs to the
 * end of the document, as CommonMark specifies.
 */
export function scanFencedCodeBlocks(markdown: string): FencedCodeBlock[] {
  const lines = markdown.split('\n')
  const blocks: FencedCodeBlock[] = []

  let i = 0
  while (i < lines.length) {
    const openMatch = FENCE_RE.exec(lines[i]!)
    if (!openMatch) {
      i++
      continue
    }

    const fence = openMatch[1]!
    const info = openMatch[2] ?? ''

    // A backtick fence's info string may not contain a backtick — that would be
    // inline code, not a fence.
    if (fence.startsWith('`') && info.includes('`')) {
      i++
      continue
    }

    const lineStart = i
    const language = info.trim().split(/\s+/)[0]?.toLowerCase() ?? ''

    // Scan for the closing fence.
    let lineEnd = lines.length - 1
    const contentLines: string[] = []
    let j = i + 1
    for (; j < lines.length; j++) {
      const closeMatch = FENCE_RE.exec(lines[j]!)
      const closesThisBlock =
        closeMatch &&
        closeMatch[1]![0] === fence[0] &&
        closeMatch[1]!.length >= fence.length &&
        (closeMatch[2] ?? '').trim() === ''

      if (closesThisBlock) {
        lineEnd = j
        break
      }
      contentLines.push(lines[j]!)
    }
    // Unclosed: the block runs to the end of the document.
    if (j >= lines.length) lineEnd = lines.length - 1

    blocks.push({ language, content: contentLines.join('\n'), lineStart, lineEnd })
    i = lineEnd + 1
  }

  return blocks
}

/** Trailing newlines differ between the source body and `textContent`. */
function normalize(text: string): string {
  return text.replace(/\n+$/, '')
}

/**
 * Pair rendered code blocks with the source blocks they came from.
 *
 * Matching walks both lists in document order and requires the language and body
 * to agree, so a block the renderer skipped (or one the scanner did not find)
 * shifts nothing: it is simply left unmatched, and `getSectionInfo` returns null
 * for it rather than a confidently wrong line range.
 *
 * @param renderedBlocks - Rendered blocks in document order, as `{language, content}`
 * @param sourceBlocks - Result of {@link scanFencedCodeBlocks}
 * @returns For each rendered block, the matching source block or null
 */
export function matchRenderedBlocks(
  renderedBlocks: Array<{ language: string; content: string }>,
  sourceBlocks: FencedCodeBlock[],
): Array<FencedCodeBlock | null> {
  const result: Array<FencedCodeBlock | null> = []
  let cursor = 0

  for (const rendered of renderedBlocks) {
    let matched: FencedCodeBlock | null = null

    for (let i = cursor; i < sourceBlocks.length; i++) {
      const candidate = sourceBlocks[i]!
      if (
        candidate.language === rendered.language.toLowerCase() &&
        normalize(candidate.content) === normalize(rendered.content)
      ) {
        matched = candidate
        cursor = i + 1
        break
      }
    }

    result.push(matched)
  }

  return result
}

/** Build the Obsidian-shaped section info for a located block. */
export function toSectionInfo(
  source: string,
  block: FencedCodeBlock,
): MarkdownSectionInformation {
  return { text: source, lineStart: block.lineStart, lineEnd: block.lineEnd }
}
