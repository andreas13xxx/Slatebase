import { describe, it, expect } from 'vitest'
import { getCanvasColorClass, getCanvasColorVar, generateCanvasId } from './canvas-utils'

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
