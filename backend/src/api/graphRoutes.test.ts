// Unit tests for the tags endpoint tag extraction logic

import { describe, it, expect } from 'vitest'
import { extractTagsFromContent } from './graphRoutes.js'

describe('extractTagsFromContent', () => {
  it('extracts simple tags', () => {
    const result = extractTagsFromContent('#hello world #test')
    expect(result).toEqual(new Set(['hello', 'test']))
  })

  it('extracts tags with digits, underscores, hyphens, and slashes', () => {
    const result = extractTagsFromContent('#project/alpha #tag_name #my-tag #tag123')
    expect(result).toEqual(new Set(['project/alpha', 'tag_name', 'my-tag', 'tag123']))
  })

  it('excludes tags inside fenced code blocks', () => {
    const content = 'before\n```\n#notag\n```\nafter #valid'
    const result = extractTagsFromContent(content)
    expect(result).toEqual(new Set(['valid']))
  })

  it('excludes tags inside inline code', () => {
    const content = 'text `#notag` more #valid'
    const result = extractTagsFromContent(content)
    expect(result).toEqual(new Set(['valid']))
  })

  it('does not match C# as a tag (preceded by word character)', () => {
    const result = extractTagsFromContent('C# is great')
    expect(result.size).toBe(0)
  })

  it('returns empty set for content with no tags', () => {
    const result = extractTagsFromContent('just plain text without any tags')
    expect(result.size).toBe(0)
  })

  it('handles tags at the start of a line', () => {
    const result = extractTagsFromContent('#first\n#second')
    expect(result).toEqual(new Set(['first', 'second']))
  })

  it('handles tags with unicode letters', () => {
    const result = extractTagsFromContent('#über #café')
    expect(result).toEqual(new Set(['über', 'café']))
  })

  it('does not match # followed by a digit as first character', () => {
    const result = extractTagsFromContent('#123 is not a tag')
    expect(result.size).toBe(0)
  })

  it('handles multiple fenced code blocks', () => {
    const content = '```js\n#code1\n```\n#valid\n```python\n#code2\n```'
    const result = extractTagsFromContent(content)
    expect(result).toEqual(new Set(['valid']))
  })

  it('deduplicates tags appearing in multiple places', () => {
    const content = '#tag1 some text #tag1 more text #tag1'
    const result = extractTagsFromContent(content)
    expect(result).toEqual(new Set(['tag1']))
  })
})
