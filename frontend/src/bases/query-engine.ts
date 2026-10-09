/**
 * Bases query engine (frontend) — turns a parsed `BaseDocument` + a chosen view
 * into a backend query, calls the metadata query route, and returns table rows.
 *
 * The engine owns no vault state: it reads live from the backend's link index
 * on each run, and callers re-run it on a `vault:change` event (via the shared
 * realtime bridge) so a base refreshes when notes change — see `BasesView`.
 */

import type { IApiClient } from '../api'
import type { BaseDocument, BaseRow, BaseView, BaseQuerySpecWire } from './types'

// ─── Spec construction ────────────────────────────────────────────────────────

/**
 * Builds a backend query spec from a base document and the view being rendered.
 *
 * - Columns are the view's explicit `order`, falling back to the document's
 *   declared property keys. Formula columns (`doc.formulas` keys) are dropped —
 *   they are evaluated client-side, not fetched.
 * - `file.*` pseudo-columns stay in the sort/order but are not requested as
 *   property values (the backend derives them).
 */
export function buildQuerySpec(doc: BaseDocument, view: BaseView): BaseQuerySpecWire {
  const formulaKeys = new Set(Object.keys(doc.formulas ?? {}))

  const columnIds = view.order ?? Object.keys(doc.properties ?? {})
  const propertyColumns = columnIds.filter((id) => !id.startsWith('file.') && !formulaKeys.has(id))

  const spec: BaseQuerySpecWire = { columns: propertyColumns }
  if (doc.filters) spec.filters = doc.filters
  if (view.sort && view.sort.length > 0) {
    // A sort on a formula column can't be pushed to the backend; drop it there
    // (client-side formula sort is a later refinement).
    const serverSort = view.sort
      .filter((s) => !formulaKeys.has(s.column))
      .map((s) => (s.direction ? { column: s.column, direction: s.direction } : { column: s.column }))
    if (serverSort.length > 0) spec.sort = serverSort
  }
  return spec
}

// ─── Execution ──────────────────────────────────────────────────────────────

/** Runs a base query against the backend and maps the result to `BaseRow[]`. */
export async function runBaseQuery(
  apiClient: IApiClient,
  vaultId: string,
  doc: BaseDocument,
  view: BaseView,
): Promise<{ rows: BaseRow[]; total: number }> {
  const spec = buildQuerySpec(doc, view)
  const result = await apiClient.queryBase(vaultId, spec)
  const rows: BaseRow[] = result.rows.map((r) => {
    const values: Record<string, unknown> = { ...r.values }
    if (r.ctime !== undefined) values['file.ctime'] = r.ctime
    if (r.mtime !== undefined) values['file.mtime'] = r.mtime
    return { path: r.path, fileName: r.fileName, values }
  })
  return { rows, total: result.total }
}
