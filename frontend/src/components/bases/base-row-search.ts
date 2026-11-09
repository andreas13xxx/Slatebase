/**
 * Client-side quick-search for Bases rows: keeps the rows whose file name or any
 * displayed-column value contains the query (case-insensitive). Purely visual —
 * it narrows the already-fetched rows, it does not touch the backend query or
 * the `.base` filters. Kept pure (no React) so it is unit-testable.
 */

import type { BaseRow } from '@slatebase/shared-contracts'

/** One row's searchable text: its file name plus every scalar value it carries. */
function rowText(row: BaseRow): string {
  const parts: string[] = [row.fileName]
  for (const value of Object.values(row.values)) {
    if (Array.isArray(value)) for (const v of value) parts.push(String(v))
    else if (value !== undefined && value !== null) parts.push(String(value))
  }
  return parts.join('\n').toLowerCase()
}

/** Rows matching `query` (trimmed, case-insensitive substring); all rows when empty. */
export function filterRowsByText(rows: BaseRow[], query: string): BaseRow[] {
  const q = query.trim().toLowerCase()
  if (q === '') return rows
  return rows.filter((row) => rowText(row).includes(q))
}
