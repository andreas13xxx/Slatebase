/**
 * BaseCell — one table cell in a Bases table view.
 *
 * - A formula column is read-only: it shows the evaluated value, no edit UI.
 * - A `file.*` pseudo-column (name/ctime/mtime) is read-only text.
 * - A property column is editable, reusing the Properties-editor typed controls
 *   (text/number/checkbox/date/list). An edit writes back through `onCommit`,
 *   which the table wires to a frontmatter save on the row's note.
 *
 * Type is inferred from the raw value (same spirit as the Properties editor):
 * a declared Property-Type registry refinement is a later addition.
 */

import { memo, useCallback } from 'react'
import {
  TextPropertyControl,
  NumberPropertyControl,
  DatePropertyControl,
  CheckboxPropertyControl,
  ListPropertyControl,
} from '../context-panel/property-controls'
import type { BaseCellType } from './base-cell-type'

export interface BaseCellProps {
  /** Raw values for this property (link-index stores every property as a string list). */
  values: string[]
  /** Inferred control type. */
  type: BaseCellType
  /** Whether this cell is read-only (formula or file.* column). */
  readOnly: boolean
  /** Commit a new value list for this property back to the note's frontmatter. */
  onCommit: (newValues: string[]) => void
}

export const BaseCell = memo(function BaseCell({ values, type, readOnly, onCommit }: BaseCellProps) {
  const first = values[0] ?? ''

  const commitScalar = useCallback((v: string) => onCommit(v === '' ? [] : [v]), [onCommit])
  const commitNumber = useCallback((v: number) => onCommit([String(v)]), [onCommit])
  const commitBool = useCallback((v: boolean) => onCommit([String(v)]), [onCommit])
  const commitDate = useCallback((v: string | null) => onCommit(v ? [v] : []), [onCommit])
  const commitList = useCallback((v: string[]) => onCommit(v), [onCommit])

  if (readOnly) {
    return <span className="base-cell base-cell--readonly" title={values.join(', ')}>{values.join(', ')}</span>
  }

  switch (type) {
    case 'number':
      return <div className="base-cell"><NumberPropertyControl value={first} onChange={commitNumber} /></div>
    case 'checkbox':
      return <div className="base-cell"><CheckboxPropertyControl value={first} onChange={commitBool} /></div>
    case 'date':
      return <div className="base-cell"><DatePropertyControl value={first} onChange={commitDate} /></div>
    case 'list':
      return <div className="base-cell"><ListPropertyControl value={values} onChange={commitList} /></div>
    default:
      return <div className="base-cell"><TextPropertyControl value={first} onChange={commitScalar} /></div>
  }
})
