import { describe, it, expect } from 'vitest'
import { parseMetadata } from './metadata-parser'

describe('parseMetadata', () => {
  describe('frontmatter', () => {
    it('parses key/value pairs and inline arrays', () => {
      const md = ['---', 'title: Hello', 'tags: [a, b]', '---', 'body'].join('\n')
      const meta = parseMetadata(md)

      expect(meta.frontmatter).toEqual({ title: 'Hello', tags: ['a', 'b'] })
    })

    it('records frontmatterPosition spanning both delimiters', () => {
      const md = ['---', 'title: Hello', '---', 'body'].join('\n')
      const meta = parseMetadata(md)

      expect(meta.frontmatterPosition).toEqual({
        start: { line: 0, col: 0, offset: 0 },
        end: { line: 2, col: 3, offset: md.indexOf('---', 5) + 3 },
      })
    })

    it('omits frontmatter fields entirely when there is none', () => {
      const meta = parseMetadata('just text')
      expect(meta.frontmatter).toBeUndefined()
      expect(meta.frontmatterPosition).toBeUndefined()
    })

    it('extracts frontmatterLinks from a scalar value', () => {
      const md = ['---', 'related: [[Other Note]]', '---', 'body'].join('\n')
      const meta = parseMetadata(md)

      expect(meta.frontmatterLinks).toEqual([
        { key: 'related', link: 'Other Note', original: '[[Other Note]]', displayText: undefined },
      ])
    })

    it('indexes repeated links under the same key', () => {
      const md = ['---', 'related: [[A]], [[B]]', '---', 'body'].join('\n')
      const meta = parseMetadata(md)

      expect(meta.frontmatterLinks).toEqual([
        { key: 'related', link: 'A', original: '[[A]]', displayText: undefined },
        { key: 'related.1', link: 'B', original: '[[B]]', displayText: undefined },
      ])
    })

    it('merges frontmatter tags with inline tags', () => {
      const md = ['---', 'tags: [project]', '---', 'body #inline'].join('\n')
      const meta = parseMetadata(md)

      expect(meta.tags?.map((t) => t.tag)).toEqual(['#project', '#inline'])
    })
  })

  describe('headings', () => {
    it('extracts ATX headings with level and text', () => {
      const md = ['# Title', '## Sub section'].join('\n')
      const meta = parseMetadata(md)

      expect(meta.headings).toEqual([
        { heading: 'Title', level: 1, position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 7, offset: 7 } } },
        { heading: 'Sub section', level: 2, position: { start: { line: 1, col: 0, offset: 8 }, end: { line: 1, col: 14, offset: 22 } } },
      ])
    })

    it('strips a closing ATX sequence', () => {
      const meta = parseMetadata('## Heading ##')
      expect(meta.headings?.[0]?.heading).toBe('Heading')
    })

    it('does not treat a heading line as a tag', () => {
      const meta = parseMetadata('# Heading text')
      expect(meta.tags).toBeUndefined()
    })

    it('still finds a tag that appears inside heading text', () => {
      const meta = parseMetadata('# Heading #project')
      expect(meta.tags?.map((t) => t.tag)).toEqual(['#project'])
    })

    it('ignores a fenced code block starting with a hash comment', () => {
      const md = ['```', '# not a heading', '```'].join('\n')
      const meta = parseMetadata(md)
      expect(meta.headings).toBeUndefined()
    })
  })

  describe('links vs embeds', () => {
    it('separates wikilinks from embeds', () => {
      const md = 'See [[Note]] and ![[image.png]]'
      const meta = parseMetadata(md)

      expect(meta.links).toEqual([
        { link: 'Note', displayText: undefined, original: '[[Note]]', position: { start: { line: 0, col: 4, offset: 4 }, end: { line: 0, col: 12, offset: 12 } } },
      ])
      expect(meta.embeds).toEqual([
        {
          link: 'image.png',
          displayText: undefined,
          original: '![[image.png]]',
          position: { start: { line: 0, col: 17, offset: 17 }, end: { line: 0, col: 31, offset: 31 } },
        },
      ])
    })

    it('keeps the display text and drops it from the link', () => {
      const meta = parseMetadata('[[Target|Shown Text]]')
      expect(meta.links?.[0]).toMatchObject({ link: 'Target', displayText: 'Shown Text' })
    })

    it('ignores a wikilink inside inline code', () => {
      const meta = parseMetadata('Use `[[Not A Link]]` here')
      expect(meta.links).toBeUndefined()
    })
  })

  describe('footnotes and footnoteRefs', () => {
    it('separates a definition from an inline reference', () => {
      const md = ['Body text[^1] more.', '', '[^1]: The footnote text.'].join('\n')
      const meta = parseMetadata(md)

      expect(meta.footnoteRefs).toEqual([
        { id: '1', position: { start: { line: 0, col: 9, offset: 9 }, end: { line: 0, col: 13, offset: 13 } } },
      ])
      expect(meta.footnotes).toEqual([
        { id: '1', position: { start: { line: 2, col: 0, offset: md.indexOf('[^1]:') }, end: { line: 2, col: 4, offset: md.indexOf('[^1]:') + 4 } } },
      ])
    })

    it('does not count the definition marker itself as a reference', () => {
      const md = '[^note]: definition text'
      const meta = parseMetadata(md)

      expect(meta.footnotes).toHaveLength(1)
      expect(meta.footnoteRefs).toBeUndefined()
    })
  })

  describe('referenceLinks', () => {
    it('parses a link reference definition', () => {
      const md = ['See [text][1].', '', '[1]: https://example.com'].join('\n')
      const meta = parseMetadata(md)

      expect(meta.referenceLinks).toEqual([
        { id: '1', link: 'https://example.com', position: { start: { line: 2, col: 0, offset: md.indexOf('[1]:') }, end: { line: 2, col: 3, offset: md.indexOf('[1]:') + 3 } } },
      ])
    })

    it('does not confuse a footnote definition with a reference link', () => {
      const md = '[^1]: not a reference link'
      const meta = parseMetadata(md)
      expect(meta.referenceLinks).toBeUndefined()
    })
  })

  describe('listItems', () => {
    it('records a flat list with parent -1', () => {
      const md = ['- one', '- two'].join('\n')
      const meta = parseMetadata(md)

      expect(meta.listItems).toEqual([
        { position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 5, offset: 5 } }, parent: -1 },
        { position: { start: { line: 1, col: 0, offset: 6 }, end: { line: 1, col: 5, offset: 11 } }, parent: -1 },
      ])
    })

    it('nests indented items under their parent line', () => {
      const md = ['- parent', '  - child'].join('\n')
      const meta = parseMetadata(md)

      expect(meta.listItems?.[0]).toMatchObject({ parent: -1 })
      expect(meta.listItems?.[1]).toMatchObject({ parent: 0 })
    })

    it('extracts the task checkbox character', () => {
      const md = ['- [ ] todo', '- [x] done'].join('\n')
      const meta = parseMetadata(md)

      expect(meta.listItems?.[0]?.task).toBe(' ')
      expect(meta.listItems?.[1]?.task).toBe('x')
    })

    it('extracts a trailing block id', () => {
      const meta = parseMetadata('- item ^my-id')
      expect(meta.listItems?.[0]?.id).toBe('my-id')
    })

    it('resets nesting between unrelated lists', () => {
      const md = ['- a', '  - b', '', 'paragraph', '', '- c'].join('\n')
      const meta = parseMetadata(md)
      const last = meta.listItems?.at(-1)

      expect(last).toMatchObject({ parent: -1 })
    })
  })

  describe('sections', () => {
    it('produces a yaml section for frontmatter', () => {
      const md = ['---', 'title: x', '---', 'body'].join('\n')
      const meta = parseMetadata(md)

      expect(meta.sections?.[0]).toMatchObject({ type: 'yaml' })
    })

    it('segments heading, paragraph, code, list and table', () => {
      const md = [
        '# Title',
        '',
        'A paragraph.',
        '',
        '```js',
        'const a = 1',
        '```',
        '',
        '- one',
        '- two',
        '',
        '| a | b |',
        '| - | - |',
        '| 1 | 2 |',
      ].join('\n')
      const meta = parseMetadata(md)

      expect(meta.sections?.map((s) => s.type)).toEqual(['heading', 'paragraph', 'code', 'list', 'table'])
    })

    it('assigns a section id from a trailing block reference', () => {
      const md = ['A paragraph. ^ref'].join('\n')
      const meta = parseMetadata(md)

      expect(meta.sections?.[0]).toMatchObject({ type: 'paragraph', id: 'ref' })
    })

    it('groups a blockquote spanning multiple lines', () => {
      const md = ['> line one', '> line two'].join('\n')
      const meta = parseMetadata(md)

      expect(meta.sections).toEqual([
        { type: 'blockquote', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 1, col: 10, offset: md.length } } },
      ])
    })

    it('emits a thematicBreak section for a horizontal rule', () => {
      const md = ['text', '', '---', '', 'more'].join('\n')
      const meta = parseMetadata(md)

      expect(meta.sections?.map((s) => s.type)).toEqual(['paragraph', 'thematicBreak', 'paragraph'])
    })
  })

  describe('blocks (regression)', () => {
    it('still resolves block ids alongside the new fields', () => {
      const meta = parseMetadata('A paragraph. ^p')
      expect(meta.blocks?.['p']).toBeDefined()
    })
  })

  describe('CRLF handling', () => {
    it('parses content with Windows line endings the same as LF', () => {
      const lf = parseMetadata('# Title\r\n\r\nBody #tag')
      expect(lf.headings?.[0]?.heading).toBe('Title')
      expect(lf.tags?.[0]?.tag).toBe('#tag')
    })
  })
})
