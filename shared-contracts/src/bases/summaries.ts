/**
 * Bases column summaries — the aggregate row shown under a table column (and in
 * a card group header). Pure logic shared by the frontend table/card views and
 * the backend MCP `query_base` tool, so both compute identical totals.
 *
 * Covers Obsidian's built-in summary functions (help.obsidian.md/bases/views/table):
 *   - All types: Count, Empty, Filled, Unique
 *   - Numbers:   Sum, Average, Min, Max, Median, Range, Stddev
 *   - Dates:     Earliest, Latest, Range
 *   - Checkbox:  Checked, Unchecked
 *
 * NOT covered (deliberately out of this spec, same reason as list `map`/`filter`):
 * custom summaries written as a formula over `values` (`values.reduce(...)`) —
 * those need the lambda support that is a separate later theme. An unknown
 * summary name yields `null` (no value, no error), never a thrown exception.
 */

import type { BaseDocument, BaseRow, BaseView } from './types.js'
import { rowContext } from './base-eval.js'
import type { FormulaValue } from './formula/functions.js'
import { toDate } from './formula/functions.js'

/** One computed summary: the function that was applied and its resulting value. */
export interface ColumnSummary {
  /** The summary function name as stored in the base (e.g. `Average`). */
  summary: string
  /** The aggregate value, or null when it is not computable for this column. */
  value: FormulaValue
}

/** Column id → computed summary, for every column the view assigns a summary to. */
export type ComputedSummaries = Record<string, ColumnSummary>

/** Canonical (lowercase) summary names, so `Average`/`average`/`AVERAGE` all match. */
const KNOWN_SUMMARIES: ReadonlySet<string> = new Set([
  'count',
  'empty',
  'filled',
  'unique',
  'sum',
  'average',
  'avg',
  'min',
  'max',
  'median',
  'range',
  'stddev',
  'earliest',
  'latest',
  'checked',
  'unchecked',
])

/**
 * Computes the summary for every column the view assigns one to, over the given
 * rows (already filtered + typed). Values are resolved via the shared row
 * context, so a summary works over a property OR a formula column alike.
 */
export function computeSummaries(rows: BaseRow[], view: BaseView, doc: BaseDocument): ComputedSummaries {
  const assignments = view.summaries
  if (!assignments) return {}

  const out: ComputedSummaries = {}
  for (const [column, summaryName] of Object.entries(assignments)) {
    const values = resolveColumnValues(rows, column, doc)
    out[column] = { summary: summaryName, value: computeOne(summaryName, values) }
  }
  return out
}

/** Resolves one column's value for every row; a failing formula contributes null. */
function resolveColumnValues(rows: BaseRow[], column: string, doc: BaseDocument): FormulaValue[] {
  return rows.map((row) => {
    try {
      return rowContext(row, doc).resolve(column)
    } catch {
      return null
    }
  })
}

/** True when a value counts as "empty" (no value) for Empty/Filled/Count semantics. */
function isEmpty(v: FormulaValue): boolean {
  if (v === null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

/** Extracts the finite numbers from a value list (strings parsed, non-numbers dropped). */
function toNumbers(values: FormulaValue[]): number[] {
  const nums: number[] = []
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      nums.push(v)
    } else if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v)
      if (Number.isFinite(n)) nums.push(n)
    }
  }
  return nums
}

/** Extracts the parseable dates from a value list. */
function toDates(values: FormulaValue[]): Date[] {
  const dates: Date[] = []
  for (const v of values) {
    const d = toDate(v)
    if (d && !Number.isNaN(d.getTime())) dates.push(d)
  }
  return dates
}

/** True when a value is a boolean-true checkbox (or its common string forms). */
function isChecked(v: FormulaValue): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    return s === 'true' || s === 'yes' || s === 'checked'
  }
  return false
}

/**
 * Applies one summary function to a column's values. Numeric aggregates over a
 * non-numeric column return null (no value, not an error — R3.4); an unknown
 * summary name returns null too.
 */
function computeOne(summaryName: string, values: FormulaValue[]): FormulaValue {
  const name = summaryName.trim().toLowerCase()
  if (!KNOWN_SUMMARIES.has(name)) return null

  switch (name) {
    case 'count':
      return values.length
    case 'empty':
      return values.filter(isEmpty).length
    case 'filled':
      return values.filter((v) => !isEmpty(v)).length
    case 'unique': {
      const seen = new Set<string>()
      for (const v of values) {
        if (isEmpty(v)) continue
        seen.add(JSON.stringify(v))
      }
      return seen.size
    }
    case 'checked':
      return values.filter(isChecked).length
    case 'unchecked':
      // "off" = present but not checked; an empty value is neither on nor off.
      return values.filter((v) => !isEmpty(v) && !isChecked(v)).length
    case 'sum': {
      const nums = toNumbers(values)
      return nums.reduce((a, b) => a + b, 0)
    }
    case 'average':
    case 'avg': {
      const nums = toNumbers(values)
      if (nums.length === 0) return null
      return nums.reduce((a, b) => a + b, 0) / nums.length
    }
    case 'min': {
      const nums = toNumbers(values)
      return nums.length === 0 ? null : Math.min(...nums)
    }
    case 'max': {
      const nums = toNumbers(values)
      return nums.length === 0 ? null : Math.max(...nums)
    }
    case 'median': {
      const nums = toNumbers(values).slice().sort((a, b) => a - b)
      if (nums.length === 0) return null
      const mid = Math.floor(nums.length / 2)
      return nums.length % 2 === 0 ? (nums[mid - 1]! + nums[mid]!) / 2 : nums[mid]!
    }
    case 'stddev': {
      const nums = toNumbers(values)
      if (nums.length === 0) return null
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length
      const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length
      return Math.sqrt(variance)
    }
    case 'range': {
      // Numeric range when the column is numeric; otherwise a date range in days.
      const nums = toNumbers(values)
      if (nums.length > 0) return Math.max(...nums) - Math.min(...nums)
      const dates = toDates(values)
      if (dates.length === 0) return null
      const times = dates.map((d) => d.getTime())
      return (Math.max(...times) - Math.min(...times)) / 86_400_000
    }
    case 'earliest': {
      const dates = toDates(values)
      if (dates.length === 0) return null
      return new Date(Math.min(...dates.map((d) => d.getTime())))
    }
    case 'latest': {
      const dates = toDates(values)
      if (dates.length === 0) return null
      return new Date(Math.max(...dates.map((d) => d.getTime())))
    }
    default:
      return null
  }
}
