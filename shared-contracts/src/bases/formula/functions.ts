/**
 * Bases expression values + global functions.
 *
 * Two value models exist deliberately and must NOT be merged:
 *   - This `FormulaValue` is the internal COMPUTATION model — plain scalars the
 *     evaluator does arithmetic/comparison on. No DOM, no rendering.
 *   - `plugins/compat/bases-values.ts`'s `Value` hierarchy is the Obsidian
 *     plugin-API SURFACE model — DOM-rendering classes a third-party Bases view
 *     receives. Different purpose, different lifecycle; a bridge converts at the
 *     boundary rather than one model serving both.
 *
 * A formula value is a string, number, boolean, Date, list, link, regex, object,
 * duration, html, icon, image, or null (empty). This is the deliberately pragmatic
 * set from the Bases expression-language spec — NOT the full Obsidian language.
 */

import moment from 'moment'

/** A link value: a vault path with optional display text. */
export interface LinkValue {
  readonly kind: 'link'
  path: string
  display?: string
}

/** A regular-expression value (`/abc/g` literal). */
export interface RegexValue {
  readonly kind: 'regex'
  source: string
  flags: string
}

/**
 * An object value: named entries in insertion order (`file.properties`). A `Map`, not a plain object,
 * so a key like `__proto__` or `constructor` is an ordinary key and never reaches `Object.prototype`.
 * Immutable: no expression changes one.
 */
export interface ObjectValue {
  readonly kind: 'object'
  readonly entries: ReadonlyMap<string, FormulaValue>
}

/**
 * A duration value (`duration("1M")`, `dateA - dateB`). Calendar months are kept apart from the fixed
 * part, so `date("2024-12-01") + "1M"` lands on 2025-01-01 instead of 30 days later.
 */
export interface DurationValue {
  readonly kind: 'duration'
  /** Calendar months (a year is 12). */
  months: number
  /** Everything shorter than a month, in milliseconds. */
  ms: number
}

/** Raw HTML (`html("<b>x</b>")`). The renderer sanitizes it; the engine only carries the text. */
export interface HtmlValue {
  readonly kind: 'html'
  html: string
}

/** An icon by its Lucide name (`icon("star")`). */
export interface IconValue {
  readonly kind: 'icon'
  name: string
}

/** An image by vault path or URL (`image(cover)`). */
export interface ImageValue {
  readonly kind: 'image'
  path: string
}

/** A formula/expression value. */
export type FormulaValue =
  | string | number | boolean | Date | FormulaValue[]
  | LinkValue | RegexValue | ObjectValue | DurationValue | HtmlValue | IconValue | ImageValue | null

/** Signature shared by every built-in global function. */
export type FormulaFn = (args: FormulaValue[]) => FormulaValue

const MS_PER_DAY = 86_400_000

/** True when a value is a link object. */
export function isLink(value: FormulaValue): value is LinkValue {
  return typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value) && value.kind === 'link'
}

/** True when a value is an object. */
export function isObject(value: FormulaValue): value is ObjectValue {
  return typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value) && value.kind === 'object'
}

/** The `kind` tag of a tagged value, or null for scalars, dates and lists. */
function kindOf(value: FormulaValue): string | null {
  return typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value) ? value.kind : null
}

/** True when a value is a duration. */
export function isDuration(value: FormulaValue): value is DurationValue {
  return kindOf(value) === 'duration'
}

/** True when a value is raw HTML. */
export function isHtml(value: FormulaValue): value is HtmlValue {
  return kindOf(value) === 'html'
}

/** True when a value is an icon. */
export function isIcon(value: FormulaValue): value is IconValue {
  return kindOf(value) === 'icon'
}

/** True when a value is an image. */
export function isImage(value: FormulaValue): value is ImageValue {
  return kindOf(value) === 'image'
}

/** Builds an object value from `[key, value]` pairs (later duplicates win, order is first insertion). */
export function makeObject(entries: Iterable<readonly [string, FormulaValue]>): ObjectValue {
  return { kind: 'object', entries: new Map(entries) }
}

/** Nesting deeper than this is cut off when an object is rendered or compared (a guard, not a feature). */
const MAX_OBJECT_DEPTH = 16

/** The JSON-shaped form of a value, used for the text form of an object. */
function toJsonShape(v: FormulaValue, depth: number): unknown {
  if (v === null) return null
  if (depth > MAX_OBJECT_DEPTH) return '…'
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString()
  if (Array.isArray(v)) return v.map((item) => toJsonShape(item, depth + 1))
  if (isObject(v)) {
    const out: Array<[string, unknown]> = []
    for (const [key, value] of v.entries) out.push([key, toJsonShape(value, depth + 1)])
    return Object.fromEntries(out)
  }
  if (isLink(v)) return v.display ?? v.path
  if (isRegex(v)) return `/${v.source}/${v.flags}`
  if (isDuration(v) || isHtml(v) || isIcon(v) || isImage(v)) return stringify(v)
  return v
}

/**
 * Strict structural equality of two values inside an object: same type and same content. Unlike the
 * loose `==` of expressions, `1` is not `"1"`, `null` is not `""`, and the list `["x, y"]` is not `["x","y"]`.
 */
function valuesIdentical(a: FormulaValue, b: FormulaValue, depth: number): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => valuesIdentical(item, b[i] ?? null, depth + 1))
  }
  if (isObject(a) || isObject(b)) return isObject(a) && isObject(b) && objectsEqual(a, b, depth + 1)
  if (isLink(a) || isLink(b)) return isLink(a) && isLink(b) && a.path === b.path && a.display === b.display
  if (isRegex(a) || isRegex(b)) return isRegex(a) && isRegex(b) && a.source === b.source && a.flags === b.flags
  const ka = kindOf(a)
  if (ka !== null || kindOf(b) !== null) return ka === kindOf(b) && stringify(a) === stringify(b)
  return false // primitives of a different type or value (the identity check above handled equal ones)
}

/**
 * Structural equality of two objects: same keys, identical values (order does not matter). The same
 * object is always equal to itself; two DIFFERENT objects nested deeper than the guard compare unequal
 * rather than recursing without bound.
 */
export function objectsEqual(a: ObjectValue, b: ObjectValue, depth = 0): boolean {
  if (a === b) return true
  if (a.entries.size !== b.entries.size) return false
  if (depth > MAX_OBJECT_DEPTH) return false
  for (const [key, value] of a.entries) {
    if (!b.entries.has(key)) return false
    if (!valuesIdentical(value, b.entries.get(key) ?? null, depth)) return false
  }
  return true
}

/** True when a value is a regular expression. */
export function isRegex(value: FormulaValue): value is RegexValue {
  return typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value) && value.kind === 'regex'
}

/** Longest regex source a formula may use. */
const MAX_REGEX_SOURCE = 200

/** Builds a JS RegExp from a regex value; null for an invalid pattern. */
export function toRegExp(value: RegexValue, extraFlags = ''): RegExp | null {
  // A base is evaluated server-side too (MCP `query_base`): keep patterns short so a
  // pasted pathological one cannot be arbitrarily large. Backtracking cost is not bounded.
  if (value.source.length > MAX_REGEX_SOURCE) return null
  try {
    return new RegExp(value.source, [...new Set(value.flags + extraFlags)].join(''))
  } catch {
    return null
  }
}

/** A bare calendar date `YYYY-MM-DD` with no time component. */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Coerces a value to a Date, or null when it cannot be parsed. */
export function toDate(value: FormulaValue): Date | null {
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'string') {
    // A bare `YYYY-MM-DD` parses as LOCAL midnight (not UTC, as `new Date(str)`
    // would), so it lines up with today()'s local midnight. Otherwise a date
    // difference like `date(deadline) - today()` carried the timezone offset as
    // a sub-day remainder and `.days` showed 23.0416… instead of 23.
    const m = DATE_ONLY_RE.exec(value)
    if (m) {
      const [y, mo, d] = value.split('-').map(Number) as [number, number, number]
      // setFullYear, not the Date constructor: `new Date(50, …)` would mean 1950 and
      // `new Date(0, 1, 29)` the non-leap 1900.
      const date = new Date(2000, 0, 1)
      date.setFullYear(y, mo - 1, d)
      // `2024-02-31` must not roll over into March: an impossible date is not a date.
      if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null
      return date
    }
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/** Coerces a value to a number, or null when not numeric. */
export function toNumber(v: FormulaValue): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return v.getTime()
  if (isDuration(v)) return durationMs(v)
  if (typeof v === 'string') {
    const n = Number(v)
    return v.trim() !== '' && !Number.isNaN(n) ? n : null
  }
  return null
}

/** Renders a value to a display string (used by concat and string coercion). */
export function stringify(v: FormulaValue): string {
  if (v === null) return ''
  if (v instanceof Date) return v.toISOString()
  if (Array.isArray(v)) return v.map(stringify).join(', ')
  if (isLink(v)) return v.display ?? v.path
  if (isRegex(v)) return `/${v.source}/${v.flags}`
  if (isDuration(v)) return formatDuration(v)
  if (isHtml(v)) return v.html
  if (isIcon(v)) return v.name
  if (isImage(v)) return v.path
  // Slatebase's own choice: Obsidian's docs do not say how an object prints. Compact JSON is unambiguous.
  if (isObject(v)) return JSON.stringify(toJsonShape(v, 0))
  return String(v)
}

/** Truthiness used by `if`, `&&`/`||` and boolean coercion. */
export function isTruthy(value: FormulaValue): boolean {
  if (value === null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.length > 0
  if (value instanceof Date) return !Number.isNaN(value.getTime())
  if (Array.isArray(value)) return value.length > 0
  if (isLink(value)) return value.path.length > 0
  if (isRegex(value)) return true
  if (isObject(value)) return value.entries.size > 0
  if (isDuration(value)) return value.months !== 0 || value.ms !== 0
  if (isHtml(value) || isIcon(value) || isImage(value)) return stringify(value).length > 0
  return false
}

/** Days a calendar month counts as when a duration is read as one number. */
const DAYS_PER_MONTH = 30

/** Unit → `[months, ms]` per one of that unit. `M` (month) and `m` (minute) are matched case-sensitively first. */
const DURATION_UNITS: Record<string, readonly [number, number]> = {
  y: [12, 0], year: [12, 0], years: [12, 0],
  mo: [1, 0], month: [1, 0], months: [1, 0],
  w: [0, 7 * MS_PER_DAY], week: [0, 7 * MS_PER_DAY], weeks: [0, 7 * MS_PER_DAY],
  d: [0, MS_PER_DAY], day: [0, MS_PER_DAY], days: [0, MS_PER_DAY],
  h: [0, 3_600_000], hour: [0, 3_600_000], hours: [0, 3_600_000],
  m: [0, 60_000], minute: [0, 60_000], minutes: [0, 60_000],
  s: [0, 1000], second: [0, 1000], seconds: [0, 1000],
}

/** Builds a duration value. */
export function makeDuration(months: number, ms: number): DurationValue {
  return { kind: 'duration', months, ms }
}

/** Parses an Obsidian duration string (e.g. "1M", "2 weeks", "3d") to a duration, or null. */
export function parseDuration(spec: string): DurationValue | null {
  const m = spec.trim().match(/^(-?\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/)
  if (!m) return null
  const amount = Number(m[1])
  const rawUnit = m[2]!
  // Case-sensitive exception: `M` = month, `m` = minute.
  const unit = rawUnit === 'M' ? DURATION_UNITS['month'] : rawUnit === 'm' ? DURATION_UNITS['m'] : DURATION_UNITS[rawUnit.toLowerCase()]
  if (unit === undefined) return null
  return makeDuration(amount * unit[0], amount * unit[1])
}

/** A duration as one millisecond number (a whole year counts as 365 days, a month as 30). */
export function durationMs(d: DurationValue): number {
  const years = Math.trunc(d.months / 12)
  return (years * 365 + (d.months - years * 12) * DAYS_PER_MONTH) * MS_PER_DAY + d.ms
}

/** Parses an Obsidian duration string to milliseconds, or null (a year counts as 365 days, a month as 30). */
export function parseDurationMs(spec: string): number | null {
  const d = parseDuration(spec)
  return d ? durationMs(d) : null
}

/**
 * Moves a date by a duration: whole months by the calendar (clamped to the month's last day), the
 * rest as fixed time. `sign` is `1` to add, `-1` to subtract.
 */
export function addDuration(date: Date, d: DurationValue, sign: 1 | -1): Date {
  const whole = Math.trunc(d.months)
  const rest = (d.months - whole) * DAYS_PER_MONTH * MS_PER_DAY + d.ms
  return moment(date).add(sign * whole, 'months').add(sign * rest, 'milliseconds').toDate()
}

/**
 * The text form of a duration. Slatebase's own choice (Obsidian's docs do not give one): the units
 * that are not zero, largest first, e.g. `1y 2M 3d 4h`; an empty duration is `0s`.
 */
export function formatDuration(d: DurationValue): string {
  const total = durationMs(d)
  if (total === 0) return '0s'
  const parts: string[] = []
  const months = Math.trunc(Math.abs(d.months))
  if (months >= 12) parts.push(`${Math.trunc(months / 12)}y`)
  if (months % 12 > 0) parts.push(`${months % 12}M`)
  let rest = Math.abs((d.months - Math.trunc(d.months)) * DAYS_PER_MONTH * MS_PER_DAY + d.ms)
  for (const [label, size] of [['d', MS_PER_DAY], ['h', 3_600_000], ['m', 60_000], ['s', 1000]] as const) {
    const n = Math.trunc(rest / size)
    if (n > 0) parts.push(`${n}${label}`)
    rest -= n * size
  }
  if (rest > 0) parts.push(`${Math.round(rest)}ms`)
  return (total < 0 ? '-' : '') + parts.join(' ')
}

/** The built-in global function table, keyed by name. */
export const FORMULA_FUNCTIONS: Record<string, FormulaFn> = {
  /** if(condition, thenValue, elseValue) */
  if: (args) => {
    if (args.length < 2) throw new Error('if() needs at least 2 arguments')
    return isTruthy(args[0] ?? null) ? (args[1] ?? null) : (args[2] ?? null)
  },

  /** concat(...parts) — string concatenation, nulls become empty strings. */
  concat: (args) => args.map(stringify).join(''),

  /** now() — current timestamp as a Date. */
  now: () => new Date(),

  /** today() — current date at local midnight. */
  today: () => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  },

  /** date(value) — parse a value into a Date (null when unparseable). */
  date: (args) => toDate(args[0] ?? null),

  /** number(value) — coerce to a number (null when not numeric). */
  number: (args) => toNumber(args[0] ?? null),

  /** list(value) — wrap a single value in a one-element list; pass lists through. */
  list: (args) => {
    const v = args[0] ?? null
    if (v === null) return []
    return Array.isArray(v) ? v : [v]
  },

  /** link(path, display?) — build a link value. */
  link: (args) => {
    const path = stringify(args[0] ?? null)
    const display = args.length > 1 ? stringify(args[1] ?? null) : undefined
    const l: LinkValue = { kind: 'link', path }
    if (display) l.display = display
    return l
  },

  /** file(path) — a link value to a vault file. */
  file: (args) => FORMULA_FUNCTIONS['link']!(args.slice(0, 1)),

  /** image(path) — an image by vault path, link or URL; the view renders it, text contexts show the path. */
  image: (args) => {
    const v = args[0] ?? null
    return { kind: 'image', path: isLink(v) ? v.path : stringify(v) }
  },

  /** icon(name) — a Lucide icon by name; the view renders it, text contexts show the name. */
  icon: (args) => ({ kind: 'icon', name: stringify(args[0] ?? null) }),

  /** html(string) — raw HTML; the view sanitizes and renders it, text contexts show the source. */
  html: (args) => ({ kind: 'html', html: stringify(args[0] ?? null) }),

  /** escapeHTML(string) — escapes &, <, >, " and '. */
  escapeHTML: (args) => stringify(args[0] ?? null)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),

  /** duration(string) — a duration value (`duration('5h') * 2`, `now() + duration('1d')`); a number is milliseconds. */
  duration: (args) => {
    const v = args[0] ?? null
    if (isDuration(v)) return v
    if (typeof v === 'number') return makeDuration(0, v)
    return parseDuration(stringify(v))
  },

  /** random() — a number in [0, 1). */
  random: () => Math.random(),

  /** min(...numbers) — smallest numeric argument, null when none numeric. */
  min: (args) => {
    const nums = args.map(toNumber).filter((n): n is number => n !== null)
    return nums.length ? Math.min(...nums) : null
  },

  /** max(...numbers) — largest numeric argument, null when none numeric. */
  max: (args) => {
    const nums = args.map(toNumber).filter((n): n is number => n !== null)
    return nums.length ? Math.max(...nums) : null
  },

  /** days(a, b) — whole-day difference between two dates (a - b). */
  days: (args) => {
    const a = toDate(args[0] ?? null)
    const b = toDate(args[1] ?? null)
    if (!a || !b) return null
    return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY)
  },

  /** length(value) — string/list length; 0 for null. */
  length: (args) => {
    const v = args[0] ?? null
    if (v === null) return 0
    if (typeof v === 'string') return v.length
    if (Array.isArray(v)) return v.length
    return stringify(v).length
  },
}
