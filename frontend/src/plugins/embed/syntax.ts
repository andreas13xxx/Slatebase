import type { Extension, Effects, State, Code, TokenizeContext } from 'micromark-util-types'
import { IMAGE_EXTENSIONS } from '../types'

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    embed: 'embed'
    embedMarker: 'embedMarker'
    embedTarget: 'embedTarget'
    embedHeadingMarker: 'embedHeadingMarker'
    embedHeading: 'embedHeading'
    embedSeparator: 'embedSeparator'
    embedDisplay: 'embedDisplay'
  }
}

/**
 * Determines the embed type based on the target file extension.
 * Returns 'image' if the target ends with a known image extension,
 * otherwise returns 'note'.
 */
export function detectEmbedType(target: string): 'image' | 'note' {
  const lower = target.toLowerCase()
  for (const ext of IMAGE_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return 'image'
    }
  }
  return 'note'
}

/**
 * Creates a micromark syntax extension for Obsidian embed syntax (`![[target]]`).
 *
 * Hooks into character code 33 (`!`) and tokenizes:
 * - `![[target]]`
 * - `![[target#heading]]`
 *
 * Code-block immunity is handled by micromark's built-in code construct priority.
 */
export function embedSyntax(): Extension {
  return {
    text: {
      33: { // '!' character code
        tokenize: tokenizeEmbed
      }
    }
  }
}

/**
 * Tokenizer for embed syntax: `![[target]]` or `![[target#heading]]`
 */
function tokenizeEmbed(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State
): State {
  return start

  /**
   * Start: expect `!`
   */
  function start(code: Code): State | undefined {
    if (code !== 33) return nok(code) // '!'
    effects.enter('embed')
    effects.enter('embedMarker')
    effects.consume(code)
    return afterBang
  }

  /**
   * After `!`: expect first `[`
   */
  function afterBang(code: Code): State | undefined {
    if (code !== 91) return nok(code) // '['
    effects.consume(code)
    return afterFirstBracket
  }

  /**
   * After `![`: expect second `[`
   */
  function afterFirstBracket(code: Code): State | undefined {
    if (code !== 91) return nok(code) // '['
    effects.consume(code)
    effects.exit('embedMarker')
    effects.enter('embedTarget')
    return insideTarget
  }

  /**
   * Inside target: consume characters until `#`, `|`, `]`, or end of line.
   * Empty targets are not valid.
   */
  function insideTarget(code: Code): State | undefined {
    // End of line or end of file — invalid embed
    if (code === null || code === -3 || code === -4 || code === -5 || code === 10 || code === 13) {
      return nok(code)
    }

    // Found `#` — switch to heading
    if (code === 35) { // '#'
      effects.exit('embedTarget')
      effects.enter('embedHeadingMarker')
      effects.consume(code)
      effects.exit('embedHeadingMarker')
      effects.enter('embedHeading')
      return insideHeading
    }

    // Found `|` — switch to display/size text
    if (code === 124) { // '|'
      effects.exit('embedTarget')
      effects.enter('embedSeparator')
      effects.consume(code)
      effects.exit('embedSeparator')
      effects.enter('embedDisplay')
      return insideDisplay
    }

    // Found `]` — potential end of embed
    if (code === 93) { // ']'
      effects.exit('embedTarget')
      effects.enter('embedMarker')
      effects.consume(code)
      return afterFirstClose
    }

    effects.consume(code)
    return insideTarget
  }

  /**
   * Inside heading fragment: consume characters until `|`, `]`, or end of line.
   */
  function insideHeading(code: Code): State | undefined {
    // End of line or end of file — invalid embed
    if (code === null || code === -3 || code === -4 || code === -5 || code === 10 || code === 13) {
      return nok(code)
    }

    // Found `|` — switch to display/size text
    if (code === 124) { // '|'
      effects.exit('embedHeading')
      effects.enter('embedSeparator')
      effects.consume(code)
      effects.exit('embedSeparator')
      effects.enter('embedDisplay')
      return insideDisplay
    }

    // Found `]` — potential end of embed
    if (code === 93) { // ']'
      effects.exit('embedHeading')
      effects.enter('embedMarker')
      effects.consume(code)
      return afterFirstClose
    }

    effects.consume(code)
    return insideHeading
  }

  /**
   * Inside display/size text: consume characters until `]` or end of line.
   * Handles formats like: 300, 300x200, 100%, alt text
   */
  function insideDisplay(code: Code): State | undefined {
    // End of line or end of file — invalid embed
    if (code === null || code === -3 || code === -4 || code === -5 || code === 10 || code === 13) {
      return nok(code)
    }

    // Found `]` — potential end of embed
    if (code === 93) { // ']'
      effects.exit('embedDisplay')
      effects.enter('embedMarker')
      effects.consume(code)
      return afterFirstClose
    }

    effects.consume(code)
    return insideDisplay
  }

  /**
   * After first `]`: expect second `]`
   */
  function afterFirstClose(code: Code): State | undefined {
    if (code !== 93) return nok(code) // ']'
    effects.consume(code)
    effects.exit('embedMarker')
    effects.exit('embed')
    return ok
  }
}
