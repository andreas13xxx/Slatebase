import { describe, it, expect } from 'vitest'
import { parseFrontmatter } from './parseFrontmatter'

describe('parseFrontmatter', () => {
  it('returns null data when content has no frontmatter', () => {
    const result = parseFrontmatter('# Hello World\n\nSome content')
    expect(result).toEqual({ data: null, parseError: null, rawFrontmatter: null })
  })

  it('returns null data when content is empty', () => {
    const result = parseFrontmatter('')
    expect(result).toEqual({ data: null, parseError: null, rawFrontmatter: null })
  })

  it('returns null data when frontmatter has no closing delimiter', () => {
    const result = parseFrontmatter('---\ntitle: Hello\nNo closing')
    expect(result).toEqual({ data: null, parseError: null, rawFrontmatter: null })
  })

  it('parses valid frontmatter with key-value pairs', () => {
    const content = '---\ntitle: Hello\ndate: 2024-01-01\n---\n\n# Content'
    const result = parseFrontmatter(content)
    expect(result.data).toEqual({ title: 'Hello', date: '2024-01-01' })
    expect(result.parseError).toBeNull()
    expect(result.rawFrontmatter).toBe('title: Hello\ndate: 2024-01-01')
  })

  it('handles empty frontmatter block', () => {
    const content = '---\n---\n\n# Content'
    const result = parseFrontmatter(content)
    expect(result).toEqual({ data: null, parseError: null, rawFrontmatter: '' })
  })

  it('handles frontmatter with only whitespace', () => {
    const content = '---\n   \n---\n\n# Content'
    const result = parseFrontmatter(content)
    expect(result).toEqual({ data: null, parseError: null, rawFrontmatter: '' })
  })

  it('returns parse error for invalid YAML', () => {
    const content = '---\ntitle: [\ninvalid yaml\n---\n\n# Content'
    const result = parseFrontmatter(content)
    expect(result.data).toBeNull()
    expect(result.parseError).not.toBeNull()
    expect(result.rawFrontmatter).toBe('title: [\ninvalid yaml')
  })

  it('parses nested objects', () => {
    const content = '---\nmeta:\n  author: John\n  version: 2\n---\n'
    const result = parseFrontmatter(content)
    expect(result.data).toEqual({ meta: { author: 'John', version: 2 } })
    expect(result.parseError).toBeNull()
  })

  it('parses arrays', () => {
    const content = '---\ntags:\n  - one\n  - two\n  - three\n---\n'
    const result = parseFrontmatter(content)
    expect(result.data).toEqual({ tags: ['one', 'two', 'three'] })
    expect(result.parseError).toBeNull()
  })

  it('returns null data when YAML parses to a scalar', () => {
    const content = '---\njust a string\n---\n'
    const result = parseFrontmatter(content)
    expect(result.data).toBeNull()
    expect(result.parseError).toBeNull()
    expect(result.rawFrontmatter).toBe('just a string')
  })

  it('returns null data when YAML parses to an array', () => {
    const content = '---\n- item1\n- item2\n---\n'
    const result = parseFrontmatter(content)
    expect(result.data).toBeNull()
    expect(result.parseError).toBeNull()
  })

  it('does not treat --- in the middle of content as frontmatter', () => {
    const content = 'Some text\n---\ntitle: Hello\n---\n'
    const result = parseFrontmatter(content)
    expect(result).toEqual({ data: null, parseError: null, rawFrontmatter: null })
  })

  it('handles frontmatter with various value types', () => {
    const content = '---\nstring: hello\nnumber: 42\nbool: true\nnull_val: null\n---\n'
    const result = parseFrontmatter(content)
    expect(result.data).toEqual({
      string: 'hello',
      number: 42,
      bool: true,
      null_val: null
    })
  })
})
