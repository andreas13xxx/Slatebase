import { describe, it, expect } from 'vitest'
import { extractHeadingSection } from './headingSection'

const NOTE = ['# Title', 'intro', '## A', 'a text', '### A1', 'deep', '## B', 'b text'].join('\n')

describe('extractHeadingSection', () => {
  it('returns the heading and everything up to the next heading of the same level', () => {
    expect(extractHeadingSection(NOTE, 'A')).toBe('## A\na text\n### A1\ndeep')
  })

  it('runs to the end of the note for the last section', () => {
    expect(extractHeadingSection(NOTE, 'B')).toBe('## B\nb text')
  })

  it('matches case-insensitively and trims', () => {
    expect(extractHeadingSection(NOTE, '  a1 ')).toBe('### A1\ndeep')
  })

  it('returns null when the heading does not exist or is empty', () => {
    expect(extractHeadingSection(NOTE, 'Nope')).toBeNull()
    expect(extractHeadingSection(NOTE, ' ')).toBeNull()
  })

  it('ignores headings inside fenced code blocks', () => {
    const note = ['# T', '```', '## Fake', '```', '## Real', 'x'].join('\n')
    expect(extractHeadingSection(note, 'Fake')).toBeNull()
    expect(extractHeadingSection(note, 'Real')).toBe('## Real\nx')
  })

  it('handles CRLF', () => {
    expect(extractHeadingSection('# A\r\nx\r\n# B\r\ny', 'A')).toBe('# A\nx')
  })
})
