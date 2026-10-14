/**
 * Bases expression methods — the per-value-type method table (`value.method(args)`).
 *
 * Deliberately pragmatic (see the Bases expression-language spec): the methods
 * that appear in real `.base` files, not Obsidian's full surface. An unknown
 * method throws, which the evaluator turns into a visible error value (never a
 * crash). Methods receive the already-evaluated receiver and argument values.
 */

import moment from 'moment'
import { toDate, toNumber, stringify, isLink, type FormulaValue } from './functions'

/** A method implementation: receiver + evaluated args → value. */
export type MethodFn = (receiver: FormulaValue, args: FormulaValue[]) => FormulaValue

/** Raised for an unknown method on a value; caught by the evaluator. */
export class MethodError extends Error {}

const stringMethods: Record<string, MethodFn> = {
  contains: (r, a) => stringify(r).includes(stringify(a[0] ?? null)),
  startsWith: (r, a) => stringify(r).startsWith(stringify(a[0] ?? null)),
  endsWith: (r, a) => stringify(r).endsWith(stringify(a[0] ?? null)),
  lower: (r) => stringify(r).toLowerCase(),
  upper: (r) => stringify(r).toUpperCase(),
  trim: (r) => stringify(r).trim(),
  replace: (r, a) => stringify(r).split(stringify(a[0] ?? null)).join(stringify(a[1] ?? null)),
  split: (r, a) => stringify(r).split(stringify(a[0] ?? null)),
  length: (r) => stringify(r).length,
}

const numberMethods: Record<string, MethodFn> = {
  toFixed: (r, a) => {
    const n = toNumber(r)
    if (n === null) return null
    const digits = toNumber(a[0] ?? null) ?? 0
    return n.toFixed(Math.max(0, Math.min(20, Math.trunc(digits))))
  },
  round: (r, a) => {
    const n = toNumber(r)
    if (n === null) return null
    const digits = toNumber(a[0] ?? null) ?? 0
    const f = 10 ** Math.max(0, Math.trunc(digits))
    return Math.round(n * f) / f
  },
  abs: (r) => {
    const n = toNumber(r)
    return n === null ? null : Math.abs(n)
  },
}

const dateMethods: Record<string, MethodFn> = {
  format: (r, a) => {
    const d = toDate(r)
    if (!d) return ''
    const fmt = a.length > 0 ? stringify(a[0] ?? null) : 'YYYY-MM-DD'
    return moment(d).format(fmt)
  },
  date: (r) => {
    const d = toDate(r)
    if (!d) return null
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  },
  time: (r) => {
    const d = toDate(r)
    return d ? moment(d).format('HH:mm:ss') : ''
  },
}

const listMethods: Record<string, MethodFn> = {
  contains: (r, a) => {
    if (!Array.isArray(r)) return false
    const needle = stringify(a[0] ?? null).toLowerCase()
    return r.some((item) => stringify(item).toLowerCase() === needle)
  },
  length: (r) => (Array.isArray(r) ? r.length : 0),
  join: (r, a) => (Array.isArray(r) ? r.map(stringify).join(stringify(a[0] ?? null)) : stringify(r)),
  first: (r) => (Array.isArray(r) && r.length > 0 ? r[0]! : null),
  last: (r) => (Array.isArray(r) && r.length > 0 ? r[r.length - 1]! : null),
}

const linkMethods: Record<string, MethodFn> = {
  // asLink/toString-ish helpers plugins occasionally call on links.
  toString: (r: FormulaValue) => stringify(r),
}

/** Date member fields (`now().hour`), returned as numbers. */
export const DATE_MEMBERS: Record<string, (d: Date) => number> = {
  year: (d) => d.getFullYear(),
  month: (d) => d.getMonth() + 1,
  day: (d) => d.getDate(),
  hour: (d) => d.getHours(),
  minute: (d) => d.getMinutes(),
  second: (d) => d.getSeconds(),
}

/**
 * Dispatch a method call on a receiver value. Throws `MethodError` for an
 * unknown method on the receiver's type.
 */
export function callMethod(receiver: FormulaValue, method: string, args: FormulaValue[]): FormulaValue {
  // Length is universal-ish; try the type-specific tables first.
  if (Array.isArray(receiver)) {
    const fn = listMethods[method]
    if (fn) return fn(receiver, args)
  } else if (receiver instanceof Date) {
    const fn = dateMethods[method]
    if (fn) return fn(receiver, args)
  } else if (isLink(receiver)) {
    const fn = linkMethods[method] ?? stringMethods[method]
    if (fn) return fn(receiver, args)
  } else if (typeof receiver === 'number' || typeof receiver === 'boolean') {
    const fn = numberMethods[method] ?? stringMethods[method]
    if (fn) return fn(receiver, args)
  } else {
    // string or null → string methods (null stringifies to '')
    const fn = stringMethods[method]
    if (fn) return fn(receiver, args)
  }
  throw new MethodError(`Unknown method '${method}' on ${describeType(receiver)}`)
}

function describeType(v: FormulaValue): string {
  if (v === null) return 'empty'
  if (Array.isArray(v)) return 'list'
  if (v instanceof Date) return 'date'
  if (isLink(v)) return 'link'
  return typeof v
}
