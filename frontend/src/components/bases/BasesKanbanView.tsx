/**
 * BasesKanbanView — renders a base's rows as a Kanban board of cards.
 *
 * The `cards` view type (Obsidian 1.14) groups notes into columns by a chosen
 * property (`view.groupBy`). Each distinct value of that property becomes a
 * column; notes without a value fall into an "Ohne …" column. Columns are
 * collapsible (local UI state), each card links to its note and shows the
 * other configured columns as labelled chips.
 *
 * Cards can be dragged between columns when `onMoveCard` is supplied (write
 * access): dropping a card on another column writes the grouping property back
 * into that note's frontmatter (dropping on the "Ohne …" column clears it).
 * Without `onMoveCard` (read-only, or no grouping property) cards only open
 * their note. Editing other properties stays in the table view and the note.
 */

import { memo, useCallback, useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'

export interface BasesKanbanViewProps {
  doc: BaseDocument
  view: BaseView
  rows: BaseRow[]
  /** Open a note by its vault-relative path. */
  onOpenNote: (path: string) => void
  /**
   * Move a card to another column by writing the grouping property of the note
   * at `path` to `newValue` ('' clears it, for the ungrouped column). Omitted
   * when the view is read-only — cards are then not draggable.
   */
  onMoveCard?: (path: string, groupByProperty: string, newValue: string) => void
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
  doc, view, rows, onOpenNote, onMoveCard,
}: BasesKanbanViewProps) {
  // The grouping property name (the new `groupBy` is an object `{property, direction}`).
  const groupBy = view.groupBy?.property
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

  // ── Drag-between-columns ──────────────────────────────────────────────────
  // Draggable only when a move handler is wired (write access). We track the
  // dragged card's path + its source column, and the column currently hovered,
  // so we can show a drop target and skip a drop onto the source column.
  const draggable = !!onMoveCard && !!groupBy
  const [dragPath, setDragPath] = useState<string | null>(null)
  const [dragFromKey, setDragFromKey] = useState<string | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)

  const handleCardDragStart = useCallback(
    (e: DragEvent, path: string, columnKey: string) => {
      e.dataTransfer.effectAllowed = 'move'
      // A payload is required for Firefox to initiate the drag at all.
      e.dataTransfer.setData('text/plain', path)
      setDragPath(path)
      setDragFromKey(columnKey)
    },
    [],
  )

  const handleDragEnd = useCallback(() => {
    setDragPath(null)
    setDragFromKey(null)
    setDragOverKey(null)
  }, [])

  const handleColumnDragOver = useCallback(
    (e: DragEvent, columnKey: string) => {
      if (!draggable || dragPath === null) return
      e.preventDefault() // allow the drop
      e.dataTransfer.dropEffect = 'move'
      if (dragOverKey !== columnKey) setDragOverKey(columnKey)
    },
    [draggable, dragPath, dragOverKey],
  )

  const handleColumnDrop = useCallback(
    (e: DragEvent, columnKey: string) => {
      if (!draggable || dragPath === null || !groupBy) return
      e.preventDefault()
      const path = dragPath
      const from = dragFromKey
      handleDragEnd()
      if (columnKey === from) return // dropped back on its own column
      const newValue = columnKey === UNGROUPED ? '' : columnKey
      onMoveCard?.(path, groupBy, newValue)
    },
    [draggable, dragPath, dragFromKey, groupBy, onMoveCard, handleDragEnd],
  )

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
        const isDropTarget = draggable && dragOverKey === column.key && dragFromKey !== column.key
        return (
          <section
            key={column.key}
            className={isDropTarget ? 'bases-kanban__column bases-kanban__column--drop-target' : 'bases-kanban__column'}
            role="listitem"
            onDragOver={draggable ? (e) => handleColumnDragOver(e, column.key) : undefined}
            onDrop={draggable ? (e) => handleColumnDrop(e, column.key) : undefined}
            onDragLeave={draggable ? () => setDragOverKey((k) => (k === column.key ? null : k)) : undefined}
          >
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
                    className={
                      draggable && dragPath === row.path
                        ? 'bases-kanban__card bases-kanban__card--dragging'
                        : 'bases-kanban__card'
                    }
                    draggable={draggable}
                    onDragStart={draggable ? (e) => handleCardDragStart(e, row.path, column.key) : undefined}
                    onDragEnd={draggable ? handleDragEnd : undefined}
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
