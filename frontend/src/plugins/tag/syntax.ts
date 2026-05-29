import type {
  Code,
  Construct,
  Effects,
  Extension,
  Previous,
  State,
  TokenizeContext,
  Tokenizer,
} from 'micromark-util-types'

/**
 * Custom token types for the tag syntax extension.
 * We use module augmentation to extend the TokenTypeMap.
 */
declare module 'micromark-util-types' {
  interface TokenTypeMap {
    tag: 'tag'
    tagMarker: 'tagMarker'
    tagValue: 'tagValue'
  }
}

/**
 * Check if a character code is a letter (a-z, A-Z) or underscore.
 */
function isTagStartChar(code: Code): boolean {
  if (code === null) return false
  return (
    (code >= 65 && code <= 90) ||   // A-Z
    (code >= 97 && code <= 122) ||  // a-z
    code === 95                      // _
  )
}

/**
 * Check if a character code is a valid tag continuation character:
 * letters, digits, underscores, hyphens, slashes.
 */
function isTagContinueChar(code: Code): boolean {
  if (code === null) return false
  return (
    (code >= 65 && code <= 90) ||   // A-Z
    (code >= 97 && code <= 122) ||  // a-z
    (code >= 48 && code <= 57) ||   // 0-9
    code === 95 ||                   // _
    code === 45 ||                   // -
    code === 47                      // /
  )
}

/**
 * Check if the previous character allows a tag to start.
 * Tags can only appear after whitespace, line start, or punctuation.
 * They must NOT appear inside words or URLs.
 */
const previousCheck: Previous = function (this: TokenizeContext, code: Code): boolean {
  // null means start of content (line start) — allowed
  if (code === null) return true
  // Line endings (micromark uses negative codes for line endings)
  if (code < 0) return true
  // Whitespace
  if (code === 32 || code === 9) return true // space, tab
  // Common punctuation that can precede a tag
  if (
    code === 40 ||  // (
    code === 91 ||  // [
    code === 123 || // {
    code === 34 ||  // "
    code === 39 ||  // '
    code === 44 ||  // ,
    code === 59 ||  // ;
    code === 58 ||  // :
    code === 46 ||  // .
    code === 33 ||  // !
    code === 63 ||  // ?
    code === 62 ||  // >
    code === 60     // <
  ) {
    return true
  }
  // Anything else (letters, digits, etc.) means we're inside a word or URL
  return false
}

/**
 * Tokenizer for inline tags (#tagname, #nested/tag).
 *
 * The tokenizer:
 * 1. Checks that `#` is NOT at the start of a line (heading syntax)
 * 2. Checks that `#` is preceded by whitespace, line start, or punctuation
 * 3. Checks that the character after `#` is a letter or underscore
 * 4. Consumes valid tag characters: letters, digits, underscores, hyphens, slashes
 * 5. Tag ends at whitespace, end of line, or any non-tag character
 */
const tokenizeTag: Tokenizer = function (
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State
): State {
  return start

  /**
   * Start state: we've matched `#` (char code 35).
   * Check that the next character is a valid tag start character.
   */
  function start(code: Code): State | undefined {
    // code should be 35 (#) — consume it as the tag marker
    if (code !== 35) return nok(code)

    effects.enter('tag')
    effects.enter('tagMarker')
    effects.consume(code)
    effects.exit('tagMarker')
    return afterMarker
  }

  /**
   * After the `#` marker: the next character must be a letter or underscore.
   * If it's a space, digit, or anything else, this is not a tag.
   */
  function afterMarker(code: Code): State | undefined {
    if (!isTagStartChar(code)) {
      return nok(code)
    }

    effects.enter('tagValue')
    effects.consume(code)
    return insideTag
  }

  /**
   * Inside the tag value: consume valid tag continuation characters.
   * Stop when we hit whitespace, end of line, or invalid character.
   */
  function insideTag(code: Code): State | undefined {
    if (isTagContinueChar(code)) {
      effects.consume(code)
      return insideTag
    }

    // Tag value is complete
    effects.exit('tagValue')
    effects.exit('tag')
    return ok(code)
  }
}

/**
 * The tag construct definition.
 */
const tagConstruct: Construct = {
  tokenize: tokenizeTag,
  previous: previousCheck,
}

/**
 * Creates a micromark syntax extension for Obsidian-style inline tags.
 *
 * Hooks into character code 35 (`#`) in the text content type.
 * Code-block immunity is handled by micromark's built-in code construct priority
 * (code constructs are parsed before text constructs).
 *
 * @returns A micromark Extension
 */
export function tagSyntax(): Extension {
  return {
    text: {
      35: tagConstruct, // '#' character code
    },
  }
}
