/**
 * Bases formula helper functions — the deliberately small, documented set the
 * first version supports. NOT the full Obsidian formula language (no lambdas,
 * no list map/filter). Each function receives already-evaluated argument
 * values and returns a formula value.
 *
 * A formula value is a string, number, boolean, Date, or null (empty).
 */

export type FormulaValue = string | number | boolean | Date | null

/** Signature shared by every built-in formula function. */
export type FormulaFn = (args: FormulaValue[]) => FormulaValue

const MS_PER_DAY = 86_400_000

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

/** Truthiness used by `if` and boolean coercion. */
export function isTruthy(value: FormulaValue): boolean {
  if (value === null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.length > 0
  if (value instanceof Date) return !Number.isNaN(value.getTime())
  return false
}

/** The built-in function table, keyed by name. */
export const FORMULA_FUNCTIONS: Record<string, FormulaFn> = {
  /** if(condition, thenValue, elseValue) */
  if: (args) => {
    if (args.length < 2) throw new Error('if() needs at least 2 arguments')
    return isTruthy(args[0] ?? null) ? (args[1] ?? null) : (args[2] ?? null)
  },

  /** concat(...parts) — string concatenation, nulls become empty strings. */
  concat: (args) => args.map((a) => (a === null ? '' : a instanceof Date ? a.toISOString() : String(a))).join(''),

  /** now() — current timestamp as a Date. */
  now: () => new Date(),

  /** today() — current date at local midnight. */
  today: () => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  },

  /** date(value) — parse a value into a Date (null when unparseable). */
  date: (args) => toDate(args[0] ?? null),

  /** days(a, b) — whole-day difference between two dates (a - b). */
  days: (args) => {
    const a = toDate(args[0] ?? null)
    const b = toDate(args[1] ?? null)
    if (!a || !b) return null
    return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY)
  },

  /** length(value) — string/collection length; 0 for null. */
  length: (args) => {
    const v = args[0] ?? null
    if (v === null) return 0
    if (typeof v === 'string') return v.length
    return String(v).length
  },
}
