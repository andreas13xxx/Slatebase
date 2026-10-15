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
    return true
  }).map((id) => (id.startsWith('note.') ? id.slice('note.'.length) : id))

  const spec: BaseQuerySpecWire = { columns: Array.from(new Set(propertyColumns)) }

  if (view.sort && view.sort.length > 0) {
    const serverSort = view.sort
      .filter((s) => !formulaKeys.has(s.column))
      .map((s) => (s.direction ? { column: s.column, direction: s.direction } : { column: s.column }))
    if (serverSort.length > 0) spec.sort = serverSort
  }
  return spec
}

// ─── Row context + filter evaluation ───────────────────────────────────────────

/**
 * Properties that are always lists in Obsidian. The index hands every property
 * over as a string list, so a one-element list cannot be told from a scalar;
 * these keys are therefore never unwrapped (`tags.contains(..)` must behave the
 * same for one tag and for two).
 */
const LIST_KEYS: ReadonlySet<string> = new Set(['tags', 'aliases', 'cssclasses', 'file.tags', 'file.links'])

/** Converts an index value to an expression value; one-element lists of other properties read as scalars. */
function toExprValue(key: string, v: unknown): FormulaValue {
  if (Array.isArray(v)) {
    if (LIST_KEYS.has(key)) return v as FormulaValue[]
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
export function rowContext(row: BaseRow, doc?: BaseDocument): FormulaContext {
  return buildContext(row, doc, new Set())
}

function buildContext(row: BaseRow, doc: BaseDocument | undefined, active: ReadonlySet<string>): FormulaContext {
  const values = row.values
  const tags = Array.isArray(values['file.tags']) ? (values['file.tags'] as string[]) : []
  const links = Array.isArray(values['file.links']) ? (values['file.links'] as string[]) : []
  const folder = typeof values['file.folder'] === 'string' ? (values['file.folder'] as string) : ''
  return {
    resolve(name: string): FormulaValue {
      const formulaKey = name.startsWith('formula.') ? name.slice('formula.'.length) : name
      if (doc?.formulas && formulaKey in doc.formulas && (name.startsWith('formula.') || !(name in values))) {
        const r = evaluateFormulaIn(doc, row, formulaKey, active)
        if (!r.ok) throw new Error(r.error)
        return r.value
      }
      if (name === 'file.name' || name === 'file.basename') return row.fileName
      if (name === 'file.path') return row.path
      if (name.startsWith('file.')) return toExprValue(name, values[name])
      const key = name.startsWith('note.') ? name.slice('note.'.length) : name
      return toExprValue(key, values[key] ?? values[name])
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
        const needle = target.toLowerCase()
        return links.some((l) => l.toLowerCase() === needle || l.toLowerCase().endsWith('/' + needle))
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
 * Maps the query route's wire rows to `BaseRow`s (file metadata folded into
 * `values` under `file.*`), keeps those passing BOTH the document filter and
 * the view filter, then applies the view `limit`. `total` is the match count
 * before the limit.
 */
export function filterRows(
  wireRows: BaseQueryRowWire[],
  doc: BaseDocument,
  view: BaseView,
): { rows: BaseRow[]; total: number } {
  const allRows: BaseRow[] = wireRows.map((r) => {
    const values: Record<string, unknown> = { ...r.values }
    if (r.ctime !== undefined) values['file.ctime'] = r.ctime
    if (r.mtime !== undefined) values['file.mtime'] = r.mtime
    if (r.ext !== undefined) values['file.ext'] = r.ext
    if (r.folder !== undefined) values['file.folder'] = r.folder
    if (r.tags !== undefined) values['file.tags'] = r.tags
    if (r.links !== undefined) values['file.links'] = r.links
    return { path: r.path, fileName: r.fileName, values }
  })

  const matched = allRows.filter((row) => {
    const ctx = rowContext(row, doc)
    return matchesFilter(doc.filters, ctx) && matchesFilter(view.filters, ctx)
  })
  const rows = view.limit !== undefined ? matched.slice(0, view.limit) : matched
  return { rows, total: matched.length }
}

// ─── Formula columns ────────────────────────────────────────────────────────

/**
 * Evaluates one formula column of a base for a row. `formula.other` (or the
 * bare id `other`) inside a formula resolves to that other formula, evaluated
 * on demand; a reference cycle yields an error result instead of recursing.
 */
export function evaluateFormulaColumn(doc: BaseDocument, row: BaseRow, id: string): FormulaResult {
  return evaluateFormulaIn(doc, row, id, new Set())
}

function evaluateFormulaIn(doc: BaseDocument, row: BaseRow, id: string, active: ReadonlySet<string>): FormulaResult {
  const source = doc.formulas?.[id]
  if (source === undefined) return { ok: false, error: `Unknown formula: ${id}` }
  if (active.has(id)) return { ok: false, error: `Formula cycle at: ${id}` }
  return evaluateFormula(source, buildContext(row, doc, new Set(active).add(id)))
}
