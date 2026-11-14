/**
 * Bases expression methods — the per-value-type method table (`value.method(args)`).
 *
 * Deliberately pragmatic (see the Bases expression-language spec): the methods
 * that appear in real `.base` files, not Obsidian's full surface. An unknown
 * method throws, which the evaluator turns into a visible error value (never a
 * crash). Methods receive the already-evaluated receiver and argument values.
 */

import moment from 'moment'
import { toDate, toNumber, stringify, isLink, isRegex, isObject, isTruthy, toRegExp, type FormulaValue } from './functions.js'

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
  replace: (r, a) => {
    const pattern = a[0] ?? null
    const replacement = stringify(a[1] ?? null)
    if (isRegex(pattern)) {
      // Like JS: without the `g` flag only the first match is replaced.
      const re = toRegExp(pattern)
      return re ? stringify(r).replace(re, replacement) : stringify(r)
    }
    // Plain string pattern: every occurrence (the historic Slatebase behaviour).
    return stringify(r).split(stringify(pattern)).join(replacement)
  },
  split: (r, a) => {
    const sep = a[0] ?? null
    const limit = toNumber(a[1] ?? null)
    const re = isRegex(sep) ? toRegExp(sep) : null
    const parts = re ? stringify(r).split(re) : stringify(r).split(stringify(sep))
    return limit !== null && limit >= 0 ? parts.slice(0, Math.trunc(limit)) : parts
  },
  length: (r) => stringify(r).length,
  containsAll: (r, a) => a.every((x) => stringify(r).includes(stringify(x))),
  containsAny: (r, a) => a.some((x) => stringify(r).includes(stringify(x))),
  repeat: (r, a) => stringify(r).repeat(Math.max(0, Math.min(10_000, Math.trunc(toNumber(a[0] ?? null) ?? 0)))),
  reverse: (r) => [...stringify(r)].reverse().join(''),
  slice: (r, a) => stringify(r).slice(toNumber(a[0] ?? null) ?? 0, toNumber(a[1] ?? null) ?? undefined),
  title: (r) => stringify(r).replace(/\b\p{L}[\p{L}\p{N}']*/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()),
}

/** Regexp receiver: `/abc/.matches("abcd")`. */
const regexMethods: Record<string, MethodFn> = {
  matches: (r, a) => {
    if (!isRegex(r)) return false
    const re = toRegExp(r)
    return re ? re.test(stringify(a[0] ?? null)) : false
  },
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
  ceil: (r) => {
    const n = toNumber(r)
    return n === null ? null : Math.ceil(n)
  },
  floor: (r) => {
    const n = toNumber(r)
    return n === null ? null : Math.floor(n)
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
  relative: (r) => {
    const d = toDate(r)
    return d ? moment(d).fromNow() : ''
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
  containsAll: (r, a) => Array.isArray(r) && a.every((x) => listHas(r, x)),
  containsAny: (r, a) => Array.isArray(r) && a.some((x) => listHas(r, x)),
  flat: (r) => (Array.isArray(r) ? r.flatMap((x) => (Array.isArray(x) ? x : [x])) : []),
  reverse: (r) => (Array.isArray(r) ? [...r].reverse() : []),
  slice: (r, a) => (Array.isArray(r) ? r.slice(toNumber(a[0] ?? null) ?? 0, toNumber(a[1] ?? null) ?? undefined) : []),
  sort: (r) => (Array.isArray(r) ? [...r].sort(compareValues) : []),
  unique: (r) => {
    if (!Array.isArray(r)) return []
    const seen = new Set<string>()
    return r.filter((x) => {
      const k = `${typeof x}:${stringify(x)}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  },
  // Aggregates: not in Obsidian's documented list methods, but its custom-summary
  // example uses `values.mean()`, so the usual ones are accepted on lists.
  sum: (r) => numbersOf(r).reduce((x, y) => x + y, 0),
  mean: (r) => {
    const nums = numbersOf(r)
    return nums.length ? nums.reduce((x, y) => x + y, 0) / nums.length : null
  },
  min: (r) => {
    const nums = numbersOf(r)
    return nums.length ? Math.min(...nums) : null
  },
  max: (r) => {
    const nums = numbersOf(r)
    return nums.length ? Math.max(...nums) : null
  },
}

function listHas(list: FormulaValue[], needle: FormulaValue): boolean {
  const n = stringify(needle).toLowerCase()
  return list.some((item) => stringify(item).toLowerCase() === n)
}

function numbersOf(list: FormulaValue): number[] {
  if (!Array.isArray(list)) return []
  return list.map(toNumber).filter((n): n is number => n !== null)
}

/** Default list ordering: numbers numerically, dates by time, everything else as text. */
function compareValues(a: FormulaValue, b: FormulaValue): number {
  if (a === null) return b === null ? 0 : 1
  if (b === null) return -1
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return stringify(a).localeCompare(stringify(b))
}

/** Methods every value has (`isEmpty`, `isTruthy`, `isType`). */
function typeName(v: FormulaValue): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'list'
  if (v instanceof Date) return 'date'
  if (isLink(v)) return 'link'
  if (isRegex(v)) return 'regexp'
  if (isObject(v)) return 'object'
  return typeof v
}

const universalMethods: Record<string, MethodFn> = {
  isEmpty: (r) => r === null || r === '' || (Array.isArray(r) && r.length === 0) || (isObject(r) && r.entries.size === 0),
  isTruthy: (r) => isTruthy(r),
  isType: (r, a) => typeName(r) === stringify(a[0] ?? null).toLowerCase(),
}

/**
 * Methods only objects have (Obsidian docs: `keys()`, `values()`; `isEmpty()` is the shared one in
 * `universalMethods`, which knows objects too), plus the generic `toString()`.
 */
const objectMethods: Record<string, MethodFn> = {
  keys: (r) => (isObject(r) ? [...r.entries.keys()] : null),
  values: (r) => (isObject(r) ? [...r.entries.values()] : null),
  toString: (r: FormulaValue) => stringify(r),
}

const linkMethods: Record<string, MethodFn> = {
  // asLink/toString-ish helpers plugins occasionally call on links.
  toString: (r: FormulaValue) => stringify(r),
  // A link doubles as its file reference in this value model.
  asFile: (r) => r,
  linksTo: (r, a) => {
    if (!isLink(r)) return false
    const target = a[0] ?? null
    const t = (isLink(target) ? target.path : stringify(target)).replace(/\.md$/i, '').toLowerCase()
    const own = r.path.replace(/\.md$/i, '').toLowerCase()
    return t !== '' && (own === t || own.endsWith('/' + t) || t.endsWith('/' + own))
  },
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
 * Duration members (`(date(a) - today()).days`): Obsidian's duration type exposes its
 * length in each unit. Here a duration is the millisecond number a date difference yields.
 */
export const DURATION_MEMBERS: Record<string, (ms: number) => number> = {
  days: (ms) => ms / 86_400_000,
  hours: (ms) => ms / 3_600_000,
  minutes: (ms) => ms / 60_000,
  seconds: (ms) => ms / 1000,
  milliseconds: (ms) => ms,
}

/**
 * Dispatch a method call on a receiver value. Throws `MethodError` for an
 * unknown method on the receiver's type.
 */
export function callMethod(receiver: FormulaValue, method: string, args: FormulaValue[]): FormulaValue {
  if (isRegex(receiver)) {
    const fn = regexMethods[method]
    if (fn) return fn(receiver, args)
  }
  // Type-specific tables first, then the methods every value has.
  if (Array.isArray(receiver)) {
    const fn = listMethods[method]
    if (fn) return fn(receiver, args)
  } else if (receiver instanceof Date) {
    const fn = dateMethods[method]
    if (fn) return fn(receiver, args)
  } else if (isLink(receiver)) {
    const fn = linkMethods[method] ?? stringMethods[method]
    if (fn) return fn(receiver, args)
  } else if (isObject(receiver)) {
    // No string/list fallback: `obj.contains(...)` must be a visible error, not a silent text match.
    const fn = objectMethods[method]
    if (fn) return fn(receiver, args)
  } else if (typeof receiver === 'number' || typeof receiver === 'boolean') {
    const fn = numberMethods[method] ?? stringMethods[method]
    if (fn) return fn(receiver, args)
    // An epoch number (`file.mtime`) used as a date: `.format(...)`, `.date()`.
    const dateFn = typeof receiver === 'number' && toDate(receiver) ? dateMethods[method] : undefined
    if (dateFn) return dateFn(receiver, args)
  } else {
    // string or null → string methods (null stringifies to '')
    const fn = stringMethods[method]
    if (fn) return fn(receiver, args)
    // A date-like string (`due: 2026-10-01`) used as a date.
    const dateFn = typeof receiver === 'string' && toDate(receiver) ? dateMethods[method] : undefined
    if (dateFn) return dateFn(receiver, args)
  }
  const universal = universalMethods[method]
  if (universal) return universal(receiver, args)
  throw new MethodError(`Unknown method '${method}' on ${describeType(receiver)}`)
}

function describeType(v: FormulaValue): string {
  if (v === null) return 'empty'
  if (Array.isArray(v)) return 'list'
  if (v instanceof Date) return 'date'
  if (isLink(v)) return 'link'
  if (isObject(v)) return 'object'
  return typeof v
}
