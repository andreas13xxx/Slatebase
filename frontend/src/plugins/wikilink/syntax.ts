/**
 * micromark syntax extension for Obsidian wikilinks.
 *
 * Recognizes the following patterns:
 * - [[target]]
 * - [[target|display]]
 * - [[target#heading]]
 * - [[target#heading|display]]
 * - [[#heading]]
 *
 * Registers on character code 91 (`[`) in the text construct map.
 * Code-block immunity is handled by micromark's built-in code construct
 * priority (code constructs take precedence over text constructs).
 */
import type {
  Code,
  Construct,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from 'micromark-util-types'

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    wikilink: 'wikilink'
    wikilinkMarker: 'wikilinkMarker'
    wikilinkData: 'wikilinkData'
    wikilinkTarget: 'wikilinkTarget'
    wikilinkSeparator: 'wikilinkSeparator'
    wikilinkDisplay: 'wikilinkDisplay'
    wikilinkHeadingMarker: 'wikilinkHeadingMarker'
    wikilinkHeading: 'wikilinkHeading'
  }
}

const wikilinkConstruct: Construct = {
  name: 'wikilink',
  tokenize: tokenizeWikilink,
}

/**
 * Creates a micromark syntax extension for wikilink parsing.
 *
 * @returns Extension object to register with micromark.
 */
export function wikilinkSyntax(): Extension {
  return {
    text: {
      91: wikilinkConstruct, // '[' character code
    },
  }
}

/**
 * Tokenizer for wikilink syntax.
 *
 * State machine:
 * start → openBracket1 → openBracket2 → targetStart → target → ...
 *   ... → (separator → display) | (headingMarker → heading) → closeBracket1 → closeBracket2
 */
function tokenizeWikilink(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State
): State {
  return start

  /** Expect first `[` */
  function start(code: Code): State | undefined {
    if (code !== 91) return nok(code) // '['
    effects.enter('wikilink')
    effects.enter('wikilinkMarker')
    effects.consume(code)
    return openBracket2
  }

  /** Expect second `[` */
  function openBracket2(code: Code): State | undefined {
    if (code !== 91) return nok(code) // '['
    effects.consume(code)
    effects.exit('wikilinkMarker')
    return afterOpen
  }

  /** After `[[`, decide what comes next */
  function afterOpen(code: Code): State | undefined {
    // Empty wikilink `[[]]` is invalid
    if (code === null || code === 93) return nok(code)
    // Line endings inside wikilinks are not allowed
    if (code === -3 || code === -4 || code === -5 || code === 10 || code === 13) {
      return nok(code)
    }
    // Start of heading-only link `[[#heading]]`
    if (code === 35) { // '#'
      effects.enter('wikilinkData')
      effects.enter('wikilinkTarget')
      effects.exit('wikilinkTarget')
      effects.enter('wikilinkHeadingMarker')
      effects.consume(code)
      effects.exit('wikilinkHeadingMarker')
      effects.enter('wikilinkHeading')
      return heading
    }
    // Normal target
    effects.enter('wikilinkData')
    effects.enter('wikilinkTarget')
    effects.consume(code)
    return target
  }

  /** Consume target characters until `|`, `#`, `]`, or end */
  function target(code: Code): State | undefined {
    // End of input or line ending — invalid
    if (code === null || code === -3 || code === -4 || code === -5 || code === 10 || code === 13) {
      return nok(code)
    }
    // Closing `]` — start close sequence
    if (code === 93) { // ']'
      effects.exit('wikilinkTarget')
      return closeBracket1(code)
    }
    // Pipe separator — switch to display text
    if (code === 124) { // '|'
      effects.exit('wikilinkTarget')
      effects.enter('wikilinkSeparator')
      effects.consume(code)
      effects.exit('wikilinkSeparator')
      effects.enter('wikilinkDisplay')
      return display
    }
    // Hash — switch to heading
    if (code === 35) { // '#'
      effects.exit('wikilinkTarget')
      effects.enter('wikilinkHeadingMarker')
      effects.consume(code)
      effects.exit('wikilinkHeadingMarker')
      effects.enter('wikilinkHeading')
      return heading
    }
    // Regular character (including spaces, umlauts, punctuation)
    effects.consume(code)
    return target
  }

  /** Consume heading characters until `|`, `]`, or end */
  function heading(code: Code): State | undefined {
    // End of input or line ending — invalid
    if (code === null || code === -3 || code === -4 || code === -5 || code === 10 || code === 13) {
      return nok(code)
    }
    // Closing `]`
    if (code === 93) { // ']'
      effects.exit('wikilinkHeading')
      return closeBracket1(code)
    }
    // Pipe separator — switch to display text
    if (code === 124) { // '|'
      effects.exit('wikilinkHeading')
      effects.enter('wikilinkSeparator')
      effects.consume(code)
      effects.exit('wikilinkSeparator')
      effects.enter('wikilinkDisplay')
      return display
    }
    // Regular character
    effects.consume(code)
    return heading
  }

  /** Consume display text characters until `]` or end */
  function display(code: Code): State | undefined {
    // End of input or line ending — invalid
    if (code === null || code === -3 || code === -4 || code === -5 || code === 10 || code === 13) {
      return nok(code)
    }
    // Closing `]`
    if (code === 93) { // ']'
      effects.exit('wikilinkDisplay')
      return closeBracket1(code)
    }
    // Regular character
    effects.consume(code)
    return display
  }

  /** Expect first `]` of closing marker */
  function closeBracket1(code: Code): State | undefined {
    if (code !== 93) return nok(code) // ']'
    effects.exit('wikilinkData')
    effects.enter('wikilinkMarker')
    effects.consume(code)
    return closeBracket2
  }

  /** Expect second `]` of closing marker */
  function closeBracket2(code: Code): State | undefined {
    if (code !== 93) return nok(code) // ']'
    effects.consume(code)
    effects.exit('wikilinkMarker')
    effects.exit('wikilink')
    return ok
  }
}
