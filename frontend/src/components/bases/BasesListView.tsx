/**
 * BasesListView — renders a base's rows as a flat list, one entry per note.
 *
 * The `list` view type (Obsidian) is the simplest built-in view: no grouping,
 * no columns grid — each note is one clickable row showing its file name as the
 * title and the view's configured properties as a compact labelled line beneath.
 * Formula columns are evaluated read-only (the table view owns formula sorting);
 * property editing stays in the table view and the note, exactly as the Kanban
 * (cards) view defers it. Whole-list summaries are shown as a header bar, the
 * same shape the Kanban view uses.
 *
 * Runs on the same query pipeline as the table — `BasesView` hands it the
 * already-fetched, already-sorted `rows`.
 */

import { memo, useCallback, useMemo } from 'react'
import type { BaseDocument, BaseRow, BaseView, ComputedSummaries } from '@slatebase/shared-contracts'
import { computeSummaries, formatFormulaValue, evaluateFormula, rowContext } from '@slatebase/shared-contracts'

export interface BasesListViewProps {
  doc: BaseDocument
  view: BaseView
  rows: BaseRow[]
  /** Open a note by its vault-relative path. */
  onOpenNote: (path: string) => void
}

/** First scalar value of a row property, as a display string ('' when absent). */
function firstValue(row: BaseRow, key: string): string {
  if (key === 'file.name') return row.fileName
  const v = row.values[key]
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ')
  if (v === undefined || v === null) return ''
  return String(v)
}

export const BasesListView = memo(function BasesListView({
  doc, view, rows, onOpenNote,
}: BasesListViewProps) {
  const formulaKeys = useMemo(() => new Set(Object.keys(doc.formulas ?? {})), [doc.formulas])

  // The columns shown under each entry: the view's configured columns minus the
  // file name (it is the entry title). Formula columns are kept but evaluated
  // read-only below.
  const detailColumns = useMemo(() => {
    const configured = view.order ?? Object.keys(doc.properties ?? {})
    return configured.filter((c) => c !== 'file.name')
  }, [view.order, doc.properties])

  const columnLabel = useCallback(
    (col: string): string => doc.properties?.[col]?.displayName ?? col,
    [doc.properties],
  )

  // Value for one detail column: a formula column is evaluated per row; any
  // other column reads the row's property value.
  const cellText = useCallback(
    (row: BaseRow, col: string): string => {
      if (formulaKeys.has(col)) {
        const src = doc.formulas?.[col] ?? ''
        const result = evaluateFormula(src, rowContext(row))
        return result.ok ? formatFormulaValue(result.value) : '#ERR'
      }
      return firstValue(row, col)
    },
    [formulaKeys, doc],
  )

  const summaries: ComputedSummaries = useMemo(
    () => computeSummaries(rows, view, doc),
    [rows, view, doc],
  )
  const summaryEntries = useMemo(
    () => Object.entries(summaries).map(([col, s]) => ({ col, ...s })),
    [summaries],
  )

  if (rows.length === 0) {
    return <p className="bases-list__empty">Keine Einträge</p>
  }

  return (
    <div className="bases-list-view">
      {summaryEntries.length > 0 && (
        <div className="bases-list__summary-bar" role="status">
          {summaryEntries.map((s) => (
            <span key={s.col} className="bases-list__summary">
              <span className="bases-list__summary-col">{columnLabel(s.col)}</span>
              <span className="bases-list__summary-label">{s.summary}</span>
              <span className="bases-list__summary-value">{formatFormulaValue(s.value)}</span>
            </span>
          ))}
        </div>
      )}
      <ul className="bases-list" role="list" aria-label="Listen-Ansicht">
        {rows.map((row) => (
          <li key={row.path} className="bases-list__item">
            <button
              type="button"
              className="bases-list__entry"
              onClick={() => onOpenNote(row.path)}
            >
              <span className="bases-list__title">{row.fileName}</span>
              {detailColumns.length > 0 && (
                <span className="bases-list__details">
                  {detailColumns.map((col) => {
                    const text = cellText(row, col)
                    if (!text) return null
                    return (
                      <span key={col} className="bases-list__chip">
                        <span className="bases-list__chip-key">{columnLabel(col)}</span>
                        <span className="bases-list__chip-val">{text}</span>
                      </span>
                    )
                  })}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
})
