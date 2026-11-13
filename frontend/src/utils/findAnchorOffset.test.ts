import { describe, it, expect } from 'vitest'
import { findAnchorOffset } from './findAnchorOffset'

const heading = (text: string) => ({ kind: 'heading' as const, text })
const block = (id: string) => ({ kind: 'block' as const, id })

describe('findAnchorOffset — headings', () => {
  const doc = '# Titel\n\nText\n\n## Zweiter Abschnitt ##\n\nMehr\n'

  it('returns the offset of the matching heading line', () => {
    expect(findAnchorOffset(doc, heading('Titel'))).toBe(0)
    expect(findAnchorOffset(doc, heading('Zweiter Abschnitt'))).toBe(doc.indexOf('## Zweiter'))
  })

  it('matches case- and whitespace-insensitively', () => {
    expect(findAnchorOffset(doc, heading('  zweiter   ABSCHNITT '))).toBe(doc.indexOf('## Zweiter'))
  })

  it('returns null when nothing matches', () => {
    expect(findAnchorOffset(doc, heading('Gibt es nicht'))).toBeNull()
  })

  it('falls back to the last segment of a nested anchor', () => {
    expect(findAnchorOffset(doc, heading('Titel#Zweiter Abschnitt'))).toBe(doc.indexOf('## Zweiter'))
  })

  it('prefers the full text over the nested fallback', () => {
    const d = '# B\n\n# A#B\n'
    expect(findAnchorOffset(d, heading('A#B'))).toBe(d.indexOf('# A#B'))
  })

  it('skips frontmatter and fenced code', () => {
    const d = '---\n# not a heading\n---\n\n```md\n# in code\n```\n\n# Echt\n'
    expect(findAnchorOffset(d, heading('not a heading'))).toBeNull()
    expect(findAnchorOffset(d, heading('in code'))).toBeNull()
    expect(findAnchorOffset(d, heading('Echt'))).toBe(d.indexOf('# Echt'))
  })

  it('handles a longer closing fence and CRLF', () => {
    const d = '````\n```\n# no\n````\r\n# Yes\r\n'
    expect(findAnchorOffset(d, heading('no'))).toBeNull()
    expect(findAnchorOffset(d, heading('Yes'))).toBe(d.indexOf('# Yes'))
  })

  it('does not treat a #tag as a heading', () => {
    expect(findAnchorOffset('#tag\n', heading('tag'))).toBeNull()
  })
})

describe('findAnchorOffset — blocks', () => {
  it('finds the line ending with the block id', () => {
    const d = 'Absatz eins\n\nAbsatz zwei ^abc-1\n\nDrei\n'
    expect(findAnchorOffset(d, block('abc-1'))).toBe(d.indexOf('Absatz zwei'))
  })

  it('finds a standalone block id line', () => {
    const d = '- a\n- b\n\n^lst\n'
    expect(findAnchorOffset(d, block('lst'))).toBe(d.indexOf('^lst'))
  })

  it('does not match a longer id or a mid-line caret', () => {
    expect(findAnchorOffset('text ^abc-12\n', block('abc-1'))).toBeNull()
    expect(findAnchorOffset('a ^abc-1 b\n', block('abc-1'))).toBeNull()
  })

  it('skips fenced code', () => {
    expect(findAnchorOffset('```\nx ^id1\n```\n', block('id1'))).toBeNull()
  })
})
