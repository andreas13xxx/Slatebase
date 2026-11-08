/**
 * Column-type icon for Bases headers and pickers, so a glance tells number from
 * date from formula. Kept in its own module (not a component file) so the
 * component files stay single-export for react-refresh.
 *
 * The type is inferred the same way a cell is edited: a formula column wins,
 * then a `file.*` field's known kind, then the declared/observed value shape.
 */

import type { ReactNode } from 'react'
import {
  Hash, Calendar, CheckSquare, List, Type, FunctionSquare, Link2, Tag, Clock, FileText,
} from 'lucide-react'
import type { BaseDocument, BaseRow } from '@slatebase/shared-contracts'
import { inferCellType } from './base-cell-type'

export type BaseColumnType =
  | 'formula' | 'number' | 'date' | 'checkbox' | 'list' | 'text'
  | 'tags' | 'link' | 'time' | 'file'

/** Known kinds of the `file.*` pseudo-columns. */
const FILE_COLUMN_TYPES: Record<string, BaseColumnType> = {
  'file.name': 'file',
  'file.path': 'file',
  'file.folder': 'file',
  'file.ext': 'text',
  'file.size': 'number',
  'file.ctime': 'time',
  'file.mtime': 'time',
  'file.tags': 'tags',
  'file.links': 'link',
  'file.backlinks': 'link',
  'file.embeds': 'link',
}

/** The type of a column id, from formula membership, file.* kind, or value shape. */
function columnType(doc: BaseDocument, col: string, rows: BaseRow[]): BaseColumnType {
  if (col.startsWith('formula.') || (doc.formulas && col in doc.formulas)) return 'formula'
  if (col in FILE_COLUMN_TYPES) return FILE_COLUMN_TYPES[col]!
  if (col === 'tags') return 'tags'

  // Observe the column's values across rows: list if any row has multiple, else
  // the inferred scalar type of the first non-empty value seen.
  let scalar: BaseColumnType = 'text'
  let sawValue = false
  for (const row of rows) {
    const raw = row.values[col]
    const values = Array.isArray(raw) ? raw.map(String) : raw === undefined || raw === null ? [] : [String(raw)]
    if (values.length > 1) return 'list'
    if (values.length === 0 || values[0] === '') continue
    if (!sawValue) {
      const t = inferCellType(values)
      scalar = t === 'number' ? 'number' : t === 'date' ? 'date' : t === 'checkbox' ? 'checkbox' : 'text'
      sawValue = true
    }
  }
  return scalar
}

const ICONS: Record<BaseColumnType, typeof Hash> = {
  formula: FunctionSquare,
  number: Hash,
  date: Calendar,
  time: Clock,
  checkbox: CheckSquare,
  list: List,
  tags: Tag,
  link: Link2,
  file: FileText,
  text: Type,
}

const LABELS: Record<BaseColumnType, string> = {
  formula: 'Formel',
  number: 'Zahl',
  date: 'Datum',
  time: 'Zeitpunkt',
  checkbox: 'Wahrheitswert',
  list: 'Liste',
  tags: 'Tags',
  link: 'Link',
  file: 'Datei',
  text: 'Text',
}

/** A small type icon for a column, labelled for screen readers. */
export function ColumnTypeIcon({ doc, col, rows }: { doc: BaseDocument; col: string; rows: BaseRow[] }): ReactNode {
  const type = columnType(doc, col, rows)
  const Icon = ICONS[type]
  return <Icon className="bases-col-type-icon" role="img" aria-label={LABELS[type]} />
}
