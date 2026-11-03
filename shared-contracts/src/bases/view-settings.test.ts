import { describe, it, expect } from 'vitest'
import { parseBase } from './parser.js'
import { serializeBase } from './serializer.js'

const SRC = `views:
  - type: cards
    name: Gallery
    image: note.cover
    imageFit: contain
    imageAspectRatio: 1.35
    cardSize: 240
    groupBy:
      property: status
    groupOrder:
      - open
      - null
`

describe('view settings round trip', () => {
  it('parses groupOrder and the cards options', () => {
    const r = parseBase(SRC)
    expect(r.errors ?? []).toEqual([])
    const v = (r as { document: import('./types.js').BaseDocument }).document.views[0]!
    expect(v.groupOrder).toEqual(['open', null])
    expect(v).toMatchObject({ image: 'note.cover', imageFit: 'contain', imageAspectRatio: 1.35, cardSize: 240 })
    expect(v._unknown).toBeUndefined()
  })

  it('keeps an empty groupOrder (hides all groups)', () => {
    const r = parseBase('views:\n  - type: cards\n    groupOrder: []\n')
    expect((r as { document: import('./types.js').BaseDocument }).document.views[0]!.groupOrder).toEqual([])
    expect(serializeBase((r as { document: import('./types.js').BaseDocument }).document)).toContain('groupOrder: []')
  })

  it('serializes and re-parses identically', () => {
    const doc = (parseBase(SRC) as { document: import('./types.js').BaseDocument }).document
    expect((parseBase(serializeBase(doc)) as { document: unknown }).document).toEqual(doc)
  })

  it('reports a malformed groupOrder', () => {
    expect((parseBase('views:\n  - type: cards\n    groupOrder: nope\n').errors ?? []).length).toBeGreaterThan(0)
  })
})
