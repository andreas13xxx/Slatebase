/**
 * Bases serializer — converts a typed `BaseDocument` back to an
 * Obsidian-compatible `.base` YAML string. Preserves unknown fields for
 * round-trip compatibility and emits a stable key order for minimal Git diffs.
 */

import { stringify as stringifyYaml } from 'yaml'
import type {
  BaseColumnMeta,
  BaseDocument,
  BaseFilterAnd,
  BaseFilterNot,
  BaseFilterNode,
  BaseFilterOr,
  BaseGroupBy,
  BaseSortClause,
  BaseView,
} from './types'

function mergeUnknown(target: Record<string, unknown>, unknown: Record<string, unknown> | undefined): void {
  if (!unknown) return
  for (const [key, value] of Object.entries(unknown)) {
    target[key] = value
  }
}

function isAnd(node: BaseFilterNode): node is BaseFilterAnd {
  return typeof node === 'object' && (node as BaseFilterAnd).and !== undefined
}

function isOr(node: BaseFilterNode): node is BaseFilterOr {
  return typeof node === 'object' && (node as BaseFilterOr).or !== undefined
}

function isNot(node: BaseFilterNode): node is BaseFilterNot {
  return typeof node === 'object' && (node as BaseFilterNot).not !== undefined
}

/** A filter node serializes to a string (leaf) or an and/or/not group object. */
function serializeFilterNode(node: BaseFilterNode): string | Record<string, unknown> {
  if (typeof node === 'string') return node
  if (isAnd(node)) return { and: node.and.map(serializeFilterNode) }
  if (isOr(node)) return { or: node.or.map(serializeFilterNode) }
  if (isNot(node)) return { not: node.not.map(serializeFilterNode) }
  return {}
}

function serializeColumnMeta(meta: BaseColumnMeta): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (meta.displayName !== undefined) out['displayName'] = meta.displayName
  mergeUnknown(out, meta._unknown)
  return out
}

function serializeSort(clauses: BaseSortClause[]): Record<string, unknown>[] {
  return clauses.map((c) => {
    const out: Record<string, unknown> = { column: c.column }
    if (c.direction !== undefined) out['direction'] = c.direction
    return out
  })
}

function serializeGroupBy(group: BaseGroupBy): Record<string, unknown> {
  const out: Record<string, unknown> = { property: group.property }
  if (group.direction !== undefined) out['direction'] = group.direction
  return out
}

function serializeView(view: BaseView): Record<string, unknown> {
  const out: Record<string, unknown> = { type: view.type }
  if (view.name !== undefined) out['name'] = view.name
  if (view.order !== undefined) out['order'] = view.order
  if (view.sort !== undefined) out['sort'] = serializeSort(view.sort)
  if (view.groupBy !== undefined) out['groupBy'] = serializeGroupBy(view.groupBy)
  if (view.filters !== undefined) out['filters'] = serializeFilterNode(view.filters)
  if (view.limit !== undefined) out['limit'] = view.limit
  if (view.summaries !== undefined) out['summaries'] = { ...view.summaries }
  mergeUnknown(out, view._unknown)
  return out
}

/**
 * Serializes a `BaseDocument` to an Obsidian-compatible `.base` YAML string.
 *
 * - Stable top-level key order: filters, formulas, properties, summaries, views
 * - Preserves unknown fields from the original document
 */
export function serializeBase(doc: BaseDocument): string {
  const out: Record<string, unknown> = {}

  if (doc.filters !== undefined) out['filters'] = serializeFilterNode(doc.filters)
  if (doc.formulas !== undefined) out['formulas'] = { ...doc.formulas }

  if (doc.properties !== undefined) {
    const props: Record<string, unknown> = {}
    for (const [key, meta] of Object.entries(doc.properties)) {
      props[key] = serializeColumnMeta(meta)
    }
    out['properties'] = props
  }

  if (doc.summaries !== undefined) out['summaries'] = { ...doc.summaries }

  out['views'] = doc.views.map(serializeView)

  mergeUnknown(out, doc._unknown)

  return stringifyYaml(out)
}
