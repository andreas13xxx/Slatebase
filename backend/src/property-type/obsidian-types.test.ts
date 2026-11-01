import { describe, expect, it } from 'vitest'
import { fromObsidianType, toObsidianType } from './obsidian-types.js'

describe('obsidian property type names', () => {
  it('reads the names seen in real files', () => {
    expect(fromObsidianType('capo', 'number')).toBe('number')
    expect(fromObsidianType('cssclasses', 'multitext')).toBe('list')
    expect(fromObsidianType('tags', 'tags')).toBe('tags')
    expect(fromObsidianType('aliases', 'multitext')).toBe('aliases')
  })

  it('reads the assumed names, and aliases written as aliases', () => {
    for (const name of ['text', 'checkbox', 'date', 'datetime']) expect(fromObsidianType('x', name)).toBe(name)
    expect(fromObsidianType('aliases', 'aliases')).toBe('aliases')
  })

  it('does not know other names, non-strings or names from Object.prototype', () => {
    expect(fromObsidianType('x', 'rating')).toBeNull()
    expect(fromObsidianType('x', 3)).toBeNull()
    expect(fromObsidianType('x', 'constructor')).toBeNull()
    expect(fromObsidianType('x', 'toString')).toBeNull()
  })

  it('writes list and aliases as multitext and the rest as named', () => {
    expect(toObsidianType('list')).toBe('multitext')
    expect(toObsidianType('aliases')).toBe('multitext')
    expect(toObsidianType('tags')).toBe('tags')
    expect(toObsidianType('number')).toBe('number')
  })

  it('round-trips every type', () => {
    for (const type of ['text', 'number', 'date', 'datetime', 'checkbox', 'list', 'tags', 'aliases'] as const) {
      const key = type === 'aliases' || type === 'tags' ? type : 'k'
      expect(fromObsidianType(key, toObsidianType(type))).toBe(type)
    }
  })
})
