import { describe, it, expect } from 'vitest'
import { distance, midpoint, startPinch, pinchViewport } from './touch-gestures'

const origin = { x: 10, y: 20 }

describe('touch gestures', () => {
  it('measures distance and midpoint', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
    expect(midpoint({ x: 0, y: 0 }, { x: 4, y: 8 })).toEqual({ x: 2, y: 4 })
  })

  it('doubles the zoom when the fingers move twice as far apart', () => {
    const start = startPinch({ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 0, y: 0 }, 1, origin)
    const v = pinchViewport(start, { x: 50, y: 100 }, { x: 250, y: 100 }, origin, 0.1, 4)
    expect(v.zoom).toBeCloseTo(2)
  })

  it('keeps the canvas point under the midpoint fixed', () => {
    const start = startPinch({ x: 100, y: 100 }, { x: 200, y: 140 }, { x: 30, y: -20 }, 1.5, origin)
    const a2 = { x: 80, y: 90 }
    const b2 = { x: 240, y: 170 }
    const v = pinchViewport(start, a2, b2, origin, 0.1, 4)
    const mid = midpoint(a2, b2)
    expect((mid.x - origin.x) / v.zoom - v.x).toBeCloseTo(start.anchor.x)
    expect((mid.y - origin.y) / v.zoom - v.y).toBeCloseTo(start.anchor.y)
  })

  it('clamps the zoom like the wheel does', () => {
    const start = startPinch({ x: 100, y: 0 }, { x: 110, y: 0 }, { x: 0, y: 0 }, 1, origin)
    expect(pinchViewport(start, { x: 0, y: 0 }, { x: 1000, y: 0 }, origin, 0.1, 4).zoom).toBe(4)
    expect(pinchViewport(start, { x: 100, y: 0 }, { x: 100.1, y: 0 }, origin, 0.1, 4).zoom).toBe(0.1)
  })

  it('pans with a two-finger drag at constant distance', () => {
    const start = startPinch({ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 0, y: 0 }, 2, origin)
    const v = pinchViewport(start, { x: 140, y: 100 }, { x: 240, y: 100 }, origin, 0.1, 4)
    expect(v.zoom).toBe(2)
    expect(v.x).toBeCloseTo(20) // 40 px to the right at zoom 2
  })
})
