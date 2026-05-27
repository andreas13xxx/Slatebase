import { describe, it, expect } from 'vitest'
import { validateFileName, normalizeFileName, getSelectionRange } from './fileValidation'

describe('validateFileName', () => {
  it('returns null for a valid filename', () => {
    expect(validateFileName('my-note')).toBeNull()
  })

  it('returns null for a valid filename with .md extension', () => {
    expect(validateFileName('my-note.md')).toBeNull()
  })

  it('rejects whitespace-only names', () => {
    expect(validateFileName('   ')).not.toBeNull()
    expect(validateFileName('\t')).not.toBeNull()
    expect(validateFileName(' \n ')).not.toBeNull()
  })

  it('rejects empty string', () => {
    expect(validateFileName('')).not.toBeNull()
  })

  it('rejects names with forward slash', () => {
    expect(validateFileName('path/file')).not.toBeNull()
  })

  it('rejects names with backslash', () => {
    expect(validateFileName('path\\file')).not.toBeNull()
  })

  it('rejects names with null byte', () => {
    expect(validateFileName('file\0name')).not.toBeNull()
  })

  it('rejects names exceeding default max length (128)', () => {
    const longName = 'a'.repeat(129)
    expect(validateFileName(longName)).not.toBeNull()
  })

  it('accepts names at exactly the max length', () => {
    const exactName = 'a'.repeat(128)
    expect(validateFileName(exactName)).toBeNull()
  })

  it('uses custom maxLength when provided', () => {
    expect(validateFileName('abcdef', 5)).not.toBeNull()
    expect(validateFileName('abcde', 5)).toBeNull()
  })

  it('accepts names with spaces (not whitespace-only)', () => {
    expect(validateFileName('my note')).toBeNull()
  })

  it('accepts names with dots', () => {
    expect(validateFileName('file.name.md')).toBeNull()
  })

  it('accepts names with special characters (not path separators)', () => {
    expect(validateFileName('file-name_v2 (copy)')).toBeNull()
  })
})

describe('normalizeFileName', () => {
  it('appends .md to a name without extension', () => {
    expect(normalizeFileName('my-note')).toBe('my-note.md')
  })

  it('does not append .md if already present (lowercase)', () => {
    expect(normalizeFileName('my-note.md')).toBe('my-note.md')
  })

  it('does not append .md if already present (uppercase)', () => {
    expect(normalizeFileName('README.MD')).toBe('README.MD')
  })

  it('does not append .md if already present (mixed case)', () => {
    expect(normalizeFileName('notes.Md')).toBe('notes.Md')
  })

  it('appends .md to names with other extensions', () => {
    expect(normalizeFileName('file.txt')).toBe('file.txt.md')
  })

  it('appends .md to names ending with .m', () => {
    expect(normalizeFileName('file.m')).toBe('file.m.md')
  })
})

describe('getSelectionRange', () => {
  it('selects name without extension for files', () => {
    expect(getSelectionRange('document.md', false)).toEqual([0, 8])
  })

  it('selects full name for folders', () => {
    expect(getSelectionRange('my-folder', true)).toEqual([0, 9])
  })

  it('selects full name for folders even with dots', () => {
    expect(getSelectionRange('folder.name', true)).toEqual([0, 11])
  })

  it('selects name without last extension for files with multiple dots', () => {
    expect(getSelectionRange('file.name.md', false)).toEqual([0, 9])
  })

  it('selects full name for files without extension', () => {
    expect(getSelectionRange('README', false)).toEqual([0, 6])
  })

  it('selects full name for dotfiles (dot at position 0)', () => {
    expect(getSelectionRange('.gitignore', false)).toEqual([0, 10])
  })
})
