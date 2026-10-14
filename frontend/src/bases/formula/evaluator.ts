/**
 * Bases expression evaluator — walks the AST against one row's values and
 * returns a value. Pure interpretation, no `eval`. A thrown error, a missing
 * property, a division by zero or an unknown method becomes a visible
 * error/empty value rather than crashing the caller: `evaluateFormula` never
 * throws.
 *
 * Shared by formulas (display values) and filters (truthiness) — see
 * `evaluateCondition` for the filter entry point.
 */

import { parseFormula } from './parser'
import type { ExprNode, BinaryOp } from './ast'
import { FORMULA_FUNCTIONS, toDate, toNumber, stringify, isTruthy, isLink, parseDurationMs } from './functions'
import type { FormulaValue } from './functions'
import { callMethod, DATE_MEMBERS } from './methods'

/** The context one expression is evaluated against: a row's property values. */
export interface FormulaContext {
  /** Resolves a property reference to a value, or null when absent. */
  resolve(name: string): FormulaValue
}

/** Result of evaluating an expression: a value, or a flagged error. */
export type FormulaResult =
  | { ok: true; value: FormulaValue }
  | { ok: false; error: string }

class EvalError extends Error {}

function evalNode(node: ExprNode, ctx: FormulaContext): FormulaValue {
  switch (node.kind) {
    case 'number':
    case 'string':
    case 'boolean':
      return node.value
    case 'property':
      return ctx.resolve(node.name)
    case 'unary': {
      const v = evalNode(node.operand, ctx)
      if (node.op === '!') return !isTruthy(v)
      const n = toNumber(v)
      if (n === null) throw new EvalError('Cannot negate non-numeric value')
      return -n
    }
    case 'logical': {
      const left = evalNode(node.left, ctx)
      if (node.op === '&&') return isTruthy(left) ? isTruthy(evalNode(node.right, ctx)) : false
      // '||'
      return isTruthy(left) ? true : isTruthy(evalNode(node.right, ctx))
    }
    case 'binary':
      return evalBinary(node.op, node.left, node.right, ctx)
    case 'call': {
      const fn = FORMULA_FUNCTIONS[node.name]
      if (!fn) throw new EvalError(`Unknown function '${node.name}'`)
      return fn(node.args.map((a) => evalNode(a, ctx)))
    }
    case 'method': {
      const receiver = evalNode(node.object, ctx)
      const args = node.args.map((a) => evalNode(a, ctx))
      return callMethod(receiver, node.method, args)
    }
    case 'member': {
      const obj = evalNode(node.object, ctx)
      if (obj instanceof Date) {
        const field = DATE_MEMBERS[node.property]
        if (field) return field(obj)
      }
      if (isLink(obj) && node.property === 'path') return obj.path
      throw new EvalError(`Unknown member '${node.property}'`)
    }
    case 'index': {
      const obj = evalNode(node.object, ctx)
      const idx = evalNode(node.index, ctx)
      if (Array.isArray(obj)) {
        const n = toNumber(idx)
        if (n === null) return null
        return obj[Math.trunc(n)] ?? null
      }
      return null
    }
    default:
      throw new EvalError('Unknown expression')
  }
}

function evalBinary(op: BinaryOp, leftNode: ExprNode, rightNode: ExprNode, ctx: FormulaContext): FormulaValue {
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

  // Date ± duration string: `date + "1M"`, `now() - "1 week"`.
  if (op === '+' || op === '-') {
    const ld = left instanceof Date ? left : null
    const rd = right instanceof Date ? right : null
    if (ld && typeof right === 'string') {
      const ms = parseDurationMs(right)
      if (ms !== null) return new Date(ld.getTime() + (op === '+' ? ms : -ms))
    }
    // Date - Date → millisecond difference (Obsidian semantics).
    if (op === '-' && ld && rd) return ld.getTime() - rd.getTime()
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
    case '%':
      if (rn === 0) throw new EvalError('Modulo by zero')
      return ln % rn
    default:
      throw new EvalError(`Unsupported operator '${op}'`)
  }
}

function looseEquals(a: FormulaValue, b: FormulaValue): boolean {
  // Link equality: same path.
  if (isLink(a) && isLink(b)) return a.path === b.path
  if (isLink(a)) return a.path.toLowerCase() === stringify(b).toLowerCase()
  if (isLink(b)) return b.path.toLowerCase() === stringify(a).toLowerCase()
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
 * Parses and evaluates an expression against a row context. Never throws:
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

/**
 * Evaluates an expression as a boolean filter condition. A parse/eval failure
 * is `false` (a broken condition excludes the row rather than crashing the
 * query) — this is the filter entry point for the query engine.
 */
export function evaluateCondition(source: string, ctx: FormulaContext): boolean {
  try {
    return isTruthy(evalNode(parseFormula(source), ctx))
  } catch {
    return false
  }
}

/** Formats a value for display in a table cell. */
export function formatFormulaValue(value: FormulaValue): string {
  if (value === null) return ''
  if (value instanceof Date) {
    const iso = value.toISOString()
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso
  }
  return stringify(value)
}
