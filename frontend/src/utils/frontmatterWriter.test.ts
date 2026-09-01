// Unit tests for frontmatterWriter utility

import { describe, it, expect } from 'vitest'
import { locateFrontmatterBlock, serializeFrontmatter, applyFrontmatterChange } from './frontmatterWriter'

describe('locateFrontmatterBlock', () => {
  it('returns location for valid frontmatter', () => {
    const content = '---\ntitle: Hello\ntags: [a, b]\n---\n# Content'
    const result = locateFrontmatterBlock(content)
    expect(result).not.toBeNull()
    expect(result!.raw).toBe('title: Hello\ntags: [a, b]')
    expect(result!.from).toBe(4) // after "---\n"
  })

  it('returns null when no frontmatter', () => {
    expect(locateFrontmatterBlock('# Just content')).toBeNull()
  })

  it('returns null when opening --- is not at start', () => {
    expect(locateFrontmatterBlock(' ---\ntitle: x\n---\n')).toBeNull()
  })

  it('returns null when no closing delimiter', () => {
    expect(locateFrontmatterBlock('---\ntitle: x\n')).toBeNull()
  })

  it('handles CRLF line endings', () => {
    const content = '---\r\ntitle: Hello\r\n---\r\n# Content'
    const result = locateFrontmatterBlock(content)
    expect(result).not.toBeNull()
    expect(result!.raw).toBe('title: Hello')
  })

  it('handles frontmatter with extra whitespace after opening ---', () => {
    const content = '---\ntitle: x\n---\ncontent'
    const result = locateFrontmatterBlock(content)
    expect(result).not.toBeNull()
  })
})

describe('serializeFrontmatter', () => {
  it('serializes simple scalar values', () => {
    const result = serializeFrontmatter({ title: 'Hello', author: 'Alice' })
    expect(result).toBe('title: Hello\nauthor: Alice')
  })

  it('serializes boolean values as lowercase', () => {
    const result = serializeFrontmatter({ draft: true, published: false })
    expect(result).toBe('draft: true\npublished: false')
  })

  it('serializes number values', () => {
    const result = serializeFrontmatter({ priority: 3, score: 4.5 })
    expect(result).toBe('priority: 3\nscore: 4.5')
  })

  it('serializes short arrays inline', () => {
    const result = serializeFrontmatter({ tags: ['a', 'b', 'c'] })
    expect(result).toBe('tags: [a, b, c]')
  })

  it('serializes long arrays as multiline', () => {
    const result = serializeFrontmatter({ items: ['one', 'two', 'three', 'four'] })
    expect(result).toBe('items:\n  - one\n  - two\n  - three\n  - four')
  })

  it('quotes strings with special characters', () => {
    const result = serializeFrontmatter({ note: 'hello: world' })
    expect(result).toBe('note: "hello: world"')
  })

  it('quotes string values that look like booleans', () => {
    const result = serializeFrontmatter({ value: 'true' })
    expect(result).toBe('value: "true"')
  })

  it('quotes empty strings', () => {
    const result = serializeFrontmatter({ empty: '' })
    expect(result).toBe('empty: ""')
  })

  it('keeps null values as blank properties and omits undefined ones', () => {
    const result = serializeFrontmatter({ keep: 'yes', blank: null, also: undefined })
    expect(result).toBe('keep: yes\nblank:')
  })

  it('leaves ISO dates and date-times unquoted', () => {
    const result = serializeFrontmatter({
      day: '2026-09-01',
      moment: '2026-09-01T10:30',
      precise: '2026-09-01T10:30:00+02:00',
    })
    expect(result).toBe('day: 2026-09-01\nmoment: 2026-09-01T10:30\nprecise: 2026-09-01T10:30:00+02:00')
  })

  it('escapes line breaks and tabs instead of emitting a broken quoted scalar', () => {
    const result = serializeFrontmatter({ note: 'Zeile 1\nZeile 2\tEnde' })
    expect(result).toBe('note: "Zeile 1\\nZeile 2\\tEnde"')
    expect(result.split('\n')).toHaveLength(1)
  })

  it('serializes Date values as an ISO string', () => {
    const result = serializeFrontmatter({ when: new Date('2026-09-01T10:30:00.000Z') })
    expect(result).toBe('when: 2026-09-01T10:30:00.000Z')
  })

  it('returns empty string for empty data', () => {
    expect(serializeFrontmatter({})).toBe('')
  })

  it('preserves original key order when provided', () => {
    const data = { z: 'last', a: 'first', m: 'middle' }
    const result = serializeFrontmatter(data, ['a', 'm', 'z'])
    expect(result).toBe('a: first\nm: middle\nz: last')
  })
})

describe('applyFrontmatterChange', () => {
  it('replaces existing frontmatter content', () => {
    const content = '---\ntitle: Old\n---\n# Heading'
    const result = applyFrontmatterChange(content, { title: 'New' })
    expect(result).toBe('---\ntitle: New\n---\n# Heading')
  })

  it('prepends new frontmatter block when none exists', () => {
    const content = '# Heading\nSome content'
    const result = applyFrontmatterChange(content, { title: 'New' })
    expect(result).toBe('---\ntitle: New\n---\n# Heading\nSome content')
  })

  it('removes frontmatter block when data is empty', () => {
    const content = '---\ntitle: x\n---\n# Heading'
    const result = applyFrontmatterChange(content, {})
    expect(result).toBe('# Heading')
  })

  it('keeps the block when a value is null, writing the property as blank', () => {
    const content = '---\ntitle: x\n---\n# Heading'
    const result = applyFrontmatterChange(content, { title: null })
    expect(result).toBe('---\ntitle:\n---\n# Heading')
  })

  it('returns content unchanged when no frontmatter and empty data', () => {
    const content = '# Just content'
    const result = applyFrontmatterChange(content, {})
    expect(result).toBe('# Just content')
  })

  it('handles content with only frontmatter (no body)', () => {
    const content = '---\ntitle: x\n---'
    const result = applyFrontmatterChange(content, { title: 'New' })
    expect(result).toContain('title: New')
  })
})
