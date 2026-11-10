import { describe, it, expect } from 'vitest'
import { folderMoveTarget } from './base-folder-move'

describe('folderMoveTarget', () => {
  it('moves a root note into a folder', () => {
    expect(folderMoveTarget('note.md', 'Projekte')).toBe('Projekte/note.md')
  })

  it('moves a note between folders and keeps its file name', () => {
    expect(folderMoveTarget('A/note.md', 'B/C')).toBe('B/C/note.md')
  })

  it('moves a note to the vault root', () => {
    expect(folderMoveTarget('A/B/note.md', '')).toBe('note.md')
  })

  it('returns null when the note is already in that folder', () => {
    expect(folderMoveTarget('A/note.md', 'A')).toBeNull()
    expect(folderMoveTarget('note.md', '')).toBeNull()
  })

  it('ignores stray slashes around the target folder', () => {
    expect(folderMoveTarget('note.md', '/Projekte/')).toBe('Projekte/note.md')
  })
})
