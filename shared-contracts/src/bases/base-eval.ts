/**
 * Pure Bases evaluation — everything that turns a parsed `BaseDocument` plus
 * candidate rows into filtered rows, without any I/O.
 *
 * Shared by the frontend (client-side filtering of the rows the query route
 * returns) and the backend MCP `query_base` tool, so both sides evaluate the
 * Obsidian expression language identically.
 */

import type { BaseDocument, BaseFilterNode, BaseRow, BaseView, BaseQuerySpecWire, BaseQueryRowWire } from './types.js'
import { evaluateCondition, evaluateFormula } from './formula/evaluator.js'
import type { FormulaContext, FormulaResult } from './formula/evaluator.js'
import type { FormulaValue } from './formula/functions.js'

// ─── Filter column collection ──────────────────────────────────────────────────

/** Pull every bare word that looks like a property reference out of an expression. */
function collectRefsFromExpression(expr: string, into: Set<string>): void {
  // Match identifiers incl. dotted paths; skip quoted string contents.
  const withoutStrings = expr.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, ' ')
  const idRe = /[A-Za-z_][A-Za-z0-9_.]*/g
  let m: RegExpExecArray | null
  while ((m = idRe.exec(withoutStrings)) !== null) {
    const id = m[0]
    // Skip the common function/global names + boolean literals.
    if (['true', 'false', 'if', 'and', 'or', 'not', 'date', 'now', 'today', 'concat', 'number', 'list', 'link', 'min', 'max', 'days', 'length'].includes(id)) continue
    into.add(id)
  }
}

/** Walk a filter tree collecting every referenced property column. */
function collectFilterRefs(node: BaseFilterNode | undefined, into: Set<string>): void {
  if (!node) return
  if (typeof node === 'string') { collectRefsFromExpression(node, into); return }
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

  const propertyColumns = Array.from(wanted).filter((id) => {
    if (formulaKeys.has(id)) return false
    if (id.startsWith('file.')) return false
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

/** First scalar of a string-list value, as the expression engine wants it. */
function firstScalar(v: unknown): FormulaValue {
  if (Array.isArray(v)) {
    if (v.length === 0) return null
    if (v.length === 1) return v[0] as FormulaValue
    return v as FormulaValue[]
  }
  return (v as FormulaValue) ?? null
}

/**
 * Builds the expression `FormulaContext` for one row, resolving the Obsidian
 * property prefixes: `file.*` → file metadata, `note.`/bare → frontmatter,
 * `formula.x` → another formula (evaluated lazily, cycle-guarded by the caller).
 */
export function rowContext(row: BaseRow): FormulaContext {
  const values = row.values
  const tags = Array.isArray(values['file.tags']) ? (values['file.tags'] as string[]) : []
  const links = Array.isArray(values['file.links']) ? (values['file.links'] as string[]) : []
  const folder = typeof values['file.folder'] === 'string' ? (values['file.folder'] as string) : ''
  return {
    resolve(name: string): FormulaValue {
      if (name === 'file.name') return row.fileName
      if (name.startsWith('file.')) return firstScalar(values[name])
      const key = name.startsWith('note.') ? name.slice('note.'.length) : name
      return firstScalar(values[key] ?? values[name])
    },
    fileApi: {
      hasTag: (tag: string) => {
        const needle = tag.replace(/^#/, '').toLowerCase()
        return tags.some((t) => t.replace(/^#/, '').toLowerCase() === needle)
      },
      inFolder: (f: string) => {
        const target = f.replace(/\/+$/, '').toLowerCase()
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
    const ctx = rowContext(row)
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
export function evaluateFormulaColumn(
  doc: BaseDocument,
  row: BaseRow,
  id: string,
  active: ReadonlySet<string> = new Set(),
): FormulaResult {
  const source = doc.formulas?.[id]
  if (source === undefined) return { ok: false, error: `Unknown formula: ${id}` }
  if (active.has(id)) return { ok: false, error: `Formula cycle at: ${id}` }

  const base = rowContext(row)
  const nextActive = new Set(active).add(id)
  const ctx: FormulaContext = {
    ...base,
    resolve(name: string): FormulaValue {
      const key = name.startsWith('formula.') ? name.slice('formula.'.length) : name
      if (doc.formulas && key in doc.formulas && (name.startsWith('formula.') || !(name in row.values))) {
        const r = evaluateFormulaColumn(doc, row, key, nextActive)
        if (!r.ok) throw new Error(r.error)
        return r.value
      }
      return base.resolve(name)
    },
  }
  return evaluateFormula(source, ctx)
}
