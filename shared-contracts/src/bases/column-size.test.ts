import { describe, it, expect } from 'vitest'
import { parseBase } from './parser.js'
import { serializeBase } from './serializer.js'

const YAML = `views:
  - type: table
    name: Tabelle
    order:
      - file.name
      - note.price
    columnSize:
      file.name: 240
      note.price: 90
`

describe('table columnSize', () => {
  it('parses the column widths', () => {
    const result = parseBase(YAML)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.document.views[0]?.columnSize).toEqual({ 'file.name': 240, 'note.price': 90 })
  })

  it('round-trips without losing a width', () => {
    const result = parseBase(YAML)
    if (!result.success) throw new Error('parse failed')
    const again = parseBase(serializeBase(result.document))
    expect(again.success && again.document.views[0]?.columnSize).toEqual({ 'file.name': 240, 'note.price': 90 })
  })

  it('reports an invalid width but keeps the valid ones', () => {
    const result = parseBase(YAML.replace('90', 'wide'))
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.document.views[0]?.columnSize).toEqual({ 'file.name': 240 })
    expect(result.errors?.some((e) => e.path?.includes('columnSize'))).toBe(true)
  })

  it('does not treat columnSize as an unknown field', () => {
    const result = parseBase(YAML)
    if (!result.success) throw new Error('parse failed')
    expect(result.document.views[0]?._unknown).toBeUndefined()
  })
})
