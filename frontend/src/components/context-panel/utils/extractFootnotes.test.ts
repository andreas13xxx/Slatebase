import { describe, it, expect } from 'vitest'
import { extractFootnotes } from './extractFootnotes'

describe('extractFootnotes', () => {
  it('returns an empty array for content without footnotes', () => {
    expect(extractFootnotes('# Title\n\nJust prose.')).toEqual([])
  })

  it('numbers footnotes by reference order, not definition order', () => {
    const md = [
      'See the second claim[^b] and the first one[^a].',
      '',
      '[^a]: First definition.',
      '[^b]: Second definition.',
    ].join('\n')

    const result = extractFootnotes(md)
    expect(result.map((f) => f.identifier)).toEqual(['b', 'a'])
    expect(result.map((f) => f.number)).toEqual([1, 2])
    expect(result[0]!.text).toBe('Second definition.')
  })

  it('counts repeated references', () => {
    const md = 'A[^x] and again[^x].\n\n[^x]: Shared note.'
    const result = extractFootnotes(md)
    expect(result).toHaveLength(1)
    expect(result[0]!.refCount).toBe(2)
    expect(result[0]!.referenced).toBe(true)
  })

  it('lists an unreferenced definition after referenced ones and flags it', () => {
    const md = [
      'Only this one is used[^used].',
      '',
      '[^used]: Used note.',
      '[^orphan]: Nobody points here.',
    ].join('\n')

    const result = extractFootnotes(md)
    expect(result.map((f) => f.identifier)).toEqual(['used', 'orphan'])
    expect(result.find((f) => f.identifier === 'orphan')!.referenced).toBe(false)
    expect(result.find((f) => f.identifier === 'orphan')!.refCount).toBe(0)
  })

  it('ignores footnote-like tokens inside fenced code blocks', () => {
    const md = [
      'Real reference[^real].',
      '',
      '```',
      'not a reference[^fake]',
      '[^fake]: not a definition',
      '```',
      '',
      '[^real]: The real one.',
    ].join('\n')

    const result = extractFootnotes(md)
    expect(result.map((f) => f.identifier)).toEqual(['real'])
  })

  it('strips inline formatting from the definition preview', () => {
    const md = 'Ref[^f].\n\n[^f]: A **bold** and *italic* note.'
    const result = extractFootnotes(md)
    expect(result[0]!.text).toBe('A bold and italic note.')
  })

  it('uses the first-reference anchor for navigation', () => {
    const md = 'Ref[^q].\n\n[^q]: Note.'
    const result = extractFootnotes(md)
    expect(result[0]!.anchor).toBe('fnref-q')
  })

  it('handles CRLF line endings', () => {
    const md = 'Ref[^c].\r\n\r\n[^c]: Windows note.'
    const result = extractFootnotes(md)
    expect(result).toHaveLength(1)
    expect(result[0]!.text).toBe('Windows note.')
  })
})
