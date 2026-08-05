import { describe, it, expect } from 'vitest'
import { placeHoverPreview } from './hover-preview-position'

const VIEWPORT = { width: 1200, height: 800 }
const POPOVER = { width: 420, height: 300 }
const anchor = (top: number, left: number) => ({ top, left, width: 100, height: 20 })

describe('placeHoverPreview', () => {
  it('places the popover below a link with room underneath', () => {
    const p = placeHoverPreview(anchor(100, 200), POPOVER, VIEWPORT)

    expect(p.side).toBe('below')
    expect(p.top).toBe(128) // 100 + 20 + gap
    expect(p.left).toBe(200)
  })

  it('flips above when there is no room below', () => {
    const p = placeHoverPreview(anchor(700, 200), POPOVER, VIEWPORT)

    expect(p.side).toBe('above')
    expect(p.top).toBe(700 - 300 - 8)
  })

  it('stays below when neither side fits but below has more room', () => {
    const tall = { width: 420, height: 700 }
    const p = placeHoverPreview(anchor(200, 100), tall, VIEWPORT)

    expect(p.side).toBe('below')
  })

  it('chooses above when neither side fits but above has more room', () => {
    const tall = { width: 420, height: 700 }
    const p = placeHoverPreview(anchor(600, 100), tall, VIEWPORT)

    expect(p.side).toBe('above')
  })

  describe('horizontal clamping', () => {
    it('pulls the popover back inside the right edge', () => {
      const p = placeHoverPreview(anchor(100, 1100), POPOVER, VIEWPORT)

      expect(p.left).toBe(VIEWPORT.width - POPOVER.width - 8)
      expect(p.left + POPOVER.width).toBeLessThanOrEqual(VIEWPORT.width)
    })

    it('keeps a margin at the left edge', () => {
      const p = placeHoverPreview(anchor(100, 0), POPOVER, VIEWPORT)

      expect(p.left).toBeGreaterThanOrEqual(8)
    })

    it('still yields a non-negative left when the popover is wider than the viewport', () => {
      const wide = { width: 2000, height: 200 }
      const p = placeHoverPreview(anchor(100, 50), wide, { width: 400, height: 800 })

      expect(p.left).toBeGreaterThanOrEqual(0)
    })
  })

  it('never positions the popover above the top edge', () => {
    const p = placeHoverPreview(anchor(10, 100), POPOVER, VIEWPORT)

    expect(p.top).toBeGreaterThanOrEqual(8)
  })
})
