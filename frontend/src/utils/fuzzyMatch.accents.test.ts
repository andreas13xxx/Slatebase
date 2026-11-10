import { describe, it, expect } from 'vitest'
import { fuzzyMatch } from './fuzzyMatch'

describe('fuzzyMatch — accent-insensitive (Obsidian 1.15)', () => {
  it('matches "cafe" against "Café Müller"', () => {
    expect(fuzzyMatch('cafe', 'Café Müller')).not.toBeNull()
  })

  it('matches "muller" against "Müller" but not "mueller"', () => {
    expect(fuzzyMatch('muller', 'Müller')).not.toBeNull()
    expect(fuzzyMatch('mueller', 'Müller')).toBeNull()
  })

  it('matches "strasse" against "Straße" and "lodz" against "Łódź"', () => {
    expect(fuzzyMatch('strasse', 'Straße')).not.toBeNull()
    expect(fuzzyMatch('lodz', 'Łódź')).not.toBeNull()
  })

  it('scores an accented hit like its plain-ASCII twin', () => {
    expect(fuzzyMatch('cafe', 'café')).toBe(fuzzyMatch('cafe', 'cafe'))
  })

  it('still rejects non-matching queries', () => {
    expect(fuzzyMatch('xyz', 'café')).toBeNull()
  })
})
