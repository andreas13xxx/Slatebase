import { describe, it, expect } from 'vitest'
import {
  scanFencedCodeBlocks,
  matchRenderedBlocks,
  toSectionInfo,
} from './markdown-sections'

describe('scanFencedCodeBlocks', () => {
  it('finds a single block and reports the fence lines', () => {
    const md = ['# Title', '', '```dataview', 'list', '```', '', 'after'].join('\n')

    expect(scanFencedCodeBlocks(md)).toEqual([
      { language: 'dataview', content: 'list', lineStart: 2, lineEnd: 4 },
    ])
  })

  it('reports lineStart and lineEnd as the fence lines themselves', () => {
    // Obsidian's section spans the fences, so a plugin replacing the range
    // replaces the whole block including its delimiters.
    const md = ['```js', 'a', 'b', '```'].join('\n')
    const [block] = scanFencedCodeBlocks(md)

    expect(block).toMatchObject({ lineStart: 0, lineEnd: 3, content: 'a\nb' })
  })

  it('finds multiple blocks in order', () => {
    const md = ['```a', '1', '```', 'text', '```b', '2', '```'].join('\n')

    expect(scanFencedCodeBlocks(md).map((b) => b.language)).toEqual(['a', 'b'])
    expect(scanFencedCodeBlocks(md)[1]).toMatchObject({ lineStart: 4, lineEnd: 6 })
  })

  it('records an empty language when the info string is absent', () => {
    const md = ['```', 'plain', '```'].join('\n')

    expect(scanFencedCodeBlocks(md)[0]!.language).toBe('')
  })

  it('takes only the first info-string word as the language', () => {
    const md = ['```js {highlight}', 'x', '```'].join('\n')

    expect(scanFencedCodeBlocks(md)[0]!.language).toBe('js')
  })

  it('lowercases the language', () => {
    expect(scanFencedCodeBlocks(['```JS', 'x', '```'].join('\n'))[0]!.language).toBe('js')
  })

  it('supports tilde fences', () => {
    const md = ['~~~python', 'x', '~~~'].join('\n')

    expect(scanFencedCodeBlocks(md)[0]).toMatchObject({ language: 'python', content: 'x' })
  })

  it('handles an empty block', () => {
    const md = ['```js', '```'].join('\n')

    expect(scanFencedCodeBlocks(md)[0]).toMatchObject({ content: '', lineStart: 0, lineEnd: 1 })
  })

  it('returns nothing for a document without fences', () => {
    expect(scanFencedCodeBlocks('# Just text\n\nA paragraph.')).toEqual([])
  })

  describe('nesting and termination', () => {
    it('does not close a longer fence on a shorter one', () => {
      // The inner ``` is content, not a terminator.
      const md = ['````md', '```', 'inner', '```', '````'].join('\n')
      const blocks = scanFencedCodeBlocks(md)

      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toMatchObject({ lineStart: 0, lineEnd: 4, content: '```\ninner\n```' })
    })

    it('does not close a backtick fence on a tilde fence', () => {
      const md = ['```js', '~~~', '```'].join('\n')
      const blocks = scanFencedCodeBlocks(md)

      expect(blocks).toHaveLength(1)
      expect(blocks[0]!.content).toBe('~~~')
    })

    it('runs an unclosed fence to the end of the document', () => {
      const md = ['```js', 'a', 'b'].join('\n')

      expect(scanFencedCodeBlocks(md)[0]).toMatchObject({ lineStart: 0, lineEnd: 2, content: 'a\nb' })
    })

    it('does not treat a line with a closing info string as a terminator', () => {
      const md = ['```js', 'a', '``` trailing', '```'].join('\n')

      expect(scanFencedCodeBlocks(md)[0]).toMatchObject({ lineEnd: 3 })
    })

    it('ignores a backtick fence whose info string contains a backtick', () => {
      // ``` `code` ``` is inline code, not a fence.
      expect(scanFencedCodeBlocks('``` `x` ```')).toEqual([])
    })

    it('allows up to three leading spaces on the fence', () => {
      const md = ['   ```js', 'x', '   ```'].join('\n')

      expect(scanFencedCodeBlocks(md)).toHaveLength(1)
    })
  })
})

describe('matchRenderedBlocks', () => {
  const source = ['```a', 'one', '```', '', '```b', 'two', '```'].join('\n')
  const blocks = scanFencedCodeBlocks(source)

  it('matches blocks by language and content in order', () => {
    const matches = matchRenderedBlocks(
      [
        { language: 'a', content: 'one' },
        { language: 'b', content: 'two' },
      ],
      blocks,
    )

    expect(matches.map((m) => m?.lineStart)).toEqual([0, 4])
  })

  it('tolerates the trailing newline that textContent carries', () => {
    const matches = matchRenderedBlocks([{ language: 'a', content: 'one\n' }], blocks)

    expect(matches[0]?.lineStart).toBe(0)
  })

  it('returns null rather than a wrong range when nothing matches', () => {
    const matches = matchRenderedBlocks([{ language: 'zzz', content: 'nope' }], blocks)

    expect(matches).toEqual([null])
  })

  it('keeps later blocks aligned when an earlier one does not match', () => {
    // A block the renderer produced but the scanner never saw must not shift
    // the ones after it.
    const matches = matchRenderedBlocks(
      [
        { language: 'ghost', content: 'not in source' },
        { language: 'b', content: 'two' },
      ],
      blocks,
    )

    expect(matches[0]).toBeNull()
    expect(matches[1]?.lineStart).toBe(4)
  })

  it('distinguishes two blocks of the same language by content', () => {
    const src = ['```js', 'first', '```', '```js', 'second', '```'].join('\n')
    const scanned = scanFencedCodeBlocks(src)

    const matches = matchRenderedBlocks(
      [
        { language: 'js', content: 'first' },
        { language: 'js', content: 'second' },
      ],
      scanned,
    )

    expect(matches.map((m) => m?.lineStart)).toEqual([0, 3])
  })

  it('does not reuse a source block for two rendered blocks', () => {
    const src = ['```js', 'same', '```'].join('\n')
    const scanned = scanFencedCodeBlocks(src)

    const matches = matchRenderedBlocks(
      [
        { language: 'js', content: 'same' },
        { language: 'js', content: 'same' },
      ],
      scanned,
    )

    expect(matches[0]?.lineStart).toBe(0)
    expect(matches[1]).toBeNull()
  })
})

describe('toSectionInfo', () => {
  it('carries the full document text alongside the range', () => {
    const source = ['```js', 'x', '```'].join('\n')
    const [block] = scanFencedCodeBlocks(source)

    expect(toSectionInfo(source, block!)).toEqual({ text: source, lineStart: 0, lineEnd: 2 })
  })

  it('produces a range a plugin can slice the source with', () => {
    const source = ['# Title', '', '```js', 'code', '```', 'after'].join('\n')
    const [block] = scanFencedCodeBlocks(source)
    const info = toSectionInfo(source, block!)

    const sliced = info.text.split('\n').slice(info.lineStart, info.lineEnd + 1)
    expect(sliced).toEqual(['```js', 'code', '```'])
  })
})
