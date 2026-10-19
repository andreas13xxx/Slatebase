/**
 * Bases query engine (frontend) — turns a parsed `BaseDocument` + a chosen view
 * into a backend query, calls the metadata query route, and evaluates the base's
 * filter expressions CLIENT-SIDE against the returned rows.
 *
 * The pure parts (spec construction, row context, filtering) live in
 * `@slatebase/shared-contracts` so the backend MCP `query_base` tool evaluates
 * bases identically. This module only adds the API round-trip. The engine owns
 * no vault state: it reads live from the backend on each run, and callers
 * re-run it on `vault:change`.
 */

import type { IApiClient } from '../api'
import { buildQuerySpec, filterRows } from '@slatebase/shared-contracts'
import type { BaseDocument, BaseRow, BaseView, BaseQuerySpecWire, BaseQueryResultWire } from '@slatebase/shared-contracts'

export { buildQuerySpec, rowContext } from '@slatebase/shared-contracts'

/** Minimal client surface runBaseQuery needs (IApiClient satisfies it). */
type QueryBaseClient = Pick<IApiClient, 'queryBase'> | { queryBase(vaultId: string, spec: BaseQuerySpecWire): Promise<BaseQueryResultWire> }

/** Runs a base query against the backend and maps + filters the result to `BaseRow[]`. */
export async function runBaseQuery(
  apiClient: QueryBaseClient,
  vaultId: string,
  doc: BaseDocument,
  view: BaseView,
): Promise<{ rows: BaseRow[]; total: number; truncated: boolean }> {
  const result = await apiClient.queryBase(vaultId, buildQuerySpec(doc, view))
  return filterRows(result.rows, doc, view, result.truncated, result.listKeys)
}
