/**
 * BasesTableView — renders a base's rows as a sortable table.
 *
 * One row per note, one column per configured property/formula, the first
 * column linking to the note. Property cells are editable (BaseCell); formula
 * columns are evaluated client-side and read-only. Clicking a header toggles
 * the sort and reports it upward (the container writes it back into the
 * `.base` file). With `view.groupBy` the rows are split into collapsible groups
 * (ordered/hidden by `view.groupOrder`).
 */

import { Fragment, memo, useCallback, useMemo } from 'react'
import type { BaseDocument, BaseRow, BaseView, BaseSortClause } from '@slatebase/shared-contracts'
import { evaluateFormula, formatFormulaValue, computeSummaries, rowContext } from '@slatebase/shared-contracts'
import type { ComputedSummaries } from '@slatebase/shared-contracts'
import { BaseCell } from './BaseCell'
import { inferCellType } from './base-cell-type'
import { groupRows, groupLabel, useCollapsedGroups } from './base-groups'

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

  // Column summaries (Sum/Average/Count/…) over the currently shown rows.
  const summaries: ComputedSummaries = useMemo(
    () => computeSummaries(rows, view, doc),
    [rows, view, doc],
  )
  const groups = useMemo(() => groupRows(rows, view), [rows, view])
  const [collapsed, toggleGroup] = useCollapsedGroups()
  const groupPropertyLabel = headerLabel(view.groupBy?.property ?? '')
  const hasSummaries = Object.keys(summaries).length > 0

  const renderRow = (row: BaseRow) => (
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
            const result = evaluateFormula(src, rowContext(row, doc))
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
  )

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
          {groups
            ? groups.map((g) => (
              <Fragment key={g.key}>
                <tr className="bases-table__group-row">
                  <th scope="rowgroup" colSpan={Math.max(columns.length, 1)} className="bases-table__group-cell">
                    <button
                      type="button"
                      className="bases-table__group-btn"
                      aria-expanded={!collapsed[g.key]}
                      onClick={() => toggleGroup(g.key)}
                    >
                      <span aria-hidden="true">{collapsed[g.key] ? '▶' : '▼'} </span>
                      {groupLabel(g.key, groupPropertyLabel)}
                      <span className="bases-table__group-count"> ({g.rows.length})</span>
                    </button>
                  </th>
                </tr>
                {!collapsed[g.key] && g.rows.map(renderRow)}
              </Fragment>
            ))
            : rows.map(renderRow)}
        </tbody>
        {hasSummaries && (
          <tfoot>
            <tr className="bases-table__summary-row">
              {columns.map((col) => {
                const s = summaries[col]
                return (
                  <td key={col} className="bases-table__cell bases-table__summary-cell">
                    {s && (
                      <span className="bases-table__summary">
                        <span className="bases-table__summary-label">{s.summary}</span>
                        <span className="bases-table__summary-value">{formatFormulaValue(s.value)}</span>
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        )}
      </table>
      {rows.length === 0 && <p className="bases-table-view__empty">Keine Einträge</p>}
    </div>
  )
})
