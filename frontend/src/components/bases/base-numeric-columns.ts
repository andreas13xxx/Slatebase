/**
 * Numeric-column detection for the Bases table, so numbers (and only numbers)
 * are right-aligned. Kept out of the component file (react-refresh constraint).
 */

import type { BaseDocument, BaseRow } from '@slatebase/shared-contracts'
import { evaluateFormulaColumn } from '@slatebase/shared-contracts'
import { inferCellType } from './base-cell-type'

/** The formula id behind a column (`formula.x` or a bare formula id), or null for a non-formula column. */
export function formulaKeyOf(column: string, formulaKeys: ReadonlySet<string>): string | null {
  if (column.startsWith('formula.')) {
    const key = column.slice('formula.'.length)
    return formulaKeys.has(key) ? key : null
  }
  return formulaKeys.has(column) ? column : null
}

/** Columns whose every non-empty value is a number (at least one value). */
export function computeNumericColumns(doc: BaseDocument, columns: string[], rows: BaseRow[]): Set<string> {
  const formulaKeys = new Set(Object.keys(doc.formulas ?? {}))
  const numeric = new Set<string>()
  columns.forEach((col, index) => {
    if (index === 0 || col.startsWith('file.')) return
    const formulaKey = formulaKeyOf(col, formulaKeys)
    let seen = false
    let allNumbers = true
    for (const row of rows) {
      if (formulaKey !== null) {
        const result = evaluateFormulaColumn(doc, row, formulaKey)
        if (!result.ok || result.value === null || result.value === undefined || result.value === '') continue
        seen = true
        if (typeof result.value !== 'number') { allNumbers = false; break }
      } else {
        const raw = row.values[col]
        const values = Array.isArray(raw) ? raw.map(String) : raw === undefined || raw === null ? [] : [String(raw)]
        if (values.length === 0 || values[0] === '') continue
        seen = true
        if (inferCellType(values) !== 'number') { allNumbers = false; break }
      }
    }
    if (seen && allNumbers) numeric.add(col)
  })
  return numeric
}
