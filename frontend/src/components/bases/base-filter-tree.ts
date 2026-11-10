/**
 * Pure helpers for rearranging a `.base` filter tree: reordering inside a
 * group and moving a node between the "this view" and "all views" filters
 * (Obsidian 1.14/1.15). The UI (BasesFilterEditor / BasesToolbar) only calls
 * these; keeping them pure makes the edge cases easy to test.
 */

import type { BaseDocument, BaseFilterNode } from '@slatebase/shared-contracts'
import {
  addFilterChild, childrenOf, groupKeyOf, makeGroup, removeFilterNode, replaceFilterNode,
  rootGroup, setDocFilter, setViewFilter, type FilterPath,
} from './base-edit'

export type FilterScope = 'view' | 'all'

/** The node at `path` (the root for an empty path), or `undefined` if the path does not exist. */
export function nodeAt(root: BaseFilterNode, path: FilterPath): BaseFilterNode | undefined {
  let node: BaseFilterNode = root
  for (const index of path) {
    if (groupKeyOf(node) === null) return undefined
    const child: BaseFilterNode | undefined = childrenOf(node)[index]
    if (child === undefined) return undefined
    node = child
  }
  return node
}

/**
 * Moves the node at `path` to position `toIndex` within the same parent group.
 * `toIndex` is the index in the resulting list and is clamped to its bounds.
 * Returns the tree unchanged for the root, an unknown path, or a no-op move.
 */
export function moveFilterNode(root: BaseFilterNode, path: FilterPath, toIndex: number): BaseFilterNode {
  if (path.length === 0) return root
  const parentPath = path.slice(0, -1)
  const from = path[path.length - 1]!
  const parent = nodeAt(root, parentPath)
  if (parent === undefined) return root
  const key = groupKeyOf(parent)
  if (key === null) return root
  const kids = childrenOf(parent)
  if (from < 0 || from >= kids.length) return root
  const target = Math.max(0, Math.min(kids.length - 1, toIndex))
  if (target === from) return root
  const next = [...kids]
  const [moved] = next.splice(from, 1)
  next.splice(target, 0, moved!)
  return replaceFilterNode(root, parentPath, makeGroup(key, next))
}

/** Moves the node one position up (`-1`) or down (`+1`) inside its group. */
export function nudgeFilterNode(root: BaseFilterNode, path: FilterPath, delta: -1 | 1): BaseFilterNode {
  if (path.length === 0) return root
  return moveFilterNode(root, path, path[path.length - 1]! + delta)
}

/**
 * Moves the filter node at `path` from one scope to the other: from the
 * view's own filter to the shared "all views" filter, or back. The node is
 * appended to the target's root group (a new `and` group if there is none).
 * Empty groups left behind are dropped by the document setters.
 */
export function moveFilterBetweenScopes(
  doc: BaseDocument,
  viewIndex: number,
  from: FilterScope,
  path: FilterPath,
): BaseDocument {
  if (path.length === 0) return doc
  const source = from === 'view' ? doc.views[viewIndex]?.filters : doc.filters
  if (source === undefined) return doc
  const sourceRoot = rootGroup(source)
  const node = nodeAt(sourceRoot, path)
  if (node === undefined) return doc

  const remaining = removeFilterNode(sourceRoot, path)
  const targetFilters = from === 'view' ? doc.filters : doc.views[viewIndex]?.filters
  const withNode = addFilterChild(rootGroup(targetFilters), [], node)

  if (from === 'view') {
    return setDocFilter(setViewFilter(doc, viewIndex, remaining), withNode)
  }
  return setViewFilter(setDocFilter(doc, remaining), viewIndex, withNode)
}
