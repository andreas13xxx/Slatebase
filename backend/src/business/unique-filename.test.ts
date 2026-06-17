import { describe, it, expect } from 'vitest'
import { generateUniqueFilename } from './unique-filename.js'

describe('generateUniqueFilename', () => {
  it('returns the desired name when no conflict exists', () => {
    const result = generateUniqueFilename('photo.png', [])
    expect(result).toBe('photo.png')
  })

  it('returns the desired name when existing names do not include it', () => {
    const result = generateUniqueFilename('photo.png', ['other.png', 'doc.md'])
    expect(result).toBe('photo.png')
  })

  it('appends -1 when the desired name conflicts', () => {
    const result = generateUniqueFilename('photo.png', ['photo.png'])
    expect(result).toBe('photo-1.png')
  })

  it('appends -2 when -1 is also taken', () => {
    const result = generateUniqueFilename('photo.png', ['photo.png', 'photo-1.png'])
    expect(result).toBe('photo-2.png')
  })

  it('skips to the first available suffix', () => {
    const existing = ['photo.png', 'photo-1.png', 'photo-2.png', 'photo-3.png']
    const result = generateUniqueFilename('photo.png', existing)
    expect(result).toBe('photo-4.png')
  })

  it('works with a Set of existing names', () => {
    const existing = new Set(['report.md', 'report-1.md'])
    const result = generateUniqueFilename('report.md', existing)
    expect(result).toBe('report-2.md')
  })

  it('preserves the original extension', () => {
    const result = generateUniqueFilename('data.tar.gz', ['data.tar.gz'])
    expect(result).toBe('data.tar-1.gz')
  })

  it('handles files without extension', () => {
    const result = generateUniqueFilename('Makefile', ['Makefile'])
    expect(result).toBe('Makefile-1')
  })

  it('handles dotfiles', () => {
    const result = generateUniqueFilename('.gitignore', ['.gitignore'])
    expect(result).toBe('.gitignore-1')
  })

  it('handles names with multiple dots', () => {
    const result = generateUniqueFilename('my.file.name.txt', ['my.file.name.txt'])
    expect(result).toBe('my.file.name-1.txt')
  })

  it('handles empty desired name gracefully', () => {
    const result = generateUniqueFilename('', [''])
    expect(result).toBe('-1')
  })

  it('works with paste-format image names', () => {
    const existing = ['paste-2024-01-20-143000.png', 'paste-2024-01-20-143000-1.png']
    const result = generateUniqueFilename('paste-2024-01-20-143000.png', existing)
    expect(result).toBe('paste-2024-01-20-143000-2.png')
  })
})
