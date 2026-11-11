import { describe, it, expect } from 'vitest'
import type { BaseDocument } from '@slatebase/shared-contracts'
import { buildBlankFrontmatter, yamlScalar } from './base-add-item'

describe('yamlScalar', () => {
  it.each([
    ['open', 'open'],
    ['In Arbeit', 'In Arbeit'],
    ['Über uns', 'Über uns'],
    ['2', '2'],
    ['1.5', '1.5'],
    ['a/b-c_d', 'a/b-c_d'],
  ])('keeps %s plain', (input, expected) => {
    expect(yamlScalar(input)).toBe(expected)
  })

  it.each([
    ['Phase: 2'],
    ['#urgent'],
    ['- x'],
    ['[a, b]'],
    ['{a: b}'],
    ['true'],
    ['null'],
    [' leading'],
    ['trailing '],
    ['say "hi"'],
    ["it's"],
    ['a #b'],
    [''],
  ])('quotes %j so it reads back unchanged', (input) => {
    const out = yamlScalar(input)
    expect(out.startsWith('"')).toBe(true)
    expect(JSON.parse(out)).toBe(input)
  })
})

describe('buildBlankFrontmatter with overrides', () => {
  const doc: BaseDocument = { views: [] }

  it('writes a special column value as a quoted scalar', () => {
    expect(buildBlankFrontmatter(['status'], doc, undefined, { status: 'Phase: 2' })).toBe('---\nstatus: "Phase: 2"\n---\n')
  })

  it('writes a hidden group property that is not a displayed column', () => {
    expect(buildBlankFrontmatter([], doc, undefined, { lane: '#urgent' })).toBe('---\nlane: "#urgent"\n---\n')
  })

  it('keeps simple values unquoted', () => {
    expect(buildBlankFrontmatter(['status'], doc, undefined, { status: 'offen' })).toBe('---\nstatus: offen\n---\n')
  })
})
