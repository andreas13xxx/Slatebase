/**
 * Table row height and list display options (`rowHeight`, `markers`,
 * `indentProperties`, `separator`). The fixtures are two `.base` files written
 * by real Obsidian, verbatim -- the keys and the values `medium`/`tall`/`extra`,
 * `number`/`none` and `;` come from there, not from the syntax reference, which
 * does not name them.
 */

import { describe, it, expect } from 'vitest'
import { parseBase } from './parser.js'
import { serializeBase } from './serializer.js'

const FILE_A = `views:
  - type: table
    name: Sicht
    rowHeight: tall
  - type: list
    name: Sicht 2
    order:
      - file.name
      - file.ctime
    markers: number
    indentProperties: true
`

const FILE_B = `views:
  - type: table
    name: Sicht
  - type: table
    name: Sicht 2
    rowHeight: medium
  - type: table
    name: Sicht 2 2
    rowHeight: tall
  - type: table
    name: Sicht 2 2 2
    rowHeight: extra
  - type: list
    name: Sicht 3
    separator: ;
  - type: list
    name: Sicht 3 2
    separator: ;
    markers: number
  - type: list
    name: Sicht 3 2 2
    order:
      - file.name
      - file.ctime
    separator: ;
    markers: none
    indentProperties: true
`

describe('view display options', () => {
  it('parses the Obsidian fixtures without errors or leftovers', () => {
    for (const src of [FILE_A, FILE_B]) {
      const result = parseBase(src)
      if (!result.success) throw new Error('parse failed')
      expect(result.errors ?? []).toEqual([])
      for (const v of result.document.views) expect(v._unknown).toBeUndefined()
    }
  })

  it('reads every option', () => {
    const result = parseBase(FILE_B)
    if (!result.success) throw new Error('parse failed')
    const v = result.document.views
    expect(v.map((x) => x.rowHeight)).toEqual([undefined, 'medium', 'tall', 'extra', undefined, undefined, undefined])
    expect(v[4]?.separator).toBe(';')
    expect(v[5]?.markers).toBe('number')
    expect(v[6]).toMatchObject({ markers: 'none', separator: ';', indentProperties: true })
  })

  it('round-trips both fixtures to the same model', () => {
    for (const src of [FILE_A, FILE_B]) {
      const first = parseBase(src)
      if (!first.success) throw new Error('parse failed')
      const second = parseBase(serializeBase(first.document))
      if (!second.success) throw new Error('re-parse failed')
      expect(second.document).toEqual(first.document)
    }
  })

  it('writes the options back as Obsidian does', () => {
    const first = parseBase(FILE_A)
    if (!first.success) throw new Error('parse failed')
    const out = serializeBase(first.document)
    expect(out).toContain('rowHeight: tall')
    expect(out).toContain('markers: number')
    expect(out).toContain('indentProperties: true')
  })

  it('reports wrongly typed options and keeps the rest of the view', () => {
    const result = parseBase('views:\n  - type: list\n    name: X\n    markers: 3\n    indentProperties: "yes"\n    separator: ;\n')
    if (!result.success) throw new Error('parse failed')
    expect((result.errors ?? []).map((e) => e.path)).toEqual(['views[0].markers', 'views[0].indentProperties'])
    expect(result.document.views[0]).toMatchObject({ name: 'X', separator: ';' })
    expect(result.document.views[0]?.markers).toBeUndefined()
  })

  it('keeps an unknown row height as written', () => {
    const result = parseBase('views:\n  - type: table\n    rowHeight: huge\n')
    if (!result.success) throw new Error('parse failed')
    expect(result.errors ?? []).toEqual([])
    expect(parseBase(serializeBase(result.document))).toMatchObject({ success: true })
    expect(serializeBase(result.document)).toContain('rowHeight: huge')
  })
})
