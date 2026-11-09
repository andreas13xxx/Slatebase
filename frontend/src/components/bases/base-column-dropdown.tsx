/**
 * ColumnDropdown — a column picker with a per-option type icon AND the column's
 * technical id shown next to its plain-language label. A custom dropdown rather
 * than a native `<select>`, which can render neither. Shared by the Bases Sort /
 * Group panels (BasesToolbar) and the Filter editor (BasesFilterEditor), so the
 * three pickers look and behave identically.
 *
 * Kept in its own module (not a component file) so the component files stay
 * single-export for react-refresh, and so both consumers import one copy.
 */

import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import type { BaseDocument, BaseRow } from '@slatebase/shared-contracts'
import type { ColumnChoice } from './base-edit'
import { ColumnTypeIcon } from './base-column-icon'

/** A column choice's label plus its technical id in a muted font (unless equal). */
export function ColumnOptionText({ choice }: { choice: ColumnChoice }): ReactNode {
  return (
    <>
      <span className="bases-tb__col-label">{choice.label}</span>
      {choice.label !== choice.id && <span className="bases-tb__col-id">{choice.id}</span>}
    </>
  )
}

export interface ColumnDropdownProps {
  doc: BaseDocument
  rows: BaseRow[]
  columns: ColumnChoice[]
  value: string
  onChange: (id: string) => void
  label: string
  disabled: boolean
  /** When true, offer a "none" entry that emits ''. */
  allowEmpty?: boolean
  emptyLabel?: string
}

export function ColumnDropdown({
  doc, rows, columns, value, onChange, label, disabled, allowEmpty, emptyLabel,
}: ColumnDropdownProps): ReactNode {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = columns.find((c) => c.id === value)
  const selectedLabel = value === '' ? (emptyLabel ?? '—') : (selected?.label ?? value)

  return (
    <div className="bases-tb__col-dd" ref={rootRef}>
      <button
        type="button"
        className="bases-tb__select bases-tb__col-dd-btn"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {value !== '' && <ColumnTypeIcon doc={doc} col={value} rows={rows} />}
        <span className="bases-tb__col-dd-selected">{selectedLabel}</span>
      </button>
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="bases-tb__col-dd-list">
          {allowEmpty && (
            <li role="option" aria-selected={value === ''}>
              <button type="button" className="bases-tb__col-dd-opt" onClick={() => { onChange(''); setOpen(false) }}>
                {value === '' ? <Check size={13} aria-hidden="true" className="bases-tb__col-dd-check" /> : <span className="bases-tb__col-dd-check" aria-hidden="true" />}
                <span className="bases-tb__col-label">{emptyLabel ?? 'Keine'}</span>
              </button>
            </li>
          )}
          {/* An unknown current value (not in the list) stays selectable so it isn't silently dropped. */}
          {value !== '' && !selected && (
            <li role="option" aria-selected>
              <button type="button" className="bases-tb__col-dd-opt" onClick={() => setOpen(false)}>
                <Check size={13} aria-hidden="true" className="bases-tb__col-dd-check" />
                <ColumnTypeIcon doc={doc} col={value} rows={rows} />
                <span className="bases-tb__col-label">{value}</span>
              </button>
            </li>
          )}
          {columns.map((c) => (
            <li key={c.id} role="option" aria-selected={c.id === value}>
              <button type="button" className="bases-tb__col-dd-opt" onClick={() => { onChange(c.id); setOpen(false) }}>
                {c.id === value ? <Check size={13} aria-hidden="true" className="bases-tb__col-dd-check" /> : <span className="bases-tb__col-dd-check" aria-hidden="true" />}
                <ColumnTypeIcon doc={doc} col={c.id} rows={rows} />
                <ColumnOptionText choice={c} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
