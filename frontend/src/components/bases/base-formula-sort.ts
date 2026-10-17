/**
 * Pure client-side formula-column sorting for Bases table/card views.
 *
 * Formula columns are not sortable server-side (buildQuerySpec drops a formula
 * key from the backend sort), so when a view's sort targets a formula column we
 * sort the already-fetched rows here by the evaluated value — stable on ties.
 * Kept out of BasesView so it is unit-testable without the component.
 */

import { evaluateFormulaColumn } from '@slatebase/shared-contracts'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'

/**
 * Returns `rows` sorted by the view's first sort clause when that clause
 * targets a formula column; otherwise returns `rows` unchanged (a property /
 * file.* sort is already applied by the backend). Null/error values sort last
 * (ascending) or first (descending). Stable: equal keys keep input order.
 */
export function sortRowsByFormula(rows: BaseRow[], doc: BaseDocument, view: BaseView | undefined): BaseRow[] {
  if (!view) return rows
  const sort = view.sort?.[0]
  if (!sort) return rows
  const formulaKeys = new Set(Object.keys(doc.formulas ?? {}))
  const key = sort.column.startsWith('formula.') ? sort.column.slice('formula.'.length) : sort.column
  if (!formulaKeys.has(key)) return rows

  const dir = sort.direction === 'desc' ? -1 : 1
  const valueFor = (row: BaseRow): number | string => {
    const r = evaluateFormulaColumn(doc, row, key)
    if (!r.ok || r.value === null) return dir === 1 ? Infinity : -Infinity
    const v = r.value
    if (typeof v === 'number') return v
    if (v instanceof Date) return v.getTime()
    return String(v)
  }

  return rows
    .map((row, i) => ({ row, i, k: valueFor(row) }))
    .sort((a, b) => {
      if (a.k < b.k) return -1 * dir
      if (a.k > b.k) return 1 * dir
      return a.i - b.i
    })
    .map((e) => e.row)
}
