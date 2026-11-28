import { describe, it, expect } from 'vitest'
import { findMarkdownHeadingLines } from './markdownHeadings'

describe('findMarkdownHeadingLines', () => {
  it('finds ATX headings with one-based line numbers', () => {
    expect(findMarkdownHeadingLines('# A\n\ntext\n## B')).toEqual([
      { lineNumber: 1, level: 1, text: 'A' },
      { lineNumber: 4, level: 2, text: 'B' },
    ])
  })

  it('ignores headings inside fenced code blocks', () => {
    expect(findMarkdownHeadingLines('```markdown\n# A\n```\n# B')).toEqual([{ lineNumber: 4, level: 1, text: 'B' }])
  })

  it('does not read frontmatter as a setext heading', () => {
    expect(findMarkdownHeadingLines('---\ntitle: x\n---\n# H')).toEqual([{ lineNumber: 4, level: 1, text: 'H' }])
  })
})
