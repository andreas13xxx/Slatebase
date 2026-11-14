import { describe, it, expect } from 'vitest'
import type { DirectoryTree, GraphData } from '../types'
import { collectCreationTimes, computeVisibleNodeIds, getTimelapseRange } from './graph-timelapse'

const tree: DirectoryTree = {
  name: 'root', path: '', type: 'directory',
  children: [
    { name: 'a.md', path: 'a.md', type: 'file', ctime: 100 },
    { name: 'sub', path: 'sub', type: 'directory', children: [
      { name: 'b.md', path: 'sub/b.md', type: 'file', ctime: 300, mtime: 400 },
      { name: 'c.md', path: 'sub/c.md', type: 'file', mtime: 200 },
    ] },
  ],
}

const graph: GraphData = {
  nodes: [
    { id: 'a.md', type: 'file', path: 'a.md', label: 'a', exists: true },
    { id: 'sub/b.md', type: 'file', path: 'sub/b.md', label: 'b', exists: true },
    { id: 'ghost.md', type: 'file', path: 'ghost.md', label: 'ghost', exists: false },
    { id: 'tag:x', type: 'tag', label: '#x', exists: true },
  ],
  edges: [
    { source: 'a.md', target: 'ghost.md', type: 'link' },
    { source: 'sub/b.md', target: 'tag:x', type: 'tag' },
  ],
}

describe('graph time-lapse', () => {
  it('collects creation times, falling back to mtime', () => {
    const times = collectCreationTimes(tree)
    expect(times.get('a.md')).toBe(100)
    expect(times.get('sub/b.md')).toBe(300)
    expect(times.get('sub/c.md')).toBe(200)
  })

  it('computes the range and handles an empty tree', () => {
    expect(getTimelapseRange(collectCreationTimes(tree))).toEqual({ start: 100, end: 300 })
    expect(getTimelapseRange(new Map())).toBeNull()
  })

  it('shows files from their creation time and linked nodes with them', () => {
    const times = collectCreationTimes(tree)
    expect([...computeVisibleNodeIds(graph, times, 50)]).toEqual([])
    expect([...computeVisibleNodeIds(graph, times, 150)].sort()).toEqual(['a.md', 'ghost.md'])
    expect([...computeVisibleNodeIds(graph, times, 300)].sort()).toEqual(['a.md', 'ghost.md', 'sub/b.md', 'tag:x'])
  })
})
