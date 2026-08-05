import { describe, it, expect } from 'vitest'
import { parseBlocks } from './block-cache'

/** Slice a document with a block's recorded position, as a plugin would. */
function slice(content: string, id: string): string[] {
  const block = parseBlocks(content)[id]!
  return content.split('\n').slice(block.position.start.line, block.position.end.line + 1)
}

describe('parseBlocks', () => {
  it('finds a trailing marker on a paragraph', () => {
    const md = ['A paragraph. ^abc'].join('\n')

    expect(parseBlocks(md)['abc']).toMatchObject({ id: 'abc' })
  })

  it('returns nothing for a document without markers', () => {
    expect(parseBlocks('# Title\n\nJust text.')).toEqual({})
  })

  it('accepts letters, digits and dashes in an id', () => {
    expect(Object.keys(parseBlocks('x ^my-block-2'))).toEqual(['my-block-2'])
  })

  it('ignores a caret that is not a block marker', () => {
    expect(parseBlocks('2^10 is 1024')).toEqual({})
    expect(parseBlocks('math: a^b + c')).toEqual({})
  })

  describe('block extent', () => {
    it('spans a whole multi-line paragraph', () => {
      const md = ['first line', 'second line', 'third line ^p'].join('\n')

      expect(slice(md, 'p')).toEqual(['first line', 'second line', 'third line ^p'])
    })

    it('stops at the blank line above the paragraph', () => {
      const md = ['earlier text', '', 'the block', 'continues ^p'].join('\n')

      expect(slice(md, 'p')).toEqual(['the block', 'continues ^p'])
    })

    it('covers only its own line for a list item', () => {
      const md = ['- one', '- two ^item', '- three'].join('\n')

      expect(slice(md, 'item')).toEqual(['- two ^item'])
    })

    it('covers only its own line for a heading', () => {
      const md = ['# Title ^h', 'body text'].join('\n')

      expect(slice(md, 'h')).toEqual(['# Title ^h'])
    })

    it('includes the heading that opens the paragraph run', () => {
      const md = ['## Section', 'body ^b'].join('\n')

      expect(slice(md, 'b')).toEqual(['## Section', 'body ^b'])
    })
  })

  describe('standalone marker on its own line', () => {
    it('labels the paragraph above it', () => {
      const md = ['some text', 'more text', '', '^solo'].join('\n')

      expect(slice(md, 'solo')).toEqual(['some text', 'more text', '', '^solo'])
    })

    it('labels a table above it', () => {
      const md = ['| a | b |', '| - | - |', '| 1 | 2 |', '^tbl'].join('\n')

      expect(slice(md, 'tbl')).toEqual(['| a | b |', '| - | - |', '| 1 | 2 |', '^tbl'])
    })

    it('labels a fenced code block above it, whole', () => {
      const md = ['```js', 'const a = 1', '```', '^code'].join('\n')

      expect(slice(md, 'code')).toEqual(['```js', 'const a = 1', '```', '^code'])
    })

    it('is ignored when there is nothing above it', () => {
      expect(parseBlocks('^orphan')).toEqual({})
    })
  })

  describe('markers that are not block ids', () => {
    it('ignores a marker inside a fenced code block', () => {
      const md = ['```js', 'const x = 1 // ^notablock', '```'].join('\n')

      expect(parseBlocks(md)).toEqual({})
    })

    it('ignores a marker inside frontmatter', () => {
      const md = ['---', 'note: text ^fm', '---', 'body'].join('\n')

      expect(parseBlocks(md)).toEqual({})
    })

    it('still finds markers after the frontmatter', () => {
      const md = ['---', 'title: x', '---', 'body ^real'].join('\n')

      expect(Object.keys(parseBlocks(md))).toEqual(['real'])
    })

    it('does not treat an unterminated frontmatter fence as covering the file', () => {
      const md = ['---', 'title: x', 'body ^real'].join('\n')

      expect(Object.keys(parseBlocks(md))).toEqual(['real'])
    })
  })

  describe('positions', () => {
    it('records offsets that slice the source correctly', () => {
      const md = ['intro', '', 'the block ^b'].join('\n')
      const { position } = parseBlocks(md)['b']!

      expect(md.slice(position.start.offset, position.end.offset)).toBe('the block ^b')
    })

    it('ends at the end of the marker line', () => {
      const md = ['a ^b'].join('\n')
      const { position } = parseBlocks(md)['b']!

      expect(position.end.col).toBe('a ^b'.length)
      expect(position.start).toMatchObject({ line: 0, col: 0, offset: 0 })
    })

    it('handles CRLF line endings', () => {
      const md = 'first\r\nsecond ^b'
      const { position } = parseBlocks(md)['b']!

      expect(position.end.line).toBe(1)
    })
  })

  describe('multiple and duplicate ids', () => {
    it('finds several distinct blocks', () => {
      const md = ['one ^a', '', 'two ^b', '', 'three ^c'].join('\n')

      expect(Object.keys(parseBlocks(md)).sort()).toEqual(['a', 'b', 'c'])
    })

    it('keeps the first occurrence when an id is duplicated', () => {
      const md = ['first ^dup', '', 'second ^dup'].join('\n')
      const block = parseBlocks(md)['dup']!

      expect(block.position.start.line).toBe(0)
    })
  })
})
