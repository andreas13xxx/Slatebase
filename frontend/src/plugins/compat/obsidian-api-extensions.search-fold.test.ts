import { describe, it, expect } from 'vitest'
import { prepareFuzzySearch, prepareSimpleSearch } from './obsidian-api-extensions'

describe('prepareFuzzySearch — accent-insensitive (Obsidian 1.15)', () => {
  it('matches "cafe" against "café" and highlights the original characters', () => {
    const result = prepareFuzzySearch('cafe')('café au lait')
    expect(result).not.toBeNull()
    expect(result!.matches).toEqual([[0, 4]].map(([a, b]) => [a, b]))
  })

  it('matches an umlaut against its base letter, but not against "ae"', () => {
    expect(prepareFuzzySearch('apfel')('Äpfel')).not.toBeNull()
    expect(prepareFuzzySearch('aepfel')('Äpfel')).toBeNull()
  })

  it('matches "lodz" against "Łódź" (Obsidian 1.15.1)', () => {
    expect(prepareFuzzySearch('lodz')('Łódź')).not.toBeNull()
  })

  it('maps matches through ß → ss back to the original text', () => {
    const result = prepareFuzzySearch('strasse')('Straße')
    expect(result).not.toBeNull()
    expect(result!.matches).toEqual([[0, 6]])
  })

  it('still returns null when characters are really missing', () => {
    expect(prepareFuzzySearch('xyz')('café')).toBeNull()
  })
})

describe('prepareSimpleSearch — accent-insensitive (Obsidian 1.15)', () => {
  it('matches words ignoring accents and case', () => {
    const result = prepareSimpleSearch('CAFE lait')('café au lait')
    expect(result).not.toBeNull()
    expect(result!.matches).toEqual([[0, 4], [8, 12]])
  })

  it('maps ranges through length-changing folds', () => {
    const result = prepareSimpleSearch('strasse')('Straße')
    expect(result!.matches).toEqual([[0, 6]])
  })

  it('returns null when a word is missing', () => {
    expect(prepareSimpleSearch('cafe tee')('café au lait')).toBeNull()
  })
})
