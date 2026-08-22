import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useViewportCulling } from './useViewportCulling'
import type { TextNode } from '../../canvas/types'
import type { CanvasViewport } from '../../state/canvasState'

function makeNode(id: string, x: number, y: number, width = 100, height = 100): TextNode {
  return { id, type: 'text', text: id, x, y, width, height }
}

const DEFAULT_VIEWPORT: CanvasViewport = { x: 0, y: 0, zoom: 1 }

describe('useViewportCulling', () => {
  it('returns all nodes unchanged when below the culling threshold (100)', () => {
    const nodes = Array.from({ length: 5 }, (_, i) => makeNode(`n${i}`, i * 10000, 0))
    const { result } = renderHook(() => useViewportCulling(nodes, DEFAULT_VIEWPORT, 800, 600))
    expect(result.current).toEqual(nodes)
  })

  it('filters out nodes far outside the viewport once above the threshold', () => {
    const visible = makeNode('visible', 100, 100)
    const farAway = makeNode('far-away', 100000, 100000)
    const nodes = [visible, farAway, ...Array.from({ length: 100 }, (_, i) => makeNode(`pad${i}`, 100, 100))]

    const { result } = renderHook(() => useViewportCulling(nodes, DEFAULT_VIEWPORT, 800, 600))

    expect(result.current.some(n => n.id === 'visible')).toBe(true)
    expect(result.current.some(n => n.id === 'far-away')).toBe(false)
  })

  it('includes a node just within the culling margin at the viewport edge', () => {
    // Viewport visible area is [0, 800] x [0, 600] in canvas coords at zoom 1, x=y=0.
    // A node just past the right edge but within the 200px margin should still be included.
    const edgeNode = makeNode('edge', 850, 100, 10, 10)
    const nodes = [edgeNode, ...Array.from({ length: 100 }, (_, i) => makeNode(`pad${i}`, 0, 0))]

    const { result } = renderHook(() => useViewportCulling(nodes, DEFAULT_VIEWPORT, 800, 600))

    expect(result.current.some(n => n.id === 'edge')).toBe(true)
  })

  it('accounts for pan offset when determining visibility', () => {
    // Panned viewport: node visible on-screen is now at canvas x = -viewport.x
    const panned: CanvasViewport = { x: -5000, y: 0, zoom: 1 }
    const nowVisible = makeNode('now-visible', 5000, 100)
    const nodes = [nowVisible, ...Array.from({ length: 100 }, (_, i) => makeNode(`pad${i}`, 5000, 100))]

    const { result } = renderHook(() => useViewportCulling(nodes, panned, 800, 600))

    expect(result.current.some(n => n.id === 'now-visible')).toBe(true)
  })

  it('accounts for zoom when determining the visible area', () => {
    // At zoom 0.1, the visible canvas area is much larger (800/0.1 = 8000px wide).
    const zoomedOut: CanvasViewport = { x: 0, y: 0, zoom: 0.1 }
    const farButVisible = makeNode('far-but-visible', 7000, 100)
    const nodes = [farButVisible, ...Array.from({ length: 100 }, (_, i) => makeNode(`pad${i}`, 0, 0))]

    const { result } = renderHook(() => useViewportCulling(nodes, zoomedOut, 800, 600))

    expect(result.current.some(n => n.id === 'far-but-visible')).toBe(true)
  })
})
