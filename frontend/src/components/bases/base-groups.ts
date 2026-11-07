/**
 * Grouping of Bases rows for the table and list views.
 *
 * `view.groupBy.property` splits the rows into groups, `view.groupOrder`
 * (Obsidian 1.14.3) lists the groups to show and their order (`null` is the
 * group of notes without a value; an empty list hides every group). Without
 * `groupOrder` the groups are sorted by value, the "no value" group last, in
 * the view's `groupBy.direction`.
 */

import { useCallback, useState } from 'react'
import type { BaseRow, BaseView } from '@slatebase/shared-contracts'

/** Key of the group of notes without a value for the grouping property. */
export const UNGROUPED = '\u0000ungrouped'

export interface RowGroup {
  /** Grouping value, or `UNGROUPED`. */
  key: string
  rows: BaseRow[]
}

/** First scalar value of a row property as a display string ('' when absent). */
function groupValue(row: BaseRow, property: string): string {
  if (property === 'file.name') return row.fileName
  const v = row.values[property]
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : ''
  if (v === undefined || v === null) return ''
  return String(v)
}

/** Splits `rows` into groups per the view; `null` when the view has no `groupBy`. */
export function groupRows(rows: BaseRow[], view: BaseView): RowGroup[] | null {
  const property = view.groupBy?.property
  if (!property) return null
  const byKey = new Map<string, BaseRow[]>()
  for (const row of rows) {
    const raw = groupValue(row, property)
    const key = raw === '' ? UNGROUPED : raw
    const bucket = byKey.get(key)
    if (bucket) bucket.push(row)
    else byKey.set(key, [row])
  }
  if (view.groupOrder) {
    const wanted = view.groupOrder.map((g) => (g === null ? UNGROUPED : String(g)))
    return wanted
      .filter((key, i) => wanted.indexOf(key) === i)
      .map((key) => ({ key, rows: byKey.get(key) ?? [] }))
  }
  const sign = String(view.groupBy?.direction).toLowerCase() === 'desc' ? -1 : 1
  return [...byKey.keys()]
    .sort((a, b) => (a === UNGROUPED ? 1 : b === UNGROUPED ? -1 : sign * a.localeCompare(b)))
    .map((key) => ({ key, rows: byKey.get(key) ?? [] }))
}

/** Header text of a group. */
export function groupLabel(key: string, propertyLabel: string): string {
  return key === UNGROUPED ? `Ohne ${propertyLabel}` : key
}

/** Local (not persisted) collapsed state per group key. */
export function useCollapsedGroups(): [Record<string, boolean>, (key: string) => void] {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggle = useCallback((key: string) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] })), [])
  return [collapsed, toggle]
}
