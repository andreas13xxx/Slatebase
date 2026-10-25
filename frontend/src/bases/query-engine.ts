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
import { buildQuerySpec, buildHostQuerySpec, filterRows, wireRowToBaseRow } from '@slatebase/shared-contracts'
import type { BaseDocument, BaseRow, BaseView, BaseQuerySpecWire, BaseQueryResultWire } from '@slatebase/shared-contracts'

export { buildQuerySpec, rowContext } from '@slatebase/shared-contracts'

/** Minimal client surface runBaseQuery needs (IApiClient satisfies it). */
type QueryBaseClient = Pick<IApiClient, 'queryBase'> | { queryBase(vaultId: string, spec: BaseQuerySpecWire): Promise<BaseQueryResultWire> }

/**
 * Fetches the row of the host note `this` refers to (the note a base is embedded
 * in, or the base file itself). Returns undefined when the base never reads `this`
 * (no query is made) or the host is not in the index — `this.*` then resolves to
 * null, which excludes a row rather than keeping it.
 */
async function fetchHostRow(
  apiClient: QueryBaseClient,
  vaultId: string,
  doc: BaseDocument,
  view: BaseView,
  hostPath: string,
): Promise<BaseRow | undefined> {
  const spec = buildHostQuerySpec(doc, view, hostPath)
  if (spec === null) return undefined
  const result = await apiClient.queryBase(vaultId, spec)
  // The path is a backend glob and may match more than the host: take the exact path.
  const wire = result.rows.find((r) => r.path === hostPath)
  if (!wire) return undefined
  const listKeys = result.listKeys && result.listKeys.length > 0 ? new Set(result.listKeys) : undefined
  return wireRowToBaseRow(wire, listKeys)
}

/**
 * Runs a base query against the backend and maps + filters the result to `BaseRow[]`.
 * `hostPath` is the vault-relative path `this` refers to; omit it when there is no host.
 */
export async function runBaseQuery(
  apiClient: QueryBaseClient,
  vaultId: string,
  doc: BaseDocument,
  view: BaseView,
  hostPath?: string,
): Promise<{ rows: BaseRow[]; total: number; truncated: boolean }> {
  if (hostPath === undefined) {
    // No host: the plain single query, with no extra async hops.
    const result = await apiClient.queryBase(vaultId, buildQuerySpec(doc, view))
    return filterRows(result.rows, doc, view, result.truncated, result.listKeys)
  }
  const [result, thisRow] = await Promise.all([
    apiClient.queryBase(vaultId, buildQuerySpec(doc, view)),
    fetchHostRow(apiClient, vaultId, doc, view, hostPath),
  ])
  return filterRows(result.rows, doc, view, result.truncated, result.listKeys, thisRow)
}
