import { describe, it, expect } from 'vitest'
import { extractHeadings } from './extractHeadings'

describe('extractHeadings', () => {
  it('extracts headings with correct levels', () => {
    const content = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6'
    const result = extractHeadings(content)

    expect(result).toHaveLength(6)
    expect(result[0]).toEqual({ text: 'H1', level: 1, anchor: 'h1' })
    expect(result[1]).toEqual({ text: 'H2', level: 2, anchor: 'h2' })
    expect(result[2]).toEqual({ text: 'H3', level: 3, anchor: 'h3' })
    expect(result[3]).toEqual({ text: 'H4', level: 4, anchor: 'h4' })
    expect(result[4]).toEqual({ text: 'H5', level: 5, anchor: 'h5' })
    expect(result[5]).toEqual({ text: 'H6', level: 6, anchor: 'h6' })
  })

  it('returns headings in document order', () => {
    const content = '## Second\n# First\n### Third'
    const result = extractHeadings(content)

    expect(result).toHaveLength(3)
    expect(result[0]?.text).toBe('Second')
    expect(result[1]?.text).toBe('First')
    expect(result[2]?.text).toBe('Third')
  })

  it('strips bold formatting markers', () => {
    const content = '# **Bold Heading**\n## __Also Bold__'
    const result = extractHeadings(content)

    expect(result[0]?.text).toBe('Bold Heading')
    expect(result[1]?.text).toBe('Also Bold')
  })

  it('strips italic formatting markers', () => {
    const content = '# *Italic Heading*\n## _Also Italic_'
    const result = extractHeadings(content)

    expect(result[0]?.text).toBe('Italic Heading')
    expect(result[1]?.text).toBe('Also Italic')
  })

  it('strips inline code markers', () => {
    const content = '# Heading with `code`'
    const result = extractHeadings(content)

    expect(result[0]?.text).toBe('Heading with code')
  })

  it('strips mixed formatting markers', () => {
    const content = '# **Bold** and *italic* with `code`'
    const result = extractHeadings(content)

    expect(result[0]?.text).toBe('Bold and italic with code')
  })

  it('returns empty array for content without headings', () => {
    const content = 'Just some text\nwithout any headings\n\nMore text.'
    const result = extractHeadings(content)

    expect(result).toEqual([])
  })

  it('returns empty array for empty content', () => {
    expect(extractHeadings('')).toEqual([])
  })

  it('handles duplicate headings with numeric suffixes', () => {
    const content = '## Section\n## Section\n## Section'
    const result = extractHeadings(content)

    expect(result).toHaveLength(3)
    expect(result[0]?.anchor).toBe('section')
    expect(result[1]?.anchor).toBe('section-1')
    expect(result[2]?.anchor).toBe('section-2')
  })

  it('ignores lines with more than 6 hashes', () => {
    const content = '####### Not a heading\n# Real heading'
    const result = extractHeadings(content)

    expect(result).toHaveLength(1)
    expect(result[0]?.text).toBe('Real heading')
  })

  it('requires a space after hashes', () => {
    const content = '#NoSpace\n# With Space'
    const result = extractHeadings(content)

    expect(result).toHaveLength(1)
    expect(result[0]?.text).toBe('With Space')
  })

  it('handles headings with special characters in anchor generation', () => {
    const content = '# Meine Überschrift!'
    const result = extractHeadings(content)

    expect(result[0]?.text).toBe('Meine Überschrift!')
    expect(result[0]?.anchor).toBe('meine-überschrift')
  })

  it('ignores headings that are not at the start of a line', () => {
    const content = 'text # Not a heading\n# Real heading'
    const result = extractHeadings(content)

    expect(result).toHaveLength(1)
    expect(result[0]?.text).toBe('Real heading')
  })

  it('handles content with mixed headings and body text', () => {
    const content = `# Introduction

Some paragraph text here.

## Methods

More text about methods.

### Sub-method A

Details about sub-method A.`

    const result = extractHeadings(content)

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ text: 'Introduction', level: 1, anchor: 'introduction' })
    expect(result[1]).toEqual({ text: 'Methods', level: 2, anchor: 'methods' })
    expect(result[2]).toEqual({ text: 'Sub-method A', level: 3, anchor: 'sub-method-a' })
  })
})
