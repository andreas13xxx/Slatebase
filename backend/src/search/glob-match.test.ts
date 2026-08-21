// Unit tests for globMatch

import { describe, it, expect } from 'vitest'
import { globMatch } from './glob-match.js'

describe('globMatch', () => {
  describe('* wildcard (single segment)', () => {
    it('matches any filename', () => {
      expect(globMatch('notes.md', '*.md')).toBe(true)
    })

    it('does not cross directory boundaries', () => {
      expect(globMatch('folder/notes.md', '*.md')).toBe(false)
    })

    it('matches partial filename', () => {
      expect(globMatch('project-alpha.md', 'project-*.md')).toBe(true)
    })
  })

  describe('** wildcard (any depth)', () => {
    it('matches files in any subdirectory', () => {
      expect(globMatch('a/b/c/file.md', '**/*.md')).toBe(true)
    })

    it('matches files in root', () => {
      expect(globMatch('file.md', '**/*.md')).toBe(true)
    })

    it('matches a directory prefix with trailing **', () => {
      expect(globMatch('Projekte/sub/file.md', 'Projekte/**')).toBe(true)
    })

    it('matches only the exact prefix', () => {
      expect(globMatch('Other/file.md', 'Projekte/**')).toBe(false)
    })

    it('handles ** at start', () => {
      expect(globMatch('deep/nested/path.txt', '**')).toBe(true)
    })
  })

  describe('? wildcard (single char)', () => {
    it('matches a single character', () => {
      expect(globMatch('file1.md', 'file?.md')).toBe(true)
    })

    it('does not match zero characters', () => {
      expect(globMatch('file.md', 'file?.md')).toBe(false)
    })

    it('does not cross directory boundary', () => {
      expect(globMatch('a/b.md', '?/b.md')).toBe(true)
      expect(globMatch('ab/b.md', '?/b.md')).toBe(false)
    })
  })

  describe('case insensitivity', () => {
    it('matches regardless of case', () => {
      expect(globMatch('Folder/File.MD', 'folder/*.md')).toBe(true)
    })
  })

  describe('special characters', () => {
    it('escapes regex-special characters in the pattern', () => {
      expect(globMatch('file (1).md', 'file (1).md')).toBe(true)
    })

    it('dot is literal, not regex wildcard', () => {
      expect(globMatch('fileXmd', 'file.md')).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('empty pattern matches empty string', () => {
      expect(globMatch('', '')).toBe(true)
    })

    it('** alone matches everything', () => {
      expect(globMatch('any/path/at/all.txt', '**')).toBe(true)
    })

    it('handles pattern with only *', () => {
      expect(globMatch('file', '*')).toBe(true)
      expect(globMatch('path/file', '*')).toBe(false)
    })
  })
})
