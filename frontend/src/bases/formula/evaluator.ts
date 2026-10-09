/**
 * Bases formula evaluator — walks the AST against one row's values and returns
 * a display value. Pure interpretation, no `eval`. A thrown error, a missing
 * property, or a division by zero becomes a visible error/empty value rather
 * than crashing the caller: `evaluateFormula` never throws.
 */

import { parseFormula } from './parser'
import type { FormulaNode, BinaryOp } from './parser'
import { FORMULA_FUNCTIONS, toDate } from './functions'
import type { FormulaValue } from './functions'

const MS_PER_DAY = 86_400_000

/** The context one formula is evaluated against: a row's property values. */
export interface FormulaContext {
  /** Resolves a property reference to a value, or null when absent. */
  resolve(name: string): FormulaValue
}

/** Result of evaluating a formula: a value, or a flagged error. */
export type FormulaResult =
  | { ok: true; value: FormulaValue }
  | { ok: false; error: string }

class EvalError extends Error {}

function evalNode(node: FormulaNode, ctx: FormulaContext): FormulaValue {
  switch (node.kind) {
    case 'number':
      return node.value
    case 'string':
      return node.value
    case 'boolean':
      return node.value
    case 'property':
      return ctx.resolve(node.name)
    case 'unary': {
      const v = evalNode(node.operand, ctx)
      const n = toNumber(v)
      if (n === null) throw new EvalError(`Cannot negate non-numeric value`)
      return -n
    }
    case 'binary':
      return evalBinary(node.op, node.left, node.right, ctx)
    case 'call': {
      const fn = FORMULA_FUNCTIONS[node.name]
      if (!fn) throw new EvalError(`Unknown function '${node.name}'`)
      const args = node.args.map((a) => evalNode(a, ctx))
      return fn(args)
    }
    default:
      throw new EvalError('Unknown expression')
  }
}

function evalBinary(op: BinaryOp, leftNode: FormulaNode, rightNode: FormulaNode, ctx: FormulaContext): FormulaValue {
  const left = evalNode(leftNode, ctx)
  const right = evalNode(rightNode, ctx)

  // Comparisons
  if (op === '==' || op === '!=') {
    const eq = looseEquals(left, right)
    return op === '==' ? eq : !eq
  }
  if (op === '<' || op === '<=' || op === '>' || op === '>=') {
    const cmp = compare(left, right)
    if (cmp === null) return false
    switch (op) {
      case '<': return cmp < 0
      case '<=': return cmp <= 0
      case '>': return cmp > 0
      case '>=': return cmp >= 0
    }
  }

  // Date - Date → whole-day difference (the common "days until" idiom).
  if (op === '-') {
    const ld = left instanceof Date ? left : null
    const rd = right instanceof Date ? right : null
    if (ld && rd) return Math.round((ld.getTime() - rd.getTime()) / MS_PER_DAY)
  }

  // String concatenation when either side is a non-numeric string under `+`.
  if (op === '+') {
    const ln = toNumber(left)
    const rn = toNumber(right)
    if (ln === null || rn === null) {
      return stringify(left) + stringify(right)
    }
    return ln + rn
  }

  // Remaining arithmetic
  const ln = toNumber(left)
  const rn = toNumber(right)
  if (ln === null || rn === null) throw new EvalError('Arithmetic on non-numeric value')
  switch (op) {
    case '-': return ln - rn
    case '*': return ln * rn
    case '/':
      if (rn === 0) throw new EvalError('Division by zero')
      return ln / rn
    default:
      throw new EvalError(`Unsupported operator '${op}'`)
  }
}

function toNumber(v: FormulaValue): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'string') {
    const n = Number(v)
    return v.trim() !== '' && !Number.isNaN(n) ? n : null
  }
  return null
}

function stringify(v: FormulaValue): string {
  if (v === null) return ''
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

function looseEquals(a: FormulaValue, b: FormulaValue): boolean {
  const an = toNumber(a)
  const bn = toNumber(b)
  if (an !== null && bn !== null) return an === bn
  return stringify(a).toLowerCase() === stringify(b).toLowerCase()
}

/** Returns negative/zero/positive, or null when the two are not comparable. */
function compare(a: FormulaValue, b: FormulaValue): number | null {
  const ad = a instanceof Date ? a : toDate(a)
  const bd = b instanceof Date ? b : toDate(b)
  if (ad && bd && (a instanceof Date || b instanceof Date)) {
    return ad.getTime() - bd.getTime()
  }
  const an = toNumber(a)
  const bn = toNumber(b)
  if (an !== null && bn !== null) return an - bn
  return stringify(a).toLowerCase().localeCompare(stringify(b).toLowerCase())
}

/**
 * Parses and evaluates a formula source against a row context. Never throws:
 * returns `{ ok: false, error }` on any parse or evaluation failure.
 */
export function evaluateFormula(source: string, ctx: FormulaContext): FormulaResult {
  try {
    const ast = parseFormula(source)
    const value = evalNode(ast, ctx)
    return { ok: true, value }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Formula error'
    return { ok: false, error: message }
  }
}

/** Formats a formula value for display in a table cell. */
export function formatFormulaValue(value: FormulaValue): string {
  if (value === null) return ''
  if (value instanceof Date) {
    // Date-only when midnight, else ISO datetime.
    const iso = value.toISOString()
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso
  }
  return String(value)
}
