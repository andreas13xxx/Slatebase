import type { GraphNode } from '../types'

/**
 * Removes the path and `.md` extension from a filename, then truncates
 * to 30 characters with a Unicode ellipsis if the result is too long.
 *
 * @param filename - A filename that may include a path (e.g. "folder/file.md")
 * @returns The display label (max 30 chars, or 30 chars + ellipsis if truncated)
 */
export function truncateLabel(filename: string): string {
  // Keep only the last path segment
  const segments = filename.split('/')
  const basename = segments[segments.length - 1] ?? filename

  // Remove .md extension (case-insensitive)
  const label = basename.replace(/\.md$/i, '')

  if (label.length > 30) {
    return label.slice(0, 30) + '\u2026'
  }

  return label
}

/**
 * Clamps the resulting zoom level (currentZoom + delta) to the range [0.1, 5.0].
 *
 * @param currentZoom - The current zoom level
 * @param delta - The zoom delta to apply (positive = zoom in, negative = zoom out)
 * @returns The clamped zoom level within [0.1, 5.0]
 */
export function clampZoom(currentZoom: number, delta: number): number {
  return Math.min(5.0, Math.max(0.1, currentZoom + delta))
}

/**
 * Computes the node radius proportionally between 4px (minimum) and 20px (maximum)
 * based on the number of connections relative to the maximum connections in the graph.
 *
 * @param connections - Number of connections for this node
 * @param maxConnections - Maximum number of connections any node has in the graph
 * @returns The node radius in pixels, between 4 and 20
 */
export function computeNodeSize(connections: number, maxConnections: number): number {
  if (maxConnections === 0) {
    return 4
  }

  const ratio = connections / maxConnections
  return 4 + ratio * (20 - 4)
}

/**
 * Filters graph nodes by case-insensitive substring match on the label field.
 * Returns at most 10 results. An empty query returns an empty array.
 *
 * @param query - The search query string
 * @param nodes - The array of graph nodes to filter
 * @returns Matching nodes (max 10), or empty array if query is empty
 */
export function filterNodes(query: string, nodes: GraphNode[]): GraphNode[] {
  if (query === '') {
    return []
  }

  const lowerQuery = query.toLowerCase()
  const results: GraphNode[] = []

  for (const node of nodes) {
    if (node.label.toLowerCase().includes(lowerQuery)) {
      results.push(node)
      if (results.length >= 10) {
        break
      }
    }
  }

  return results
}
