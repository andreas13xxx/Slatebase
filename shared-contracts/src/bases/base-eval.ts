/**
 * Pure Bases evaluation — everything that turns a parsed `BaseDocument` plus
 * candidate rows into filtered rows, without any I/O.
 *
 * Shared by the frontend (client-side filtering of the rows the query route
 * returns) and the backend MCP `query_base` tool, so both sides evaluate the
 * Obsidian expression language identically.
 */

import type { BaseDocument, BaseFilterNode, BaseRow, BaseView, BaseQuerySpecWire, BaseQueryRowWire } from './types.js'
import { evaluateCondition, evaluateFormula, collectExpressionRefs } from './formula/evaluator.js'
import type { FormulaContext, FormulaResult } from './formula/evaluator.js'
import type { FormulaValue } from './formula/functions.js'
import { buildCombinedPrefilter } from './prefilter.js'

// ─── Filter column collection ──────────────────────────────────────────────────

/** Walk a filter tree collecting every referenced property column. */
function collectFilterRefs(node: BaseFilterNode | undefined, into: Set<string>): void {
  if (!node) return
  if (typeof node === 'string') { collectExpressionRefs(node, into); return }
  if ('and' in node) node.and.forEach((n) => collectFilterRefs(n, into))
  else if ('or' in node) node.or.forEach((n) => collectFilterRefs(n, into))
  else if ('not' in node) node.not.forEach((n) => collectFilterRefs(n, into))
}

// ─── Spec construction ────────────────────────────────────────────────────────

/**
 * Builds a backend query spec from a base document and the view being rendered.
 *
 * - Columns are the view's explicit `order`, falling back to the document's
 *   declared property keys, PLUS any property referenced in a filter (so the
 *   caller has the values it needs to filter), minus formula columns and
 *   `file.*`/`note.` prefixed pseudo-columns (the backend derives those).
 * - Filters and the view `limit` are NOT pushed to the backend — the backend
 *   would cut candidate rows BEFORE the expression filters ran, so `filterRows`
 *   applies both (filter first, then limit).
 */
export function buildQuerySpec(doc: BaseDocument, view: BaseView): BaseQuerySpecWire {
  const formulaKeys = new Set(Object.keys(doc.formulas ?? {}))

  const wanted = new Set<string>()
  for (const id of view.order ?? Object.keys(doc.properties ?? {})) wanted.add(id)
  if (view.groupBy) wanted.add(view.groupBy.property)
  collectFilterRefs(doc.filters, wanted)
  collectFilterRefs(view.filters, wanted)
  // Properties read by formula columns must reach the client too.
  for (const src of Object.values(doc.formulas ?? {})) collectExpressionRefs(src, wanted)

  const propertyColumns = Array.from(wanted).filter((id) => {
    if (formulaKeys.has(id)) return false
    if (id.startsWith('file.') || id.startsWith('formula.')) return false
    if (id === 'file' || id === 'note') return false
    // `this.*` reads the host note, not the candidate rows — see `buildHostQuerySpec`.
    if (isThisRef(id)) return false
    return true
  }).map((id) => (id.startsWith('note.') ? id.slice('note.'.length) : id))

  const spec: BaseQuerySpecWire = { columns: Array.from(new Set(propertyColumns)) }

  if (view.sort && view.sort.length > 0) {
    const serverSort = view.sort
      .filter((s) => !formulaKeys.has(s.column))
      .map((s) => (s.direction ? { column: s.column, direction: s.direction } : { column: s.column }))
    if (serverSort.length > 0) spec.sort = serverSort
  }

  // Conservative structured prefilter: a necessary-condition subset of the
  // document + view filters, so the backend narrows candidates before its row
  // cap. The full expression filter still runs client-side in `filterRows`.
  const prefilter = buildCombinedPrefilter(doc.filters, view.filters)
  if (prefilter !== null) spec.filters = prefilter

  // file.* pseudo-columns referenced anywhere (columns/filters/formulas/sort),
  // so the backend knows whether a stat() for file.size is worth doing.
  const fileColumns = new Set<string>()
  for (const id of wanted) if (id.startsWith('file.')) fileColumns.add(id)
  for (const s of view.sort ?? []) if (s.column.startsWith('file.')) fileColumns.add(s.column)
  if (fileColumns.size > 0) spec.fileColumns = Array.from(fileColumns)

  return spec
}

/** `this` or a `this.…` reference — the host note of an embedded base. */
function isThisRef(id: string): boolean {
  return id === 'this' || id.startsWith('this.')
}

/** Every `this.*` reference in the document's and the view's filters and formulas. */
function collectThisRefs(doc: BaseDocument, view: BaseView): string[] {
  const refs = new Set<string>()
  collectFilterRefs(doc.filters, refs)
  collectFilterRefs(view.filters, refs)
  for (const src of Object.values(doc.formulas ?? {})) collectExpressionRefs(src, refs)
  return Array.from(refs).filter(isThisRef)
}

/**
 * Builds the query that fetches the HOST row for `this` (the note a base is
 * embedded in, or the base file itself), or null when the base never reads
 * `this` — then no second query is needed. It asks for exactly the host columns
 * the base references (`this.status` → `status`, `this.file.size` → `file.size`)
 * and narrows to the host path. The path is a backend glob, so a path with glob
 * characters may match more than the host: the caller picks the row whose path
 * is exactly `hostPath`.
 */
export function buildHostQuerySpec(doc: BaseDocument, view: BaseView, hostPath: string): BaseQuerySpecWire | null {
  const refs = collectThisRefs(doc, view)
  if (refs.length === 0) return null
  const columns = new Set<string>()
  const fileColumns = new Set<string>()
  for (const ref of refs) {
    if (ref === 'this' || ref === 'this.file') continue
    const rest = ref.slice('this.'.length)
    if (rest.startsWith('file.')) fileColumns.add(rest)
    else columns.add(rest.startsWith('note.') ? rest.slice('note.'.length) : rest)
  }
  const spec: BaseQuerySpecWire = { columns: Array.from(columns), filters: { path: hostPath } }
  if (fileColumns.size > 0) spec.fileColumns = Array.from(fileColumns)
  return spec
}

// ─── Row context + filter evaluation ───────────────────────────────────────────

/**
 * Properties that are always lists in Obsidian. The index hands every property
 * over as a string list, so a one-element list cannot be told from a scalar;
 * these keys are therefore never unwrapped (`tags.contains(..)` must behave the
 * same for one tag and for two).
 */
const LIST_KEYS: ReadonlySet<string> = new Set(['tags', 'aliases', 'cssclasses', 'file.tags', 'file.links', 'file.backlinks'])

/**
 * Converts an index value to an expression value. A one-element list reads as a
 * scalar UNLESS the key is a known list key — either a static Obsidian list key
 * (`LIST_KEYS`) or one the backend reported for this vault (`extraListKeys`,
 * from the property-type registry or observed multi-value form). This is what
 * keeps a genuinely list-typed property with a single current value a list.
 */
function toExprValue(key: string, v: unknown, extraListKeys?: ReadonlySet<string>): FormulaValue {
  if (Array.isArray(v)) {
    if (LIST_KEYS.has(key) || extraListKeys?.has(key)) return v as FormulaValue[]
    if (v.length === 0) return null
    if (v.length === 1) return v[0] as FormulaValue
    return v as FormulaValue[]
  }
  return (v as FormulaValue) ?? null
}

/**
 * Builds the expression `FormulaContext` for one row, resolving the Obsidian
 * property prefixes: `file.*` → file metadata, `note.`/bare → frontmatter.
 * With `doc`, `formula.x` (or a bare formula id) resolves to that formula of
 * the base, evaluated on demand — so filters can use formula values too.
 */
export function rowContext(row: BaseRow, doc?: BaseDocument, thisRow?: BaseRow): FormulaContext {
  return buildContext(row, doc, new Set(), thisRow)
}

/**
 * Resolves a `this.*` reference against the host row — the note a base is
 * embedded in, or the base file itself when it is opened on its own (Obsidian's
 * `this`). `this.file` alone is the host's path, usable as `file.hasLink(this.file)`;
 * `this.file.*` is the host's file metadata and `this.<prop>` / `this.note.<prop>`
 * its frontmatter. With no host row everything resolves to null.
 */
function resolveThis(name: string, thisRow: BaseRow | undefined): FormulaValue {
  if (!thisRow) return null
  if (name === 'this.file') return thisRow.path
  if (name === 'this.file.name' || name === 'this.file.basename') return thisRow.fileName
  if (name === 'this.file.path') return thisRow.path
  if (name.startsWith('this.file.')) {
    const key = name.slice('this.'.length)
    return toExprValue(key, thisRow.values[key], thisRow.listKeys)
  }
  const rest = name.slice('this.'.length)
  const key = rest.startsWith('note.') ? rest.slice('note.'.length) : rest
  return toExprValue(key, thisRow.values[key], thisRow.listKeys)
}

/** Lower-cased link or path without a trailing `.md`, so `Notes/A.md` and the link `a` compare alike. */
function linkKey(value: string): string {
  return value.replace(/\.md$/i, '').toLowerCase()
}

function buildContext(row: BaseRow, doc: BaseDocument | undefined, active: ReadonlySet<string>, thisRow?: BaseRow): FormulaContext {
  const values = row.values
  const listKeys = row.listKeys
  const tags = Array.isArray(values['file.tags']) ? (values['file.tags'] as string[]) : []
  const links = Array.isArray(values['file.links']) ? (values['file.links'] as string[]) : []
  const folder = typeof values['file.folder'] === 'string' ? (values['file.folder'] as string) : ''
  return {
    resolve(name: string): FormulaValue {
      if (name === 'this' || name.startsWith('this.')) return resolveThis(name, thisRow)
      const formulaKey = name.startsWith('formula.') ? name.slice('formula.'.length) : name
      if (doc?.formulas && formulaKey in doc.formulas && (name.startsWith('formula.') || !(name in values))) {
        const r = evaluateFormulaIn(doc, row, formulaKey, active, thisRow)
        if (!r.ok) throw new Error(r.error)
        return r.value
      }
      if (name === 'file.name' || name === 'file.basename') return row.fileName
      if (name === 'file.path') return row.path
      if (name.startsWith('file.')) return toExprValue(name, values[name], listKeys)
      const key = name.startsWith('note.') ? name.slice('note.'.length) : name
      return toExprValue(key, values[key] ?? values[name], listKeys)
    },
    fileApi: {
      hasTag: (tag: string) => {
        const needle = tag.replace(/^#/, '').toLowerCase()
        return tags.some((t) => t.replace(/^#/, '').toLowerCase() === needle)
      },
      inFolder: (f: string) => {
        const target = f.replace(/\/+$/, '').toLowerCase()
        // An empty folder argument names no folder — match nothing, not the vault root.
        if (target === '') return false
        const own = folder.toLowerCase()
        // Match the folder itself or any descendant path.
        return own === target || own.startsWith(target + '/') || row.path.toLowerCase().startsWith(target + '/')
      },
      hasLink: (target: string) => {
        const needle = linkKey(target)
        // An empty target names no file — match nothing (e.g. `this.file` without a host).
        if (needle === '') return false
        // Links are stored as written (`Tasks`, `Notes/Tasks`), a file reference is a full path
        // (`Notes/Tasks.md`): match the same name, or either one as the path suffix of the other.
        return links.some((l) => {
          const k = linkKey(l)
          return k === needle || k.endsWith('/' + needle) || needle.endsWith('/' + k)
        })
      },
    },
  }
}

/** Evaluate a filter tree against one row's context. */
function matchesFilter(node: BaseFilterNode | undefined, ctx: FormulaContext): boolean {
  if (!node) return true
  if (typeof node === 'string') return evaluateCondition(node, ctx)
  if ('and' in node) return node.and.every((n) => matchesFilter(n, ctx))
  if ('or' in node) return node.or.some((n) => matchesFilter(n, ctx))
  // 'not': none of the children may match.
  return node.not.every((n) => !matchesFilter(n, ctx))
}

// ─── Wire rows → filtered rows ──────────────────────────────────────────────

/**
 * Maps one wire row of the query route to a `BaseRow`: file metadata is folded
 * into `values` under `file.*`. Also builds the host row for `this`.
 */
export function wireRowToBaseRow(r: BaseQueryRowWire, listKeys?: ReadonlySet<string>): BaseRow {
  const values: Record<string, unknown> = { ...r.values }
  if (r.ctime !== undefined) values['file.ctime'] = r.ctime
  if (r.mtime !== undefined) values['file.mtime'] = r.mtime
  if (r.ext !== undefined) values['file.ext'] = r.ext
  if (r.folder !== undefined) values['file.folder'] = r.folder
  if (r.tags !== undefined) values['file.tags'] = r.tags
  if (r.links !== undefined) values['file.links'] = r.links
  if (r.size !== undefined) values['file.size'] = r.size
  if (r.backlinks !== undefined) values['file.backlinks'] = r.backlinks
  return listKeys
    ? { path: r.path, fileName: r.fileName, values, listKeys }
    : { path: r.path, fileName: r.fileName, values }
}

/**
 * Maps the query route's wire rows to `BaseRow`s (file metadata folded into
 * `values` under `file.*`), keeps those passing BOTH the document filter and
 * the view filter, then applies the view `limit`. `total` is the match count
 * before the limit. `truncated` propagates the backend's candidate-cap flag so
 * the view can warn the result may be incomplete. `listKeys` (the backend's
 * vault-wide list-property set) is attached to every row so the engine treats
 * a one-element value for such a key as a list, not a scalar.
 */
export function filterRows(
  wireRows: BaseQueryRowWire[],
  doc: BaseDocument,
  view: BaseView,
  truncated?: boolean,
  listKeys?: readonly string[],
  thisRow?: BaseRow,
): { rows: BaseRow[]; total: number; truncated: boolean } {
  const listKeySet = listKeys && listKeys.length > 0 ? new Set(listKeys) : undefined
  const allRows: BaseRow[] = wireRows.map((r) => wireRowToBaseRow(r, listKeySet))

  const matched = allRows.filter((row) => {
    const ctx = rowContext(row, doc, thisRow)
    return matchesFilter(doc.filters, ctx) && matchesFilter(view.filters, ctx)
  })
  const rows = view.limit !== undefined ? matched.slice(0, view.limit) : matched
  return { rows, total: matched.length, truncated: truncated ?? false }
}

// ─── Formula columns ────────────────────────────────────────────────────────

/**
 * Evaluates one formula column of a base for a row. `formula.other` (or the
 * bare id `other`) inside a formula resolves to that other formula, evaluated
 * on demand; a reference cycle yields an error result instead of recursing.
 */
export function evaluateFormulaColumn(doc: BaseDocument, row: BaseRow, id: string, thisRow?: BaseRow): FormulaResult {
  return evaluateFormulaIn(doc, row, id, new Set(), thisRow)
}

function evaluateFormulaIn(doc: BaseDocument, row: BaseRow, id: string, active: ReadonlySet<string>, thisRow?: BaseRow): FormulaResult {
  const source = doc.formulas?.[id]
  if (source === undefined) return { ok: false, error: `Unknown formula: ${id}` }
  if (active.has(id)) return { ok: false, error: `Formula cycle at: ${id}` }
  return evaluateFormula(source, buildContext(row, doc, new Set(active).add(id), thisRow))
}
