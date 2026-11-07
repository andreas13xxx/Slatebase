/**
 * BasesToolbar — the control bar above a base: view switcher/manager and the
 * Sort / Group / Filter / Properties popovers (Obsidian's Bases toolbar), plus
 * all in one row, each a dropdown. The view/source switch lives in the breadcrumb.
 *
 * Every edit is a pure `base-edit` operation producing a new `BaseDocument`,
 * handed to `onChange`, which serializes it back into the `.base` file.
 * With `readOnly` the panels still open but every control is disabled.
 */

import { memo, useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { BaseDocument, BaseFilterNode, BaseRow, BaseSortClause } from '@slatebase/shared-contracts'
import {
  addView, availableColumns, deleteView, duplicateView, effectiveColumns, renameView, rootGroup,
  setDocFilter, setGroupBy, setOrder, setSort, setViewFilter, setViewType, VIEW_TYPES, VIEW_TYPE_LABELS,
  type ColumnChoice,
} from './base-edit'
import { BasesFilterEditor, CommitInput } from './BasesFilterEditor'

export type BasesMode = 'view' | 'source'
export type DocUpdate = (doc: BaseDocument) => BaseDocument

export interface BasesToolbarProps {
  doc: BaseDocument
  rows: BaseRow[]
  activeIndex: number
  readOnly: boolean
  /** Owned by the host (the breadcrumb switches it); the panels only show in `view`. */
  mode: BasesMode
  onSelectView: (index: number) => void
  /**
   * Apply an edit to the LATEST document and persist it. Edits are functions, not
   * finished documents, so two quick changes (e.g. a filter value committed on blur,
   * then a click on "+ Bedingung") compose instead of the second overwriting the first.
   */
  onChange: (update: DocUpdate) => void
}

// ─── Popover ────────────────────────────────────────────────────────────────

const Popover = memo(function Popover({
  label, title, badge, children,
}: { label: ReactNode; title: string; badge?: number; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        // Blur first so a half-typed field commits before its panel unmounts.
        const active = document.activeElement
        if (active instanceof HTMLElement && rootRef.current.contains(active)) active.blur()
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="bases-tb__pop" ref={rootRef}>
      <button
        type="button"
        className={open || (badge ?? 0) > 0 ? 'bases-tb__btn bases-tb__btn--active' : 'bases-tb__btn'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        {(badge ?? 0) > 0 && <span className="bases-tb__badge">{badge}</span>}
        <span aria-hidden="true" className="bases-tb__caret">▾</span>
      </button>
      {open && (
        <div id={panelId} role="dialog" aria-label={title} className="bases-tb__panel">
          {children}
        </div>
      )}
    </div>
  )
})

// ─── Panels ─────────────────────────────────────────────────────────────────

interface PanelProps {
  doc: BaseDocument
  index: number
  columns: ColumnChoice[]
  disabled: boolean
  onChange: (update: DocUpdate) => void
}

function ColumnSelect({ columns, value, onChange, label, disabled }: {
  columns: ColumnChoice[]; value: string; onChange: (id: string) => void; label: string; disabled: boolean
}) {
  const known = columns.some((c) => c.id === value)
  return (
    <select className="bases-tb__select" aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {!known && value !== '' && <option value={value}>{value}</option>}
      {columns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
    </select>
  )
}

const SortPanel = memo(function SortPanel({ doc, index, columns, disabled, onChange }: PanelProps) {
  const sort: BaseSortClause[] = doc.views[index]?.sort ?? []
  const edit = (fn: (current: BaseSortClause[]) => BaseSortClause[]) =>
    onChange((d) => setSort(d, index, fn(d.views[index]?.sort ?? [])))
  const update = (i: number, patch: Partial<BaseSortClause>) => edit((cur) => cur.map((s, k) => (k === i ? { ...s, ...patch } : s)))
  const move = (i: number, by: -1 | 1) => edit((cur) => {
    const next = [...cur]
    const [item] = next.splice(i, 1)
    if (item) next.splice(i + by, 0, item)
    return next
  })
  const unused = columns.find((c) => !sort.some((s) => s.column === c.id))

  return (
    <div className="bases-tb__section">
      {sort.length === 0 && <p className="bases-tb__hint">Keine Sortierung.</p>}
      {sort.map((s, i) => (
        <div key={`${s.column}-${i}`} className="bases-tb__row">
          <ColumnSelect columns={columns} value={s.column} label="Sortieren nach" disabled={disabled} onChange={(id) => update(i, { column: id })} />
          <select
            className="bases-tb__select"
            aria-label="Richtung"
            value={s.direction ?? 'asc'}
            disabled={disabled}
            onChange={(e) => update(i, { direction: e.target.value as 'asc' | 'desc' })}
          >
            <option value="asc">Aufsteigend</option>
            <option value="desc">Absteigend</option>
          </select>
          <button type="button" className="bases-tb__icon-btn" aria-label="Nach oben" disabled={disabled || i === 0} onClick={() => move(i, -1)}>↑</button>
          <button type="button" className="bases-tb__icon-btn" aria-label="Nach unten" disabled={disabled || i === sort.length - 1} onClick={() => move(i, 1)}>↓</button>
          <button type="button" className="bases-tb__icon-btn" aria-label="Sortierung entfernen" disabled={disabled} onClick={() => edit((cur) => cur.filter((_, k) => k !== i))}>×</button>
        </div>
      ))}
      {!disabled && unused && (
        <button type="button" className="bases-tb__link-btn" onClick={() => edit((cur) => [...cur, { column: unused.id, direction: 'asc' }])}>
          + Sortierung hinzufügen
        </button>
      )}
    </div>
  )
})

const GroupPanel = memo(function GroupPanel({ doc, index, columns, disabled, onChange }: PanelProps) {
  const groupBy = doc.views[index]?.groupBy
  return (
    <div className="bases-tb__section">
      <div className="bases-tb__row">
        <select
          className="bases-tb__select"
          aria-label="Gruppieren nach"
          value={groupBy?.property ?? ''}
          disabled={disabled}
          onChange={(e) => { const property = e.target.value; onChange((d) => setGroupBy(d, index, property ? { property, direction: groupBy?.direction ?? 'ASC' } : undefined)) }}
        >
          <option value="">Keine Gruppierung</option>
          {groupBy && !columns.some((c) => c.id === groupBy.property) && <option value={groupBy.property}>{groupBy.property}</option>}
          {columns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        {groupBy && (
          <select
            className="bases-tb__select"
            aria-label="Gruppenreihenfolge"
            value={groupBy.direction?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}
            disabled={disabled}
            onChange={(e) => { const direction = e.target.value; onChange((d) => setGroupBy(d, index, { property: groupBy.property, direction })) }}
          >
            <option value="ASC">Aufsteigend</option>
            <option value="DESC">Absteigend</option>
          </select>
        )}
      </div>
      <p className="bases-tb__hint">Gruppen zeigen Karten- und Kanban-Ansichten als Spalten.</p>
    </div>
  )
})

const PropertiesPanel = memo(function PropertiesPanel({ doc, index, columns, disabled, onChange }: PanelProps) {
  const shown = effectiveColumns(doc, doc.views[index])
  const labelOf = (id: string) => columns.find((c) => c.id === id)?.label ?? id
  const hidden = columns.filter((c) => !shown.includes(c.id))
  const edit = (fn: (current: string[]) => string[]) =>
    onChange((d) => setOrder(d, index, fn(effectiveColumns(d, d.views[index]))))
  const move = (i: number, by: -1 | 1) => edit((cur) => {
    const next = [...cur]
    const [item] = next.splice(i, 1)
    if (item !== undefined) next.splice(i + by, 0, item)
    return next
  })

  return (
    <div className="bases-tb__section">
      <ul className="bases-tb__list" aria-label="Angezeigte Eigenschaften">
        {shown.map((id, i) => (
          <li key={id} className="bases-tb__row">
            <label className="bases-tb__check">
              <input type="checkbox" checked disabled={disabled} onChange={() => edit((cur) => cur.filter((c) => c !== id))} />
              <span>{labelOf(id)}</span>
            </label>
            <button type="button" className="bases-tb__icon-btn" aria-label={`${labelOf(id)} nach oben`} disabled={disabled || i === 0} onClick={() => move(i, -1)}>↑</button>
            <button type="button" className="bases-tb__icon-btn" aria-label={`${labelOf(id)} nach unten`} disabled={disabled || i === shown.length - 1} onClick={() => move(i, 1)}>↓</button>
          </li>
        ))}
      </ul>
      {hidden.length > 0 && (
        <>
          <p className="bases-tb__hint">Ausgeblendet</p>
          <ul className="bases-tb__list" aria-label="Ausgeblendete Eigenschaften">
            {hidden.map((c) => (
              <li key={c.id} className="bases-tb__row">
                <label className="bases-tb__check">
                  <input type="checkbox" checked={false} disabled={disabled} onChange={() => edit((cur) => (cur.includes(c.id) ? cur : [...cur, c.id]))} />
                  <span>{c.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      {!disabled && (
        <CommitInput
          label="Eigene Eigenschaft hinzufügen"
          placeholder="Eigene Eigenschaft hinzufügen…"
          value=""
          onCommit={(name) => { const n = name.trim(); if (n) edit((cur) => (cur.includes(n) ? cur : [...cur, n])) }}
        />
      )}
    </div>
  )
})

const FilterPanel = memo(function FilterPanel({ doc, index, columns, disabled, onChange }: PanelProps) {
  const [scope, setScope] = useState<'view' | 'all'>('view')
  const view = doc.views[index]
  const node: BaseFilterNode | undefined = scope === 'view' ? view?.filters : doc.filters
  return (
    <div className="bases-tb__section">
      <div className="bases-tb__tabs" role="tablist" aria-label="Geltungsbereich">
        <button type="button" role="tab" aria-selected={scope === 'view'} className={scope === 'view' ? 'bases-tb__tab bases-tb__tab--active' : 'bases-tb__tab'} onClick={() => setScope('view')}>
          Diese Ansicht
        </button>
        <button type="button" role="tab" aria-selected={scope === 'all'} className={scope === 'all' ? 'bases-tb__tab bases-tb__tab--active' : 'bases-tb__tab'} onClick={() => setScope('all')}>
          Alle Ansichten
        </button>
      </div>
      <BasesFilterEditor
        root={rootGroup(node)}
        columns={columns}
        disabled={disabled}
        onChange={(update) => onChange((d) => (scope === 'view'
          ? setViewFilter(d, index, update(rootGroup(d.views[index]?.filters)))
          : setDocFilter(d, update(rootGroup(d.filters)))))}
      />
    </div>
  )
})

function countConditions(node: BaseFilterNode | undefined): number {
  if (node === undefined) return 0
  if (typeof node === 'string') return node === '' ? 0 : 1
  const kids = 'and' in node ? node.and : 'or' in node ? node.or : node.not
  return kids.reduce((n, k) => n + countConditions(k), 0)
}

// ─── View menu ──────────────────────────────────────────────────────────────

const ViewMenu = memo(function ViewMenu({ doc, activeIndex, disabled, onSelectView, onChange }: {
  doc: BaseDocument
  activeIndex: number
  disabled: boolean
  onSelectView: (index: number) => void
  onChange: (update: DocUpdate) => void
}) {
  const active = doc.views[activeIndex]
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<string>('table')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const typeOptions: string[] = [...VIEW_TYPES]
  if (active && !typeOptions.includes(active.type)) typeOptions.push(active.type)

  return (
    <Popover label={active?.name ?? 'Ansicht'} title="Ansichten">
      <div className="bases-tb__section">
        <ul className="bases-tb__list" aria-label="Ansichten">
          {doc.views.map((v, i) => (
            <li key={`${v.type}-${i}`}>
              <button
                type="button"
                className={i === activeIndex ? 'bases-tb__view-item bases-tb__view-item--active' : 'bases-tb__view-item'}
                aria-current={i === activeIndex ? 'true' : undefined}
                onClick={() => { setConfirmDelete(false); onSelectView(i) }}
              >
                <span>{v.name ?? v.type}</span>
                <span className="bases-tb__type">{VIEW_TYPE_LABELS[v.type] ?? v.type}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {active && (
        <div className="bases-tb__section">
          <p className="bases-tb__hint">Diese Ansicht konfigurieren</p>
          <div className="bases-tb__row">
            <CommitInput label="Name der Ansicht" value={active.name ?? ''} disabled={disabled} onCommit={(name) => onChange((d) => renameView(d, activeIndex, name))} />
          </div>
          <div className="bases-tb__row">
            <select className="bases-tb__select" aria-label="Typ der Ansicht" value={active.type} disabled={disabled} onChange={(e) => { const type = e.target.value; onChange((d) => setViewType(d, activeIndex, type)) }}>
              {typeOptions.map((t) => <option key={t} value={t}>{VIEW_TYPE_LABELS[t] ?? t}</option>)}
            </select>
          </div>
          {!disabled && (
            <div className="bases-tb__row">
              <button type="button" className="bases-tb__btn" onClick={() => { onChange((d) => duplicateView(d, activeIndex)); onSelectView(activeIndex + 1) }}>
                Duplizieren
              </button>
              {confirmDelete ? (
                <button
                  type="button"
                  className="bases-tb__btn bases-tb__btn--danger"
                  onClick={() => {
                    onChange((d) => deleteView(d, activeIndex))
                    onSelectView(Math.max(0, Math.min(activeIndex, doc.views.length - 2)))
                    setConfirmDelete(false)
                  }}
                >
                  Wirklich löschen
                </button>
              ) : (
                <button type="button" className="bases-tb__btn" disabled={doc.views.length <= 1} title={doc.views.length <= 1 ? 'Die letzte Ansicht kann nicht gelöscht werden' : undefined} onClick={() => setConfirmDelete(true)}>
                  Löschen
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {!disabled && (
        <div className="bases-tb__section">
          <p className="bases-tb__hint">Neue Ansicht</p>
          <div className="bases-tb__row">
            <input type="text" className="bases-tb__input" aria-label="Name der neuen Ansicht" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <select className="bases-tb__select" aria-label="Typ der neuen Ansicht" value={newType} onChange={(e) => setNewType(e.target.value)}>
              {VIEW_TYPES.map((t) => <option key={t} value={t}>{VIEW_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <button
            type="button"
            className="bases-tb__btn bases-tb__btn--primary"
            onClick={() => {
              const name = newName.trim() || VIEW_TYPE_LABELS[newType] || newType
              onChange((d) => addView(d, newType, name))
              onSelectView(doc.views.length)
              setNewName('')
            }}
          >
            Ansicht anlegen
          </button>
        </div>
      )}
    </Popover>
  )
})

// ─── Toolbar ────────────────────────────────────────────────────────────────

export const BasesToolbar = memo(function BasesToolbar({
  doc, rows, activeIndex, readOnly, mode, onSelectView, onChange,
}: BasesToolbarProps) {
  const view = doc.views[activeIndex]
  const columns = availableColumns(doc, rows, view)
  const handleChange = useCallback((update: DocUpdate) => { if (!readOnly) onChange(update) }, [readOnly, onChange])
  const panelProps: PanelProps = { doc, index: activeIndex, columns, disabled: readOnly, onChange: handleChange }
  const filterCount = countConditions(view?.filters) + countConditions(doc.filters)

  return (
    <div className="bases-view__toolbar" role="toolbar" aria-label="Base-Werkzeugleiste">
      <div className="bases-tb__group-left">
        <ViewMenu doc={doc} activeIndex={activeIndex} disabled={readOnly} onSelectView={onSelectView} onChange={handleChange} />
        {mode === 'view' && view && (
          <>
            <Popover label="Sortieren" title="Sortierung" badge={view.sort?.length ?? 0}><SortPanel {...panelProps} /></Popover>
            <Popover label="Gruppieren" title="Gruppierung" badge={view.groupBy ? 1 : 0}><GroupPanel {...panelProps} /></Popover>
            <Popover label="Filtern" title="Filter" badge={filterCount}><FilterPanel {...panelProps} /></Popover>
            <Popover label="Eigenschaften" title="Eigenschaften"><PropertiesPanel {...panelProps} /></Popover>
          </>
        )}
      </div>
    </div>
  )
})
