import { describe, it, expect } from 'vitest'
import { computeDiff, isTextFile, groupHunks, DiffHunk } from './diff-utils'

describe('computeDiff', () => {
  it('returns empty array for two empty strings', () => {
    const hunks = computeDiff('', '')
    expect(hunks).toEqual([])
  })

  it('detects all lines as inserts when old is empty', () => {
    const hunks = computeDiff('', 'a\nb\nc')
    expect(hunks).toEqual([
      { type: 'insert', lines: ['a', 'b', 'c'], oldStart: 0, newStart: 0 },
    ])
  })

  it('detects all lines as deletes when new is empty', () => {
    const hunks = computeDiff('a\nb\nc', '')
    expect(hunks).toEqual([
      { type: 'delete', lines: ['a', 'b', 'c'], oldStart: 0, newStart: 0 },
    ])
  })

  it('detects identical texts as a single equal hunk', () => {
    const text = 'line1\nline2\nline3'
    const hunks = computeDiff(text, text)
    expect(hunks).toEqual([
      { type: 'equal', lines: ['line1', 'line2', 'line3'], oldStart: 0, newStart: 0 },
    ])
  })

  it('detects a simple insertion in the middle', () => {
    const old = 'a\nc'
    const newText = 'a\nb\nc'
    const hunks = computeDiff(old, newText)

    // Should have equal(a), insert(b), equal(c)
    expect(hunks.length).toBe(3)
    expect(hunks[0]).toEqual({ type: 'equal', lines: ['a'], oldStart: 0, newStart: 0 })
    expect(hunks[1]).toEqual({ type: 'insert', lines: ['b'], oldStart: 1, newStart: 1 })
    expect(hunks[2]).toEqual({ type: 'equal', lines: ['c'], oldStart: 1, newStart: 2 })
  })

  it('detects a simple deletion in the middle', () => {
    const old = 'a\nb\nc'
    const newText = 'a\nc'
    const hunks = computeDiff(old, newText)

    expect(hunks.length).toBe(3)
    expect(hunks[0]).toEqual({ type: 'equal', lines: ['a'], oldStart: 0, newStart: 0 })
    expect(hunks[1]).toEqual({ type: 'delete', lines: ['b'], oldStart: 1, newStart: 1 })
    expect(hunks[2]).toEqual({ type: 'equal', lines: ['c'], oldStart: 2, newStart: 1 })
  })

  it('detects a replacement (delete + insert)', () => {
    const old = 'a\nb\nc'
    const newText = 'a\nX\nc'
    const hunks = computeDiff(old, newText)

    expect(hunks.length).toBe(4)
    expect(hunks[0]).toEqual({ type: 'equal', lines: ['a'], oldStart: 0, newStart: 0 })
    expect(hunks[1]).toEqual({ type: 'delete', lines: ['b'], oldStart: 1, newStart: 1 })
    expect(hunks[2]).toEqual({ type: 'insert', lines: ['X'], oldStart: 2, newStart: 1 })
    expect(hunks[3]).toEqual({ type: 'equal', lines: ['c'], oldStart: 2, newStart: 2 })
  })

  it('round-trip: applying diff to old text produces new text', () => {
    const old = 'hello\nworld\nfoo\nbar\nbaz'
    const newText = 'hello\nplanet\nfoo\nqux\nbaz\nextra'
    const hunks = computeDiff(old, newText)

    // Reconstruct new text from hunks
    const reconstructed = reconstructNewText(hunks)
    expect(reconstructed).toBe(newText)
  })

  it('round-trip: old text can be reconstructed from equal + delete hunks', () => {
    const old = 'alpha\nbeta\ngamma\ndelta'
    const newText = 'alpha\nX\ngamma\nY\nZ'
    const hunks = computeDiff(old, newText)

    // Reconstruct old text from equal + delete hunks
    const reconstructed = reconstructOldText(hunks)
    expect(reconstructed).toBe(old)
  })

  it('handles single-line texts', () => {
    const hunks = computeDiff('hello', 'world')
    expect(hunks.length).toBe(2)
    expect(hunks[0]!.type).toBe('delete')
    expect(hunks[0]!.lines).toEqual(['hello'])
    expect(hunks[1]!.type).toBe('insert')
    expect(hunks[1]!.lines).toEqual(['world'])
  })

  it('handles text with empty lines', () => {
    const old = 'a\n\nb'
    const newText = 'a\n\n\nb'
    const hunks = computeDiff(old, newText)

    const reconstructed = reconstructNewText(hunks)
    expect(reconstructed).toBe(newText)
  })
})

describe('isTextFile', () => {
  it('returns true for .md files', () => {
    expect(isTextFile('notes/readme.md')).toBe(true)
  })

  it('returns true for .txt files', () => {
    expect(isTextFile('file.txt')).toBe(true)
  })

  it('returns true for .json files', () => {
    expect(isTextFile('config.json')).toBe(true)
  })

  it('returns true for .csv files', () => {
    expect(isTextFile('data.csv')).toBe(true)
  })

  it('returns true for .yaml files', () => {
    expect(isTextFile('config.yaml')).toBe(true)
  })

  it('returns true for .yml files', () => {
    expect(isTextFile('config.yml')).toBe(true)
  })

  it('returns true for .xml files', () => {
    expect(isTextFile('data.xml')).toBe(true)
  })

  it('returns true for .html files', () => {
    expect(isTextFile('index.html')).toBe(true)
  })

  it('returns true for .css files', () => {
    expect(isTextFile('styles.css')).toBe(true)
  })

  it('returns true for .js files', () => {
    expect(isTextFile('app.js')).toBe(true)
  })

  it('returns true for .ts files', () => {
    expect(isTextFile('main.ts')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isTextFile('README.MD')).toBe(true)
    expect(isTextFile('CONFIG.JSON')).toBe(true)
    expect(isTextFile('file.TXT')).toBe(true)
  })

  it('returns false for binary extensions', () => {
    expect(isTextFile('image.png')).toBe(false)
    expect(isTextFile('photo.jpg')).toBe(false)
    expect(isTextFile('document.pdf')).toBe(false)
    expect(isTextFile('archive.zip')).toBe(false)
  })

  it('returns false for files without extension', () => {
    expect(isTextFile('Makefile')).toBe(false)
    expect(isTextFile('README')).toBe(false)
  })

  it('handles paths with directories', () => {
    expect(isTextFile('path/to/file.md')).toBe(true)
    expect(isTextFile('path/to/file.png')).toBe(false)
  })

  it('handles dot in directory name but no file extension', () => {
    expect(isTextFile('.hidden/config')).toBe(false)
  })

  it('uses last dot for extension detection', () => {
    expect(isTextFile('file.backup.md')).toBe(true)
    expect(isTextFile('archive.tar.gz')).toBe(false)
  })

  it('handles Windows-style paths', () => {
    expect(isTextFile('C:\\Users\\docs\\file.md')).toBe(true)
    expect(isTextFile('C:\\Users\\docs\\file.exe')).toBe(false)
  })
})

describe('groupHunks', () => {
  it('returns empty array for empty input', () => {
    expect(groupHunks([])).toEqual([])
  })

  it('groups change hunks together', () => {
    const hunks: DiffHunk[] = [
      { type: 'delete', lines: ['a'], oldStart: 0, newStart: 0 },
      { type: 'insert', lines: ['b'], oldStart: 1, newStart: 0 },
    ]
    const grouped = groupHunks(hunks)
    expect(grouped.length).toBe(1)
    expect(grouped[0]!.hasChanges).toBe(true)
    expect(grouped[0]!.hunks.length).toBe(2)
  })

  it('does not collapse small equal sections', () => {
    const hunks: DiffHunk[] = [
      { type: 'delete', lines: ['x'], oldStart: 0, newStart: 0 },
      { type: 'equal', lines: ['a', 'b', 'c'], oldStart: 1, newStart: 0 },
      { type: 'insert', lines: ['y'], oldStart: 4, newStart: 3 },
    ]
    // contextLines=3 → threshold=6, section has 3 lines → no collapse
    const grouped = groupHunks(hunks, 3)
    // First change group includes trailing equal context
    // Then next change group
    expect(grouped.some(g => g.collapsedLineCount !== undefined)).toBe(false)
  })

  it('collapses large equal sections (> contextLines * 2)', () => {
    const equalLines = Array.from({ length: 20 }, (_, i) => `line${i}`)
    const hunks: DiffHunk[] = [
      { type: 'delete', lines: ['x'], oldStart: 0, newStart: 0 },
      { type: 'equal', lines: equalLines, oldStart: 1, newStart: 0 },
      { type: 'insert', lines: ['y'], oldStart: 21, newStart: 20 },
    ]
    const grouped = groupHunks(hunks, 3)

    // Should have a collapsed section
    const collapsed = grouped.find(g => g.collapsedLineCount !== undefined)
    expect(collapsed).toBeDefined()
    expect(collapsed!.collapsedLineCount).toBe(14) // 20 - 3*2 = 14
  })

  it('uses default contextLines of 3', () => {
    const equalLines = Array.from({ length: 10 }, (_, i) => `line${i}`)
    const hunks: DiffHunk[] = [
      { type: 'delete', lines: ['x'], oldStart: 0, newStart: 0 },
      { type: 'equal', lines: equalLines, oldStart: 1, newStart: 0 },
      { type: 'insert', lines: ['y'], oldStart: 11, newStart: 10 },
    ]
    // Default contextLines=3 → threshold=6, 10 > 6 → collapse
    const grouped = groupHunks(hunks)
    const collapsed = grouped.find(g => g.collapsedLineCount !== undefined)
    expect(collapsed).toBeDefined()
    expect(collapsed!.collapsedLineCount).toBe(4) // 10 - 3*2 = 4
  })

  it('handles only equal hunks (no changes)', () => {
    const hunks: DiffHunk[] = [
      { type: 'equal', lines: ['a', 'b', 'c'], oldStart: 0, newStart: 0 },
    ]
    const grouped = groupHunks(hunks)
    expect(grouped.length).toBe(1)
    expect(grouped[0]!.hasChanges).toBe(false)
    expect(grouped[0]!.hunks.length).toBe(1)
  })

  it('preserves all lines across grouping (no data loss)', () => {
    const hunks: DiffHunk[] = [
      { type: 'equal', lines: ['a', 'b'], oldStart: 0, newStart: 0 },
      { type: 'delete', lines: ['c'], oldStart: 2, newStart: 2 },
      { type: 'insert', lines: ['d', 'e'], oldStart: 3, newStart: 2 },
      { type: 'equal', lines: ['f'], oldStart: 3, newStart: 4 },
    ]
    const grouped = groupHunks(hunks, 3)

    // All hunks should be present in the groups (no collapse since equal sections are small)
    const allHunks = grouped.flatMap(g => g.hunks)
    const totalLines = allHunks.reduce((sum, h) => sum + h.lines.length, 0)
    const originalLines = hunks.reduce((sum, h) => sum + h.lines.length, 0)
    expect(totalLines).toBe(originalLines)
  })
})

// ---- Test helpers ----

/** Reconstructs the new text from diff hunks (equal + insert lines). */
function reconstructNewText(hunks: DiffHunk[]): string {
  const lines: string[] = []
  for (const hunk of hunks) {
    if (hunk.type === 'equal' || hunk.type === 'insert') {
      lines.push(...hunk.lines)
    }
  }
  return lines.join('\n')
}

/** Reconstructs the old text from diff hunks (equal + delete lines). */
function reconstructOldText(hunks: DiffHunk[]): string {
  const lines: string[] = []
  for (const hunk of hunks) {
    if (hunk.type === 'equal' || hunk.type === 'delete') {
      lines.push(...hunk.lines)
    }
  }
  return lines.join('\n')
}
