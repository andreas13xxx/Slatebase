import { describe, it, expect } from 'vitest'
import {
  fuzzySearch,
  sortSearchResults,
  renderMatches,
  renderResults,
  getBlobArrayBuffer,
  setTooltip,
  type SearchResultContainer,
} from './obsidian-api-extensions'

describe('fuzzySearch', () => {
  it('matches characters in order and reports their positions', () => {
    const result = fuzzySearch('abc', 'aXbXc')
    expect(result).not.toBeNull()
    expect(result?.matches).toEqual([[0, 1], [2, 3], [4, 5]])
  })

  it('returns null when not every query character occurs in order', () => {
    expect(fuzzySearch('abc', 'acb')).toBeNull()
  })

  it('is case-insensitive, like Obsidian', () => {
    expect(fuzzySearch('ABC', 'abc')).not.toBeNull()
  })
})

describe('sortSearchResults', () => {
  it('orders results best-scoring first, in place', () => {
    const results: SearchResultContainer[] = [
      { match: { score: 0.1, matches: [] }, item: 'low' },
      { match: { score: 0.9, matches: [] }, item: 'high' },
      { match: { score: 0.5, matches: [] }, item: 'mid' },
    ]
    sortSearchResults(results)
    expect(results.map((r) => r.item)).toEqual(['high', 'mid', 'low'])
  })

  it('treats a missing match as the lowest score instead of throwing', () => {
    const results = [
      { match: undefined, item: 'none' },
      { match: { score: 0.5, matches: [] }, item: 'some' },
    ] as unknown as SearchResultContainer[]
    expect(() => sortSearchResults(results)).not.toThrow()
    expect(results[0]?.item).toBe('some')
  })
})

describe('renderMatches', () => {
  it('wraps matched ranges and leaves the rest as text', () => {
    const el = document.createElement('div')
    renderMatches(el, 'hello world', [[0, 5]])
    expect(el.querySelectorAll('.suggestion-highlight')).toHaveLength(1)
    expect(el.querySelector('.suggestion-highlight')?.textContent).toBe('hello')
    expect(el.textContent).toBe('hello world')
  })

  it('renders plain text when there are no matches', () => {
    const el = document.createElement('div')
    renderMatches(el, 'hello', null)
    expect(el.querySelectorAll('.suggestion-highlight')).toHaveLength(0)
    expect(el.textContent).toBe('hello')
  })

  it('handles several ranges without losing the text between them', () => {
    const el = document.createElement('div')
    renderMatches(el, 'abcdef', [[0, 1], [3, 4]])
    expect(el.textContent).toBe('abcdef')
    expect([...el.querySelectorAll('.suggestion-highlight')].map((n) => n.textContent)).toEqual(['a', 'd'])
  })

  it('skips overlapping or out-of-order ranges rather than scrambling the text', () => {
    const el = document.createElement('div')
    renderMatches(el, 'abcdef', [[2, 4], [0, 1]])
    expect(el.textContent).toBe('abcdef')
  })

  it('applies the offset to every range', () => {
    const el = document.createElement('div')
    renderMatches(el, 'xxabc', [[0, 3]], 2)
    expect(el.querySelector('.suggestion-highlight')?.textContent).toBe('abc')
  })
})

describe('renderResults', () => {
  it('clears previous content before rendering', () => {
    const el = document.createElement('div')
    el.textContent = 'stale'
    renderResults(el, 'fresh', { score: 1, matches: [[0, 1]] })
    expect(el.textContent).toBe('fresh')
  })

  it('renders unhighlighted text for a null result', () => {
    const el = document.createElement('div')
    renderResults(el, 'plain', null)
    expect(el.textContent).toBe('plain')
    expect(el.querySelectorAll('.suggestion-highlight')).toHaveLength(0)
  })
})

describe('getBlobArrayBuffer', () => {
  it('reads the blob contents', async () => {
    const buffer = await getBlobArrayBuffer(new Blob(['hi']))
    expect(new TextDecoder().decode(buffer)).toBe('hi')
  })
})

describe('setTooltip', () => {
  it('sets aria-label, which is what Obsidian renders tooltips from', () => {
    const el = document.createElement('div')
    setTooltip(el, 'Explain')
    expect(el.getAttribute('aria-label')).toBe('Explain')
  })

  it('does not set title — that would show a second, native tooltip', () => {
    const el = document.createElement('div')
    el.title = 'stale native tooltip'
    setTooltip(el, 'Explain')
    expect(el.getAttribute('title')).toBeNull()
  })

  it('records the requested placement', () => {
    const el = document.createElement('div')
    setTooltip(el, 'Explain', { placement: 'right' })
    expect(el.getAttribute('data-tooltip-position')).toBe('right')
  })
})
