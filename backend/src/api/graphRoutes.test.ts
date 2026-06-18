// Unit tests for the graph routes tag extraction logic
// (Tests validate the refactored tag-extractor which is now used by graphRoutes)

import { describe, it, expect } from 'vitest'
import { extractTags } from '../link-index/tag-extractor.js'

describe('extractTags (used by graphRoutes)', () => {
  it('extracts simple tags', () => {
    const result = extractTags('#hello world #test')
    expect(new Set(result)).toEqual(new Set(['hello', 'test']))
  })

  it('extracts tags with digits, underscores, hyphens, and slashes', () => {
    const result = extractTags('#project/alpha #tag_name #my-tag #tag123')
    expect(new Set(result)).toEqual(new Set(['project/alpha', 'tag_name', 'my-tag', 'tag123']))
  })

  it('excludes tags inside fenced code blocks', () => {
    const content = 'before\n```\n#notag\n```\nafter #valid'
    const result = extractTags(content)
    expect(new Set(result)).toEqual(new Set(['valid']))
  })

  it('excludes tags inside inline code', () => {
    const content = 'text `#notag` more #valid'
    const result = extractTags(content)
    expect(new Set(result)).toEqual(new Set(['valid']))
  })

  it('does not match C# as a tag (preceded by word character)', () => {
    const result = extractTags('C# is great')
    expect(result).toHaveLength(0)
  })

  it('returns empty array for content with no tags', () => {
    const result = extractTags('just plain text without any tags')
    expect(result).toHaveLength(0)
  })

  it('handles tags at the start of a line', () => {
    const result = extractTags('#first\n#second')
    expect(new Set(result)).toEqual(new Set(['first', 'second']))
  })

  it('handles tags with unicode letters', () => {
    const result = extractTags('#über #café')
    expect(new Set(result)).toEqual(new Set(['über', 'café']))
  })

  it('does not match # followed by a digit as first character', () => {
    const result = extractTags('#123 is not a tag')
    expect(result).toHaveLength(0)
  })

  it('handles multiple fenced code blocks', () => {
    const content = '```js\n#code1\n```\n#valid\n```python\n#code2\n```'
    const result = extractTags(content)
    expect(new Set(result)).toEqual(new Set(['valid']))
  })

  it('deduplicates tags appearing in multiple places', () => {
    const content = '#tag1 some text #tag1 more text #tag1'
    const result = extractTags(content)
    expect(result).toEqual(['tag1'])
  })
})
