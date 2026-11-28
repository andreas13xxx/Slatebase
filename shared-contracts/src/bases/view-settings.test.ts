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

  it('keeps the Kanban columnWidth of a real Obsidian base, typed and not as an unknown key', () => {
    const src = `filters:
  and:
    - file.inFolder("Features/Beispiel-Aufgaben")
views:
  - type: kanban
    name: Nach Status
    groupBy:
      property: status
      direction: ASC
    order:
      - file.name
      - priority
    summaries:
      file.name: Filled
      estimate: Sum
    columnWidth: 360
`
    const r = parseBase(src)
    expect(r.errors ?? []).toEqual([])
    const doc = (r as { document: import('./types.js').BaseDocument }).document
    expect(doc.views[0]!.columnWidth).toBe(360)
    expect(doc.views[0]!._unknown).toBeUndefined()
    expect(serializeBase(doc)).toContain('columnWidth: 360')
    expect((parseBase(serializeBase(doc)) as { document: unknown }).document).toEqual(doc)
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

describe('sort clause spelling', () => {
  type Parsed = { document: import('./types.js').BaseDocument }
  const OBSIDIAN = 'views:\n  - type: table\n    sort:\n      - property: file.name\n        direction: DESC\n'

  it('reads Obsidian\'s property/ASC-DESC form and the older column form', () => {
    expect((parseBase(OBSIDIAN) as Parsed).document.views[0]!.sort).toEqual([{ column: 'file.name', direction: 'desc' }])
    const old = 'views:\n  - type: table\n    sort:\n      - column: status\n        direction: asc\n'
    expect((parseBase(old) as Parsed).document.views[0]!.sort).toEqual([{ column: 'status', direction: 'asc' }])
  })

  it('writes Obsidian\'s form', () => {
    const out = serializeBase((parseBase(OBSIDIAN) as Parsed).document)
    expect(out).toContain('property: file.name')
    expect(out).toContain('direction: DESC')
    expect(out).not.toContain('column:')
  })
})
