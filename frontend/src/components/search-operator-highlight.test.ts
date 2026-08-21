// Unit tests for highlightSearchQuery

import { describe, it, expect } from 'vitest'
import { highlightSearchQuery } from './search-operator-highlight'

describe('highlightSearchQuery', () => {
  it('returns empty array for empty string', () => {
    expect(highlightSearchQuery('')).toEqual([])
  })

  it('returns freetext segment for plain query', () => {
    const result = highlightSearchQuery('hello world')
    expect(result).toEqual([{ text: 'hello world', type: 'freetext' }])
  })

  it('highlights a single tag operator', () => {
    const result = highlightSearchQuery('tag:projekt')
    expect(result).toEqual([
      { text: 'tag:', type: 'operator-keyword' },
      { text: 'projekt', type: 'operator-value' },
    ])
  })

  it('highlights operator with freetext before and after', () => {
    const result = highlightSearchQuery('before tag:test after')
    expect(result).toEqual([
      { text: 'before ', type: 'freetext' },
      { text: 'tag:', type: 'operator-keyword' },
      { text: 'test', type: 'operator-value' },
      { text: ' after', type: 'freetext' },
    ])
  })

  it('highlights negation prefix', () => {
    const result = highlightSearchQuery('-tag:archiv')
    expect(result).toEqual([
      { text: '-', type: 'operator-negation' },
      { text: 'tag:', type: 'operator-keyword' },
      { text: 'archiv', type: 'operator-value' },
    ])
  })

  it('highlights multiple operators', () => {
    const result = highlightSearchQuery('path:A/** tag:b text')
    expect(result).toHaveLength(6)
    expect(result[0]).toEqual({ text: 'path:', type: 'operator-keyword' })
    expect(result[1]).toEqual({ text: 'A/**', type: 'operator-value' })
    expect(result[2]).toEqual({ text: ' ', type: 'freetext' })
    expect(result[3]).toEqual({ text: 'tag:', type: 'operator-keyword' })
    expect(result[4]).toEqual({ text: 'b', type: 'operator-value' })
    expect(result[5]).toEqual({ text: ' text', type: 'freetext' })
  })

  it('highlights property operator with key=value', () => {
    const result = highlightSearchQuery('property:status=done')
    expect(result).toEqual([
      { text: 'property:', type: 'operator-keyword' },
      { text: 'status=done', type: 'operator-value' },
    ])
  })

  it('highlights quoted value', () => {
    const result = highlightSearchQuery('path:"My Folder/**"')
    expect(result).toEqual([
      { text: 'path:', type: 'operator-keyword' },
      { text: '"My Folder/**"', type: 'operator-value' },
    ])
  })

  it('does not highlight unknown operators', () => {
    const result = highlightSearchQuery('http://example.com')
    expect(result).toEqual([{ text: 'http://example.com', type: 'freetext' }])
  })
})
