import { describe, it, expect } from 'vitest'
import { getCanvasColorClass, getCanvasColorVar, generateCanvasId, computeFitViewport, computeContentBounds } from './canvas-utils'
import type { TextNode } from '../../canvas/types'

function textNode(overrides: Partial<TextNode> = {}): TextNode {
  return { id: 'n1', type: 'text', text: '', x: 0, y: 0, width: 100, height: 50, ...overrides }
}

describe('getCanvasColorClass', () => {
  it('returns the empty string for undefined', () => {
    expect(getCanvasColorClass(undefined)).toBe('')
  })

  it('returns the empty string for an empty string', () => {
    expect(getCanvasColorClass('')).toBe('')
  })

  it.each([
    ['1', 'canvas-color-1'],
    ['2', 'canvas-color-2'],
    ['3', 'canvas-color-3'],
    ['4', 'canvas-color-4'],
    ['5', 'canvas-color-5'],
    ['6', 'canvas-color-6'],
  ])('maps numbered color %s to %s', (input, expected) => {
    expect(getCanvasColorClass(input)).toBe(expected)
  })

  it('returns the empty string for a hex color (applied via inline style instead)', () => {
    expect(getCanvasColorClass('#ff0000')).toBe('')
  })
})

describe('getCanvasColorVar', () => {
  it('returns undefined for undefined', () => {
    expect(getCanvasColorVar(undefined)).toBeUndefined()
  })

  it.each([
    ['1', 'var(--canvas-color-1)'],
    ['6', 'var(--canvas-color-6)'],
  ])('maps numbered color %s to a CSS variable', (input, expected) => {
    expect(getCanvasColorVar(input)).toBe(expected)
  })

  it('returns the hex value as-is when it starts with #', () => {
    expect(getCanvasColorVar('#00ff00')).toBe('#00ff00')
  })

  it('returns undefined for an unrecognized non-hex value', () => {
    expect(getCanvasColorVar('not-a-color')).toBeUndefined()
  })
})

describe('generateCanvasId', () => {
  it('generates a 16-character alphanumeric id with no hyphens', () => {
    const id = generateCanvasId()
    expect(id).toHaveLength(16)
    expect(id).not.toContain('-')
  })

  it('generates unique ids on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateCanvasId()))
    expect(ids.size).toBe(20)
  })
})

describe('computeFitViewport', () => {
  it('centers the bounds in the viewport at 100% zoom when it already fits with padding', () => {
    // 100x100 content, 50px padding each side -> 200x200 needed; 400x400 rect has plenty of room, so zoom caps at 1.
    const result = computeFitViewport({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, { width: 400, height: 400 }, 50, 0.1)
    expect(result.zoom).toBe(1)
    expect(result.x).toBe(150) // -50 (centerX) + 400/2
    expect(result.y).toBe(150)
  })

  it('zooms out (never in) to fit bounds larger than the viewport', () => {
    const result = computeFitViewport({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 }, { width: 500, height: 500 }, 0, 0.1)
    expect(result.zoom).toBe(0.5)
  })

  it('clamps zoom to minZoom for extremely large bounds', () => {
    const result = computeFitViewport({ minX: 0, minY: 0, maxX: 100000, maxY: 100000 }, { width: 500, height: 500 }, 0, 0.1)
    expect(result.zoom).toBe(0.1)
  })

  it('never zooms in past 100% for bounds smaller than the viewport', () => {
    const result = computeFitViewport({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { width: 500, height: 500 }, 0, 0.1)
    expect(result.zoom).toBe(1)
  })
})

describe('computeContentBounds', () => {
  it('returns null for an empty node list', () => {
    expect(computeContentBounds([])).toBeNull()
  })

  it("spans a single node's own rectangle", () => {
    const bounds = computeContentBounds([textNode({ x: 10, y: 20, width: 100, height: 50 })])
    expect(bounds).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70 })
  })

  it('spans the union of multiple nodes, including negative coordinates', () => {
    const bounds = computeContentBounds([
      textNode({ id: 'a', x: -50, y: 0, width: 100, height: 100 }),
      textNode({ id: 'b', x: 200, y: 300, width: 50, height: 50 }),
    ])
    expect(bounds).toEqual({ minX: -50, minY: 0, maxX: 250, maxY: 350 })
  })
})
