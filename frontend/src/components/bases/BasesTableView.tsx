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

import { Fragment, memo, useCallback, useMemo, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { BaseDocument, BaseRow, BaseView, BaseSortClause } from '@slatebase/shared-contracts'
import { evaluateFormulaColumn, formatFormulaValue, computeSummaries } from '@slatebase/shared-contracts'
import type { ComputedSummaries } from '@slatebase/shared-contracts'
import { BaseCell } from './BaseCell'
import { inferCellType } from './base-cell-type'
import { groupRows, groupLabel, useCollapsedGroups } from './base-groups'
import { computeNumericColumns, formulaKeyOf } from './base-numeric-columns'
import { columnLabel, COLUMN_WIDTH } from './base-edit'
import { ColumnTypeIcon } from './base-column-icon'

/** Width assumed for a column without a saved width when the table total is computed (px). */
const AUTO_COLUMN_WIDTH = 160

const cellClass = (base: string, numeric: boolean): string => (numeric ? `${base} bases-table__cell--num` : base)

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
  /** Persist a column's new width in px (`undefined` = back to automatic). Absent = widths are not editable. */
  onColumnResize?: (column: string, width: number | undefined) => void
}

export const BasesTableView = memo(function BasesTableView({
  doc, view, rows, onOpenNote, onCommitCell, onSortChange, onColumnResize,
}: BasesTableViewProps) {
  // Width while a drag is in progress; committed (and written to the file) on release.
  const [liveWidth, setLiveWidth] = useState<{ column: string; width: number } | null>(null)
  const formulaKeys = useMemo(() => new Set(Object.keys(doc.formulas ?? {})), [doc.formulas])
  const columns = useMemo(() => view.order ?? Object.keys(doc.properties ?? {}), [view.order, doc.properties])

  const numericCols = useMemo(() => computeNumericColumns(doc, columns, rows), [doc, columns, rows])

  const sortByColumn = useMemo(() => {
    const map = new Map<string, 'asc' | 'desc'>()
    for (const s of view.sort ?? []) map.set(s.column, s.direction ?? 'asc')
    return map
  }, [view.sort])

  const headerLabel = useCallback(
    (col: string): string => columnLabel(doc, col),
    [doc],
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
  // Only the heights Obsidian writes get a class; anything else renders as the default (short).
  const rowHeightClass = view.rowHeight && ['medium', 'tall', 'extra'].includes(view.rowHeight) ? `bases-table-view--row-${view.rowHeight}` : ''
  const [collapsed, toggleGroup] = useCollapsedGroups()
  const groupPropertyLabel = headerLabel(view.groupBy?.property ?? '')
  const hasSummaries = Object.keys(summaries).length > 0

  // Column widths (`columnSize`). A drag shows its live width at once; the file write follows on release.
  // The live value is dropped as soon as the saved sizes change, so the file stays the source of truth.
  const [prevColumnSize, setPrevColumnSize] = useState(view.columnSize)
  if (prevColumnSize !== view.columnSize) {
    setPrevColumnSize(view.columnSize)
    setLiveWidth(null)
  }
  const widthOf = (col: string): number | undefined => (liveWidth?.column === col ? liveWidth.width : view.columnSize?.[col])
  const hasWidths = columns.some((c) => widthOf(c) !== undefined)
  const tableStyle: CSSProperties | undefined = hasWidths
    ? { tableLayout: 'fixed', width: columns.reduce((sum, c) => sum + (widthOf(c) ?? AUTO_COLUMN_WIDTH), 0), minWidth: '100%' }
    : undefined
  const clampWidth = (w: number): number => Math.min(COLUMN_WIDTH.max, Math.max(COLUMN_WIDTH.min, w))

  const startResize = (e: ReactPointerEvent<HTMLElement>, col: string) => {
    if (!onColumnResize || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const startWidth = e.currentTarget.closest('th')?.getBoundingClientRect().width ?? AUTO_COLUMN_WIDTH
    const startX = e.clientX
    let current = startWidth
    let moved = false
    const onMove = (ev: PointerEvent) => {
      moved = true
      current = clampWidth(startWidth + ev.clientX - startX)
      setLiveWidth({ column: col, width: current })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (moved) onColumnResize(col, Math.round(current))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const handleResizeKey = (e: ReactKeyboardEvent<HTMLElement>, col: string) => {
    if (!onColumnResize) return
    const step = e.shiftKey ? 50 : 10
    const delta = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0
    if (delta === 0) return
    e.preventDefault()
    const width = e.currentTarget.closest('th')?.getBoundingClientRect().width ?? AUTO_COLUMN_WIDTH
    onColumnResize(col, Math.round(clampWidth(width + delta)))
  }

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

          const formulaKey = formulaKeyOf(col, formulaKeys)
          if (formulaKey !== null) {
            const result = evaluateFormulaColumn(doc, row, formulaKey)
            return (
              <td key={col} className={cellClass('bases-table__cell bases-table__cell--formula', numericCols.has(col))}>
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
            <td key={col} className={cellClass('bases-table__cell', numericCols.has(col))}>
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
    <div className={rowHeightClass ? `bases-table-view ${rowHeightClass}` : 'bases-table-view'}>
      <table className={hasWidths ? 'bases-table data-table bases-table--sized' : 'bases-table data-table'} style={tableStyle}>
        {hasWidths && (
          <colgroup>
            {columns.map((col) => <col key={col} style={widthOf(col) !== undefined ? { width: widthOf(col) } : undefined} />)}
          </colgroup>
        )}
        <thead>
          <tr>
            {columns.map((col) => {
              const dir = sortByColumn.get(col)
              return (
                <th
                  key={col}
                  className={numericCols.has(col) ? 'bases-table__header bases-table__header--num' : 'bases-table__header'}
                  aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                >
                  <button
                    type="button"
                    className="bases-table__header-btn"
                    onClick={() => handleHeaderClick(col)}
                  >
                    <ColumnTypeIcon doc={doc} col={col} rows={rows} />
                    {headerLabel(col)}
                    {dir === 'asc' && <span aria-hidden="true"> ▲</span>}
                    {dir === 'desc' && <span aria-hidden="true"> ▼</span>}
                  </button>
                  {onColumnResize && (
                    <span
                      className="bases-table__resize"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Spaltenbreite ${headerLabel(col)}`}
                      aria-valuemin={COLUMN_WIDTH.min}
                      aria-valuemax={COLUMN_WIDTH.max}
                      aria-valuenow={widthOf(col)}
                      tabIndex={0}
                      title="Ziehen: Breite ändern, Doppelklick: automatisch"
                      onPointerDown={(e) => startResize(e, col)}
                      onKeyDown={(e) => handleResizeKey(e, col)}
                      onDoubleClick={() => onColumnResize(col, undefined)}
                    />
                  )}
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
                  <td key={col} className={cellClass('bases-table__cell bases-table__summary-cell', numericCols.has(col))}>
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
