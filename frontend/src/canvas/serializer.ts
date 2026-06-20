/**
 * Canvas serializer — converts internal CanvasDocument back to Obsidian-compatible JSON.
 * Preserves unknown properties for round-trip compatibility.
 * Uses stable key ordering for minimal Git diffs.
 */

import type { CanvasDocument, CanvasNode, CanvasEdge } from './types'

/**
 * Serializes a node to a plain object with stable key ordering.
 */
function serializeNode(node: CanvasNode): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: node.id,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }

  if (node.color !== undefined) {
    base['color'] = node.color
  }

  switch (node.type) {
    case 'text':
      base['text'] = node.text
      break
    case 'file':
      base['file'] = node.file
      if (node.subpath !== undefined) {
        base['subpath'] = node.subpath
      }
      break
    case 'link':
      base['url'] = node.url
      break
    case 'group':
      if (node.label !== undefined) {
        base['label'] = node.label
      }
      if (node.background !== undefined) {
        base['background'] = node.background
      }
      if (node.backgroundStyle !== undefined) {
        base['backgroundStyle'] = node.backgroundStyle
      }
      break
  }

  // Merge unknown properties (preserves round-trip for future Obsidian fields)
  if (node._unknown) {
    for (const [key, value] of Object.entries(node._unknown)) {
      base[key] = value
    }
  }

  return base
}

/**
 * Serializes an edge to a plain object with stable key ordering.
 */
function serializeEdge(edge: CanvasEdge): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: edge.id,
    fromNode: edge.fromNode,
    fromSide: edge.fromSide,
  }

  if (edge.fromEnd !== undefined) {
    result['fromEnd'] = edge.fromEnd
  }

  result['toNode'] = edge.toNode
  result['toSide'] = edge.toSide

  if (edge.toEnd !== undefined) {
    result['toEnd'] = edge.toEnd
  }

  if (edge.color !== undefined) {
    result['color'] = edge.color
  }

  if (edge.label !== undefined) {
    result['label'] = edge.label
  }

  // Merge unknown properties
  if (edge._unknown) {
    for (const [key, value] of Object.entries(edge._unknown)) {
      result[key] = value
    }
  }

  return result
}

/**
 * Serializes a CanvasDocument to an Obsidian-compatible JSON string.
 *
 * - Maintains stable key ordering for minimal Git diffs
 * - Preserves unknown properties from the original document
 * - Produces valid Obsidian .canvas format
 */
export function serializeCanvas(doc: CanvasDocument): string {
  const output: Record<string, unknown> = {
    nodes: doc.nodes.map(serializeNode),
    edges: doc.edges.map(serializeEdge),
  }

  // Merge unknown top-level properties
  if (doc._unknown) {
    for (const [key, value] of Object.entries(doc._unknown)) {
      output[key] = value
    }
  }

  // Use 2-space indentation matching Obsidian's format
  return JSON.stringify(output, null, '\t')
}
