/**
 * Bases expression tokenizer — turns an expression string into a token stream.
 * Single left-to-right scan, no `eval`, no regex-driven magic. Recognises
 * identifiers (property refs / function names, including dotted paths like
 * `file.name`), string / number / boolean literals, arithmetic / comparison /
 * logical operators, a standalone member-access dot, parentheses, square
 * brackets and commas.
 *
 * Dotted paths vs. member access: a run like `file.name` scans as ONE
 * `identifier` (it is a property reference in Obsidian). A `.` that follows a
 * `)` or `]` — e.g. `now().hour`, `list[0].x` — scans as a standalone `dot`
 * operator, because the left side is a computed value, not a property path.
 * The parser decides method calls (`path.method(...)`) by re-splitting a
 * dotted identifier whose tail is followed by `(`.
 */

/** Token kinds the expression grammar recognises. */
export type TokenType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'identifier'
  | 'operator'
  | 'lparen'
  | 'rparen'
  | 'lbracket'
  | 'rbracket'
  | 'dot'
  | 'comma'
  | 'eof'

/** A single lexical token with its source position (for error messages). */
export interface Token {
  type: TokenType
  value: string
  pos: number
}

/** Raised when the source contains a character the tokenizer cannot read. */
export class FormulaTokenizeError extends Error {
  readonly pos: number
  constructor(message: string, pos: number) {
    super(message)
    this.name = 'FormulaTokenizeError'
    this.pos = pos
  }
}

const TWO_CHAR_OPERATORS = new Set(['==', '!=', '<=', '>=', '&&', '||'])
const ONE_CHAR_OPERATORS = new Set(['+', '-', '*', '/', '%', '<', '>', '!'])

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

function isIdentifierStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_'
}

/** Characters that continue an identifier. `.` is handled specially (see below). */
function isIdentifierPartNoDot(ch: string): boolean {
  return isIdentifierStart(ch) || isDigit(ch) || ch === '-'
}

/**
 * Tokenizes an expression. Throws `FormulaTokenizeError` on an unreadable
 * character; an empty/whitespace-only source yields just `eof`.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = source.length

  const lastSignificant = (): Token | undefined => tokens[tokens.length - 1]

  while (i < n) {
    const ch = source[i]!

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }

    // String literal — single or double quoted, with \\ and \" / \' escapes
    if (ch === '"' || ch === "'") {
      const quote = ch
      const start = i
      i++
      let value = ''
      while (i < n && source[i] !== quote) {
        if (source[i] === '\\' && i + 1 < n) {
          const next = source[i + 1]!
          value += next === 'n' ? '\n' : next === 't' ? '\t' : next
          i += 2
        } else {
          value += source[i]
          i++
        }
      }
      if (i >= n) throw new FormulaTokenizeError('Unterminated string literal', start)
      i++ // closing quote
      tokens.push({ type: 'string', value, pos: start })
      continue
    }

    // Number literal (integer or decimal)
    if (isDigit(ch) || (ch === '.' && i + 1 < n && isDigit(source[i + 1]!))) {
      const start = i
      let value = ''
      while (i < n && (isDigit(source[i]!) || source[i] === '.')) {
        value += source[i]
        i++
      }
      tokens.push({ type: 'number', value, pos: start })
      continue
    }

    // Parentheses / brackets / comma
    if (ch === '(') { tokens.push({ type: 'lparen', value: ch, pos: i }); i++; continue }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ch, pos: i }); i++; continue }
    if (ch === '[') { tokens.push({ type: 'lbracket', value: ch, pos: i }); i++; continue }
    if (ch === ']') { tokens.push({ type: 'rbracket', value: ch, pos: i }); i++; continue }
    if (ch === ',') { tokens.push({ type: 'comma', value: ch, pos: i }); i++; continue }

    // A standalone member-access dot: a `.` directly after a `)` or `]` (a
    // computed value). A `.` elsewhere is part of a dotted identifier (handled
    // in the identifier branch below).
    if (ch === '.') {
      const prev = lastSignificant()
      if (prev && (prev.type === 'rparen' || prev.type === 'rbracket')) {
        tokens.push({ type: 'dot', value: '.', pos: i })
        i++
        continue
      }
      throw new FormulaTokenizeError(`Unexpected '.'`, i)
    }

    // Two-char then one-char operators
    const two = source.slice(i, i + 2)
    if (TWO_CHAR_OPERATORS.has(two)) {
      tokens.push({ type: 'operator', value: two, pos: i })
      i += 2
      continue
    }
    if (ONE_CHAR_OPERATORS.has(ch)) {
      tokens.push({ type: 'operator', value: ch, pos: i })
      i++
      continue
    }

    // Identifier (property reference incl. dotted path, function name, true/false)
    if (isIdentifierStart(ch)) {
      const start = i
      let value = ''
      // Scan identifier parts; a `.` continues the identifier only when
      // followed by another identifier-start char (a dotted property path).
      while (i < n) {
        const c = source[i]!
        if (isIdentifierPartNoDot(c)) {
          value += c
          i++
        } else if (c === '.' && i + 1 < n && isIdentifierStart(source[i + 1]!)) {
          value += c
          i++
        } else {
          break
        }
      }
      if (value === 'true' || value === 'false') {
        tokens.push({ type: 'boolean', value, pos: start })
      } else {
        tokens.push({ type: 'identifier', value, pos: start })
      }
      continue
    }

    throw new FormulaTokenizeError(`Unexpected character '${ch}'`, i)
  }

  tokens.push({ type: 'eof', value: '', pos: n })
  return tokens
}
