/**
 * BasesToolbar — the control bar above a base: view switcher/manager and the
 * Sort / Group / Filter / Properties popovers (Obsidian's Bases toolbar), plus
 * all in one row, each a dropdown. The view/source switch lives in the breadcrumb.
 *
 * Every edit is a pure `base-edit` operation producing a new `BaseDocument`,
 * handed to `onChange`, which serializes it back into the `.base` file.
 * With `readOnly` the panels still open but every control is disabled.
 */

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { ArrowUpDown, Rows3, SlidersHorizontal, Filter, Columns3, Table2, Plus, Search, X, ListFilter, Settings } from 'lucide-react'
import { rowValueKey } from '@slatebase/shared-contracts'
import type { BaseDocument, BaseFilterNode, BaseRow, BaseSortClause, BaseView } from '@slatebase/shared-contracts'
import { useTranslation, translateNow } from '../../i18n'
import { ColumnTypeIcon } from './base-column-icon'
import { BasesViewOptionsDialog } from './BasesViewOptionsDialog'
import { ColumnDropdown, ColumnOptionText } from './base-column-dropdown'
import {
  addFormula, addView, availableColumns, columnEntry, columnLabel, deleteView, duplicateView, effectiveColumns, indexAfterMove, isValidFormulaName,
  moveView, removeFormula, renameView, rootGroup, setDisplayName, setLimit, setViewSummary, SUMMARY_GROUPS, SUMMARY_LABELS,
  CARD_RATIO, CARD_SIZE, setCardImageAspectRatio, setBoardSize, setCardImageFit, setCardImageProperty, setCardSize, resetColumnSizes,
  setDocFilter, setGroupBy, setGroupOrder, setListIndentProperties, setListMarkers, setListSeparator, setOrder, setRowHeight, setSort, setViewFilter, setViewType, VIEW_TYPES, VIEW_TYPE_LABELS,
  type ColumnChoice,
} from './base-edit'
import {
  getBasesViewRegistration, listBasesViewRegistrations,
  subscribeBasesViewRegistry, getBasesViewRegistryVersion,
} from '../../plugins/compat/bases-view-registry'
import { BasesFilterEditor, CommitInput } from './BasesFilterEditor'
import { moveFilterBetweenScopes } from './base-filter-tree'
import { groupLabel, groupRows, UNGROUPED } from './base-groups'

/**
 * Display label for a view type: the built-in localised label, else the name a
 * plugin gave when it registered the type via `registerBasesView` (e.g. the
 * Maps plugin's "Map"), else the raw technical type as a last resort.
 */
function viewTypeLabel(type: string): string {
  return (type in VIEW_TYPE_LABELS ? translateNow(`basesToolbar.type_${type}` as 'basesToolbar.type_table') : undefined) ?? getBasesViewRegistration(type)?.name ?? type
}

/** Localised name of a built-in summary function (the file keeps Obsidian's English names). */
function summaryName(name: string): string {
  return name in SUMMARY_LABELS ? translateNow(`basesToolbar.sum_${name}` as 'basesToolbar.sum_Sum') : name
}

/** Localised heading of a summary group. */
function groupName(label: string): string {
  return label in SUMMARY_GROUP_KEYS ? translateNow(`basesToolbar.sumgroup_${label}` as 'basesToolbar.sumgroup_Alle') : label
}
const SUMMARY_GROUP_KEYS: Record<string, true> = { Alle: true, Zahlen: true, Datum: true, Kontrollkästchen: true }

/** Drag payload type for reordering views (a custom type, so the file drop zone ignores it). */
const VIEW_DRAG_TYPE = 'application/x-slatebase-bases-view'

export type BasesMode = 'view' | 'source'
export type DocUpdate = (doc: BaseDocument) => BaseDocument

export interface BasesToolbarProps {
  doc: BaseDocument
  rows: BaseRow[]
  /**
   * Every frontmatter property key across the base's matched notes (from the
   * query result). Offered as pickable columns so the toolbar lists the base's
   * own properties — Obsidian's behaviour — not only the requested columns.
   */
  observedProperties?: string[]
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
  /** Copy the shown table to the clipboard (offered in the Results panel of a table view). */
  onCopyTable?: () => void
  /** Download the shown table as CSV (offered in the Results panel of a table view). */
  onExportCsv?: () => void
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
      const t = e.target as Node
      if (rootRef.current && !rootRef.current.contains(t)) {
        // A column dropdown's list is portalled to the body (outside rootRef);
        // a click inside it must not close the panel.
        if (t instanceof Element && t.closest('.bases-tb__col-dd-list')) return
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
  /** Current rows — used only to infer a column's type icon. */
  rows: BaseRow[]
  disabled: boolean
  onChange: (update: DocUpdate) => void
}

const SortPanel = memo(function SortPanel({ doc, index, columns, rows, disabled, onChange }: PanelProps) {
  const { t } = useTranslation()
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
      {sort.length === 0 && <p className="bases-tb__hint">{t('basesToolbar.noSort')}</p>}
      {sort.map((s, i) => (
        <div key={`${s.column}-${i}`} className="bases-tb__row">
          <ColumnDropdown doc={doc} rows={rows} columns={columns} value={s.column} label={t('basesToolbar.sortBy')} disabled={disabled} onChange={(id) => update(i, { column: id })} />
          <select
            className="bases-tb__select"
            aria-label={t('basesToolbar.direction')}
            value={s.direction ?? 'asc'}
            disabled={disabled}
            onChange={(e) => update(i, { direction: e.target.value as 'asc' | 'desc' })}
          >
            <option value="asc">{t('basesToolbar.asc')}</option>
            <option value="desc">{t('basesToolbar.desc')}</option>
          </select>
          <button type="button" className="bases-tb__icon-btn" aria-label={t('basesToolbar.moveUp')} disabled={disabled || i === 0} onClick={() => move(i, -1)}>↑</button>
          <button type="button" className="bases-tb__icon-btn" aria-label={t('basesToolbar.moveDown')} disabled={disabled || i === sort.length - 1} onClick={() => move(i, 1)}>↓</button>
          <button type="button" className="bases-tb__icon-btn" aria-label={t('basesToolbar.removeSort')} disabled={disabled} onClick={() => edit((cur) => cur.filter((_, k) => k !== i))}>×</button>
        </div>
      ))}
      {!disabled && unused && (
        <button type="button" className="bases-tb__link-btn" onClick={() => edit((cur) => [...cur, { column: unused.id, direction: 'asc' }])}>
          {t('basesToolbar.addSort')}
        </button>
      )}
    </div>
  )
})

/** Display options that exist for one view type only: row height (table) and marker/indent/separator (list). */
const DisplayPanel = memo(function DisplayPanel({ doc, index, columns, rows, disabled, onChange }: PanelProps) {
  const { t } = useTranslation()
  const view = doc.views[index]
  if (!view) return null
  if (view.type === 'cards' || view.type === 'kanban') {
    const numberOr = (text: string): number | undefined => {
      const n = Number(text.replace(',', '.'))
      return text.trim() !== '' && Number.isFinite(n) ? n : undefined
    }
    // Kanban and grouped cards are board layouts: cardSize is the column (Kanban) or card width there.
    const board = view.type === 'kanban' || !!view.groupBy
    const sizeLabel = view.type === 'kanban' ? t('basesToolbar.columnWidth') : t('basesToolbar.cardWidth')
    return (
      <div className="bases-tb__section">
        {board ? (
          <div className="bases-tb__row">
            <span>{sizeLabel}</span>
            <CommitInput
              value={view.cardSize !== undefined ? String(view.cardSize) : ''}
              label={sizeLabel}
              placeholder={t('basesToolbar.automatic')}
              disabled={disabled}
              onCommit={(text) => {
                if (text.trim() === '') { onChange((d) => setBoardSize(d, index, undefined)); return }
                const n = numberOr(text)
                if (n !== undefined) onChange((d) => setBoardSize(d, index, n))
              }}
            />
            <span className="bases-tb__hint">{CARD_SIZE.min}–{CARD_SIZE.max}</span>
          </div>
        ) : (
          <div className="bases-tb__row">
            <span>{t('basesToolbar.cardSize')}</span>
            <CommitInput
              value={String(view.cardSize ?? CARD_SIZE.default)}
              label={t('basesToolbar.cardSize')}
              disabled={disabled}
              onCommit={(text) => { const n = numberOr(text); if (n !== undefined) onChange((d) => setCardSize(d, index, n)) }}
            />
            <span className="bases-tb__hint">{CARD_SIZE.min}–{CARD_SIZE.max}</span>
          </div>
        )}
        <div className="bases-tb__row">
          <span>{t('basesToolbar.imageProperty')}</span>
          <ColumnDropdown
            doc={doc}
            rows={rows}
            columns={columns}
            value={view.image ?? ''}
            label={t('basesToolbar.imageProperty')}
            disabled={disabled}
            allowEmpty
            emptyLabel={t('basesToolbar.none')}
            onChange={(id) => onChange((d) => setCardImageProperty(d, index, id))}
          />
        </div>
        <label className="bases-tb__row">
          <span>{t('basesToolbar.imageFit')}</span>
          <select
            className="bases-tb__select"
            aria-label={t('basesToolbar.imageFit')}
            value={view.imageFit?.trim().startsWith('contain') ? 'contain' : 'cover'}
            disabled={disabled}
            onChange={(e) => { const fit = e.target.value === 'contain' ? 'contain' : 'cover'; onChange((d) => setCardImageFit(d, index, fit)) }}
          >
            <option value="cover">{t('basesToolbar.fitCover')}</option>
            <option value="contain">{t('basesToolbar.fitContain')}</option>
          </select>
        </label>
        <div className="bases-tb__row">
          <span>{t('basesToolbar.imageRatio')}</span>
          <CommitInput
            value={String(view.imageAspectRatio ?? CARD_RATIO.default)}
            label={t('basesToolbar.imageRatio')}
            disabled={disabled}
            onCommit={(text) => { const n = numberOr(text); if (n !== undefined) onChange((d) => setCardImageAspectRatio(d, index, n)) }}
          />
          <span className="bases-tb__hint">{CARD_RATIO.min}–{CARD_RATIO.max}</span>
        </div>
      </div>
    )
  }
  if (view.type === 'table') {
    return (
      <div className="bases-tb__section">
        <label className="bases-tb__row">
          <span>{t('basesToolbar.rowHeight')}</span>
          <select
            className="bases-tb__select"
            aria-label={t('basesToolbar.rowHeight')}
            value={view.rowHeight ?? ''}
            disabled={disabled}
            onChange={(e) => { const value = e.target.value || undefined; onChange((d) => setRowHeight(d, index, value)) }}
          >
            <option value="">{t('basesToolbar.rowShort')}</option>
            <option value="medium">{t('basesToolbar.rowMedium')}</option>
            <option value="tall">{t('basesToolbar.rowTall')}</option>
            <option value="extra">{t('basesToolbar.rowExtra')}</option>
            {view.rowHeight && !['medium', 'tall', 'extra'].includes(view.rowHeight) && <option value={view.rowHeight}>{view.rowHeight}</option>}
          </select>
        </label>
        <div className="bases-tb__row">
          <span>{t('basesToolbar.columnWidths')}</span>
          <button
            type="button"
            className="bases-tb__link-btn"
            disabled={disabled || !view.columnSize}
            onClick={() => onChange((d) => resetColumnSizes(d, index))}
          >
            {t('basesToolbar.reset')}
          </button>
          <span className="bases-tb__hint">{t('basesToolbar.dragColumnEdge')}</span>
        </div>
      </div>
    )
  }
  return (
    <div className="bases-tb__section">
      <label className="bases-tb__row">
        <span>{t('basesToolbar.markers')}</span>
        <select
          className="bases-tb__select"
          aria-label={t('basesToolbar.markers')}
          value={view.markers ?? ''}
          disabled={disabled}
          onChange={(e) => { const value = e.target.value || undefined; onChange((d) => setListMarkers(d, index, value)) }}
        >
          <option value="">{t('basesToolbar.markersBullets')}</option>
          <option value="number">{t('basesToolbar.markersNumbers')}</option>
          <option value="none">{t('basesToolbar.none')}</option>
          {view.markers && !['number', 'none'].includes(view.markers) && <option value={view.markers}>{view.markers}</option>}
        </select>
      </label>
      <label className="bases-tb__row">
        <input
          type="checkbox"
          checked={view.indentProperties === true}
          disabled={disabled}
          onChange={(e) => { const checked = e.target.checked; onChange((d) => setListIndentProperties(d, index, checked)) }}
        />
        <span>{t('basesToolbar.indentProperties')}</span>
      </label>
      {view.indentProperties !== true && (
      <div className="bases-tb__row">
        <span>{t('basesToolbar.separator')}</span>
        <CommitInput
          value={view.separator ?? ''}
          label={t('basesToolbar.separator')}
          placeholder=","
          disabled={disabled}
          onCommit={(value) => onChange((d) => setListSeparator(d, index, value))}
        />
      </div>
      )}
    </div>
  )
})


const GroupPanel = memo(function GroupPanel({ doc, index, columns, rows, disabled, onChange }: PanelProps) {
  const { t } = useTranslation()
  const view = doc.views[index]
  const groupBy = view?.groupBy
  return (
    <div className="bases-tb__section">
      <div className="bases-tb__row">
        <ColumnDropdown
          doc={doc}
          rows={rows}
          columns={columns}
          value={groupBy?.property ?? ''}
          label={t('basesToolbar.groupBy')}
          disabled={disabled}
          allowEmpty
          emptyLabel={t('basesToolbar.noGrouping')}
          onChange={(property) => onChange((d) => setGroupBy(d, index, property ? { property, direction: groupBy?.direction ?? 'ASC' } : undefined))}
        />
        {groupBy && (
          <select
            className="bases-tb__select"
            aria-label={t('basesToolbar.groupOrder')}
            value={groupBy.direction?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}
            disabled={disabled}
            onChange={(e) => { const direction = e.target.value; onChange((d) => setGroupBy(d, index, { property: groupBy.property, direction })) }}
          >
            <option value="ASC">{t('basesToolbar.asc')}</option>
            <option value="DESC">{t('basesToolbar.desc')}</option>
          </select>
        )}
      </div>
      {view && groupBy && <GroupValuesSection doc={doc} index={index} view={view} rows={rows} disabled={disabled} onChange={onChange} />}
    </div>
  )
})

/** Show/hide, reorder and add the groups of the grouping property (`groupOrder`). */
const GroupValuesSection = memo(function GroupValuesSection({ doc, index, view, rows, disabled, onChange }: {
  doc: BaseDocument; index: number; view: BaseView; rows: BaseRow[]; disabled: boolean; onChange: (update: DocUpdate) => void
}) {
  const { t } = useTranslation()
  const property = view.groupBy?.property ?? ''
  const propertyLabel = columnLabel(doc, rowValueKey(property))
  const observed = useMemo(() => (groupRows(rows, { ...view, groupOrder: undefined })?.map((g) => g.key) ?? []), [rows, view])
  const listed = useMemo(() => (view.groupOrder ?? []).map((g) => (g === null ? UNGROUPED : String(g))), [view.groupOrder])
  const visible = view.groupOrder ? listed.filter((k, i) => listed.indexOf(k) === i) : observed
  const hidden = observed.filter((k) => !visible.includes(k))
  const write = (keys: string[]) => onChange((d) => setGroupOrder(d, index, keys.map((k) => (k === UNGROUPED ? null : k)), true))
  const move = (i: number, by: -1 | 1) => {
    const next = [...visible]
    const [item] = next.splice(i, 1)
    if (item !== undefined) next.splice(i + by, 0, item)
    write(next)
  }
  const count = (key: string) => observed.includes(key) ? (groupRows(rows, { ...view, groupOrder: undefined })?.find((g) => g.key === key)?.rows.length ?? 0) : 0

  return (
    <>
      <p className="bases-tb__hint">{t('basesToolbar.groups')}</p>
      <ul className="bases-tb__list" aria-label={t('basesToolbar.shownGroups')}>
        {visible.map((key, i) => (
          <li key={key} className="bases-tb__row">
            <label className="bases-tb__check">
              <input type="checkbox" checked disabled={disabled} onChange={() => write(visible.filter((k) => k !== key))} />
              <span className="bases-tb__col-label">{groupLabel(key, propertyLabel)}</span>
              <span className="bases-tb__col-id">{count(key)}</span>
            </label>
            <button type="button" className="bases-tb__icon-btn" aria-label={t('basesToolbar.groupUp', { label: groupLabel(key, propertyLabel) })} disabled={disabled || i === 0} onClick={() => move(i, -1)}>↑</button>
            <button type="button" className="bases-tb__icon-btn" aria-label={t('basesToolbar.groupDown', { label: groupLabel(key, propertyLabel) })} disabled={disabled || i === visible.length - 1} onClick={() => move(i, 1)}>↓</button>
          </li>
        ))}
      </ul>
      {hidden.length > 0 && (
        <>
          <p className="bases-tb__hint">{t('basesToolbar.hidden')}</p>
          <ul className="bases-tb__list" aria-label={t('basesToolbar.hiddenGroups')}>
            {hidden.map((key) => (
              <li key={key} className="bases-tb__row">
                <label className="bases-tb__check">
                  <input type="checkbox" checked={false} disabled={disabled} onChange={() => write([...visible, key])} />
                  <span className="bases-tb__col-label">{groupLabel(key, propertyLabel)}</span>
                  <span className="bases-tb__col-id">{count(key)}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      {!disabled && (
        <CommitInput
          label={t('basesToolbar.addGroup')}
          placeholder={t('basesToolbar.addGroupPh')}
          value=""
          onCommit={(name) => { const n = name.trim(); if (n && !visible.includes(n)) write([...visible, n]) }}
        />
      )}
    </>
  )
})

const PropertiesPanel = memo(function PropertiesPanel({ doc, index, columns, rows, disabled, onChange }: PanelProps) {
  const { t } = useTranslation()
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
  // One column at a time shows its options (header text, summary) under its row.
  const [openOptions, setOpenOptions] = useState<string | null>(null)
  const view = doc.views[index]
  const customSummaries = Object.keys(doc.summaries ?? {})

  return (
    <div className="bases-tb__section">
      <ul className="bases-tb__list" aria-label={t('basesToolbar.shownProperties')}>
        {shown.map((id, i) => {
          const summary = columnEntry(view?.summaries, id) ?? ''
          const known = customSummaries.includes(summary) || SUMMARY_GROUPS.some((g) => g.names.includes(summary))
          return (
            <li key={id} className="bases-tb__prop">
              <div className="bases-tb__row">
                <label className="bases-tb__check">
                  <input type="checkbox" checked disabled={disabled} onChange={() => edit((cur) => cur.filter((c) => c !== id))} />
                  <ColumnTypeIcon doc={doc} col={id} rows={rows} />
                  <ColumnOptionText choice={choiceOf(id)} />
                </label>
                <button
                  type="button"
                  className={openOptions === id || summary ? 'bases-tb__icon-btn bases-tb__icon-btn--active' : 'bases-tb__icon-btn'}
                  aria-label={t('basesToolbar.optionsFor', { label: labelOf(id) })}
                  aria-expanded={openOptions === id}
                  onClick={() => setOpenOptions((cur) => (cur === id ? null : id))}
                >
                  <SlidersHorizontal size={14} aria-hidden="true" />
                </button>
                <button type="button" className="bases-tb__icon-btn" aria-label={t('basesToolbar.groupUp', { label: labelOf(id) })} disabled={disabled || i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="bases-tb__icon-btn" aria-label={t('basesToolbar.groupDown', { label: labelOf(id) })} disabled={disabled || i === shown.length - 1} onClick={() => move(i, 1)}>↓</button>
              </div>
              {openOptions === id && (
                <div className="bases-tb__prop-options">
                  <div className="bases-tb__row">
                    <span>{t('basesToolbar.displayName')}</span>
                    <CommitInput
                      label={t('basesToolbar.displayNameFor', { label: labelOf(id) })}
                      placeholder={id}
                      value={columnEntry(doc.properties, id)?.displayName ?? ''}
                      disabled={disabled}
                      onCommit={(name) => onChange((d) => setDisplayName(d, id, name))}
                    />
                  </div>
                  <label className="bases-tb__row">
                    <span>{t('basesToolbar.summary')}</span>
                    <select
                      className="bases-tb__select"
                      aria-label={t('basesToolbar.summaryFor', { label: labelOf(id) })}
                      value={summary}
                      disabled={disabled}
                      onChange={(e) => { const name = e.target.value || undefined; onChange((d) => setViewSummary(d, index, id, name)) }}
                    >
                      <option value="">{t('basesToolbar.none')}</option>
                      {SUMMARY_GROUPS.map((g) => (
                        <optgroup key={g.label} label={groupName(g.label)}>
                          {g.names.map((n) => <option key={n} value={n}>{summaryName(n)}</option>)}
                        </optgroup>
                      ))}
                      {customSummaries.length > 0 && (
                        <optgroup label={t('basesToolbar.summaryCustom')}>
                          {customSummaries.map((n) => <option key={n} value={n}>{n}</option>)}
                        </optgroup>
                      )}
                      {summary && !known && <option value={summary}>{summary}</option>}
                    </select>
                  </label>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {hidden.length > 0 && (
        <>
          <p className="bases-tb__hint">{t('basesToolbar.hidden')}</p>
          <ul className="bases-tb__list" aria-label={t('basesToolbar.hiddenProperties')}>
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
          label={t('basesToolbar.addProperty')}
          placeholder={t('basesToolbar.addPropertyPh')}
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
  const { t } = useTranslation()
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
      <p className="bases-tb__hint">{t('basesToolbar.formulas')}</p>
      {formulas.length === 0 && <p className="bases-tb__hint">{t('basesToolbar.noFormula')}</p>}
      <ul className="bases-tb__list" aria-label={t('basesToolbar.formulas')}>
        {formulas.map(([key, expression]) => (
          <li key={key} className="bases-tb__row">
            <span className="bases-tb__formula-name">{key}</span>
            <code className="bases-tb__formula-expr" title={expression}>{expression}</code>
            {!disabled && (
              <button type="button" className="bases-tb__icon-btn" aria-label={t('basesToolbar.removeFormula', { name: key })} onClick={() => onChange((d) => removeFormula(d, key))}>×</button>
            )}
          </li>
        ))}
      </ul>
      {!disabled && (
        <div className="bases-tb__formula-add">
          <input
            type="text"
            className={nameOk ? 'bases-tb__input' : 'bases-tb__input bases-tb__input--invalid'}
            aria-label={t('basesToolbar.formulaName')}
            placeholder={t('basesToolbar.formulaNamePh')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="text"
            className="bases-tb__input bases-tb__input--grow"
            aria-label={t('basesToolbar.formulaExpr')}
            placeholder={t('basesToolbar.formulaExprPh')}
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          />
          <button type="button" className="bases-tb__btn bases-tb__btn--primary" disabled={!canAdd} onClick={add}>
            {t('basesToolbar.add')}
          </button>
        </div>
      )}
    </div>
  )
})

const FilterPanel = memo(function FilterPanel({ doc, index, columns, rows, disabled, onChange }: PanelProps) {
  const { t } = useTranslation()
  const [scope, setScope] = useState<'view' | 'all'>('view')
  const view = doc.views[index]
  const node: BaseFilterNode | undefined = scope === 'view' ? view?.filters : doc.filters
  return (
    <div className="bases-tb__section">
      <div className="bases-tb__tabs" role="tablist" aria-label={t('basesToolbar.scope')}>
        <button type="button" role="tab" aria-selected={scope === 'view'} className={scope === 'view' ? 'bases-tb__tab bases-tb__tab--active' : 'bases-tb__tab'} onClick={() => setScope('view')}>
          {t('basesToolbar.thisView')}
        </button>
        <button type="button" role="tab" aria-selected={scope === 'all'} className={scope === 'all' ? 'bases-tb__tab bases-tb__tab--active' : 'bases-tb__tab'} onClick={() => setScope('all')}>
          {t('basesToolbar.allViews')}
        </button>
      </div>
      <BasesFilterEditor
        root={rootGroup(node)}
        doc={doc}
        rows={rows}
        columns={columns}
        disabled={disabled}
        scopeMove={{
          label: scope === 'view' ? t('basesToolbar.moveToAll') : t('basesToolbar.moveToThis'),
          onMove: (path) => onChange((d) => moveFilterBetweenScopes(d, index, scope === 'view' ? 'view' : 'all', path)),
        }}
        onChange={(update) => onChange((d) => (scope === 'view'
          ? setViewFilter(d, index, update(rootGroup(d.views[index]?.filters)))
          : setDocFilter(d, update(rootGroup(d.filters)))))}
      />
    </div>
  )
})

/** Results: how many rows the view shows, plus copying and exporting what is shown. */
const ResultsPanel = memo(function ResultsPanel({ doc, index, disabled, onChange, onCopyTable, onExportCsv }: {
  doc: BaseDocument
  index: number
  disabled: boolean
  onChange: (update: DocUpdate) => void
  onCopyTable?: (() => void) | undefined
  onExportCsv?: (() => void) | undefined
}) {
  const { t } = useTranslation()
  const view = doc.views[index]
  if (!view) return null
  return (
    <div className="bases-tb__section">
      <div className="bases-tb__row">
        <span>Limit</span>
        <CommitInput
          value={view.limit !== undefined ? String(view.limit) : ''}
          label={t('basesToolbar.limitResults')}
          placeholder={t('basesToolbar.noLimit')}
          disabled={disabled}
          onCommit={(text) => {
            const n = Number(text.trim())
            const limit = text.trim() !== '' && Number.isFinite(n) && n >= 1 ? n : undefined
            onChange((d) => setLimit(d, index, limit))
          }}
        />
      </div>
      <p className="bases-tb__hint">{t('basesToolbar.limitHint')}</p>
      {(onCopyTable || onExportCsv) && (
        <div className="bases-tb__row">
          {onCopyTable && <button type="button" className="bases-tb__btn" onClick={onCopyTable}>{t('basesToolbar.copyTable')}</button>}
          {onExportCsv && <button type="button" className="bases-tb__btn" onClick={onExportCsv}>{t('basesToolbar.exportCsv')}</button>}
        </div>
      )}
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

/**
 * Every selectable view type: built-ins first, then each plugin-registered type.
 * The Bases view registry fills asynchronously as plugins (Maps, Base Graph, …)
 * load, so this subscribes to its version — otherwise a plugin-registered type
 * never appears in the "new view" / "change type" dropdowns until a `.base`
 * already holds a view of that type.
 */
function useViewTypeIds(): string[] {
  const registryVersion = useSyncExternalStore(subscribeBasesViewRegistry, getBasesViewRegistryVersion)
  return useMemo<string[]>(() => {
    void registryVersion
    const types: string[] = [...VIEW_TYPES]
    for (const { viewId } of listBasesViewRegistrations()) {
      if (!types.includes(viewId)) types.push(viewId)
    }
    return types
  }, [registryVersion])
}

const ViewMenu = memo(function ViewMenu({ doc, activeIndex, disabled, onSelectView, onChange, onConfigureView }: {
  doc: BaseDocument
  activeIndex: number
  disabled: boolean
  onSelectView: (index: number) => void
  onChange: (update: DocUpdate) => void
  onConfigureView: (index: number) => void
}) {
  const { t } = useTranslation()
  const active = doc.views[activeIndex]
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<string>('table')
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Reordering views: drag a row, or use its ↑/↓ buttons (the keyboard path).
  const canReorder = !disabled && doc.views.length > 1
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const endDrag = () => { setDragIndex(null); setDropIndex(null) }
  const moveViewTo = (from: number, to: number) => {
    if (from === to) return
    setConfirmDelete(false)
    onChange((d) => moveView(d, from, to))
    // The open view stays the open one, wherever it ends up.
    onSelectView(indexAfterMove(activeIndex, from, to))
  }
  // Built-in types first, then every plugin-registered type (deduplicated).
  const allTypeOptions = useViewTypeIds()
  // "Change type" dropdown: all options plus the active view's own type as a
  // fallback (so an unknown/uninstalled type still shows instead of jumping).
  const typeOptions: string[] = active && !allTypeOptions.includes(active.type)
    ? [...allTypeOptions, active.type]
    : allTypeOptions

  return (
    <Popover label={<><Table2 aria-hidden="true" className="bases-tb__btn-icon" />{active?.name ?? t('basesToolbar.viewFallback')}</>} title={t('basesToolbar.views')}>
      <div className="bases-tb__section">
        <ul className="bases-tb__list" aria-label={t('basesToolbar.views')}>
          {doc.views.map((v, i) => {
            const label = v.name ?? v.type
            return (
              <li
                key={`${v.type}-${i}`}
                className={dropIndex === i && dragIndex !== null && dragIndex !== i ? 'bases-tb__row bases-tb__row--drop' : 'bases-tb__row'}
                draggable={canReorder}
                onDragStart={(e) => {
                  if (!canReorder) return
                  e.dataTransfer.setData(VIEW_DRAG_TYPE, String(i))
                  e.dataTransfer.effectAllowed = 'move'
                  setDragIndex(i)
                }}
                onDragOver={(e) => {
                  if (dragIndex === null || !e.dataTransfer.types.includes(VIEW_DRAG_TYPE)) return
                  e.preventDefault()
                  setDropIndex(i)
                }}
                onDrop={(e) => {
                  if (dragIndex === null) return
                  e.preventDefault()
                  moveViewTo(dragIndex, i)
                  endDrag()
                }}
                onDragEnd={endDrag}
              >
                <button
                  type="button"
                  className={i === activeIndex ? 'bases-tb__view-item bases-tb__view-item--active' : 'bases-tb__view-item'}
                  aria-current={i === activeIndex ? 'true' : undefined}
                  onClick={() => { setConfirmDelete(false); onSelectView(i) }}
                >
                  <span>{label}</span>
                  <span className="bases-tb__type">{viewTypeLabel(v.type)}</span>
                </button>
                <button
                  type="button"
                  className="bases-tb__icon-btn"
                  aria-label={t('basesToolbar.configureViewNamed', { label })}
                  title={t('basesToolbar.configureViewNamed', { label })}
                  onClick={() => { setConfirmDelete(false); onSelectView(i); onConfigureView(i) }}
                >
                  <Settings aria-hidden="true" className="bases-tb__btn-icon" />
                </button>
                {canReorder && (
                  <>
                    <button type="button" className="bases-tb__icon-btn" aria-label={t('basesToolbar.groupUp', { label: label })} disabled={i === 0} onClick={() => moveViewTo(i, i - 1)}>↑</button>
                    <button type="button" className="bases-tb__icon-btn" aria-label={t('basesToolbar.groupDown', { label: label })} disabled={i === doc.views.length - 1} onClick={() => moveViewTo(i, i + 1)}>↓</button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      {active && (
        <div className="bases-tb__section">
          <p className="bases-tb__hint">{t('basesToolbar.configureView')}</p>
          <div className="bases-tb__row">
            <CommitInput label={t('basesToolbar.viewName')} value={active.name ?? ''} disabled={disabled} onCommit={(name) => onChange((d) => renameView(d, activeIndex, name))} />
          </div>
          <div className="bases-tb__row">
            <select className="bases-tb__select" aria-label={t('basesToolbar.viewType')} value={active.type} disabled={disabled} onChange={(e) => { const type = e.target.value; onChange((d) => setViewType(d, activeIndex, type)) }}>
              {typeOptions.map((ty) => <option key={ty} value={ty}>{viewTypeLabel(ty)}</option>)}
            </select>
          </div>
          {!disabled && (
            <div className="bases-tb__row">
              <button type="button" className="bases-tb__btn" onClick={() => { onChange((d) => duplicateView(d, activeIndex)); onSelectView(activeIndex + 1) }}>
                {t('basesToolbar.duplicate')}
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
                  {t('basesToolbar.reallyDelete')}
                </button>
              ) : (
                <button type="button" className="bases-tb__btn" disabled={doc.views.length <= 1} title={doc.views.length <= 1 ? t('basesToolbar.lastViewNoDelete') : undefined} onClick={() => setConfirmDelete(true)}>
                  {t('basesToolbar.delete')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {!disabled && (
        <div className="bases-tb__section">
          <p className="bases-tb__hint">{t('basesToolbar.newView')}</p>
          <div className="bases-tb__row">
            <input type="text" className="bases-tb__input" aria-label={t('basesToolbar.newViewName')} placeholder={t('basesToolbar.name')} value={newName} onChange={(e) => setNewName(e.target.value)} />
            <select className="bases-tb__select" aria-label={t('basesToolbar.newViewType')} value={newType} onChange={(e) => setNewType(e.target.value)}>
              {allTypeOptions.map((ty) => <option key={ty} value={ty}>{viewTypeLabel(ty)}</option>)}
            </select>
          </div>
          <button
            type="button"
            className="bases-tb__btn bases-tb__btn--primary"
            onClick={() => {
              const name = newName.trim() || viewTypeLabel(newType)
              onChange((d) => addView(d, newType, name))
              onSelectView(doc.views.length)
              setNewName('')
            }}
          >
            {t('basesToolbar.createView')}
          </button>
        </div>
      )}
    </Popover>
  )
})

// ─── Toolbar ────────────────────────────────────────────────────────────────

export const BasesToolbar = memo(function BasesToolbar({
  doc, rows, observedProperties, activeIndex, readOnly, mode, onSelectView, onChange, onAddItem, searchQuery, onSearchQueryChange, onCopyTable, onExportCsv,
}: BasesToolbarProps) {
  const { t } = useTranslation()
  const view = doc.views[activeIndex]
  const columns = availableColumns(doc, rows, view, observedProperties)
  const handleChange = useCallback((update: DocUpdate) => { if (!readOnly) onChange(update) }, [readOnly, onChange])
  const panelProps: PanelProps = { doc, index: activeIndex, columns, rows, disabled: readOnly, onChange: handleChange }
  const filterCount = countConditions(view?.filters) + countConditions(doc.filters)
  const viewTypeIds = useViewTypeIds()
  // The settings window of one view; held here, not in the view menu popover, which closes on outside clicks.
  const [configIndex, setConfigIndex] = useState<number | null>(null)
  const configView = configIndex !== null ? doc.views[configIndex] : undefined
  const dialogTypeOptions = useMemo(() => {
    const ids = configView && !viewTypeIds.includes(configView.type) ? [...viewTypeIds, configView.type] : viewTypeIds
    return ids.map((id) => ({ id, label: viewTypeLabel(id) }))
  }, [viewTypeIds, configView])
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
      <div className="bases-view__toolbar" role="toolbar" aria-label={t('basesToolbar.toolbarLabel')}>
        <div className="bases-tb__group-left">
          <ViewMenu doc={doc} activeIndex={activeIndex} disabled={readOnly} onSelectView={onSelectView} onChange={handleChange} onConfigureView={setConfigIndex} />
          {configView && configIndex !== null && (
            <BasesViewOptionsDialog
              key={`${configIndex}-${configView.type}`}
              doc={doc}
              index={configIndex}
              columns={columns}
              typeOptions={dialogTypeOptions}
              disabled={readOnly}
              onChange={handleChange}
              onClose={() => setConfigIndex(null)}
            />
          )}
          {mode === 'view' && !readOnly && onAddItem && (
            <button type="button" className="bases-tb__btn bases-tb__btn--primary" title={t('basesToolbar.newItemTitle')} onClick={onAddItem}>
              <Plus aria-hidden="true" className="bases-tb__btn-icon" />
              {t('basesToolbar.newItem')}
            </button>
          )}
        </div>
        {mode === 'view' && view && (
          <div className="bases-tb__group-right">
            <button
              type="button"
              className={showSearch ? 'bases-tb__btn bases-tb__btn--active' : 'bases-tb__btn'}
              title={t('basesToolbar.search')}
              aria-label={t('basesToolbar.search')}
              aria-pressed={showSearch}
              onClick={toggleSearch}
            >
              <Search aria-hidden="true" className="bases-tb__btn-icon" />
              {t('basesToolbar.search')}
            </button>
            <Popover label={<><ListFilter aria-hidden="true" className="bases-tb__btn-icon" />{t('basesToolbar.results')}</>} title={t('basesToolbar.results')} badge={view.limit !== undefined ? 1 : 0}>
              <ResultsPanel
                doc={doc}
                index={activeIndex}
                disabled={readOnly}
                onChange={handleChange}
                onCopyTable={view.type === 'table' ? onCopyTable : undefined}
                onExportCsv={view.type === 'table' ? onExportCsv : undefined}
              />
            </Popover>
            <Popover label={<><ArrowUpDown aria-hidden="true" className="bases-tb__btn-icon" />{t('basesToolbar.sort')}</>} title={t('basesToolbar.sortTitle')} badge={view.sort?.length ?? 0}><SortPanel {...panelProps} /></Popover>
            <Popover label={<><Rows3 aria-hidden="true" className="bases-tb__btn-icon" />{t('basesToolbar.group')}</>} title={t('basesToolbar.groupTitle')} badge={view.groupBy ? 1 : 0}><GroupPanel {...panelProps} /></Popover>
            <Popover label={<><Filter aria-hidden="true" className="bases-tb__btn-icon" />{t('basesToolbar.filter')}</>} title={t('basesToolbar.filterTitle')} badge={filterCount}><FilterPanel {...panelProps} /></Popover>
            {(view.type === 'table' || view.type === 'list' || view.type === 'cards' || view.type === 'kanban') && (
              <Popover label={<><SlidersHorizontal aria-hidden="true" className="bases-tb__btn-icon" />{t('basesToolbar.display')}</>} title={t('basesToolbar.display')}><DisplayPanel {...panelProps} /></Popover>
            )}
            <Popover label={<><Columns3 aria-hidden="true" className="bases-tb__btn-icon" />{t('basesToolbar.properties')}</>} title={t('basesToolbar.properties')}><PropertiesPanel {...panelProps} /></Popover>
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
            aria-label={t('basesToolbar.searchEntries')}
            placeholder={t('basesToolbar.searchEntriesPh')}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { onSearchQueryChange(''); setSearchOpen(false) } }}
          />
          <button
            type="button"
            className="bases-tb__icon-btn"
            aria-label={t('basesToolbar.closeSearch')}
            title={t('basesToolbar.closeSearch')}
            onClick={() => { onSearchQueryChange(''); setSearchOpen(false) }}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
})
