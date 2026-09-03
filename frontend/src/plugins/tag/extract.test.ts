import { describe, it, expect } from 'vitest'
import { extractTags, extractInlineTags, extractFrontmatterTags } from './extract'

describe('extractInlineTags', () => {
  it('extracts a plain tag', () => {
    expect(extractInlineTags('Some #todo here')).toEqual(['todo'])
  })

  it('keeps a nested tag as one name', () => {
    expect(extractInlineTags('#Rezepte/Hauptspeise')).toEqual(['Rezepte/Hauptspeise'])
  })

  it('accepts a tag at the start of a line', () => {
    // The indexer records this; only a `# ` with a space is a heading.
    expect(extractInlineTags('#todo\ntext')).toEqual(['todo'])
  })

  it('ignores an ATX heading', () => {
    expect(extractInlineTags('# Überschrift')).toEqual([])
  })

  it('handles umlauts and accents', () => {
    expect(extractInlineTags('#Übung und #café')).toEqual(['Übung', 'café'])
  })

  it('does not match a # inside a word or URL', () => {
    expect(extractInlineTags('C# and http://x.test/page#anchor')).toEqual([])
  })

  it('ignores tags in fenced code blocks', () => {
    expect(extractInlineTags('```\n#nope\n```\n#yes')).toEqual(['yes'])
  })

  it('ignores tags in tilde-fenced code blocks', () => {
    expect(extractInlineTags('~~~\n#nope\n~~~\n#yes')).toEqual(['yes'])
  })

  it('ignores tags in indented code blocks', () => {
    expect(extractInlineTags('    #nope\n#yes')).toEqual(['yes'])
  })

  it('ignores tags in inline code', () => {
    expect(extractInlineTags('`#nope` but #yes')).toEqual(['yes'])
  })

  it('deduplicates repeated tags', () => {
    expect(extractInlineTags('#todo and #todo again')).toEqual(['todo'])
  })

  it('survives CRLF line endings', () => {
    expect(extractInlineTags('#eins\r\n#zwei')).toEqual(['eins', 'zwei'])
  })
})

describe('extractFrontmatterTags', () => {
  it('reads an inline array', () => {
    expect(extractFrontmatterTags('---\ntags: [a, b]\n---\n')).toEqual(['a', 'b'])
  })

  it('reads a dash list', () => {
    expect(extractFrontmatterTags('---\ntags:\n  - a\n  - b\n---\n')).toEqual(['a', 'b'])
  })

  it('reads the singular key', () => {
    expect(extractFrontmatterTags('---\ntag: solo\n---\n')).toEqual(['solo'])
  })

  it('splits a comma-separated scalar', () => {
    expect(extractFrontmatterTags('---\ntags: a, b\n---\n')).toEqual(['a', 'b'])
  })

  it('strips a leading hash', () => {
    expect(extractFrontmatterTags('---\ntags: ["#a"]\n---\n')).toEqual(['a'])
  })

  it('returns nothing without frontmatter', () => {
    expect(extractFrontmatterTags('#inline only')).toEqual([])
  })

  it('returns nothing for unparseable frontmatter', () => {
    expect(extractFrontmatterTags('---\ntags: [unclosed\n---\n')).toEqual([])
  })
})

describe('extractTags', () => {
  it('merges frontmatter and inline tags without duplicates', () => {
    const content = '---\ntags: [rezept, Rezepte/Nachtisch]\n---\n\nText mit #rezept und #neu'

    expect(extractTags(content).sort()).toEqual(['Rezepte/Nachtisch', 'neu', 'rezept'])
  })
})
