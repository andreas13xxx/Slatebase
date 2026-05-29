import { describe, it, expect } from 'vitest'
import { resolveWikilinkTarget, collectFilesSorted, resolvePathTarget } from './link-resolver'
import type { DirectoryTree } from '../types'

/**
 * Helper to create a file node.
 */
function file(name: string, path: string): DirectoryTree {
  return { name, type: 'file', path }
}

/**
 * Helper to create a directory node.
 */
function dir(name: string, path: string, children: DirectoryTree[]): DirectoryTree {
  return { name, type: 'directory', path, children }
}

/** Sample vault tree for testing. */
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

describe('resolveWikilinkTarget', () => {
  it('returns null for empty target', () => {
    expect(resolveWikilinkTarget('', sampleTree)).toBeNull()
    expect(resolveWikilinkTarget('   ', sampleTree)).toBeNull()
  })

  it('returns null for null tree', () => {
    expect(resolveWikilinkTarget('Notes', null)).toBeNull()
  })

  it('resolves exact file name match (case-insensitive)', () => {
    expect(resolveWikilinkTarget('README.md', sampleTree)).toBe('README.md')
    expect(resolveWikilinkTarget('readme.md', sampleTree)).toBe('README.md')
    expect(resolveWikilinkTarget('README.MD', sampleTree)).toBe('README.md')
  })

  it('resolves with .md extension fallback', () => {
    expect(resolveWikilinkTarget('README', sampleTree)).toBe('README.md')
    // "Notes" matches first in depth-first alphabetical order
    // "folder/sub/Notes.md" comes before root "Notes.md" because "folder" < "Notes.md" alphabetically
    expect(resolveWikilinkTarget('Notes', sampleTree)).not.toBeNull()
    expect(resolveWikilinkTarget('alpha', sampleTree)).toBe('folder/alpha.md')
    expect(resolveWikilinkTarget('gamma', sampleTree)).toBe('another/gamma.md')
  })

  it('resolves case-insensitively', () => {
    expect(resolveWikilinkTarget('beta.md', sampleTree)).toBe('folder/Beta.md')
    expect(resolveWikilinkTarget('BETA', sampleTree)).toBe('folder/Beta.md')
  })

  it('returns first match in depth-first alphabetical order for ambiguous names', () => {
    // "Notes.md" exists at root and in folder/sub/
    // In depth-first alphabetical order, directories are traversed before later siblings
    // "folder" sorts before "Notes.md" so folder/sub/Notes.md is found first
    const result = resolveWikilinkTarget('Notes.md', sampleTree)
    expect(result).toBe('folder/sub/Notes.md')
  })

  it('returns first match when file sorts before directories', () => {
    // Tree where a file sorts alphabetically before any directory
    const tree: DirectoryTree = dir('vault', '', [
      file('aaa.md', 'aaa.md'),
      dir('zzz', 'zzz', [
        file('aaa.md', 'zzz/aaa.md'),
      ]),
    ])
    // "aaa.md" at root sorts before "zzz" directory
    expect(resolveWikilinkTarget('aaa.md', tree)).toBe('aaa.md')
  })

  it('resolves path-based targets', () => {
    expect(resolveWikilinkTarget('folder/alpha.md', sampleTree)).toBe('folder/alpha.md')
    expect(resolveWikilinkTarget('folder/alpha', sampleTree)).toBe('folder/alpha.md')
    expect(resolveWikilinkTarget('folder/sub/deep', sampleTree)).toBe('folder/sub/deep.md')
  })

  it('resolves path-based targets case-insensitively', () => {
    expect(resolveWikilinkTarget('Folder/Alpha.md', sampleTree)).toBe('folder/alpha.md')
    expect(resolveWikilinkTarget('FOLDER/BETA', sampleTree)).toBe('folder/Beta.md')
  })

  it('returns null for non-existent targets', () => {
    expect(resolveWikilinkTarget('nonexistent', sampleTree)).toBeNull()
    expect(resolveWikilinkTarget('folder/nonexistent', sampleTree)).toBeNull()
  })

  it('resolves non-markdown files', () => {
    expect(resolveWikilinkTarget('image.png', sampleTree)).toBe('another/image.png')
  })

  it('trims whitespace from target', () => {
    // Trimmed "Notes" resolves to a Notes.md file
    expect(resolveWikilinkTarget('  Notes  ', sampleTree)).not.toBeNull()
    // Unique file resolves correctly with whitespace
    expect(resolveWikilinkTarget('  alpha  ', sampleTree)).toBe('folder/alpha.md')
  })
})

describe('collectFilesSorted', () => {
  it('collects all files in depth-first alphabetical order', () => {
    const files = collectFilesSorted(sampleTree)
    const paths = files.map(f => f.path)

    // Root-level files sorted alphabetically: Notes.md, README.md
    // Then "another" directory (alphabetically before "folder"): gamma.md, image.png
    // Then "folder" directory: alpha.md, Beta.md, then sub/: deep.md, Notes.md
    expect(paths).toEqual([
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

  it('returns empty array for empty directory', () => {
    const emptyTree: DirectoryTree = dir('vault', '', [])
    expect(collectFilesSorted(emptyTree)).toEqual([])
  })

  it('handles single file at root', () => {
    const singleFile: DirectoryTree = file('test.md', 'test.md')
    expect(collectFilesSorted(singleFile)).toEqual([{ name: 'test.md', path: 'test.md' }])
  })

  it('handles directory without children property', () => {
    const noChildren: DirectoryTree = { name: 'empty', type: 'directory', path: 'empty' }
    expect(collectFilesSorted(noChildren)).toEqual([])
  })
})

describe('resolvePathTarget', () => {
  const files = collectFilesSorted(sampleTree)

  it('resolves exact path match', () => {
    expect(resolvePathTarget('folder/alpha.md', files)).toBe('folder/alpha.md')
  })

  it('resolves with .md fallback', () => {
    expect(resolvePathTarget('folder/alpha', files)).toBe('folder/alpha.md')
  })

  it('resolves case-insensitively', () => {
    expect(resolvePathTarget('FOLDER/ALPHA.MD', files)).toBe('folder/alpha.md')
  })

  it('resolves partial path suffix', () => {
    expect(resolvePathTarget('sub/deep.md', files)).toBe('folder/sub/deep.md')
    expect(resolvePathTarget('sub/deep', files)).toBe('folder/sub/deep.md')
  })

  it('returns null for non-existent path', () => {
    expect(resolvePathTarget('nonexistent/file', files)).toBeNull()
  })
})
