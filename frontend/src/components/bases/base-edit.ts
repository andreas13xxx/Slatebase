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

import type {
  BaseDocument, BaseFilterNode, BaseGroupBy, BaseRow, BaseSortClause, BaseView,
} from '@slatebase/shared-contracts'

// ─── Views ──────────────────────────────────────────────────────────────────

export const VIEW_TYPES = ['table', 'cards', 'kanban', 'list', 'map'] as const

export const VIEW_TYPE_LABELS: Record<string, string> = {
  table: 'Tabelle', cards: 'Karten', kanban: 'Kanban', list: 'Liste', map: 'Karte (Map)',
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

export function setOrder(doc: BaseDocument, index: number, order: string[]): BaseDocument {
  return withView(doc, index, (v) => ({ ...v, order }))
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
  const declared = doc.properties?.[id]?.displayName
  if (declared) return declared
  if (id in FILE_COLUMN_LABELS) return FILE_COLUMN_LABELS[id]!
  if (id.startsWith('formula.')) return id.slice('formula.'.length)
  return id
}

/** Every column the toolbar offers: file fields, formulas, declared and observed properties. */
export function availableColumns(doc: BaseDocument, rows: BaseRow[], view: BaseView | undefined): ColumnChoice[] {
  const ids: string[] = [...FILE_COLUMNS]
  for (const key of Object.keys(doc.formulas ?? {})) ids.push(`formula.${key}`)
  for (const key of Object.keys(doc.properties ?? {})) ids.push(key)
  for (const id of view?.order ?? []) ids.push(id)
  for (const row of rows) {
    for (const key of Object.keys(row.values)) if (!key.startsWith('file.')) ids.push(key)
  }
  const seen = new Set<string>()
  const out: ColumnChoice[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, label: columnLabel(doc, id) })
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
