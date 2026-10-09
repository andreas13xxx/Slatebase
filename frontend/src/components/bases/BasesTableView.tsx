/**
 * BasesTableView — renders a base's rows as a sortable table.
 *
 * One row per note, one column per configured property/formula, the first
 * column linking to the note. Property cells are editable (BaseCell); formula
 * columns are evaluated client-side and read-only. Clicking a header toggles
 * the sort and reports it upward (the container writes it back into the
 * `.base` file).
 */

import { memo, useCallback, useMemo } from 'react'
import type { BaseDocument, BaseRow, BaseView, BaseSortClause } from '../../bases/types'
import { evaluateFormula, formatFormulaValue } from '../../bases/formula/evaluator'
import type { FormulaContext } from '../../bases/formula/evaluator'
import { BaseCell } from './BaseCell'
import { inferCellType } from './base-cell-type'

export interface BasesTableViewProps {
  doc: BaseDocument
  view: BaseView
  rows: BaseRow[]
  /** Open a note by its vault-relative path. */
  onOpenNote: (path: string) => void
  /** Commit new values for one property on one note. */
  onCommitCell: (path: string, property: string, values: string[]) => void
  /** Toggle sort on a column; the container persists it. */
  onSortChange: (sort: BaseSortClause[]) => void
}

/** Builds a formula evaluation context from one row's values. */
function rowContext(row: BaseRow): FormulaContext {
  return {
    resolve: (name) => {
      if (name === 'file.name') return row.fileName
      const v = row.values[name]
      if (Array.isArray(v)) return v.length > 0 ? (v[0] ?? null) : null
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v
      return null
    },
  }
}

export const BasesTableView = memo(function BasesTableView({
  doc, view, rows, onOpenNote, onCommitCell, onSortChange,
}: BasesTableViewProps) {
  const formulaKeys = useMemo(() => new Set(Object.keys(doc.formulas ?? {})), [doc.formulas])
  const columns = useMemo(() => view.order ?? Object.keys(doc.properties ?? {}), [view.order, doc.properties])

  const sortByColumn = useMemo(() => {
    const map = new Map<string, 'asc' | 'desc'>()
    for (const s of view.sort ?? []) map.set(s.column, s.direction ?? 'asc')
    return map
  }, [view.sort])

  const headerLabel = useCallback(
    (col: string): string => doc.properties?.[col]?.displayName ?? col,
    [doc.properties],
  )

  const handleHeaderClick = useCallback((col: string) => {
    const current = sortByColumn.get(col)
    const next: BaseSortClause = { column: col, direction: current === 'asc' ? 'desc' : 'asc' }
    onSortChange([next])
  }, [sortByColumn, onSortChange])

  return (
    <div className="bases-table-view">
      <table className="bases-table">
        <thead>
          <tr>
            {columns.map((col) => {
              const dir = sortByColumn.get(col)
              return (
                <th
                  key={col}
                  className="bases-table__header"
                  aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                >
                  <button
                    type="button"
                    className="bases-table__header-btn"
                    onClick={() => handleHeaderClick(col)}
                  >
                    {headerLabel(col)}
                    {dir === 'asc' && <span aria-hidden="true"> ▲</span>}
                    {dir === 'desc' && <span aria-hidden="true"> ▼</span>}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.path} className="bases-table__row">
              {columns.map((col, colIndex) => {
                // First column links to the note.
                if (colIndex === 0) {
                  const firstVal = row.values[col]
                  const linkText = col === 'file.name'
                    ? row.fileName
                    : (Array.isArray(firstVal) ? (firstVal[0] as string | undefined) : undefined) ?? row.fileName
                  return (
                    <td key={col} className="bases-table__cell bases-table__cell--link">
                      <button type="button" className="bases-table__link" onClick={() => onOpenNote(row.path)}>
                        {linkText}
                      </button>
                    </td>
                  )
                }

                if (formulaKeys.has(col)) {
                  const src = doc.formulas?.[col] ?? ''
                  const result = evaluateFormula(src, rowContext(row))
                  return (
                    <td key={col} className="bases-table__cell bases-table__cell--formula">
                      {result.ok
                        ? formatFormulaValue(result.value)
                        : <span className="bases-table__formula-error" title={result.error}>#ERR</span>}
                    </td>
                  )
                }

                if (col.startsWith('file.')) {
                  const raw = row.values[col]
                  const text = col === 'file.name'
                    ? row.fileName
                    : String((Array.isArray(raw) ? raw[0] : raw) ?? '')
                  return <td key={col} className="bases-table__cell"><span className="base-cell base-cell--readonly">{text}</span></td>
                }

                const raw = row.values[col]
                const strValues = Array.isArray(raw)
                  ? raw.map((v) => String(v))
                  : raw === undefined || raw === null
                    ? []
                    : [String(raw)]
                return (
                  <td key={col} className="bases-table__cell">
                    <BaseCell
                      values={strValues}
                      type={inferCellType(strValues)}
                      readOnly={false}
                      onCommit={(newValues) => onCommitCell(row.path, col, newValues)}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="bases-table-view__empty">Keine Einträge</p>}
    </div>
  )
})
