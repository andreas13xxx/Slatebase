import { describe, it, expect } from 'vitest'
import { getInitials, colorFromName, readableTextColor } from './userAvatarUtils'

describe('getInitials', () => {
  it('takes the first letter of the first two words', () => {
    expect(getInitials('Andreas Müller')).toBe('AM')
    expect(getInitials('john   doe')).toBe('JD')
  })

  it('takes the first two chars of a single word', () => {
    expect(getInitials('admin')).toBe('AD')
    expect(getInitials('x')).toBe('X')
  })

  it('falls back to ? for empty/whitespace input', () => {
    expect(getInitials('')).toBe('?')
    expect(getInitials('   ')).toBe('?')
  })
})

describe('colorFromName', () => {
  it('is deterministic for the same name', () => {
    expect(colorFromName('andreas')).toBe(colorFromName('andreas'))
  })

  it('returns a #rrggbb colour from the palette', () => {
    expect(colorFromName('somebody')).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('does not always return the same colour across different names', () => {
    const colors = new Set(
      ['alice', 'bob', 'carol', 'dave', 'erin', 'frank'].map(colorFromName),
    )
    expect(colors.size).toBeGreaterThan(1)
  })
})

describe('readableTextColor', () => {
  it('returns black on a light background', () => {
    expect(readableTextColor('#ffffff')).toBe('#000000')
    expect(readableTextColor('#f3a712')).toBe('#000000')
  })

  it('returns white on a dark background', () => {
    expect(readableTextColor('#000000')).toBe('#ffffff')
    expect(readableTextColor('#3d5a80')).toBe('#ffffff')
  })

  it('falls back to white for a malformed colour', () => {
    expect(readableTextColor('nope')).toBe('#ffffff')
    expect(readableTextColor('#fff')).toBe('#ffffff')
  })
})
