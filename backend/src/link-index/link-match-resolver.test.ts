import { describe, it, expect } from 'vitest'
import {
  resolveWikilinkTargetOnTree,
  resolveWikilinkTargetWithAlternatives,
  resolveAmbiguousMatch,
  collectFilesSorted,
  resolvePathTarget,
  type FileCandidate,
} from './link-match-resolver.js'
import type { DirectoryTree } from '../vault/index.js'

/** Mirrors the sample tree used by the frontend's link-resolver.test.ts, for behavioral parity. */
function file(name: string, path: string): DirectoryTree {
  return { name, type: 'file', path }
}

function dir(name: string, path: string, children: DirectoryTree[]): DirectoryTree {
  return { name, type: 'directory', path, children }
}

const sampleTree: DirectoryTree = dir('vault', '', [
  file('README.md', 'README.md'),
  file('Notes.md', 'Notes.md'),
  dir('folder', 'folder', [
    file('alpha.md', 'folder/alpha.md'),
    file('Beta.md', 'folder/Beta.md'),
    dir('sub', 'folder/sub', [
      file('deep.md', 'folder/sub/deep.md'),
      file('Notes.md', 'folder/sub/Notes.md'),
    ]),
  ]),
  dir('another', 'another', [
    file('gamma.md', 'another/gamma.md'),
    file('image.png', 'another/image.png'),
  ]),
])

describe('resolveWikilinkTargetOnTree', () => {
  it('returns null for empty target', () => {
    expect(resolveWikilinkTargetOnTree('', sampleTree, '')).toBeNull()
    expect(resolveWikilinkTargetOnTree('   ', sampleTree, '')).toBeNull()
  })

  it('resolves exact file name match (case-insensitive)', () => {
    expect(resolveWikilinkTargetOnTree('README.md', sampleTree, '')).toBe('README.md')
    expect(resolveWikilinkTargetOnTree('readme.md', sampleTree, '')).toBe('README.md')
    expect(resolveWikilinkTargetOnTree('README.MD', sampleTree, '')).toBe('README.md')
  })

  it('resolves with .md extension fallback', () => {
    expect(resolveWikilinkTargetOnTree('README', sampleTree, '')).toBe('README.md')
    expect(resolveWikilinkTargetOnTree('alpha', sampleTree, '')).toBe('folder/alpha.md')
    expect(resolveWikilinkTargetOnTree('gamma', sampleTree, '')).toBe('another/gamma.md')
  })

  it('resolves case-insensitively', () => {
    expect(resolveWikilinkTargetOnTree('beta.md', sampleTree, '')).toBe('folder/Beta.md')
    expect(resolveWikilinkTargetOnTree('BETA', sampleTree, '')).toBe('folder/Beta.md')
  })

  it('resolves a bare name to a file in a subfolder (the case the literal-path Link_Index misses)', () => {
    expect(resolveWikilinkTargetOnTree('deep', sampleTree, '')).toBe('folder/sub/deep.md')
  })

  it('resolves path-based targets exactly', () => {
    expect(resolveWikilinkTargetOnTree('folder/alpha', sampleTree, '')).toBe('folder/alpha.md')
    expect(resolveWikilinkTargetOnTree('folder/alpha.md', sampleTree, '')).toBe('folder/alpha.md')
  })

  it('prefers the shortest path for ambiguous names with no same-folder match', () => {
    // "Notes.md" exists at root (1 segment) and in folder/sub/ (3 segments).
    expect(resolveWikilinkTargetOnTree('Notes.md', sampleTree, '')).toBe('Notes.md')
  })

  it('prefers a same-folder match over a shorter path when sourcePath is known', () => {
    expect(resolveWikilinkTargetOnTree('Notes.md', sampleTree, 'folder/sub/current.md')).toBe('folder/sub/Notes.md')
  })

  it('returns null when no candidate matches', () => {
    expect(resolveWikilinkTargetOnTree('DoesNotExist', sampleTree, '')).toBeNull()
  })

  it('does not treat "Note" and "Note.md" as ambiguous with each other', () => {
    const tree = dir('vault', '', [file('Note.md', 'Note.md'), file('Note', 'Note')])
    // Exact-name match ("Note") wins outright — the .md-appended candidate never enters the pool.
    expect(resolveWikilinkTargetOnTree('Note', tree, '')).toBe('Note')
  })
})

describe('resolveWikilinkTargetWithAlternatives', () => {
  it('reports zero alternatives for a single match', () => {
    const result = resolveWikilinkTargetWithAlternatives('alpha', sampleTree, '')
    expect(result?.alternativeCount).toBe(0)
  })

  it('reports the count of other same-named candidates', () => {
    const result = resolveWikilinkTargetWithAlternatives('Notes.md', sampleTree, '')
    expect(result?.alternativeCount).toBe(1)
  })
})

describe('resolveAmbiguousMatch', () => {
  it('returns the single candidate unchanged when there is only one', () => {
    const candidates: FileCandidate[] = [{ name: 'a.md', path: 'a.md' }]
    const result = resolveAmbiguousMatch(candidates)
    expect(result).toEqual({ resolved: candidates[0], alternativeCount: 0 })
  })

  it('falls back to alphabetical order as the final tie-break', () => {
    const candidates: FileCandidate[] = [
      { name: 'Note.md', path: 'z/Note.md' },
      { name: 'Note.md', path: 'a/Note.md' },
    ]
    const result = resolveAmbiguousMatch(candidates)
    expect(result.resolved.path).toBe('a/Note.md')
    expect(result.alternativeCount).toBe(1)
  })
})

describe('collectFilesSorted', () => {
  it('collects only files, depth-first and alphabetically', () => {
    const files = collectFilesSorted(sampleTree)
    expect(files.map((f) => f.path)).toEqual([
      'another/gamma.md',
      'another/image.png',
      'folder/alpha.md',
      'folder/Beta.md',
      'folder/sub/deep.md',
      'folder/sub/Notes.md',
      'Notes.md',
      'README.md',
    ])
  })
})

describe('resolvePathTarget', () => {
  it('matches an exact path case-insensitively', () => {
    const files = collectFilesSorted(sampleTree)
    expect(resolvePathTarget('FOLDER/ALPHA.MD', files)).toBe('folder/alpha.md')
  })

  it('returns null when nothing matches', () => {
    const files = collectFilesSorted(sampleTree)
    expect(resolvePathTarget('nowhere/nothing', files)).toBeNull()
  })
})
