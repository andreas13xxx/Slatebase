/**
 * Bases formula parser — a small Pratt (precedence-climbing) parser turning a
 * token stream into an expression AST. Supports comparisons, additive and
 * multiplicative arithmetic, unary minus, parenthesized groups, function calls,
 * property references and literals. No `eval`.
 */

import { tokenize } from './tokenizer'
import type { Token } from './tokenizer'

// ─── AST ──────────────────────────────────────────────────────────────────────

export type FormulaNode =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'property'; name: string }
  | { kind: 'unary'; op: '-'; operand: FormulaNode }
  | { kind: 'binary'; op: BinaryOp; left: FormulaNode; right: FormulaNode }
  | { kind: 'call'; name: string; args: FormulaNode[] }

export type BinaryOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | '+' | '-' | '*' | '/'

/** Raised on a malformed expression. */
export class FormulaParseError extends Error {
  readonly pos: number
  constructor(message: string, pos: number) {
    super(message)
    this.name = 'FormulaParseError'
    this.pos = pos
  }
}

// Binding power per binary operator (higher binds tighter).
const PRECEDENCE: Record<BinaryOp, number> = {
  '==': 1, '!=': 1, '<': 1, '<=': 1, '>': 1, '>=': 1,
  '+': 2, '-': 2,
  '*': 3, '/': 3,
}

// ─── Parser ────────────────────────────────────────────────────────────────────

class Parser {
  private pos = 0
  private readonly tokens: Token[]
  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  private peek(): Token {
    return this.tokens[this.pos]!
  }

  private next(): Token {
    return this.tokens[this.pos++]!
  }

  private expect(type: Token['type']): Token {
    const tok = this.peek()
    if (tok.type !== type) {
      throw new FormulaParseError(`Expected ${type} but found '${tok.value || tok.type}'`, tok.pos)
    }
    return this.next()
  }

  parse(): FormulaNode {
    const expr = this.parseExpression(0)
    if (this.peek().type !== 'eof') {
      const tok = this.peek()
      throw new FormulaParseError(`Unexpected trailing token '${tok.value}'`, tok.pos)
    }
    return expr
  }

  /** Precedence-climbing core. */
  private parseExpression(minBp: number): FormulaNode {
    let left = this.parseUnary()

    for (;;) {
      const tok = this.peek()
      if (tok.type !== 'operator') break
      const op = tok.value as BinaryOp
      const bp = PRECEDENCE[op]
      if (bp === undefined || bp < minBp) break
      this.next() // consume operator
      // Left-associative: right side must bind tighter than this level.
      const right = this.parseExpression(bp + 1)
      left = { kind: 'binary', op, left, right }
    }

    return left
  }

  private parseUnary(): FormulaNode {
    const tok = this.peek()
    if (tok.type === 'operator' && tok.value === '-') {
      this.next()
      return { kind: 'unary', op: '-', operand: this.parseUnary() }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): FormulaNode {
    const tok = this.peek()

    switch (tok.type) {
      case 'number': {
        this.next()
        const value = Number(tok.value)
        if (Number.isNaN(value)) throw new FormulaParseError(`Invalid number '${tok.value}'`, tok.pos)
        return { kind: 'number', value }
      }
      case 'string':
        this.next()
        return { kind: 'string', value: tok.value }
      case 'boolean':
        this.next()
        return { kind: 'boolean', value: tok.value === 'true' }
      case 'lparen': {
        this.next()
        const expr = this.parseExpression(0)
        this.expect('rparen')
        return expr
      }
      case 'identifier': {
        this.next()
        // A function call when immediately followed by '('.
        if (this.peek().type === 'lparen') {
          this.next() // consume '('
          const args: FormulaNode[] = []
          if (this.peek().type !== 'rparen') {
            args.push(this.parseExpression(0))
            while (this.peek().type === 'comma') {
              this.next()
              args.push(this.parseExpression(0))
            }
          }
          this.expect('rparen')
          return { kind: 'call', name: tok.value, args }
        }
        return { kind: 'property', name: tok.value }
      }
      default:
        throw new FormulaParseError(`Unexpected token '${tok.value || tok.type}'`, tok.pos)
    }
  }
}

/** Parses a formula source string into an AST. */
export function parseFormula(source: string): FormulaNode {
  const tokens = tokenize(source)
  return new Parser(tokens).parse()
}
