import { describe, expect, it } from 'vitest'
import { embedRef, extractBlockById, extractEmbeds, extractHeadingSection, stripFrontmatter } from './embed-extraction.js'

describe('stripFrontmatter', () => {
  it('removes a leading frontmatter block', () => {
    expect(stripFrontmatter('---\ntitle: x\ntags: [a]\n---\n# Hi\ntext')).toBe('# Hi\ntext')
  })

  it('handles CRLF and a BOM', () => {
    expect(stripFrontmatter('﻿---\r\na: 1\r\n---\r\nbody')).toBe('body')
  })

  it('leaves content without frontmatter unchanged', () => {
    expect(stripFrontmatter('# Hi\n---\nnot frontmatter')).toBe('# Hi\n---\nnot frontmatter')
  })

  it('leaves an unclosed frontmatter block unchanged', () => {
    expect(stripFrontmatter('---\na: 1\nbody')).toBe('---\na: 1\nbody')
  })

  it('does not treat a thematic break after text as frontmatter', () => {
    expect(stripFrontmatter('intro\n---\na\n---\nb')).toBe('intro\n---\na\n---\nb')
  })
})

describe('extractHeadingSection', () => {
  const doc = '# A\nintro\n## B\nb1\n### C\nc1\n## D\nd1'

  it('returns the section up to the next heading of the same or higher level', () => {
    expect(extractHeadingSection(doc, 'B')).toBe('## B\nb1\n### C\nc1')
  })

  it('matches case-insensitively', () => {
    expect(extractHeadingSection(doc, 'd')).toBe('## D\nd1')
  })

  it('returns the full content for an unknown heading (as the editor does)', () => {
    expect(extractHeadingSection(doc, 'Nope')).toBe(doc)
  })
})

describe('extractBlockById', () => {
  it('extracts a paragraph without the marker', () => {
    expect(extractBlockById('first\n\nline one\nline two ^abc\n\nlast', 'abc')).toBe('line one\nline two')
  })

  it('extracts a list item', () => {
    expect(extractBlockById('- a\n- b ^x1\n- c', 'x1')).toBe('- b')
  })

  it('extracts a heading with its section', () => {
    expect(extractBlockById('## H ^h\nbody\n## Next', 'h')).toBe('## H\nbody')
  })

  it('returns null for an unknown block', () => {
    expect(extractBlockById('text ^a', 'b')).toBeNull()
  })
})

describe('extractEmbeds', () => {
  it('finds wiki embeds with heading, block and display', () => {
    const embeds = extractEmbeds('![[Note]] ![[Note#Sec]] ![[Note#^b1]] ![[img.png|200]]')
    expect(embeds.map((e) => e.ref)).toEqual(['Note', 'Note#Sec', 'Note#^b1', 'img.png'])
    expect(embeds[1]).toMatchObject({ target: 'Note', heading: 'Sec', blockRef: null })
    expect(embeds[2]).toMatchObject({ target: 'Note', heading: null, blockRef: 'b1' })
  })

  it('finds local markdown images and decodes them, but not external URLs', () => {
    const embeds = extractEmbeds('![a](img/my%20pic.png) ![b](https://x.test/y.png) ![c](data:image/png;base64,AA) ![d](//cdn/x.png)')
    expect(embeds.map((e) => e.ref)).toEqual(['img/my pic.png'])
  })

  it('does not treat wikilinks as embeds', () => {
    expect(extractEmbeds('[[Note]] and [text](Note.md)')).toEqual([])
  })

  it('ignores embeds in fenced and inline code', () => {
    const md = '```\n![[hidden]]\n```\n`![[inline]]` ![[shown]]\n~~~\n![[tilde]]\n~~~'
    expect(extractEmbeds(md).map((e) => e.ref)).toEqual(['shown'])
  })

  it('lists each reference once', () => {
    expect(extractEmbeds('![[a]] ![[a]] ![[a]]')).toHaveLength(1)
  })

  it('ignores empty targets', () => {
    expect(extractEmbeds('![[]] ![[#x]] ![[ |y]]')).toEqual([])
  })
})

describe('embedRef', () => {
  it('prefers the block reference over a heading', () => {
    expect(embedRef('N', 'H', 'b')).toBe('N#^b')
    expect(embedRef('N', 'H', null)).toBe('N#H')
    expect(embedRef('N', null, null)).toBe('N')
  })
})
