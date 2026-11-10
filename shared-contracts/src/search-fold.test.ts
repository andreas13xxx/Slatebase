import { describe, it, expect } from 'vitest'
import { foldForSearch, foldQuery, toOriginalRange, mergeRanges } from './search-fold.js'

describe('foldForSearch', () => {
  it('lowercases ASCII and keeps positions identical (fast path)', () => {
    expect(foldForSearch('Hello World')).toEqual({ text: 'hello world', map: null })
  })

  it('strips accents', () => {
    expect(foldQuery('café')).toBe('cafe')
    expect(foldQuery('Crème Brûlée')).toBe('creme brulee')
  })

  it('folds German umlauts to the base letter, not to ae/oe/ue', () => {
    expect(foldQuery('Äpfel')).toBe('apfel')
    expect(foldQuery('Müller')).toBe('muller')
    expect(foldQuery('Öl')).toBe('ol')
  })

  it.each([
    ['ø', 'o'],
    ['ł', 'l'],
    ['đ', 'd'],
    ['ð', 'd'],
    ['ħ', 'h'],
    ['ı', 'i'],
    ['ß', 'ss'],
    ['æ', 'ae'],
    ['œ', 'oe'],
    ['þ', 'th'],
  ])('folds %s to %s', (from, to) => {
    expect(foldQuery(from)).toBe(to)
  })

  it('handles the examples from the Obsidian 1.15.1 changelog', () => {
    expect(foldQuery('Łódź')).toBe('lodz')
    expect(foldQuery('Straße')).toBe('strasse')
  })

  it('handles empty strings and astral characters', () => {
    expect(foldForSearch('')).toEqual({ text: '', map: null })
    expect(foldQuery('a😀b é')).toBe('a😀b e')
  })
})

describe('toOriginalRange', () => {
  it('returns the same range when nothing changed length', () => {
    const folded = foldForSearch('Hello')
    expect(toOriginalRange(folded, 'Hello', 1, 3)).toEqual([1, 3])
  })

  it('maps through a length-changing replacement (ß → ss)', () => {
    const original = 'Straße'
    const folded = foldForSearch(original) // "strasse"
    const at = folded.text.indexOf('ss')
    expect(toOriginalRange(folded, original, at, at + 2)).toEqual([4, 5]) // just "ß"
    expect(toOriginalRange(folded, original, 0, 5)).toEqual([0, 5]) // "stra" + first s of ß
  })

  it('maps accents 1:1', () => {
    const original = 'café au lait'
    const folded = foldForSearch(original)
    const at = folded.text.indexOf('au')
    expect(toOriginalRange(folded, original, at, at + 2)).toEqual([5, 7])
  })

  it('keeps astral code points whole', () => {
    const original = 'é😀'
    const folded = foldForSearch(original)
    expect(toOriginalRange(folded, original, 1, 3)).toEqual([1, 3])
  })
})

describe('mergeRanges', () => {
  it('merges touching and overlapping ranges', () => {
    expect(mergeRanges([[0, 2], [2, 4], [6, 7], [6, 9]])).toEqual([[0, 4], [6, 9]])
  })
})
