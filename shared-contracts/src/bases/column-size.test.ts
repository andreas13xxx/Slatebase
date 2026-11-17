/**
 * Table column widths (`columnSize`: column id → px). The key name is Obsidian's; a
 * malformed value must round-trip untouched instead of being dropped.
 */

import { describe, it, expect } from 'vitest'
import { parseBase } from './parser.js'
import { serializeBase } from './serializer.js'

const FILE = `views:
  - type: table
    name: Sicht
    order:
      - file.name
      - note.status
    columnSize:
      file.name: 320
      note.status: 120
`

describe('columnSize', () => {
  it('parses the widths per column id', () => {
    const result = parseBase(FILE)
    expect(result.success).toBe(true)
    const view = result.document!.views[0]!
    expect({ ...view.columnSize }).toEqual({ 'file.name': 320, 'note.status': 120 })
    expect(view._unknown).toBeUndefined()
  })

  it('writes them back', () => {
    const out = serializeBase(parseBase(FILE).document!)
    expect(parseBase(out).document!.views[0]!.columnSize).toEqual(parseBase(FILE).document!.views[0]!.columnSize)
    expect(out).toContain('file.name: 320')
  })

  it('keeps a malformed value as an unknown field', () => {
    const result = parseBase('views:\n  - type: table\n    columnSize:\n      file.name: wide\n')
    const view = result.document!.views[0]!
    expect(view.columnSize).toBeUndefined()
    expect(view._unknown).toEqual({ columnSize: { 'file.name': 'wide' } })
    expect(serializeBase(result.document!)).toContain('file.name: wide')
  })

  it('keeps the valid widths when one entry is malformed', () => {
    const view = parseBase('views:\n  - type: table\n    columnSize:\n      a: 120\n      b: auto\n').document!.views[0]!
    expect({ ...view.columnSize }).toEqual({ a: 120 })
  })

  it('treats a column named __proto__ as an ordinary key', () => {
    const view = parseBase('views:\n  - type: table\n    columnSize:\n      __proto__: 90\n').document!.views[0]!
    expect(Object.keys(view.columnSize ?? {})).toEqual(['__proto__'])
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })
})
