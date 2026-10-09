/**
 * BasesKanbanView — renders a base's rows as a Kanban board of cards.
 *
 * The `cards` view type (Obsidian 1.14) groups notes into columns by a chosen
 * property (`view.groupBy`). Each distinct value of that property becomes a
 * column; notes without a value fall into an "Ohne …" column. Columns are
 * collapsible (local UI state), each card links to its note and shows the
 * other configured columns as labelled chips.
 *
 * Read-only in this version: cards open their note but are not drag-reorderable
 * between columns (that would write the grouping property back into every moved
 * note — a later stage). Grouping/collapse is the leverage; editing stays in
 * the table view and the note itself.
 */

import { memo, useCallback, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { BaseDocument, BaseRow, BaseView } from '../../bases/types'

export interface BasesKanbanViewProps {
  doc: BaseDocument
  view: BaseView
  rows: BaseRow[]
  /** Open a note by its vault-relative path. */
  onOpenNote: (path: string) => void
}

/** Sentinel key for the "no value for the grouping property" column. */
const UNGROUPED = '\u0000ungrouped'

/** First scalar value of a row property, as a display string ('' when absent). */
function firstValue(row: BaseRow, key: string): string {
  if (key === 'file.name') return row.fileName
  const v = row.values[key]
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : ''
  if (v === undefined || v === null) return ''
  return String(v)
}

interface KanbanColumn {
  /** Grouping value, or the UNGROUPED sentinel. */
  key: string
  /** Column header text. */
  label: string
  rows: BaseRow[]
}

export const BasesKanbanView = memo(function BasesKanbanView({
  doc, view, rows, onOpenNote,
}: BasesKanbanViewProps) {
  const groupBy = view.groupBy
  // Chip columns: the view's configured columns minus the grouping property
  // itself (redundant on every card in a column) and the file name (it is the
  // card title). Formula columns are left out — the table view evaluates those.
  const formulaKeys = useMemo(() => new Set(Object.keys(doc.formulas ?? {})), [doc.formulas])
  const chipColumns = useMemo(() => {
    const configured = view.order ?? Object.keys(doc.properties ?? {})
    return configured.filter((c) => c !== groupBy && c !== 'file.name' && !formulaKeys.has(c))
  }, [view.order, doc.properties, groupBy, formulaKeys])

  const columnLabel = useCallback(
    (col: string): string => doc.properties?.[col]?.displayName ?? col,
    [doc.properties],
  )

  const columns = useMemo<KanbanColumn[]>(() => {
    if (!groupBy) return []
    const byValue = new Map<string, BaseRow[]>()
    const order: string[] = []
    for (const row of rows) {
      const raw = firstValue(row, groupBy)
      const key = raw === '' ? UNGROUPED : raw
      if (!byValue.has(key)) { byValue.set(key, []); order.push(key) }
      byValue.get(key)!.push(row)
    }
    // Named columns alphabetically, the "ungrouped" column always last.
    order.sort((a, b) => {
      if (a === UNGROUPED) return 1
      if (b === UNGROUPED) return -1
      return a.localeCompare(b)
    })
    return order.map((key) => ({
      key,
      label: key === UNGROUPED ? `Ohne ${columnLabel(groupBy)}` : key,
      rows: byValue.get(key)!,
    }))
  }, [groupBy, rows, columnLabel])

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  if (!groupBy) {
    return (
      <div className="bases-kanban bases-kanban--error" role="alert">
        Diese Karten-Ansicht hat kein <code>groupBy</code>-Feld. Füge im Quelltext
        {' '}<code>groupBy: &lt;Eigenschaft&gt;</code> zur Ansicht hinzu.
      </div>
    )
  }

  if (rows.length === 0) {
    return <p className="bases-kanban__empty">Keine Einträge</p>
  }

  return (
    <div className="bases-kanban" role="list" aria-label="Karten-Ansicht">
      {columns.map((column) => {
        const isCollapsed = collapsed[column.key] ?? false
        return (
          <section key={column.key} className="bases-kanban__column" role="listitem">
            <button
              type="button"
              className="bases-kanban__column-header"
              aria-expanded={!isCollapsed}
              onClick={() => toggle(column.key)}
            >
              {isCollapsed
                ? <ChevronRight size={14} aria-hidden="true" />
                : <ChevronDown size={14} aria-hidden="true" />}
              <span className="bases-kanban__column-title">{column.label}</span>
              <span className="bases-kanban__column-count">{column.rows.length}</span>
            </button>
            {!isCollapsed && (
              <div className="bases-kanban__cards">
                {column.rows.map((row) => (
                  <button
                    key={row.path}
                    type="button"
                    className="bases-kanban__card"
                    onClick={() => onOpenNote(row.path)}
                  >
                    <span className="bases-kanban__card-title">{row.fileName}</span>
                    {chipColumns.map((col) => {
                      const text = firstValue(row, col)
                      if (!text) return null
                      return (
                        <span key={col} className="bases-kanban__chip">
                          <span className="bases-kanban__chip-key">{columnLabel(col)}</span>
                          <span className="bases-kanban__chip-val">{text}</span>
                        </span>
                      )
                    })}
                  </button>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
})
