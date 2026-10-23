/**
 * Server prefilter extraction — turns a Bases expression filter into a
 * CONSERVATIVE structured prefilter the backend query route can apply before
 * it caps candidate rows.
 *
 * Why this exists: the rich Obsidian expression language (`'status != "done"'`,
 * methods, arithmetic) is evaluated client-side by `filterRows`, so the backend
 * returns candidate rows WITHOUT applying it. The backend caps candidates at a
 * fixed number; a matching note beyond that cap is never seen. This module
 * extracts the cheaply-checkable, safely-pushable predicates (property
 * equality/existence, `file.hasTag`, `file.inFolder`, path) and hands them to
 * the backend so the cap applies to PREFILTERED candidates, not arbitrary ones.
 *
 * Soundness contract: the prefilter MUST NEVER exclude a row the full
 * expression filter would keep. It therefore only emits a predicate when it can
 * prove the predicate is a necessary condition of the whole filter. Anything it
 * cannot prove is dropped from the prefilter (not pushed), and the client's
 * `filterRows` still applies the complete semantics. Over-inclusion is safe
 * (the client re-filters); under-exclusion is the bug we must avoid.
 */

import { parseFormula } from './formula/parser.js'
import type { ExprNode } from './formula/ast.js'
import type { BaseFilterNode } from './types.js'

/**
 * A structured prefilter node — a strict subset mirroring the backend
 * `BaseQueryNode`. Only the forms the extractor can prove safe appear here.
 */
export type PrefilterNode = PrefilterCondition | PrefilterAnd | PrefilterOr

/** A leaf prefilter condition (subset of the backend `BaseQueryCondition`). */
export interface PrefilterCondition {
  property?: string
  tag?: string
  path?: string
  op?: 'eq' | 'exists' | 'contains'
  value?: string | number | boolean
}

/** An AND group — every child must match. */
export interface PrefilterAnd {
  and: PrefilterNode[]
}

/** An OR group — at least one child must match. */
export interface PrefilterOr {
  or: PrefilterNode[]
}

/** A literal AST node whose value we can read directly. */
function literalValue(node: ExprNode): string | number | boolean | null {
  if (node.kind === 'string' || node.kind === 'number' || node.kind === 'boolean') return node.value
  return null
}

/**
 * Whether a `prop == literal` equality is SAFE to push to the backend.
 *
 * The backend applies property `eq` as a case-insensitive STRING comparison
 * (`value.toLowerCase() === literal.toLowerCase()`). The client's expression
 * `==` (`looseEquals`) instead coerces BOTH sides to numbers whenever each
 * parses as one, so `price == 10` keeps a note whose stored `price` is `"10.0"`
 * — a match the backend's string compare would miss (`"10.0" !== "10"`), silently
 * dropping the row before the candidate cap.
 *
 * Pushing is therefore sound ONLY for a string literal that is not itself
 * numeric-coercible (same rule as the evaluator's `toNumber`): then neither side
 * can take the client's numeric path, and the backend's case-insensitive string
 * compare reproduces the client semantics exactly. Numbers, booleans and
 * numeric-looking strings are left to the client filter.
 */
function pushableEqLiteral(value: string | number | boolean | null): value is string {
  if (typeof value !== 'string') return false
  const n = Number(value)
  return value.trim() === '' || Number.isNaN(n)
}

/** A bare/`note.`-prefixed property reference → its plain key, else null. */
function propertyKey(node: ExprNode): string | null {
  if (node.kind !== 'property') return null
  if (node.name === 'file' || node.name === 'formula') return null
  if (node.name.startsWith('file.') || node.name.startsWith('formula.')) return null
  // A dotted member access (`title.length`) is not a plain property.
  const key = node.name.startsWith('note.') ? node.name.slice('note.'.length) : node.name
  if (key.includes('.')) return null
  return key
}

/**
 * Extracts a provably-necessary prefilter from ONE expression AST, or null when
 * nothing can be safely pushed. Only these forms are emitted:
 *  - `prop == literal`  → { property, op: 'eq', value }
 *  - `file.hasTag("x")` → { tag: 'x' }
 *  - `file.inFolder("x")` → { path: 'x/**' }
 *  - `a && b` → AND of each side's prefilter (a side that yields nothing is dropped)
 *  - `a || b` → OR, but ONLY if BOTH sides yield a prefilter (an un-pushable
 *    branch of an OR means the whole OR cannot be safely narrowed).
 * Everything else (negation, `!=`, `<`, methods other than the two above,
 * arithmetic) yields null — the client filter still applies it.
 */
function extractFromNode(node: ExprNode): PrefilterNode | null {
  switch (node.kind) {
    case 'logical': {
      if (node.op === '&&') {
        const left = extractFromNode(node.left)
        const right = extractFromNode(node.right)
        const parts = [left, right].filter((p): p is PrefilterNode => p !== null)
        if (parts.length === 0) return null
        if (parts.length === 1) return parts[0]!
        return { and: parts }
      }
      // '||': only safe if BOTH branches narrow — otherwise one branch could
      // match rows the prefilter would wrongly exclude.
      const left = extractFromNode(node.left)
      const right = extractFromNode(node.right)
      if (left === null || right === null) return null
      return { or: [left, right] }
    }
    case 'binary': {
      // `prop == literal` (either operand order).
      if (node.op === '==') {
        const lk = propertyKey(node.left)
        const lv = literalValue(node.right)
        if (lk !== null && pushableEqLiteral(lv)) return { property: lk, op: 'eq', value: lv }
        const rk = propertyKey(node.right)
        const rv = literalValue(node.left)
        if (rk !== null && pushableEqLiteral(rv)) return { property: rk, op: 'eq', value: rv }
      }
      return null
    }
    case 'method': {
      // `file.hasTag("x")` / `file.inFolder("x")` on the bare `file` receiver.
      if (node.object.kind === 'property' && node.object.name === 'file' && node.args.length === 1) {
        const arg = literalValue(node.args[0]!)
        if (typeof arg !== 'string') return null
        if (node.method === 'hasTag') return { tag: arg.replace(/^#/, '') }
        if (node.method === 'inFolder') return { path: `${arg.replace(/\/+$/, '')}/**` }
      }
      return null
    }
    default:
      return null
  }
}

/**
 * Parses one expression-string filter leaf and extracts its safe prefilter,
 * or null when the expression is unparseable or nothing can be pushed.
 */
function extractFromExpression(source: string): PrefilterNode | null {
  try {
    return extractFromNode(parseFormula(source))
  } catch {
    return null
  }
}

/**
 * Builds a conservative server prefilter from a Bases filter tree (document- or
 * view-level). Returns null when nothing can be safely pushed — in which case
 * the backend applies no prefilter and the client filter does all the work.
 *
 * Group semantics mirror the soundness contract:
 *  - `and`: push each child that yields a prefilter (a child yielding nothing is
 *    simply not narrowed — safe, since AND only ever removes rows).
 *  - `or`: push ONLY if every child yields a prefilter (one un-pushable branch
 *    means a row could match via that branch and must not be pre-excluded).
 *  - `not`: never pushed (negation can turn a necessary condition into an
 *    optional one).
 */
export function buildPrefilterNode(filter: BaseFilterNode | undefined): PrefilterNode | null {
  if (filter === undefined) return null
  if (typeof filter === 'string') return extractFromExpression(filter)
  if ('and' in filter) {
    const parts = filter.and
      .map(buildPrefilterNode)
      .filter((p): p is PrefilterNode => p !== null)
    if (parts.length === 0) return null
    if (parts.length === 1) return parts[0]!
    return { and: parts }
  }
  if ('or' in filter) {
    const parts = filter.or.map(buildPrefilterNode)
    if (parts.some((p) => p === null)) return null
    const safe = parts.filter((p): p is PrefilterNode => p !== null)
    if (safe.length === 0) return null
    if (safe.length === 1) return safe[0]!
    return { or: safe }
  }
  // 'not': never pushed.
  return null
}

/**
 * Combines a document filter and a view filter into one prefilter (they apply
 * as an implicit AND). Either side may be absent.
 */
export function buildCombinedPrefilter(
  docFilter: BaseFilterNode | undefined,
  viewFilter: BaseFilterNode | undefined,
): PrefilterNode | null {
  const parts = [buildPrefilterNode(docFilter), buildPrefilterNode(viewFilter)]
    .filter((p): p is PrefilterNode => p !== null)
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]!
  return { and: parts }
}
