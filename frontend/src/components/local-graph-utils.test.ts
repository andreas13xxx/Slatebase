import { describe, it, expect } from 'vitest'
import { filterToNeighborhood } from './local-graph-utils'
import type { GraphData, GraphNode, GraphEdge } from '../types'

function node(id: string): GraphNode {
  return { id, type: 'file', path: id, label: id, exists: true }
}

function edge(source: string, target: string): GraphEdge {
  return { source, target, type: 'link' }
}

describe('filterToNeighborhood', () => {
  it('returns only the center node when maxHops is 0', () => {
    const data: GraphData = {
      nodes: [node('A'), node('B')],
      edges: [edge('A', 'B')],
    }
    const result = filterToNeighborhood(data, 'A', 0)
    expect(result.nodes.map((n) => n.id)).toEqual(['A'])
    expect(result.edges).toEqual([])
  })

  it('includes direct neighbors at 1 hop', () => {
    // A - B - C - D (chain)
    const data: GraphData = {
      nodes: [node('A'), node('B'), node('C'), node('D')],
      edges: [edge('A', 'B'), edge('B', 'C'), edge('C', 'D')],
    }
    const result = filterToNeighborhood(data, 'B', 1)
    expect(new Set(result.nodes.map((n) => n.id))).toEqual(new Set(['A', 'B', 'C']))
    expect(result.edges).toHaveLength(2)
  })

  it('expands correctly at 2 and 3 hops', () => {
    const data: GraphData = {
      nodes: [node('A'), node('B'), node('C'), node('D')],
      edges: [edge('A', 'B'), edge('B', 'C'), edge('C', 'D')],
    }
    const result2 = filterToNeighborhood(data, 'A', 2)
    expect(new Set(result2.nodes.map((n) => n.id))).toEqual(new Set(['A', 'B', 'C']))

    const result3 = filterToNeighborhood(data, 'A', 3)
    expect(new Set(result3.nodes.map((n) => n.id))).toEqual(new Set(['A', 'B', 'C', 'D']))
  })

  it('treats edges as undirected for reachability (backlinks count)', () => {
    // Edge direction is C -> A (A is only a target), but from A's perspective
    // this is still a 1-hop neighbor.
    const data: GraphData = {
      nodes: [node('A'), node('C')],
      edges: [edge('C', 'A')],
    }
    const result = filterToNeighborhood(data, 'A', 1)
    expect(new Set(result.nodes.map((n) => n.id))).toEqual(new Set(['A', 'C']))
  })

  it('handles cycles without infinite looping or duplicate nodes', () => {
    // A - B - C - A (triangle)
    const data: GraphData = {
      nodes: [node('A'), node('B'), node('C')],
      edges: [edge('A', 'B'), edge('B', 'C'), edge('C', 'A')],
    }
    const result = filterToNeighborhood(data, 'A', 5)
    expect(result.nodes).toHaveLength(3)
    expect(result.edges).toHaveLength(3)
  })

  it('returns an isolated center node with no edges when it has no connections', () => {
    const data: GraphData = {
      nodes: [node('A'), node('B')],
      edges: [],
    }
    const result = filterToNeighborhood(data, 'A', 2)
    expect(result.nodes.map((n) => n.id)).toEqual(['A'])
    expect(result.edges).toEqual([])
  })

  it('returns an empty result when the center node is absent from the data', () => {
    const data: GraphData = {
      nodes: [node('A'), node('B')],
      edges: [edge('A', 'B')],
    }
    const result = filterToNeighborhood(data, 'ZZZ', 2)
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
  })

  it('only includes edges whose both endpoints survive the hop filter', () => {
    // A - B - C, plus a far node D - E unrelated to A's neighborhood
    const data: GraphData = {
      nodes: [node('A'), node('B'), node('C'), node('D'), node('E')],
      edges: [edge('A', 'B'), edge('B', 'C'), edge('D', 'E')],
    }
    const result = filterToNeighborhood(data, 'A', 1)
    expect(new Set(result.nodes.map((n) => n.id))).toEqual(new Set(['A', 'B']))
    expect(result.edges).toEqual([{ source: 'A', target: 'B', type: 'link' }])
  })
})
