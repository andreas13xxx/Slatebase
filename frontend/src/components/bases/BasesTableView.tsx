/**
 * BasesTableView — renders a base's rows as a sortable table.
 *
 * One row per note, one column per configured property/formula, the first
 * column linking to the note. Property cells are editable (BaseCell); formula
 * columns are evaluated client-side and read-only. Clicking a header sorts by
 * that column alone; Shift-clicking extends the existing multi-column sort
 * instead of replacing it. Either way the result is reported upward (the
 * container writes it back into the `.base` file). With `view.groupBy` the
 * rows are split into collapsible groups (ordered/hidden by `view.groupOrder`).
 */

import { useTranslation } from '../../i18n'
import { Fragment, memo, useCallback, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { BaseDocument, BaseRow, BaseView, BaseSortClause } from '@slatebase/shared-contracts'
import { evaluateFormulaColumn, formatFormulaValue, computeSummaries } from '@slatebase/shared-contracts'
import type { ComputedSummaries } from '@slatebase/shared-contracts'
import { BaseCell } from './BaseCell'
import { BaseFormulaValue } from './BaseFormulaValue'
import { inferCellType } from './base-cell-type'
import { groupRows, groupLabel, useCollapsedGroups } from './base-groups'
import { computeNumericColumns, formulaKeyOf } from './base-numeric-columns'
import { COLUMN_WIDTH, clampTo, columnEntry, columnLabel } from './base-edit'
import { ColumnTypeIcon } from './base-column-icon'

const cellClass = (base: string, numeric: boolean, sized: boolean): string =>
  `${base}${numeric ? ' bases-table__cell--num' : ''}${sized ? ' bases-table__cell--sized' : ''}`

/** Drag payload type for reordering columns (a custom type, so the file drop zone ignores it). */
const COLUMN_DRAG_TYPE = 'application/x-slatebase-bases-column'

/** Width a column starts from when the keyboard resizes it and its real width cannot be measured. */
const FALLBACK_COLUMN_WIDTH = 160

export interface BasesTableViewProps {
  doc: BaseDocument
  view: BaseView
  rows: BaseRow[]
  /** Vault of the rows, so an `image(...)` formula value can load a vault file. */
  vaultId?: string
  /** The row `this` stands for in formulas (the host note), if any. */
  thisRow?: BaseRow | undefined
  /** Open a note by its vault-relative path. */
  onOpenNote: (path: string) => void
  /** Commit new values for one property on one note. */
  onCommitCell: (path: string, property: string, values: string[]) => void
  /** Toggle sort on a column; the container persists it. */
  onSortChange: (sort: BaseSortClause[]) => void
  /** Set a column's width in px (`undefined` resets it). Without it the columns cannot be resized. */
  onColumnResize?: (column: string, width: number | undefined) => void
  /** Move the column at index `from` to index `to`. Without it the columns cannot be dragged. */
  onReorderColumns?: (from: number, to: number) => void
}

export const BasesTableView = memo(function BasesTableView({
  doc, view, rows, vaultId, thisRow, onOpenNote, onCommitCell, onSortChange, onColumnResize, onReorderColumns,
}: BasesTableViewProps) {
  const { t } = useTranslation()
  const formulaKeys = useMemo(() => new Set(Object.keys(doc.formulas ?? {})), [doc.formulas])
  const columns = useMemo(() => view.order ?? Object.keys(doc.properties ?? {}), [view.order, doc.properties])

  const numericCols = useMemo(() => computeNumericColumns(doc, columns, rows, thisRow), [doc, columns, rows, thisRow])

  const sortByColumn = useMemo(() => {
    const map = new Map<string, 'asc' | 'desc'>()
    for (const s of view.sort ?? []) map.set(s.column, s.direction ?? 'asc')
    return map
  }, [view.sort])

  const headerLabel = useCallback(
    (col: string): string => columnLabel(doc, col),
    [doc],
  )

  // A plain click sorts by that column alone (replaces any existing multi-sort — the
  // common single-click convention). Shift-click EXTENDS the current multi-sort instead:
  // toggling the clicked column's direction in place if it is already a sort key, else
  // appending it ascending, so a carefully built multi-column sort is never lost by accident.
  const handleHeaderClick = useCallback((col: string, additive: boolean) => {
    if (!additive) {
      const current = sortByColumn.get(col)
      const next: BaseSortClause = { column: col, direction: current === 'asc' ? 'desc' : 'asc' }
      onSortChange([next])
      return
    }
    const existing = view.sort ?? []
    const idx = existing.findIndex((s) => s.column === col)
    if (idx === -1) {
      onSortChange([...existing, { column: col, direction: 'asc' }])
      return
    }
    const nextDirection: BaseSortClause['direction'] = (existing[idx]!.direction ?? 'asc') === 'asc' ? 'desc' : 'asc'
    onSortChange(existing.map((s, i) => (i === idx ? { ...s, direction: nextDirection } : s)))
  }, [sortByColumn, onSortChange, view.sort])

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

  // ── Column widths ──────────────────────────────────────────────────────────
  // While a handle is dragged the width lives here; it is written to the file once, on release.
  const [liveWidth, setLiveWidth] = useState<{ column: string; width: number } | null>(null)
  const resizeRef = useRef<{ column: string; startX: number; startWidth: number } | null>(null)

  const widthOf = (col: string): number | undefined =>
    liveWidth?.column === col ? liveWidth.width : columnEntry(view.columnSize, col)
  const sizeStyle = (col: string): CSSProperties | undefined => {
    const width = widthOf(col)
    return width === undefined ? undefined : ({ '--bases-col-width': `${width}px` } as CSSProperties)
  }
  const clampWidth = (width: number): number => Math.round(clampTo(width, COLUMN_WIDTH.min, COLUMN_WIDTH.max) ?? COLUMN_WIDTH.min)

  const handleResizeStart = (e: ReactPointerEvent<HTMLSpanElement>, col: string) => {
    if (!onColumnResize || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const header = e.currentTarget.closest('th')
    const startWidth = widthOf(col) ?? (header?.getBoundingClientRect().width || FALLBACK_COLUMN_WIDTH)
    resizeRef.current = { column: col, startX: e.clientX, startWidth }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const handleResizeMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = resizeRef.current
    if (!drag) return
    setLiveWidth({ column: drag.column, width: clampWidth(drag.startWidth + e.clientX - drag.startX) })
  }
  const handleResizeEnd = (e: ReactPointerEvent<HTMLSpanElement>, commit: boolean) => {
    const drag = resizeRef.current
    if (!drag) return
    resizeRef.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    const width = clampWidth(drag.startWidth + e.clientX - drag.startX)
    setLiveWidth(null)
    if (commit && width !== Math.round(drag.startWidth)) onColumnResize?.(drag.column, width)
  }
  const handleResizeKey = (e: ReactKeyboardEvent<HTMLSpanElement>, col: string) => {
    if (!onColumnResize) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const header = e.currentTarget.closest('th')
      const current = widthOf(col) ?? (header?.getBoundingClientRect().width || FALLBACK_COLUMN_WIDTH)
      onColumnResize(col, clampWidth(current + (e.key === 'ArrowRight' ? COLUMN_WIDTH.step : -COLUMN_WIDTH.step)))
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      onColumnResize(col, undefined)
    }
  }

  // ── Column order (drag a header onto another) ─────────────────────────────
  const [dragColumn, setDragColumn] = useState<number | null>(null)
  const [dropColumn, setDropColumn] = useState<number | null>(null)
  const endColumnDrag = () => { setDragColumn(null); setDropColumn(null) }

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
              <td key={col} className={cellClass('bases-table__cell bases-table__cell--link', false, widthOf(col) !== undefined)} style={sizeStyle(col)}>
                <button type="button" className="bases-table__link" onClick={() => onOpenNote(row.path)}>
                  {linkText}
                </button>
              </td>
            )
          }

          const formulaKey = formulaKeyOf(col, formulaKeys)
          if (formulaKey !== null) {
            const result = evaluateFormulaColumn(doc, row, formulaKey, thisRow)
            return (
              <td key={col} className={cellClass('bases-table__cell bases-table__cell--formula', numericCols.has(col), widthOf(col) !== undefined)} style={sizeStyle(col)}>
                {result.ok
                  ? <BaseFormulaValue value={result.value} vaultId={vaultId} sourcePath={row.path} />
                  : <span className="bases-table__formula-error" title={result.error}>#ERR</span>}
              </td>
            )
          }

          if (col.startsWith('file.')) {
            const raw = row.values[col]
            const text = col === 'file.name'
              ? row.fileName
              : String((Array.isArray(raw) ? raw[0] : raw) ?? '')
            return <td key={col} className={cellClass('bases-table__cell', false, widthOf(col) !== undefined)} style={sizeStyle(col)}><span className="base-cell base-cell--readonly">{text}</span></td>
          }

          const raw = row.values[col]
          const strValues = Array.isArray(raw)
            ? raw.map((v) => String(v))
            : raw === undefined || raw === null
              ? []
              : [String(raw)]
          return (
            <td key={col} className={cellClass('bases-table__cell', numericCols.has(col), widthOf(col) !== undefined)} style={sizeStyle(col)}>
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
      <table className="bases-table data-table">
        <thead>
          <tr>
            {columns.map((col, colIndex) => {
              const dir = sortByColumn.get(col)
              const width = widthOf(col)
              const canDrag = !!onReorderColumns && columns.length > 1
              const classes = ['bases-table__header']
              if (numericCols.has(col)) classes.push('bases-table__header--num')
              if (width !== undefined) classes.push('bases-table__header--sized')
              if (dragColumn !== null && dropColumn === colIndex && dragColumn !== colIndex) classes.push('bases-table__header--drop')
              return (
                <th
                  key={col}
                  className={classes.join(' ')}
                  style={sizeStyle(col)}
                  aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                  draggable={canDrag}
                  onDragStart={(e) => {
                    // A drag that starts on the resize handle resizes; it must not also move the column.
                    if (!canDrag || resizeRef.current) { e.preventDefault(); return }
                    e.dataTransfer.setData(COLUMN_DRAG_TYPE, String(colIndex))
                    e.dataTransfer.effectAllowed = 'move'
                    setDragColumn(colIndex)
                  }}
                  onDragOver={(e) => {
                    if (dragColumn === null || !e.dataTransfer.types.includes(COLUMN_DRAG_TYPE)) return
                    e.preventDefault()
                    setDropColumn(colIndex)
                  }}
                  onDrop={(e) => {
                    if (dragColumn === null) return
                    e.preventDefault()
                    if (dragColumn !== colIndex) onReorderColumns?.(dragColumn, colIndex)
                    endColumnDrag()
                  }}
                  onDragEnd={endColumnDrag}
                >
                  <button
                    type="button"
                    className="bases-table__header-btn"
                    title={t('basesUi.headerHint')}
                    onClick={(e) => handleHeaderClick(col, e.shiftKey)}
                    onKeyDown={(e) => {
                      // Keyboard path for the header drag: Alt+←/→ moves the column one place.
                      if (!canDrag || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
                      const to = colIndex + (e.key === 'ArrowRight' ? 1 : -1)
                      if (to < 0 || to >= columns.length) return
                      e.preventDefault()
                      onReorderColumns?.(colIndex, to)
                    }}
                  >
                    <ColumnTypeIcon doc={doc} col={col} rows={rows} />
                    {headerLabel(col)}
                    {dir === 'asc' && <span aria-hidden="true"> ▲</span>}
                    {dir === 'desc' && <span aria-hidden="true"> ▼</span>}
                  </button>
                  {onColumnResize && (
                    <span
                      className="bases-table__resizer"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Breite der Spalte ${headerLabel(col)}`}
                      aria-valuenow={width ?? FALLBACK_COLUMN_WIDTH}
                      aria-valuemin={COLUMN_WIDTH.min}
                      aria-valuemax={COLUMN_WIDTH.max}
                      tabIndex={0}
                      title={t('basesUi.resizeHint')}
                      onPointerDown={(e) => handleResizeStart(e, col)}
                      onPointerMove={handleResizeMove}
                      onPointerUp={(e) => handleResizeEnd(e, true)}
                      onPointerCancel={(e) => handleResizeEnd(e, false)}
                      onDoubleClick={() => onColumnResize(col, undefined)}
                      onKeyDown={(e) => handleResizeKey(e, col)}
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
                  <td key={col} className={cellClass('bases-table__cell bases-table__summary-cell', numericCols.has(col), widthOf(col) !== undefined)} style={sizeStyle(col)}>
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
      {rows.length === 0 && <p className="bases-table-view__empty">{t('basesUi.noEntries')}</p>}
    </div>
  )
})
