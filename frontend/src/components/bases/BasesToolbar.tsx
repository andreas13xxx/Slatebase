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
import { ArrowUpDown, Rows3, Filter, Columns3, Table2, Plus, Search, X } from 'lucide-react'
import type { BaseDocument, BaseFilterNode, BaseRow, BaseSortClause } from '@slatebase/shared-contracts'
import { ColumnTypeIcon } from './base-column-icon'
import { ColumnDropdown, ColumnOptionText } from './base-column-dropdown'
import {
  addFormula, addView, availableColumns, deleteView, duplicateView, effectiveColumns, isValidFormulaName,
  removeFormula, renameView, rootGroup,
  setDocFilter, setGroupBy, setOrder, setSort, setViewFilter, setViewType, VIEW_TYPES, VIEW_TYPE_LABELS,
  type ColumnChoice,
} from './base-edit'
import { BasesFilterEditor, CommitInput } from './BasesFilterEditor'
import { moveFilterBetweenScopes } from './base-filter-tree'

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
  /**
   * Create a new note scoped to this base and open it (the `bases:add-item` path).
   * Absent / disabled when the base is read-only; the button then does not render.
   */
  onAddItem?: () => void
  /** Current quick-search text (filters the rendered rows client-side). */
  searchQuery: string
  /** Change the quick-search text. */
  onSearchQueryChange: (query: string) => void
}

// ─── Popover ────────────────────────────────────────────────────────────────

const Popover = memo(function Popover({
  label, title, badge, panelClassName, children,
}: { label: ReactNode; title: string; badge?: number; panelClassName?: string; children: ReactNode }) {
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
        <div id={panelId} role="dialog" aria-label={title} className={panelClassName ? `bases-tb__panel ${panelClassName}` : 'bases-tb__panel'}>
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
  /** Current rows — used only to infer a column's type icon. */
  rows: BaseRow[]
  disabled: boolean
  onChange: (update: DocUpdate) => void
}

const SortPanel = memo(function SortPanel({ doc, index, columns, rows, disabled, onChange }: PanelProps) {
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
          <ColumnDropdown doc={doc} rows={rows} columns={columns} value={s.column} label="Sortieren nach" disabled={disabled} onChange={(id) => update(i, { column: id })} />
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

const GroupPanel = memo(function GroupPanel({ doc, index, columns, rows, disabled, onChange }: PanelProps) {
  const groupBy = doc.views[index]?.groupBy
  return (
    <div className="bases-tb__section">
      <div className="bases-tb__row">
        <ColumnDropdown
          doc={doc}
          rows={rows}
          columns={columns}
          value={groupBy?.property ?? ''}
          label="Gruppieren nach"
          disabled={disabled}
          allowEmpty
          emptyLabel="Keine Gruppierung"
          onChange={(property) => onChange((d) => setGroupBy(d, index, property ? { property, direction: groupBy?.direction ?? 'ASC' } : undefined))}
        />
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
    </div>
  )
})

const PropertiesPanel = memo(function PropertiesPanel({ doc, index, columns, rows, disabled, onChange }: PanelProps) {
  const shown = effectiveColumns(doc, doc.views[index])
  const choiceOf = (id: string): ColumnChoice => columns.find((c) => c.id === id) ?? { id, label: id }
  const labelOf = (id: string) => choiceOf(id).label
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
              <ColumnTypeIcon doc={doc} col={id} rows={rows} />
              <ColumnOptionText choice={choiceOf(id)} />
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
                  <ColumnTypeIcon doc={doc} col={c.id} rows={rows} />
                  <ColumnOptionText choice={c} />
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
      <FormulaSection doc={doc} index={index} disabled={disabled} onChange={onChange} />
    </div>
  )
})

/** Add / list / remove the document's formula columns (inside the Properties panel). */
const FormulaSection = memo(function FormulaSection({ doc, index, disabled, onChange }: {
  doc: BaseDocument; index: number; disabled: boolean; onChange: (update: DocUpdate) => void
}) {
  const [name, setName] = useState('')
  const [expr, setExpr] = useState('')
  const formulas = Object.entries(doc.formulas ?? {})
  const nameOk = name.trim() === '' || isValidFormulaName(doc, name)
  const canAdd = name.trim() !== '' && expr.trim() !== '' && isValidFormulaName(doc, name)

  const add = () => {
    if (!canAdd) return
    onChange((d) => addFormula(d, index, name, expr))
    setName('')
    setExpr('')
  }

  return (
    <div className="bases-tb__section">
      <p className="bases-tb__hint">Formeln</p>
      {formulas.length === 0 && <p className="bases-tb__hint">Noch keine Formel.</p>}
      <ul className="bases-tb__list" aria-label="Formeln">
        {formulas.map(([key, expression]) => (
          <li key={key} className="bases-tb__row">
            <span className="bases-tb__formula-name">{key}</span>
            <code className="bases-tb__formula-expr" title={expression}>{expression}</code>
            {!disabled && (
              <button type="button" className="bases-tb__icon-btn" aria-label={`Formel ${key} entfernen`} onClick={() => onChange((d) => removeFormula(d, key))}>×</button>
            )}
          </li>
        ))}
      </ul>
      {!disabled && (
        <div className="bases-tb__formula-add">
          <input
            type="text"
            className={nameOk ? 'bases-tb__input' : 'bases-tb__input bases-tb__input--invalid'}
            aria-label="Name der Formel"
            placeholder="Name (z.B. tage_übrig)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="text"
            className="bases-tb__input bases-tb__input--grow"
            aria-label="Formelausdruck"
            placeholder='Ausdruck (z.B. (date(deadline) - today()).days)'
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          />
          <button type="button" className="bases-tb__btn bases-tb__btn--primary" disabled={!canAdd} onClick={add}>
            Hinzufügen
          </button>
        </div>
      )}
    </div>
  )
})

const FilterPanel = memo(function FilterPanel({ doc, index, columns, rows, disabled, onChange }: PanelProps) {
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
        doc={doc}
        rows={rows}
        columns={columns}
        disabled={disabled}
        scopeMove={{
          label: scope === 'view' ? 'Zu allen Ansichten verschieben' : 'Zu dieser Ansicht verschieben',
          onMove: (path) => onChange((d) => moveFilterBetweenScopes(d, index, scope === 'view' ? 'view' : 'all', path)),
        }}
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
    <Popover label={<><Table2 aria-hidden="true" className="bases-tb__btn-icon" />{active?.name ?? 'Ansicht'}</>} title="Ansichten">
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
  doc, rows, activeIndex, readOnly, mode, onSelectView, onChange, onAddItem, searchQuery, onSearchQueryChange,
}: BasesToolbarProps) {
  const view = doc.views[activeIndex]
  const columns = availableColumns(doc, rows, view)
  const handleChange = useCallback((update: DocUpdate) => { if (!readOnly) onChange(update) }, [readOnly, onChange])
  const panelProps: PanelProps = { doc, index: activeIndex, columns, rows, disabled: readOnly, onChange: handleChange }
  const filterCount = countConditions(view?.filters) + countConditions(doc.filters)

  // Quick search is open whenever it has text, or the user toggled it open.
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const showSearch = searchOpen || searchQuery !== ''
  const toggleSearch = useCallback(() => {
    setSearchOpen((v) => {
      const next = !v
      if (next) requestAnimationFrame(() => searchInputRef.current?.focus())
      else onSearchQueryChange('')
      return next
    })
  }, [onSearchQueryChange])

  return (
    <div className="bases-view__toolbar-wrap">
      <div className="bases-view__toolbar" role="toolbar" aria-label="Base-Werkzeugleiste">
        <div className="bases-tb__group-left">
          <ViewMenu doc={doc} activeIndex={activeIndex} disabled={readOnly} onSelectView={onSelectView} onChange={handleChange} />
          {mode === 'view' && !readOnly && onAddItem && (
            <button type="button" className="bases-tb__btn bases-tb__btn--primary" title="Neuen Eintrag anlegen" onClick={onAddItem}>
              <Plus aria-hidden="true" className="bases-tb__btn-icon" />
              Neuer Eintrag
            </button>
          )}
        </div>
        {mode === 'view' && view && (
          <div className="bases-tb__group-right">
            <button
              type="button"
              className={showSearch ? 'bases-tb__btn bases-tb__btn--active' : 'bases-tb__btn'}
              title="Suchen"
              aria-label="Suchen"
              aria-pressed={showSearch}
              onClick={toggleSearch}
            >
              <Search aria-hidden="true" className="bases-tb__btn-icon" />
              Suchen
            </button>
            <Popover label={<><ArrowUpDown aria-hidden="true" className="bases-tb__btn-icon" />Sortieren</>} title="Sortierung" badge={view.sort?.length ?? 0} panelClassName="bases-tb__panel--dropdown"><SortPanel {...panelProps} /></Popover>
            <Popover label={<><Rows3 aria-hidden="true" className="bases-tb__btn-icon" />Gruppieren</>} title="Gruppierung" badge={view.groupBy ? 1 : 0} panelClassName="bases-tb__panel--dropdown"><GroupPanel {...panelProps} /></Popover>
            <Popover label={<><Filter aria-hidden="true" className="bases-tb__btn-icon" />Filtern</>} title="Filter" badge={filterCount}><FilterPanel {...panelProps} /></Popover>
            <Popover label={<><Columns3 aria-hidden="true" className="bases-tb__btn-icon" />Eigenschaften</>} title="Eigenschaften"><PropertiesPanel {...panelProps} /></Popover>
          </div>
        )}
      </div>
      {mode === 'view' && view && showSearch && (
        <div className="bases-view__searchbar">
          <Search aria-hidden="true" className="bases-tb__btn-icon" />
          <input
            ref={searchInputRef}
            type="search"
            className="bases-tb__input bases-tb__input--grow"
            aria-label="In den Einträgen suchen"
            placeholder="In den Einträgen suchen…"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { onSearchQueryChange(''); setSearchOpen(false) } }}
          />
          <button
            type="button"
            className="bases-tb__icon-btn"
            aria-label="Suche schließen"
            title="Suche schließen"
            onClick={() => { onSearchQueryChange(''); setSearchOpen(false) }}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
})
