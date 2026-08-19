import type { GraphData } from '../types'

/**
 * Filters full graph data down to the N-hop neighborhood of a center node.
 * Edges are treated as undirected for reachability purposes — a Backlink
 * counts the same as a Forward_Link when determining hop distance.
 *
 * If `centerNodeId` has no entry in `data.nodes` (e.g. a note with zero
 * links, which never appears as a node in the full-graph response), an
 * empty result is returned — callers are responsible for synthesizing a
 * standalone center node in that case.
 *
 * @param data - The full, unfiltered graph data
 * @param centerNodeId - The graph node id to center the neighborhood on
 * @param maxHops - Maximum number of edges between the center and any included node (>= 0)
 * @returns Nodes within `maxHops` of the center, and edges whose both endpoints survive the filter
 */
export function filterToNeighborhood(data: GraphData, centerNodeId: string, maxHops: number): GraphData {
  const centerExists = data.nodes.some((node) => node.id === centerNodeId)
  if (!centerExists) {
    return { nodes: [], edges: [] }
  }

  // Build an undirected adjacency map from the edge list.
  const adjacency = new Map<string, Set<string>>()
  for (const edge of data.edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set())
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set())
    adjacency.get(edge.source)!.add(edge.target)
    adjacency.get(edge.target)!.add(edge.source)
  }

  // BFS from the center node, stopping at maxHops.
  const visited = new Map<string, number>([[centerNodeId, 0]])
  let frontier = [centerNodeId]
  for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
    const nextFrontier: string[] = []
    for (const nodeId of frontier) {
      for (const neighborId of adjacency.get(nodeId) ?? []) {
        if (!visited.has(neighborId)) {
          visited.set(neighborId, hop + 1)
          nextFrontier.push(neighborId)
        }
      }
    }
    frontier = nextFrontier
  }

  const nodes = data.nodes.filter((node) => visited.has(node.id))
  const edges = data.edges.filter((edge) => visited.has(edge.source) && visited.has(edge.target))

  return { nodes, edges }
}
