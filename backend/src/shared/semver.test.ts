import { describe, it, expect } from 'vitest'
import { compareSemver } from './semver.js'

describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0)
    expect(compareSemver('2.5.3', '2.5.3')).toBe(0)
  })

  it('returns 1 when a > b', () => {
    expect(compareSemver('2.0.0', '1.0.0')).toBe(1)
    expect(compareSemver('1.1.0', '1.0.0')).toBe(1)
    expect(compareSemver('1.0.1', '1.0.0')).toBe(1)
  })

  it('returns -1 when a < b', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1)
    expect(compareSemver('1.0.0', '1.1.0')).toBe(-1)
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1)
  })

  it('compares numerically, not lexicographically', () => {
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1)
    expect(compareSemver('1.9.9', '2.0.0')).toBe(-1)
    expect(compareSemver('1.10.0', '1.9.0')).toBe(1)
  })

  it('treats missing segments as 0', () => {
    expect(compareSemver('1.0', '1.0.0')).toBe(0)
    expect(compareSemver('1.2', '1.1.9')).toBe(1)
    expect(compareSemver('1', '1.0.1')).toBe(-1)
  })
})
