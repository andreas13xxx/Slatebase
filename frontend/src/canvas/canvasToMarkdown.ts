/**
 * Converts a parsed canvas document into a single flat Markdown document —
 * backs the `canvas:convert-to-file` command. A canvas is a free 2D layout,
 * which has no exact Markdown equivalent, so nodes are linearized in reading
 * order (top-to-bottom, then left-to-right) rather than preserved verbatim by
 * array order or nested by visual group membership (canvas groups are just
 * overlapping boxes, not a real parent/child structure to walk).
 *
 * Edges carry no meaningful flat-text representation and are dropped.
 */
import type { CanvasDocument, CanvasNode } from './types'

function readingOrder(a: CanvasNode, b: CanvasNode): number {
  if (a.y !== b.y) return a.y - b.y
  return a.x - b.x
}

function nodeToMarkdown(node: CanvasNode): string {
  switch (node.type) {
    case 'text':
      return node.text
    case 'file':
      return `![[${node.file}${node.subpath ? `#${node.subpath}` : ''}]]`
    case 'link':
      return `[${node.url}](${node.url})`
    case 'group':
      return `## ${node.label ?? 'Group'}`
  }
}

/** Converts a canvas document into Markdown, one blank-line-separated block per node. */
export function canvasToMarkdown(document: CanvasDocument): string {
  return [...document.nodes]
    .sort(readingOrder)
    .map(nodeToMarkdown)
    .filter((block) => block.trim() !== '')
    .join('\n\n')
}
