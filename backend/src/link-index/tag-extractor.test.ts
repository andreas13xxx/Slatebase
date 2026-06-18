import { describe, it, expect } from 'vitest'
import { extractTags } from './tag-extractor.js'

describe('extractTags', () => {
  it('extracts simple tags', () => {
    const result = extractTags('Hello #tag world')
    expect(result).toEqual(['tag'])
  })

  it('extracts multiple tags', () => {
    const result = extractTags('#alpha text #beta')
    expect(result).toContain('alpha')
    expect(result).toContain('beta')
    expect(result).toHaveLength(2)
  })

  it('extracts nested/hierarchical tags', () => {
    const result = extractTags('See #projekt/alpha and #work/team/backend')
    expect(result).toContain('projekt/alpha')
    expect(result).toContain('work/team/backend')
  })

  it('extracts tags with underscores and hyphens', () => {
    const result = extractTags('#my_tag #another-tag')
    expect(result).toContain('my_tag')
    expect(result).toContain('another-tag')
  })

  it('ignores tags inside fenced code blocks (backticks)', () => {
    const content = `Before
\`\`\`
#inside-code
\`\`\`
After #outside`
    const result = extractTags(content)
    expect(result).toEqual(['outside'])
  })

  it('ignores tags inside fenced code blocks (tildes)', () => {
    const content = `Before
~~~
#inside-code
~~~
After #outside`
    const result = extractTags(content)
    expect(result).toEqual(['outside'])
  })

  it('ignores tags inside inline code', () => {
    const content = 'This `#not-a-tag` but #real-tag'
    const result = extractTags(content)
    expect(result).toEqual(['real-tag'])
  })

  it('ignores tags inside indented code blocks', () => {
    const content = `Normal line #visible
    #indented-code
Another #also-visible`
    const result = extractTags(content)
    expect(result).toContain('visible')
    expect(result).toContain('also-visible')
    expect(result).not.toContain('indented-code')
  })

  it('does not recognize heading # as tag', () => {
    const content = `# Heading 1
## Heading 2
### Heading 3
Text #real-tag`
    const result = extractTags(content)
    expect(result).toEqual(['real-tag'])
  })

  it('returns empty array for empty input', () => {
    expect(extractTags('')).toEqual([])
  })

  it('returns empty array for content without tags', () => {
    expect(extractTags('Hello world, no tags here.')).toEqual([])
  })

  it('deduplicates repeated tags', () => {
    const content = '#tag some text #tag again #tag'
    const result = extractTags(content)
    expect(result).toEqual(['tag'])
  })

  it('does not match hash in URLs or anchors', () => {
    const content = 'Visit https://example.com#section'
    const result = extractTags(content)
    expect(result).toEqual([])
  })

  it('does not match C# style references', () => {
    const content = 'Using C# for development'
    const result = extractTags(content)
    // C# should not produce a tag since # is preceded by a letter
    expect(result).toEqual([])
  })

  it('matches tags at start of line', () => {
    const content = '#start-of-line tag'
    const result = extractTags(content)
    expect(result).toEqual(['start-of-line'])
  })

  it('matches tags after special characters', () => {
    const content = '(#paren) [#bracket] "#quoted"'
    const result = extractTags(content)
    expect(result).toContain('paren')
    expect(result).toContain('bracket')
    expect(result).toContain('quoted')
  })

  it('handles tags with unicode characters', () => {
    const content = '#café #über'
    const result = extractTags(content)
    expect(result).toContain('café')
    expect(result).toContain('über')
  })

  it('does not match tags starting with digits', () => {
    const content = '#123 should not match'
    const result = extractTags(content)
    expect(result).toEqual([])
  })
})
