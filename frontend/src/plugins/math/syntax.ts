/**
 * Micromark syntax extension for LaTeX math.
 *
 * Recognizes inline math: `$...$` (single dollar signs, with boundary rules).
 *
 * Boundary rules for inline math (Obsidian-compatible):
 * - Opening `$` must NOT be followed by whitespace
 * - Closing `$` must NOT be preceded by whitespace
 * - Closing `$` must NOT be followed by a digit (prevents $5...$10 false positives)
 * - No newlines within inline math
 * - Escaped `\$` is not treated as a delimiter
 *
 * Block math ($$...$$) is handled as an MDAST transformer in mdast-util.ts,
 * not as a micromark tokenizer, because micromark's flow context processes
 * content line-by-line which makes multi-line block math difficult to tokenize.
 *
 * Code-block immunity is handled by micromark's built-in code construct priority.
 */
import type { Extension, Effects, State, Code, TokenizeContext } from 'micromark-util-types'

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    mathInline: 'mathInline'
    mathInlineMarker: 'mathInlineMarker'
    mathInlineValue: 'mathInlineValue'
  }
}

/** Character codes used in the tokenizer. */
const DOLLAR = 36
const BACKSLASH = 92
const SPACE = 32
const TAB = 9

function isWhitespace(code: Code): boolean {
  return code === SPACE || code === TAB
}

function isDigit(code: Code): boolean {
  if (code === null) return false
  return code >= 48 && code <= 57
}

function isLineEnding(code: Code): boolean {
  if (code === null) return true
  return code === 10 || code === 13 || code < 0
}

/**
 * Tokenizer for inline math: `$...$`
 */
function tokenizeInlineMath(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State
): State {
  let prevCode: Code = null

  return start

  function start(code: Code): State | undefined {
    if (code !== DOLLAR) return nok(code)
    effects.enter('mathInline')
    effects.enter('mathInlineMarker')
    effects.consume(code)
    effects.exit('mathInlineMarker')
    return afterOpen
  }

  /** After opening `$`: check for `$$` (block math) or whitespace (invalid). */
  function afterOpen(code: Code): State | undefined {
    // Double dollar → not inline math
    if (code === DOLLAR) return nok(code)
    // Whitespace after opening $ → not valid inline math
    if (isWhitespace(code) || isLineEnding(code)) return nok(code)
    // Null (end of input) → not valid
    if (code === null) return nok(code)

    effects.enter('mathInlineValue')
    prevCode = code
    effects.consume(code)
    return insideValue
  }

  function insideValue(code: Code): State | undefined {
    // End of line or input → inline math can't span lines
    if (isLineEnding(code) || code === null) return nok(code)

    // Closing `$` — check boundary rules
    if (code === DOLLAR && prevCode !== BACKSLASH) {
      // Preceding character must not be whitespace
      if (isWhitespace(prevCode)) return nok(code)

      effects.exit('mathInlineValue')
      effects.enter('mathInlineMarker')
      effects.consume(code)
      effects.exit('mathInlineMarker')
      effects.exit('mathInline')
      return afterClose
    }

    prevCode = code
    effects.consume(code)
    return insideValue
  }

  /** After closing `$`: next char must not be a digit. */
  function afterClose(code: Code): State | undefined {
    if (isDigit(code)) return nok(code)
    return ok(code)
  }
}

/**
 * Creates a micromark syntax extension for inline LaTeX math.
 * Hooks into character code 36 (`$`) in text context only.
 * Block math is handled separately via MDAST transformer.
 */
export function mathSyntax(): Extension {
  return {
    text: {
      [DOLLAR]: { tokenize: tokenizeInlineMath },
    },
  }
}
