import { describe, it, expect } from 'vitest'
import { resolveSubpath } from './obsidian-api-extensions'
import type { CachedMetadata, Pos } from './types'

function pos(line: number, offset: number): Pos {
  return {
    start: { line, col: 0, offset },
    end: { line, col: 10, offset: offset + 10 },
  }
}

const cache: CachedMetadata = {
  headings: [
    { heading: 'Erstes', level: 1, position: pos(0, 0) },
    { heading: 'Unterpunkt', level: 2, position: pos(4, 40) },
    { heading: 'Zweites', level: 1, position: pos(8, 80) },
  ],
  blocks: {
    abc123: { id: 'abc123', position: pos(12, 120) },
  },
}

describe('resolveSubpath', () => {
  it('resolves a heading to the range up to the next heading of the same level', () => {
    const result = resolveSubpath(cache, '#Erstes')
    expect(result?.type).toBe('heading')
    expect(result?.start.line).toBe(0)
    // Stops at "Zweites" (level 1), not at the nested "Unterpunkt" (level 2).
    expect(result?.end?.line).toBe(8)
  })

  it('runs a trailing section to the end of the file', () => {
    expect(resolveSubpath(cache, '#Zweites')?.end).toBeNull()
  })

  it('ends a nested section at the next heading of a higher level', () => {
    expect(resolveSubpath(cache, '#Unterpunkt')?.end?.line).toBe(8)
  })

  it('accepts a subpath without the leading #', () => {
    expect(resolveSubpath(cache, 'Erstes')?.type).toBe('heading')
  })

  it('matches headings case-insensitively, as Obsidian does', () => {
    expect(resolveSubpath(cache, '#erstes')?.start.line).toBe(0)
  })

  it('resolves a block reference', () => {
    const result = resolveSubpath(cache, '#^abc123')
    expect(result?.type).toBe('block')
    expect(result?.start.line).toBe(12)
  })

  it('returns null for an unknown heading', () => {
    expect(resolveSubpath(cache, '#Gibtsnicht')).toBeNull()
  })

  it('returns null for an unknown block', () => {
    expect(resolveSubpath(cache, '#^nope')).toBeNull()
  })

  it('returns null for an empty subpath', () => {
    expect(resolveSubpath(cache, '#')).toBeNull()
  })

  it('returns null when there is no cache', () => {
    expect(resolveSubpath(null, '#Erstes')).toBeNull()
  })

  it('ignores formatting in the heading text when matching', () => {
    const formatted: CachedMetadata = {
      headings: [{ heading: '**Über uns**', level: 1, position: pos(0, 0) }],
    }
    expect(resolveSubpath(formatted, '#Über uns')).not.toBeNull()
  })
})
