import { describe, it, expect } from 'vitest'
import { extractWikilinks } from './wikilink-parser.js'

describe('extractWikilinks', () => {
  describe('basic formats', () => {
    it('extracts simple wikilink [[target]]', () => {
      const result = extractWikilinks('Hello [[world]] there')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        target: 'world',
        display: 'world',
        heading: null,
        position: { line: 1, column: 7 },
      })
    })

    it('extracts wikilink with folder path [[folder/file]]', () => {
      const result = extractWikilinks('See [[projects/alpha]]')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        target: 'projects/alpha',
        display: 'projects/alpha',
        heading: null,
        position: { line: 1, column: 5 },
      })
    })

    it('extracts wikilink with heading [[file#heading]]', () => {
      const result = extractWikilinks('See [[notes#introduction]]')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        target: 'notes',
        display: 'notes > introduction',
        heading: 'introduction',
        position: { line: 1, column: 5 },
      })
    })

    it('extracts wikilink with heading and display [[file#heading|display]]', () => {
      const result = extractWikilinks('See [[notes#intro|my notes]]')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        target: 'notes',
        display: 'my notes',
        heading: 'intro',
        position: { line: 1, column: 5 },
      })
    })

    it('extracts heading-only wikilink [[#heading]]', () => {
      const result = extractWikilinks('Jump to [[#conclusion]]')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        target: '',
        display: 'conclusion',
        heading: 'conclusion',
        position: { line: 1, column: 9 },
      })
    })

    it('extracts wikilink with display text [[target|display]]', () => {
      const result = extractWikilinks('See [[file|custom text]]')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        target: 'file',
        display: 'custom text',
        heading: null,
        position: { line: 1, column: 5 },
      })
    })
  })

  describe('multiple wikilinks', () => {
    it('extracts multiple wikilinks from one line', () => {
      const result = extractWikilinks('Link [[a]] and [[b]] here')
      expect(result).toHaveLength(2)
      expect(result[0]!.target).toBe('a')
      expect(result[1]!.target).toBe('b')
    })

    it('extracts wikilinks from multiple lines', () => {
      const result = extractWikilinks('Line 1 [[alpha]]\nLine 2 [[beta]]')
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        target: 'alpha',
        display: 'alpha',
        heading: null,
        position: { line: 1, column: 8 },
      })
      expect(result[1]).toEqual({
        target: 'beta',
        display: 'beta',
        heading: null,
        position: { line: 2, column: 8 },
      })
    })
  })

  describe('code block exclusion', () => {
    it('ignores wikilinks in fenced code blocks (backticks)', () => {
      const md = '```\n[[inside]]\n```'
      const result = extractWikilinks(md)
      expect(result).toHaveLength(0)
    })

    it('ignores wikilinks in fenced code blocks (tildes)', () => {
      const md = '~~~\n[[inside]]\n~~~'
      const result = extractWikilinks(md)
      expect(result).toHaveLength(0)
    })

    it('ignores wikilinks in fenced code blocks with info string', () => {
      const md = '```typescript\n[[inside]]\n```'
      const result = extractWikilinks(md)
      expect(result).toHaveLength(0)
    })

    it('ignores wikilinks in indented code blocks (4 spaces)', () => {
      const md = '    [[inside]]'
      const result = extractWikilinks(md)
      expect(result).toHaveLength(0)
    })

    it('ignores wikilinks in indented code blocks (tab)', () => {
      const md = '\t[[inside]]'
      const result = extractWikilinks(md)
      expect(result).toHaveLength(0)
    })

    it('ignores wikilinks in inline code', () => {
      const md = 'See `[[inside]]` here'
      const result = extractWikilinks(md)
      expect(result).toHaveLength(0)
    })

    it('ignores wikilinks in double-backtick inline code', () => {
      const md = 'See ``[[inside]]`` here'
      const result = extractWikilinks(md)
      expect(result).toHaveLength(0)
    })

    it('extracts wikilinks outside code blocks', () => {
      const md = '[[before]]\n```\n[[inside]]\n```\n[[after]]'
      const result = extractWikilinks(md)
      expect(result).toHaveLength(2)
      expect(result[0]!.target).toBe('before')
      expect(result[1]!.target).toBe('after')
    })
  })

  describe('invalid wikilinks', () => {
    it('ignores empty wikilinks [[]]', () => {
      const result = extractWikilinks('See [[]] here')
      expect(result).toHaveLength(0)
    })

    it('ignores unclosed wikilinks', () => {
      const result = extractWikilinks('See [[unclosed here')
      expect(result).toHaveLength(0)
    })

    it('ignores wikilinks with newlines (split across lines)', () => {
      // Since we parse line-by-line, a wikilink cannot span lines
      const result = extractWikilinks('See [[multi\nline]]')
      expect(result).toHaveLength(0)
    })

    it('does not throw on invalid input', () => {
      expect(() => extractWikilinks('[[]]')).not.toThrow()
      expect(() => extractWikilinks('[[')).not.toThrow()
      expect(() => extractWikilinks(']]')).not.toThrow()
      expect(() => extractWikilinks('')).not.toThrow()
    })
  })

  describe('edge cases', () => {
    it('returns empty array for empty string', () => {
      expect(extractWikilinks('')).toEqual([])
    })

    it('returns empty array for string with no wikilinks', () => {
      expect(extractWikilinks('Hello world, no links here.')).toEqual([])
    })

    it('handles wikilinks with spaces in target', () => {
      const result = extractWikilinks('[[my note]]')
      expect(result).toHaveLength(1)
      expect(result[0]!.target).toBe('my note')
    })

    it('handles wikilinks with special characters', () => {
      const result = extractWikilinks('[[über-notes (2024)]]')
      expect(result).toHaveLength(1)
      expect(result[0]!.target).toBe('über-notes (2024)')
    })

    it('handles single bracket not triggering wikilink', () => {
      const result = extractWikilinks('[not a wikilink]')
      expect(result).toHaveLength(0)
    })
  })

  describe('determinism', () => {
    it('produces same output for same input', () => {
      const md = '[[a]] text [[b#c|d]] more [[#e]]'
      const result1 = extractWikilinks(md)
      const result2 = extractWikilinks(md)
      expect(result1).toEqual(result2)
    })
  })
})
