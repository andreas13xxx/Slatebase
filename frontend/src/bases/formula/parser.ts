/**
 * Bases expression parser — a Pratt (precedence-climbing) parser turning a
 * token stream into an `ExprNode` AST. Supports logical `&&`/`||`, comparisons,
 * additive/multiplicative arithmetic (incl. `%`), unary `-`/`!`, parenthesised
 * groups, global function calls, dotted property references, member access,
 * indexing and method calls. No `eval`.
 *
 * Precedence (loosest → tightest): `||` < `&&` < comparison < `+ -` < `* / %`
 * < unary < postfix (member / index / method).
 */

import { tokenize } from './tokenizer'
import type { Token } from './tokenizer'
import type { ExprNode, BinaryOp, LogicalOp } from './ast'

export type { ExprNode, FormulaNode, BinaryOp, LogicalOp } from './ast'

/** Raised on a malformed expression. */
export class FormulaParseError extends Error {
  readonly pos: number
  constructor(message: string, pos: number) {
    super(message)
    this.name = 'FormulaParseError'
    this.pos = pos
  }
}

// Binding power per binary/logical operator (higher binds tighter).
const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3, '!=': 3, '<': 3, '<=': 3, '>': 3, '>=': 3,
  '+': 4, '-': 4,
  '*': 5, '/': 5, '%': 5,
}

const LOGICAL_OPS = new Set<string>(['&&', '||'])

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

  parse(): ExprNode {
    const expr = this.parseExpression(0)
    if (this.peek().type !== 'eof') {
      const tok = this.peek()
      throw new FormulaParseError(`Unexpected trailing token '${tok.value}'`, tok.pos)
    }
    return expr
  }

  /** Precedence-climbing core (binary + logical operators). */
  private parseExpression(minBp: number): ExprNode {
    let left = this.parseUnary()

    for (;;) {
      const tok = this.peek()
      if (tok.type !== 'operator') break
      const op = tok.value
      const bp = PRECEDENCE[op]
      if (bp === undefined || bp < minBp) break
      this.next() // consume operator
      // Left-associative: right side must bind tighter than this level.
      const right = this.parseExpression(bp + 1)
      if (LOGICAL_OPS.has(op)) {
        left = { kind: 'logical', op: op as LogicalOp, left, right }
      } else {
        left = { kind: 'binary', op: op as BinaryOp, left, right }
      }
    }

    return left
  }

  private parseUnary(): ExprNode {
    const tok = this.peek()
    if (tok.type === 'operator' && (tok.value === '-' || tok.value === '!')) {
      this.next()
      return { kind: 'unary', op: tok.value, operand: this.parseUnary() }
    }
    return this.parsePostfix(this.parsePrimary())
  }

  /** Member access (`.x`), indexing (`[e]`) and method calls on a value. */
  private parsePostfix(node: ExprNode): ExprNode {
    let current = node
    for (;;) {
      const tok = this.peek()
      if (tok.type === 'dot') {
        this.next()
        const name = this.expect('identifier')
        // `.name(` → method call; `.name` → member access.
        if (this.peek().type === 'lparen') {
          const args = this.parseCallArgs()
          current = { kind: 'method', object: current, method: name.value, args }
        } else {
          current = { kind: 'member', object: current, property: name.value }
        }
      } else if (tok.type === 'lbracket') {
        this.next()
        const index = this.parseExpression(0)
        this.expect('rbracket')
        current = { kind: 'index', object: current, index }
      } else {
        break
      }
    }
    return current
  }

  /** Parse a parenthesised, comma-separated argument list (consumes `(` … `)`). */
  private parseCallArgs(): ExprNode[] {
    this.expect('lparen')
    const args: ExprNode[] = []
    if (this.peek().type !== 'rparen') {
      args.push(this.parseExpression(0))
      while (this.peek().type === 'comma') {
        this.next()
        args.push(this.parseExpression(0))
      }
    }
    this.expect('rparen')
    return args
  }

  private parsePrimary(): ExprNode {
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
        // A dotted identifier whose tail is immediately followed by `(` is a
        // method call on the property path before the tail, e.g.
        // `file.name.contains(x)` → method `contains` on property `file.name`,
        // and `price.toFixed(2)` → method `toFixed` on property `price`.
        if (this.peek().type === 'lparen') {
          const dot = tok.value.lastIndexOf('.')
          if (dot > 0) {
            const objectName = tok.value.slice(0, dot)
            const method = tok.value.slice(dot + 1)
            const args = this.parseCallArgs()
            return { kind: 'method', object: { kind: 'property', name: objectName }, method, args }
          }
          // No dot: a global function call, e.g. `date(...)`, `if(...)`.
          const args = this.parseCallArgs()
          return { kind: 'call', name: tok.value, args }
        }
        return { kind: 'property', name: tok.value }
      }
      default:
        throw new FormulaParseError(`Unexpected token '${tok.value || tok.type}'`, tok.pos)
    }
  }
}

/** Parses an expression source string into an AST. */
export function parseFormula(source: string): ExprNode {
  const tokens = tokenize(source)
  return new Parser(tokens).parse()
}
