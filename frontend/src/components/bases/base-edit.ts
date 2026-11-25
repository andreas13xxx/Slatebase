/**
 * Pure edit operations behind the Bases toolbar: view management, sort, group,
 * visible properties and filters. Every function takes a `BaseDocument` and
 * returns a new one (never mutates), so the toolbar just serializes the result
 * back into the `.base` file.
 *
 * Filters are edited as the `BaseFilterNode` tree itself; a leaf is an
 * expression string. For the guided builder a leaf is split into
 * `Condition` (property, operator, value) and generated back, with a raw
 * expression fallback for anything that does not round-trip.
 */

import { translateNow } from '../../i18n'
import { rowValueKey } from '@slatebase/shared-contracts'
import type {
  BaseDocument, BaseFilterNode, BaseGroupBy, BaseGroupValue, BaseRow, BaseSortClause, BaseView,
} from '@slatebase/shared-contracts'

// ─── Views ──────────────────────────────────────────────────────────────────

export const VIEW_TYPES = ['table', 'cards', 'kanban', 'list'] as const

export const VIEW_TYPE_LABELS: Record<string, string> = {
  table: 'Tabelle', cards: 'Galerie', kanban: 'Kanban', list: 'Liste',
}
export type ViewType = (typeof VIEW_TYPES)[number]

/** A name not yet used by another view: `base`, else `base 2`, `base 3`, … */
export function uniqueViewName(doc: BaseDocument, base: string): string {
  const taken = new Set(doc.views.map((v) => v.name ?? v.type))
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`
    if (!taken.has(candidate)) return candidate
  }
}

function withView(doc: BaseDocument, index: number, fn: (v: BaseView) => BaseView): BaseDocument {
  return { ...doc, views: doc.views.map((v, i) => (i === index ? fn(v) : v)) }
}

/** Appends a view; its default columns are just the file name. */
export function addView(doc: BaseDocument, type: string, name: string): BaseDocument {
  const view: BaseView = { type, name: uniqueViewName(doc, name.trim() || type), order: ['file.name'] }
  return { ...doc, views: [...doc.views, view] }
}

export function renameView(doc: BaseDocument, index: number, name: string): BaseDocument {
  const trimmed = name.trim()
  if (!trimmed) return doc
  return withView(doc, index, (v) => ({ ...v, name: trimmed }))
}

/** Inserts a copy right after the original. */
export function duplicateView(doc: BaseDocument, index: number): BaseDocument {
  const source = doc.views[index]
  if (!source) return doc
  const copy: BaseView = structuredClone(source)
  copy.name = uniqueViewName(doc, `${source.name ?? source.type} (Kopie)`)
  const views = [...doc.views]
  views.splice(index + 1, 0, copy)
  return { ...doc, views }
}

/** Removes a view; the last remaining view cannot be deleted. */
export function deleteView(doc: BaseDocument, index: number): BaseDocument {
  if (doc.views.length <= 1 || !doc.views[index]) return doc
  return { ...doc, views: doc.views.filter((_, i) => i !== index) }
}

export function setViewType(doc: BaseDocument, index: number, type: string): BaseDocument {
  return withView(doc, index, (v) => ({ ...v, type }))
}

/** View fields that have a typed slot in the model; every other option key lives in `_unknown`. */
const TYPED_VIEW_OPTION_KEYS = new Set(['limit', 'image', 'imageFit', 'imageAspectRatio', 'cardSize'])

/** The stored value of a plugin-defined view option (typed slot first, then the passthrough bucket). */
export function getViewOption(view: BaseView, key: string): unknown {
  if (TYPED_VIEW_OPTION_KEYS.has(key)) return (view as unknown as Record<string, unknown>)[key]
  return view._unknown?.[key]
}

/**
 * Sets (or, with `undefined`, removes) a view-specific option declared by a plugin's
 * `registerBasesView({ options })`. These keys have no typed slot, so they travel in
 * the view's passthrough bucket and are written back verbatim into the `.base` file.
 */
export function setViewOption(doc: BaseDocument, index: number, key: string, value: unknown): BaseDocument {
  return withView(doc, index, (v) => {
    if (TYPED_VIEW_OPTION_KEYS.has(key)) {
      const next = { ...v } as unknown as Record<string, unknown>
      if (value === undefined) delete next[key]
      else next[key] = value
      return next as unknown as BaseView
    }
    const unknown = { ...(v._unknown ?? {}) }
    if (value === undefined) delete unknown[key]
    else unknown[key] = value
    return { ...v, _unknown: unknown }
  })
}

/** A copy of `list` with the item at `from` moved to position `to`; the list itself when either index is out of range. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return next
}

/** Moves a view to another position in the view list. */
export function moveView(doc: BaseDocument, from: number, to: number): BaseDocument {
  if (!doc.views[from] || !doc.views[to] || from === to) return doc
  return { ...doc, views: moveItem(doc.views, from, to) }
}

/** Where the view at `selected` ends up after `moveView(doc, from, to)`. */
export function indexAfterMove(selected: number, from: number, to: number): number {
  if (selected === from) return to
  if (from < selected && to >= selected) return selected - 1
  if (from > selected && to <= selected) return selected + 1
  return selected
}

/** Largest result limit the toolbar writes. */
export const MAX_VIEW_LIMIT = 100_000

/** Sets how many rows the view shows; `undefined` (or anything that is not a positive number) removes the limit. */
export function setLimit(doc: BaseDocument, index: number, limit: number | undefined): BaseDocument {
  const value = limit !== undefined && Number.isFinite(limit) && limit >= 1 ? Math.min(MAX_VIEW_LIMIT, Math.floor(limit)) : undefined
  return withView(doc, index, (v) => {
    const { limit: _old, ...rest } = v
    return value !== undefined ? { ...rest, limit: value } : rest
  })
}

// ─── Column summaries / display names / widths ──────────────────────────────

/** The summary functions Obsidian offers, by the kind of value they fit. */
export const SUMMARY_GROUPS: ReadonlyArray<{ label: string; names: readonly string[] }> = [
  { label: 'Alle', names: ['Empty', 'Filled', 'Unique'] },
  { label: 'Zahlen', names: ['Sum', 'Average', 'Median', 'Min', 'Max', 'Range', 'Stddev'] },
  { label: 'Datum', names: ['Earliest', 'Latest'] },
  { label: 'Kontrollkästchen', names: ['Checked', 'Unchecked'] },
]

/** German labels of the built-in summary names (the file keeps Obsidian's English names). */
export const SUMMARY_LABELS: Record<string, string> = {
  Empty: 'Leer', Filled: 'Gefüllt', Unique: 'Eindeutig',
  Sum: 'Summe', Average: 'Durchschnitt', Median: 'Median', Min: 'Minimum', Max: 'Maximum', Range: 'Spanne', Stddev: 'Standardabweichung',
  Earliest: 'Frühestes', Latest: 'Spätestes',
  Checked: 'Angehakt', Unchecked: 'Nicht angehakt',
}

/**
 * The key a per-column map (`summaries`, `columnSize`, `properties`) already uses for a column, else
 * the id as given. A file may name the same column `status` or `note.status`.
 */
function existingColumnKey(map: Record<string, unknown> | undefined, id: string): string {
  if (!map) return id
  for (const key of [id, rowValueKey(id), `note.${rowValueKey(id)}`]) {
    if (Object.hasOwn(map, key)) return key
  }
  return id
}

/** The entry a per-column map holds for a column, whichever of its spellings the file uses. */
export function columnEntry<T>(map: Record<string, T> | undefined, id: string): T | undefined {
  if (!map) return undefined
  const key = existingColumnKey(map, id)
  return Object.hasOwn(map, key) ? map[key] : undefined
}

/** Assigns a summary to a column of the view; an empty name removes it (and the key once no summary is left). */
export function setViewSummary(doc: BaseDocument, index: number, column: string, name: string | undefined): BaseDocument {
  return withView(doc, index, (v) => {
    const { summaries: old, ...rest } = v
    const next: Record<string, string> = { ...(old ?? {}) }
    const key = existingColumnKey(next, column)
    if (name) next[key] = name
    else delete next[key]
    return Object.keys(next).length > 0 ? { ...rest, summaries: next } : rest
  })
}

/**
 * Sets the header text of a column (`properties.<id>.displayName`); an empty name removes it. A view
 * without its own `order` shows the declared properties, so before a NEW key is declared every such
 * view gets its current columns written down — renaming a column must not add it to another view.
 */
export function setDisplayName(doc: BaseDocument, id: string, name: string): BaseDocument {
  const trimmed = name.trim()
  const properties = { ...(doc.properties ?? {}) }
  const key = existingColumnKey(properties, id)
  const isNewKey = !Object.hasOwn(properties, key)
  if (!trimmed && isNewKey) return doc
  const { displayName: _old, ...meta } = properties[key] ?? {}
  if (trimmed) properties[key] = { ...meta, displayName: trimmed }
  else properties[key] = meta
  const views = isNewKey
    ? doc.views.map((v) => (v.order ? v : { ...v, order: effectiveColumns(doc, v) }))
    : doc.views
  return { ...doc, properties, views }
}

/** Column widths the table accepts, in px. */
export const COLUMN_WIDTH = { min: 40, max: 2000, step: 16 } as const

/** Sets a column's width in px (`columnSize`); `undefined` lets the column size itself again. */
export function setColumnSize(doc: BaseDocument, index: number, column: string, width: number | undefined): BaseDocument {
  const clamped = width === undefined ? undefined : clampTo(width, COLUMN_WIDTH.min, COLUMN_WIDTH.max)
  return withView(doc, index, (v) => {
    const { columnSize: old, ...rest } = v
    const next: Record<string, number> = { ...(old ?? {}) }
    const key = existingColumnKey(next, column)
    if (clamped !== undefined) next[key] = Math.round(clamped)
    else delete next[key]
    return Object.keys(next).length > 0 ? { ...rest, columnSize: next } : rest
  })
}

// ─── Sort / group / properties ──────────────────────────────────────────────

/** An empty clause list removes the key instead of writing `sort: []`. */
export function setSort(doc: BaseDocument, index: number, sort: BaseSortClause[]): BaseDocument {
  return withView(doc, index, (v) => {
    const { sort: _old, ...rest } = v
    return sort.length > 0 ? { ...rest, sort } : rest
  })
}

export function setGroupBy(doc: BaseDocument, index: number, groupBy: BaseGroupBy | undefined): BaseDocument {
  return withView(doc, index, (v) => {
    // A new grouping property invalidates the old group order.
    const { groupBy: _old, groupOrder: _order, ...rest } = v
    return groupBy ? { ...rest, groupBy } : rest
  })
}

/** Obsidian writes `medium`, `tall` or `extra`; short (the default) is never written, the key is removed. */
export function setRowHeight(doc: BaseDocument, index: number, rowHeight: string | undefined): BaseDocument {
  return withView(doc, index, (v) => {
    const { rowHeight: _old, ...rest } = v
    return rowHeight ? { ...rest, rowHeight } : rest
  })
}

/** Obsidian writes `number` or `none`; bullets (the default) are never written, the key is removed. */
export function setListMarkers(doc: BaseDocument, index: number, markers: string | undefined): BaseDocument {
  return withView(doc, index, (v) => {
    const { markers: _old, ...rest } = v
    return markers ? { ...rest, markers } : rest
  })
}

/** `false` removes the key (Obsidian only writes `indentProperties: true`). */
export function setListIndentProperties(doc: BaseDocument, index: number, indent: boolean): BaseDocument {
  return withView(doc, index, (v) => {
    const { indentProperties: _old, ...rest } = v
    return indent ? { ...rest, indentProperties: true } : rest
  })
}

/** An empty separator removes the key. */
export function setListSeparator(doc: BaseDocument, index: number, separator: string): BaseDocument {
  return withView(doc, index, (v) => {
    const { separator: _old, ...rest } = v
    return separator !== '' ? { ...rest, separator } : rest
  })
}

/** Card options, as the Obsidian UI offers them (sample file: size 440, ratio 2.5, `contain`). */
export const CARD_SIZE = { min: 50, max: 800, default: 200 } as const
export const CARD_RATIO = { min: 0.25, max: 2.5, default: 1 } as const

/** Clamps `value` into the range; `undefined` for anything that is not a finite number. */
export function clampTo(value: number, min: number, max: number): number | undefined {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined
}

/** The default size is never written: the key is removed instead. */
export function setCardSize(doc: BaseDocument, index: number, size: number | undefined): BaseDocument {
  const clamped = size === undefined ? undefined : clampTo(size, CARD_SIZE.min, CARD_SIZE.max)
  return withView(doc, index, (v) => {
    const { cardSize: _old, ...rest } = v
    return clamped !== undefined && clamped !== CARD_SIZE.default ? { ...rest, cardSize: Math.round(clamped) } : rest
  })
}

/** Board layouts (Kanban, grouped cards) take the width from `cardSize` too, but unset means "automatic". */
export function setBoardSize(doc: BaseDocument, index: number, size: number | undefined): BaseDocument {
  const clamped = size === undefined ? undefined : clampTo(size, CARD_SIZE.min, CARD_SIZE.max)
  return withView(doc, index, (v) => {
    const { cardSize: _old, ...rest } = v
    return clamped !== undefined ? { ...rest, cardSize: Math.round(clamped) } : rest
  })
}

/** Back to automatic widths for every column of the view. */
export function resetColumnSizes(doc: BaseDocument, index: number): BaseDocument {
  return withView(doc, index, (v) => {
    const { columnSize: _old, ...rest } = v
    return rest
  })
}

/** An empty id removes the key (no image property is the default). */
export function setCardImageProperty(doc: BaseDocument, index: number, property: string): BaseDocument {
  return withView(doc, index, (v) => {
    const { image: _old, ...rest } = v
    return property ? { ...rest, image: property } : rest
  })
}

/** `contain` (fit in) is written; fill (`cover`, the default) removes the key. */
export function setCardImageFit(doc: BaseDocument, index: number, fit: 'contain' | 'cover'): BaseDocument {
  return withView(doc, index, (v) => {
    const { imageFit: _old, ...rest } = v
    return fit === 'contain' ? { ...rest, imageFit: 'contain' } : rest
  })
}

/** The default ratio (1) is never written: the key is removed instead. */
export function setCardImageAspectRatio(doc: BaseDocument, index: number, ratio: number | undefined): BaseDocument {
  const clamped = ratio === undefined ? undefined : clampTo(ratio, CARD_RATIO.min, CARD_RATIO.max)
  return withView(doc, index, (v) => {
    const { imageAspectRatio: _old, ...rest } = v
    return clamped !== undefined && clamped !== CARD_RATIO.default ? { ...rest, imageAspectRatio: Math.round(clamped * 100) / 100 } : rest
  })
}

export function setOrder(doc: BaseDocument, index: number, order: string[]): BaseDocument {
  return withView(doc, index, (v) => ({ ...v, order }))
}

/**
 * Sets the explicit order of Kanban/cards groups (`groupOrder`), e.g. after a
 * drag-reorder of the columns. An empty list removes the key (fall back to the
 * default alphabetical order) rather than writing `groupOrder: []`, which
 * Obsidian reads as "hide all groups" — unless `keepEmpty` asks for exactly that.
 */
export function setGroupOrder(doc: BaseDocument, index: number, groupOrder: BaseGroupValue[], keepEmpty = false): BaseDocument {
  return withView(doc, index, (v) => {
    const { groupOrder: _old, ...rest } = v
    return groupOrder.length > 0 || keepEmpty ? { ...rest, groupOrder } : rest
  })
}

// ─── Formulas ───────────────────────────────────────────────────────────────

const FORMULA_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Whether a formula name is a valid identifier not already taken. */
export function isValidFormulaName(doc: BaseDocument, name: string): boolean {
  const n = name.trim()
  return FORMULA_NAME.test(n) && !(doc.formulas && n in doc.formulas)
}

/**
 * Adds a formula `name: expression` to the document and appends `formula.name`
 * as a column of the given view, so it shows up right away. A no-op when the
 * name is invalid or taken.
 */
export function addFormula(doc: BaseDocument, viewIndex: number, name: string, expression: string): BaseDocument {
  const n = name.trim()
  if (!isValidFormulaName(doc, n)) return doc
  const withFormula: BaseDocument = { ...doc, formulas: { ...(doc.formulas ?? {}), [n]: expression.trim() } }
  const colId = `formula.${n}`
  return withView(withFormula, viewIndex, (v) => {
    const order = v.order ?? Object.keys(doc.properties ?? {})
    return order.includes(colId) ? v : { ...v, order: [...order, colId] }
  })
}

/** Removes a formula from the document and drops its column from every view. */
export function removeFormula(doc: BaseDocument, name: string): BaseDocument {
  if (!doc.formulas || !(name in doc.formulas)) return doc
  const { [name]: _drop, ...rest } = doc.formulas
  const colId = `formula.${name}`
  const views = doc.views.map((v) => (v.order ? { ...v, order: v.order.filter((c) => c !== colId) } : v))
  const formulas = Object.keys(rest).length > 0 ? rest : undefined
  return { ...doc, formulas, views } as BaseDocument
}

/** The columns a view shows: its `order`, else the declared properties. */
export function effectiveColumns(doc: BaseDocument, view: BaseView | undefined): string[] {
  return view?.order ?? Object.keys(doc.properties ?? {})
}

export interface ColumnChoice {
  id: string
  label: string
}

const FILE_COLUMNS = [
  'file.name', 'file.path', 'file.folder', 'file.ext', 'file.size',
  'file.ctime', 'file.mtime', 'file.tags', 'file.links', 'file.backlinks', 'file.embeds',
]

/**
 * Plain-language labels for the technical `file.*` pseudo-columns, so a header
 * or picker shows "Ordner" instead of "file.folder". A user-declared
 * `properties['file.x'].displayName` still wins (handled in `columnLabel`).
 */
export const FILE_COLUMN_LABELS: Record<string, string> = {
  'file.name': 'Name',
  'file.path': 'Pfad',
  'file.folder': 'Ordner',
  'file.ext': 'Dateiendung',
  'file.size': 'Größe',
  'file.ctime': 'Erstellt',
  'file.mtime': 'Geändert',
  'file.tags': 'Tags',
  'file.links': 'Links',
  'file.backlinks': 'Backlinks',
  'file.embeds': 'Einbettungen',
}

/**
 * The display label for a column id: a declared displayName wins, then the
 * plain-language name of a `file.*` field, then a formula's own key, else the
 * id verbatim (a user property).
 */
export function columnLabel(doc: BaseDocument, id: string): string {
  // `status` and `note.status` name the same column: a display name declared under either spelling counts.
  const declared = columnEntry(doc.properties, id)?.displayName
  if (declared) return declared
  if (id in FILE_COLUMN_LABELS) return translateNow(`basesUi.col_${id.slice('file.'.length)}` as 'basesUi.col_name')
  if (id.startsWith('formula.')) return id.slice('formula.'.length)
  return id
}

/**
 * Every column the toolbar offers: file fields, formulas, declared and observed
 * properties. `observedProperties` are the frontmatter keys the backend saw
 * across the base's matched notes (independent of which columns the query
 * requested) — so the picker lists the base's own properties like Obsidian,
 * not just the ones that happened to be fetched into `rows`.
 */
export function availableColumns(doc: BaseDocument, rows: BaseRow[], view: BaseView | undefined, observedProperties?: readonly string[]): ColumnChoice[] {
  const ids: string[] = [...FILE_COLUMNS]
  for (const key of Object.keys(doc.formulas ?? {})) ids.push(`formula.${key}`)
  for (const key of Object.keys(doc.properties ?? {})) ids.push(key)
  for (const id of view?.order ?? []) ids.push(id)
  for (const key of observedProperties ?? []) if (!key.startsWith('file.')) ids.push(key)
  for (const row of rows) {
    for (const key of Object.keys(row.values)) if (!key.startsWith('file.')) ids.push(key)
  }
  // Dedup on the normalized key so a `note.`-prefixed id from `view.order` and
  // the bare key observed in the rows collapse to one choice (the backend
  // strips `note.` when filling rows). The bare id is the canonical choice —
  // it matches the row-value key and the form `setGroupBy`/`setOrder` write.
  const seen = new Set<string>()
  const out: ColumnChoice[] = []
  for (const id of ids) {
    const key = rowValueKey(id)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id: key, label: columnLabel(doc, key) })
  }
  return out
}

// ─── Filters ────────────────────────────────────────────────────────────────

export type FilterGroupKey = 'and' | 'or' | 'not'
export type FilterPath = number[]

export function groupKeyOf(node: BaseFilterNode): FilterGroupKey | null {
  if (typeof node === 'string') return null
  if ('and' in node) return 'and'
  if ('or' in node) return 'or'
  return 'not'
}

export function childrenOf(node: BaseFilterNode): BaseFilterNode[] {
  if (typeof node === 'string') return []
  if ('and' in node) return node.and
  if ('or' in node) return node.or
  return node.not
}

export function makeGroup(key: FilterGroupKey, children: BaseFilterNode[]): BaseFilterNode {
  if (key === 'and') return { and: children }
  if (key === 'or') return { or: children }
  return { not: children }
}

/** The editor always works on a group at the root. */
export function rootGroup(node: BaseFilterNode | undefined): BaseFilterNode {
  if (node === undefined) return { and: [] }
  return typeof node === 'string' ? { and: [node] } : node
}

/** Drops empty groups (recursively); an empty root becomes `undefined` (no filter). */
export function normalizeFilter(node: BaseFilterNode | undefined): BaseFilterNode | undefined {
  if (node === undefined || typeof node === 'string') return node
  const key = groupKeyOf(node)!
  const children = childrenOf(node)
    .map((c) => normalizeFilter(c))
    .filter((c): c is BaseFilterNode => c !== undefined && c !== '')
  return children.length > 0 ? makeGroup(key, children) : undefined
}

function mapAt(node: BaseFilterNode, path: FilterPath, fn: (n: BaseFilterNode) => BaseFilterNode | null): BaseFilterNode | null {
  if (path.length === 0) return fn(node)
  const [head, ...rest] = path
  const key = groupKeyOf(node)
  if (key === null) return node
  const kids = childrenOf(node)
  const target = kids[head!]
  if (target === undefined) return node
  const replaced = mapAt(target, rest, fn)
  const next = replaced === null ? kids.filter((_, i) => i !== head) : kids.map((k, i) => (i === head ? replaced : k))
  return makeGroup(key, next)
}

/** Replaces the node at `path` (a leaf expression or a whole group). */
export function replaceFilterNode(root: BaseFilterNode, path: FilterPath, node: BaseFilterNode): BaseFilterNode {
  return mapAt(root, path, () => node) ?? root
}

/** Removes the node at `path` (the root cannot be removed). */
export function removeFilterNode(root: BaseFilterNode, path: FilterPath): BaseFilterNode {
  if (path.length === 0) return root
  return mapAt(root, path, () => null) ?? root
}

/** Appends a child to the group at `path`. */
export function addFilterChild(root: BaseFilterNode, path: FilterPath, child: BaseFilterNode): BaseFilterNode {
  return mapAt(root, path, (n) => {
    const key = groupKeyOf(n)
    return key === null ? n : makeGroup(key, [...childrenOf(n), child])
  }) ?? root
}

/** Switches a group between and / or / not, keeping its children. */
export function setGroupKey(root: BaseFilterNode, path: FilterPath, key: FilterGroupKey): BaseFilterNode {
  return mapAt(root, path, (n) => (groupKeyOf(n) === null ? n : makeGroup(key, childrenOf(n)))) ?? root
}

export function setViewFilter(doc: BaseDocument, index: number, node: BaseFilterNode | undefined): BaseDocument {
  const normalized = normalizeFilter(node)
  return withView(doc, index, (v) => {
    const { filters: _old, ...rest } = v
    return normalized !== undefined ? { ...rest, filters: normalized } : rest
  })
}

export function setDocFilter(doc: BaseDocument, node: BaseFilterNode | undefined): BaseDocument {
  const normalized = normalizeFilter(node)
  const { filters: _old, ...rest } = doc
  return normalized !== undefined ? { ...rest, filters: normalized } : rest
}

// ─── Guided condition builder ───────────────────────────────────────────────

export type Operator =
  | 'eq' | 'neq' | 'contains' | 'notContains' | 'startsWith' | 'endsWith'
  | 'empty' | 'notEmpty' | 'gt' | 'gte' | 'lt' | 'lte' | 'hasTag' | 'inFolder'

export interface Condition {
  property: string
  operator: Operator
  value: string
}

export const OPERATOR_LABELS: Record<Operator, string> = {
  eq: 'ist', neq: 'ist nicht', contains: 'enthält', notContains: 'enthält nicht',
  startsWith: 'beginnt mit', endsWith: 'endet mit', empty: 'ist leer', notEmpty: 'ist nicht leer',
  gt: '>', gte: '≥', lt: '<', lte: '≤', hasTag: 'hat Tag', inFolder: 'liegt in Ordner',
}

/** Operators that take no value. */
export const VALUELESS_OPERATORS: ReadonlySet<Operator> = new Set(['empty', 'notEmpty'])

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

/** How a property is written inside an expression. */
export function propertyRef(name: string): string {
  if (/^(file|formula|note)\./.test(name) && name.split('.').every((p) => IDENT.test(p))) return name
  if (IDENT.test(name)) return name
  return `note[${quote(name)}]`
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

const NUMBER = /^-?\d+(\.\d+)?$/

function literal(value: string, numericAllowed: boolean): string {
  return numericAllowed && NUMBER.test(value.trim()) ? value.trim() : quote(value)
}

/** Generates the expression for a condition. */
export function conditionToExpression(c: Condition): string {
  const p = propertyRef(c.property)
  switch (c.operator) {
    case 'eq': return `${p} == ${literal(c.value, true)}`
    case 'neq': return `${p} != ${literal(c.value, true)}`
    case 'gt': return `${p} > ${literal(c.value, true)}`
    case 'gte': return `${p} >= ${literal(c.value, true)}`
    case 'lt': return `${p} < ${literal(c.value, true)}`
    case 'lte': return `${p} <= ${literal(c.value, true)}`
    case 'contains': return `${p}.contains(${quote(c.value)})`
    case 'notContains': return `!${p}.contains(${quote(c.value)})`
    case 'startsWith': return `${p}.startsWith(${quote(c.value)})`
    case 'endsWith': return `${p}.endsWith(${quote(c.value)})`
    case 'empty': return `${p}.isEmpty()`
    case 'notEmpty': return `!${p}.isEmpty()`
    case 'hasTag': return `file.hasTag(${quote(c.value)})`
    case 'inFolder': return `file.inFolder(${quote(c.value)})`
  }
}

const PROP_SRC = String.raw`(note\["(?:[^"\\]|\\.)*"\]|[A-Za-z_][A-Za-z0-9_.]*)`
const STR_SRC = String.raw`"((?:[^"\\]|\\.)*)"`
const NUM_SRC = String.raw`(-?\d+(?:\.\d+)?)`

function unquote(s: string): string {
  return s.replace(/\\(.)/g, '$1')
}

function propertyFromRef(ref: string): string {
  const m = /^note\[("(?:[^"\\]|\\.)*")\]$/.exec(ref)
  return m ? unquote(m[1]!.slice(1, -1)) : ref
}

const BINARY = new RegExp(String.raw`^${PROP_SRC}\s*(==|!=|>=|<=|>|<)\s*(?:${STR_SRC}|${NUM_SRC})$`)
const METHOD = new RegExp(String.raw`^(!?)${PROP_SRC}\.(contains|startsWith|endsWith)\(${STR_SRC}\)$`)
const EMPTY = new RegExp(String.raw`^(!?)${PROP_SRC}\.isEmpty\(\)$`)
const FILE_CALL = new RegExp(String.raw`^file\.(hasTag|inFolder)\(${STR_SRC}\)$`)

const BINARY_OPS: Record<string, Operator> = { '==': 'eq', '!=': 'neq', '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' }

/** Splits an expression into builder fields, or null when it needs the raw editor. */
export function parseCondition(expression: string): Condition | null {
  const src = expression.trim()
  let m = FILE_CALL.exec(src)
  if (m) {
    const operator = m[1] === 'hasTag' ? 'hasTag' : 'inFolder'
    return { property: operator === 'hasTag' ? 'file.tags' : 'file.folder', operator, value: unquote(m[2]!) }
  }
  m = EMPTY.exec(src)
  if (m) return { property: propertyFromRef(m[2]!), operator: m[1] ? 'notEmpty' : 'empty', value: '' }
  m = METHOD.exec(src)
  if (m) {
    const method = m[3]!
    if (m[1] && method !== 'contains') return null
    const operator: Operator = method === 'contains' ? (m[1] ? 'notContains' : 'contains') : (method as 'startsWith' | 'endsWith')
    return { property: propertyFromRef(m[2]!), operator, value: unquote(m[4]!) }
  }
  m = BINARY.exec(src)
  if (m) {
    return { property: propertyFromRef(m[1]!), operator: BINARY_OPS[m[2]!]!, value: m[3] !== undefined ? unquote(m[3]) : m[4]! }
  }
  return null
}
