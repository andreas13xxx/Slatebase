import { describe, it, expect } from 'vitest'
import { inlineTitleFromPath } from './useShowInlineTitle'

describe('inlineTitleFromPath', () => {
  it('strips the .md extension from a note', () => {
    expect(inlineTitleFromPath('folder/My Note.md')).toBe('My Note')
    expect(inlineTitleFromPath('Top.md')).toBe('Top')
  })

  it('keeps a non-markdown extension', () => {
    expect(inlineTitleFromPath('a/Board.canvas')).toBe('Board.canvas')
  })

  it('uses only the base name', () => {
    expect(inlineTitleFromPath('deep/nested/path/Note.md')).toBe('Note')
  })
})
