import { describe, it, expect } from 'vitest'
import { splitSlides } from './slides'

describe('splitSlides', () => {
  it('splits on --- lines', () => {
    expect(splitSlides('# A\n\n---\n\n# B\n\n---\nC')).toEqual(['# A', '# B', 'C'])
    expect(splitSlides('Title\n---\nText')).toEqual(['Title\n---\nText'])
  })

  it('drops frontmatter', () => {
    expect(splitSlides('---\ntitle: x\n---\n# A\n\n---\n# B')).toEqual(['# A', '# B'])
  })

  it('keeps --- inside fenced code', () => {
    expect(splitSlides('```yaml\na: 1\n---\nb: 2\n```\n\n---\nnext')).toEqual(['```yaml\na: 1\n---\nb: 2\n```', 'next'])
  })

  it('skips empty slides and handles CRLF', () => {
    expect(splitSlides('A\r\n\r\n---\r\n---\r\nB')).toEqual(['A', 'B'])
    expect(splitSlides('')).toEqual([])
  })
})
