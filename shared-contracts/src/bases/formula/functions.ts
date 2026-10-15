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
 * A formula value is a string, number, boolean, Date, list, link, or null
 * (empty). This is the deliberately pragmatic set from the Bases
 * expression-language spec — NOT the full Obsidian language.
 */

/** A link value: a vault path with optional display text. */
export interface LinkValue {
  readonly kind: 'link'
  path: string
  display?: string
}

/** A formula/expression value. */
export type FormulaValue = string | number | boolean | Date | FormulaValue[] | LinkValue | null

/** Signature shared by every built-in global function. */
export type FormulaFn = (args: FormulaValue[]) => FormulaValue

const MS_PER_DAY = 86_400_000

/** True when a value is a link object. */
export function isLink(value: FormulaValue): value is LinkValue {
  return typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value)
}

/** Coerces a value to a Date, or null when it cannot be parsed. */
export function toDate(value: FormulaValue): Date | null {
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'string') {
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
  return false
}

/** Parses an Obsidian duration string (e.g. "1M", "2 weeks", "3d") to ms, or null. */
export function parseDurationMs(spec: string): number | null {
  const m = spec.trim().match(/^(-?\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/)
  if (!m) return null
  const amount = Number(m[1])
  const unit = m[2]!.toLowerCase()
  const MS = {
    y: 365 * MS_PER_DAY, year: 365 * MS_PER_DAY, years: 365 * MS_PER_DAY,
    mo: 30 * MS_PER_DAY, month: 30 * MS_PER_DAY, months: 30 * MS_PER_DAY, M: 30 * MS_PER_DAY,
    w: 7 * MS_PER_DAY, week: 7 * MS_PER_DAY, weeks: 7 * MS_PER_DAY,
    d: MS_PER_DAY, day: MS_PER_DAY, days: MS_PER_DAY,
    h: 3_600_000, hour: 3_600_000, hours: 3_600_000,
    m: 60_000, minute: 60_000, minutes: 60_000,
    s: 1000, second: 1000, seconds: 1000,
  } as Record<string, number>
  // Case-sensitive exception: `M` = month, `m` = minute.
  const rawUnit = m[2]!
  const factor = rawUnit === 'M' ? MS['M'] : rawUnit === 'm' ? MS['m'] : MS[unit]
  if (factor === undefined) return null
  return amount * factor
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
