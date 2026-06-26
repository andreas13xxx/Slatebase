/**
 * Backend wikilink parser for extracting wikilinks from Markdown strings.
 *
 * Produces the same targets as the frontend `extractWikilinks()` function
 * (Property 9: Backend Parser Equivalence). Ignores wikilinks inside
 * fenced code blocks, indented code blocks, and inline code.
 */
import type { ParsedWikilink } from './types.js'

/**
 * Extracts all wikilinks from a Markdown string.
 *
 * Handles the following formats:
 * - `[[target]]` → target="target", display="target", heading=null
 * - `[[folder/file]]` → target="folder/file", display="folder/file", heading=null
 * - `[[file#heading]]` → target="file", display="file > heading", heading="heading"
 * - `[[file#heading|display]]` → target="file", display="display", heading="heading"
 * - `[[#heading]]` → target="", display="heading", heading="heading"
 *
 * Excludes wikilinks inside:
 * - Fenced code blocks (``` or ~~~)
 * - Indented code blocks (4 spaces or 1 tab at line start)
 * - Inline code (backticks)
 *
 * Ignores invalid wikilinks:
 * - Empty `[[]]`
 * - Unclosed `[[...`
 * - Wikilinks containing newlines
 *
 * @param markdown - The markdown string to extract wikilinks from.
 * @returns Array of ParsedWikilink objects with target, display, heading, and position.
 */
export function extractWikilinks(markdown: string): ParsedWikilink[] {
  const results: ParsedWikilink[] = []
  const lines = markdown.split('\n')

  let inFencedCodeBlock = false
  let fenceChar = ''
  let fenceIndent = 0
  let fenceLength = 0

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!

    // ─── Fenced Code Block Detection ───────────────────────────────────
    if (inFencedCodeBlock) {
      // Check if this line closes the fenced code block
      if (isClosingFence(line, fenceChar, fenceIndent, fenceLength)) {
        inFencedCodeBlock = false
      }
      continue
    }

    // Check if this line opens a fenced code block
    const fenceInfo = getOpeningFence(line)
    if (fenceInfo !== null) {
      inFencedCodeBlock = true
      fenceChar = fenceInfo.char
      fenceIndent = fenceInfo.indent
      fenceLength = fenceInfo.length
      continue
    }

    // ─── Indented Code Block Detection ─────────────────────────────────
    if (isIndentedCodeLine(line)) {
      continue
    }

    // ─── Extract Wikilinks from Line (skipping inline code) ────────────
    extractFromLine(line, lineIndex + 1, results)
  }

  return results
}

/**
 * Checks if a line opens a fenced code block.
 * Returns fence info or null if not a fence opener.
 */
function getOpeningFence(line: string): { char: string; indent: number; length: number } | null {
  // Count leading spaces (max 3 allowed for a fence)
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

  // Need at least 3 fence characters
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

  return { char, indent, length }
}

/**
 * Checks if a line closes a fenced code block.
 */
function isClosingFence(line: string, fenceChar: string, _fenceIndent: number, fenceLength: number): boolean {
  // Count leading spaces (max 3 allowed for closing fence)
  let indent = 0
  while (indent < line.length && indent < 3 && line[indent] === ' ') {
    indent++
  }

  if (line[indent] !== fenceChar) {
    return false
  }

  // Count consecutive fence characters
  let length = 0
  let i = indent
  while (i < line.length && line[i] === fenceChar) {
    length++
    i++
  }

  // Closing fence must be at least as long as opening fence
  if (length < fenceLength) {
    return false
  }

  // After the fence characters, only spaces are allowed
  const remainder = line.slice(i).trim()
  return remainder.length === 0
}

/**
 * Checks if a line is an indented code block line.
 * A line is indented code if it starts with 4 spaces or 1 tab.
 */
function isIndentedCodeLine(line: string): boolean {
  if (line.length === 0) {
    return false
  }
  if (line[0] === '\t') {
    return true
  }
  if (line.length >= 4 && line[0] === ' ' && line[1] === ' ' && line[2] === ' ' && line[3] === ' ') {
    return true
  }
  return false
}

/**
 * Extracts wikilinks from a single line, skipping content inside inline code spans.
 */
function extractFromLine(line: string, lineNumber: number, results: ParsedWikilink[]): void {
  let i = 0

  while (i < line.length) {
    // ─── Skip Inline Code ────────────────────────────────────────────
    if (line[i] === '`') {
      // Count consecutive backticks to determine the code span delimiter
      let backtickCount = 0
      const backtickStart = i
      while (i < line.length && line[i] === '`') {
        backtickCount++
        i++
      }

      // Find matching closing backticks
      let found = false
      while (i < line.length) {
        if (line[i] === '`') {
          let closeCount = 0
          while (i < line.length && line[i] === '`') {
            closeCount++
            i++
          }
          if (closeCount === backtickCount) {
            found = true
            break
          }
          // Not matching — continue searching
        } else {
          i++
        }
      }

      if (!found) {
        // Unclosed inline code — treat rest of line as code
        // Actually per CommonMark, unclosed backticks are literal.
        // But for safety (matching frontend behavior where micromark
        // handles this), we skip to end.
        // Reset: unclosed backtick sequences are literal text, not code
        i = backtickStart + backtickCount
      }
      continue
    }

    // ─── Detect Wikilink Opening `[[` ────────────────────────────────
    if (line[i] === '[' && i + 1 < line.length && line[i + 1] === '[') {
      const startColumn = i + 1 // 1-based column
      i += 2 // Skip `[[`

      const wikilink = parseWikilinkContent(line, i)
      if (wikilink !== null) {
        results.push({
          target: wikilink.target,
          display: wikilink.display,
          heading: wikilink.heading,
          blockRef: wikilink.blockRef,
          position: { line: lineNumber, column: startColumn },
        })
        i = wikilink.endIndex
      }
      // If null, the `[[` was not a valid wikilink — continue scanning
      continue
    }

    i++
  }
}

/**
 * Parses the content between `[[` and `]]`.
 * Returns the parsed wikilink or null if invalid.
 *
 * @param line - The full line string
 * @param startIndex - Index right after the opening `[[`
 */
function parseWikilinkContent(
  line: string,
  startIndex: number
): { target: string; display: string; heading: string | null; blockRef: string | null; endIndex: number } | null {
  let i = startIndex
  let target = ''
  let heading: string | null = null
  let blockRef: string | null = null
  let display: string | null = null

  // Empty wikilink `[[]]` is invalid
  if (i < line.length && line[i] === ']') {
    return null
  }

  // Check for heading-only link `[[#...]]`
  if (i < line.length && line[i] === '#') {
    i++ // Skip '#'
    // Parse heading (may be a block reference if starts with ^)
    const headingResult = consumeUntil(line, i, ['|', ']'])
    if (headingResult === null) {
      return null
    }

    // Detect block reference: heading starts with ^
    if (headingResult.value.startsWith('^')) {
      blockRef = headingResult.value.slice(1)
    } else {
      heading = headingResult.value
    }

    if (headingResult.stopChar === '|') {
      i = headingResult.endIndex + 1 // Skip '|'
      const displayResult = consumeUntil(line, i, [']'])
      if (displayResult === null) {
        return null
      }
      display = displayResult.value
      i = displayResult.endIndex
    } else {
      i = headingResult.endIndex
    }
  } else {
    // Parse target
    const targetResult = consumeUntil(line, i, ['#', '|', ']'])
    if (targetResult === null) {
      return null
    }
    target = targetResult.value

    if (targetResult.stopChar === '#') {
      i = targetResult.endIndex + 1 // Skip '#'
      // Parse heading (may be a block reference if starts with ^)
      const headingResult = consumeUntil(line, i, ['|', ']'])
      if (headingResult === null) {
        return null
      }

      // Detect block reference: heading starts with ^
      if (headingResult.value.startsWith('^')) {
        blockRef = headingResult.value.slice(1)
      } else {
        heading = headingResult.value
      }

      if (headingResult.stopChar === '|') {
        i = headingResult.endIndex + 1 // Skip '|'
        const displayResult = consumeUntil(line, i, [']'])
        if (displayResult === null) {
          return null
        }
        display = displayResult.value
        i = displayResult.endIndex
      } else {
        i = headingResult.endIndex
      }
    } else if (targetResult.stopChar === '|') {
      i = targetResult.endIndex + 1 // Skip '|'
      const displayResult = consumeUntil(line, i, [']'])
      if (displayResult === null) {
        return null
      }
      display = displayResult.value
      i = displayResult.endIndex
    } else {
      i = targetResult.endIndex
    }
  }

  // Expect closing `]]`
  if (i >= line.length || line[i] !== ']') {
    return null
  }
  i++ // First ']'
  if (i >= line.length || line[i] !== ']') {
    return null
  }
  i++ // Second ']'

  // Validate: target must not be empty unless it's a heading-only or blockRef-only link
  if (target === '' && heading === null && blockRef === null) {
    return null
  }

  // Determine display text (matching frontend behavior):
  // 1. If explicit display text was provided, use it
  // 2. If blockRef exists but no display, use "target > ^block-id" (or just "^block-id" if target is empty)
  // 3. If heading exists but no display, use "target > heading" (or just heading if target is empty)
  // 4. Otherwise, use target
  let resolvedDisplay: string
  if (display !== null) {
    resolvedDisplay = display
  } else if (blockRef !== null) {
    resolvedDisplay = target ? `${target} > ^${blockRef}` : `^${blockRef}`
  } else if (heading !== null) {
    resolvedDisplay = target ? `${target} > ${heading}` : heading
  } else {
    resolvedDisplay = target
  }

  return {
    target,
    display: resolvedDisplay,
    heading,
    blockRef,
    endIndex: i,
  }
}

/**
 * Consumes characters from the line until one of the stop characters is found.
 * Returns null if end of line is reached without finding a stop character.
 */
function consumeUntil(
  line: string,
  startIndex: number,
  stopChars: string[]
): { value: string; stopChar: string; endIndex: number } | null {
  let i = startIndex

  while (i < line.length) {
    const ch = line[i]!
    if (stopChars.includes(ch)) {
      return {
        value: line.slice(startIndex, i),
        stopChar: ch,
        endIndex: i,
      }
    }
    i++
  }

  // Reached end of line without finding stop character — invalid (unclosed)
  return null
}
