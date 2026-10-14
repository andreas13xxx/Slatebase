import { describe, it, expect } from 'vitest'
import { computeLinkpath, toNewLinkFormat } from './link-text'

const note = { path: 'notes/Idea.md', name: 'Idea.md', extension: 'md' }
const image = { path: 'assets/Photo.png', name: 'Photo.png', extension: 'png' }

describe('computeLinkpath', () => {
  it('uses the bare name for a unique markdown file and drops .md', () => {
    expect(computeLinkpath(note, 'index.md', [note.path, 'index.md'], 'shortest', true)).toBe('Idea')
  })

  it('keeps the extension of non-markdown files', () => {
    expect(computeLinkpath(image, 'index.md', [image.path], 'shortest', true)).toBe('Photo.png')
  })

  it('keeps .md when omitMdExtension is false', () => {
    expect(computeLinkpath(note, 'index.md', [note.path], 'shortest', false)).toBe('Idea.md')
  })

  it('falls back to the full path when the name is not unique (case-insensitive)', () => {
    const paths = [note.path, 'archive/idea.md']
    expect(computeLinkpath(note, 'index.md', paths, 'shortest', true)).toBe('notes/Idea')
  })

  it('builds a path relative to the source folder', () => {
    expect(computeLinkpath(note, 'journal/2026/today.md', [], 'relative', true)).toBe('../../notes/Idea')
    expect(computeLinkpath(note, 'notes/other.md', [], 'relative', true)).toBe('Idea')
    expect(computeLinkpath(note, 'root.md', [], 'relative', true)).toBe('notes/Idea')
  })

  it('uses the full vault path for the absolute format', () => {
    expect(computeLinkpath(image, 'notes/x.md', [], 'absolute', true)).toBe('assets/Photo.png')
  })
})

describe('toNewLinkFormat', () => {
  it('accepts known formats and defaults everything else to shortest', () => {
    expect(toNewLinkFormat('relative')).toBe('relative')
    expect(toNewLinkFormat('absolute')).toBe('absolute')
    expect(toNewLinkFormat(null)).toBe('shortest')
    expect(toNewLinkFormat('bogus')).toBe('shortest')
  })
})
