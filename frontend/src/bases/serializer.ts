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
  BaseFilterCondition,
  BaseFilterNode,
  BaseFilterOr,
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
  return (node as BaseFilterAnd).and !== undefined
}

function isOr(node: BaseFilterNode): node is BaseFilterOr {
  return (node as BaseFilterOr).or !== undefined
}

function serializeCondition(c: BaseFilterCondition): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (c.property !== undefined) out['property'] = c.property
  if (c.tag !== undefined) out['tag'] = c.tag
  if (c.path !== undefined) out['path'] = c.path
  if (c.file !== undefined) out['file'] = c.file
  if (c.op !== undefined) out['op'] = c.op
  if (c.value !== undefined) out['value'] = c.value
  if (c.not !== undefined) out['not'] = c.not
  mergeUnknown(out, c._unknown)
  return out
}

function serializeFilterNode(node: BaseFilterNode): Record<string, unknown> {
  if (isAnd(node)) {
    return { and: node.and.map(serializeFilterNode) }
  }
  if (isOr(node)) {
    return { or: node.or.map(serializeFilterNode) }
  }
  return serializeCondition(node)
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

function serializeView(view: BaseView): Record<string, unknown> {
  const out: Record<string, unknown> = { type: view.type }
  if (view.name !== undefined) out['name'] = view.name
  if (view.order !== undefined) out['order'] = view.order
  if (view.sort !== undefined) out['sort'] = serializeSort(view.sort)
  mergeUnknown(out, view._unknown)
  return out
}

/**
 * Serializes a `BaseDocument` to an Obsidian-compatible `.base` YAML string.
 *
 * - Stable top-level key order: filters, formulas, properties, views
 * - Preserves unknown fields from the original document
 */
export function serializeBase(doc: BaseDocument): string {
  const out: Record<string, unknown> = {}

  if (doc.filters !== undefined) out['filters'] = serializeFilterNode(doc.filters)

  if (doc.formulas !== undefined) {
    out['formulas'] = { ...doc.formulas }
  }

  if (doc.properties !== undefined) {
    const props: Record<string, unknown> = {}
    for (const [key, meta] of Object.entries(doc.properties)) {
      props[key] = serializeColumnMeta(meta)
    }
    out['properties'] = props
  }

  out['views'] = doc.views.map(serializeView)

  mergeUnknown(out, doc._unknown)

  return stringifyYaml(out)
}
