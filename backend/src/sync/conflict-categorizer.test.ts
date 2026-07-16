import { describe, it, expect } from 'vitest'
import { categorizeConflict, categorizeConflicts, applyDefaultCategory } from './conflict-categorizer.js'
import type { CategorizationInput } from './conflict-categorizer.js'
import type { ConflictEntry } from './types.js'

function createConflictEntry(overrides?: Partial<ConflictEntry>): ConflictEntry {
  return {
    documentPath: 'notes/test.md',
    local: {
      modifiedAt: '2024-01-15T10:00:00.000Z',
      size: 1024,
    },
    remote: {
      revision: '2-abc123',
      modifiedAt: '2024-01-15T11:00:00.000Z',
      size: 2048,
    },
    detectedAt: '2024-01-15T12:00:00.000Z',
    ...overrides,
  }
}

describe('categorizeConflict', () => {
  it('returns content_conflict when both local and remote exist and are modified', () => {
    const input: CategorizationInput = {
      conflict: createConflictEntry(),
      local: { exists: true, contentHash: 'hash-a' },
      remote: { exists: true, contentHash: 'hash-b' },
    }

    const result = categorizeConflict(input)

    expect(result.category).toBe('content_conflict')
    expect(result.localContentHash).toBe('hash-a')
    expect(result.remoteContentHash).toBe('hash-b')
  })

  it('returns local_deleted when local is absent and remote is present', () => {
    const input: CategorizationInput = {
      conflict: createConflictEntry(),
      local: { exists: false },
      remote: { exists: true, contentHash: 'hash-remote' },
    }

    const result = categorizeConflict(input)

    expect(result.category).toBe('local_deleted')
    expect(result.localContentHash).toBeUndefined()
    expect(result.remoteContentHash).toBe('hash-remote')
  })

  it('returns remote_deleted when remote is absent and local is present', () => {
    const input: CategorizationInput = {
      conflict: createConflictEntry(),
      local: { exists: true, contentHash: 'hash-local' },
      remote: { exists: false },
    }

    const result = categorizeConflict(input)

    expect(result.category).toBe('remote_deleted')
    expect(result.localContentHash).toBe('hash-local')
    expect(result.remoteContentHash).toBeUndefined()
  })

  it('returns rename_conflict when same content hash exists at different paths', () => {
    const input: CategorizationInput = {
      conflict: createConflictEntry(),
      local: { exists: true, contentHash: 'same-hash' },
      remote: { exists: true, contentHash: 'same-hash' },
      sameContentAtDifferentPath: true,
    }

    const result = categorizeConflict(input)

    expect(result.category).toBe('rename_conflict')
    expect(result.localContentHash).toBe('same-hash')
    expect(result.remoteContentHash).toBe('same-hash')
  })

  it('returns content_conflict when hashes match but sameContentAtDifferentPath is false', () => {
    const input: CategorizationInput = {
      conflict: createConflictEntry(),
      local: { exists: true, contentHash: 'same-hash' },
      remote: { exists: true, contentHash: 'same-hash' },
      sameContentAtDifferentPath: false,
    }

    const result = categorizeConflict(input)

    expect(result.category).toBe('content_conflict')
  })

  it('returns content_conflict when hashes match but sameContentAtDifferentPath is undefined', () => {
    const input: CategorizationInput = {
      conflict: createConflictEntry(),
      local: { exists: true, contentHash: 'same-hash' },
      remote: { exists: true, contentHash: 'same-hash' },
    }

    const result = categorizeConflict(input)

    expect(result.category).toBe('content_conflict')
  })

  it('returns content_conflict when both files are absent (edge case: fallback)', () => {
    const input: CategorizationInput = {
      conflict: createConflictEntry(),
      local: { exists: false },
      remote: { exists: false },
    }

    const result = categorizeConflict(input)

    expect(result.category).toBe('content_conflict')
  })

  it('does not produce rename_conflict when local contentHash is missing', () => {
    const input: CategorizationInput = {
      conflict: createConflictEntry(),
      local: { exists: true },
      remote: { exists: true, contentHash: 'hash-remote' },
      sameContentAtDifferentPath: true,
    }

    const result = categorizeConflict(input)

    expect(result.category).toBe('content_conflict')
  })

  it('does not produce rename_conflict when remote contentHash is missing', () => {
    const input: CategorizationInput = {
      conflict: createConflictEntry(),
      local: { exists: true, contentHash: 'hash-local' },
      remote: { exists: true },
      sameContentAtDifferentPath: true,
    }

    const result = categorizeConflict(input)

    expect(result.category).toBe('content_conflict')
  })

  it('does not produce rename_conflict when hashes differ even with sameContentAtDifferentPath flag', () => {
    const input: CategorizationInput = {
      conflict: createConflictEntry(),
      local: { exists: true, contentHash: 'hash-a' },
      remote: { exists: true, contentHash: 'hash-b' },
      sameContentAtDifferentPath: true,
    }

    const result = categorizeConflict(input)

    expect(result.category).toBe('content_conflict')
  })

  it('preserves all fields from the original ConflictEntry', () => {
    const conflict = createConflictEntry({
      documentPath: 'deep/nested/file.md',
    })
    const input: CategorizationInput = {
      conflict,
      local: { exists: true, contentHash: 'abc' },
      remote: { exists: true, contentHash: 'def' },
    }

    const result = categorizeConflict(input)

    expect(result.documentPath).toBe('deep/nested/file.md')
    expect(result.local).toEqual(conflict.local)
    expect(result.remote).toEqual(conflict.remote)
    expect(result.detectedAt).toBe(conflict.detectedAt)
  })

  it('rename_conflict takes priority over content_conflict when conditions are met', () => {
    // Both exist AND same hash at different path → rename_conflict wins
    const input: CategorizationInput = {
      conflict: createConflictEntry(),
      local: { exists: true, contentHash: 'same' },
      remote: { exists: true, contentHash: 'same' },
      sameContentAtDifferentPath: true,
    }

    const result = categorizeConflict(input)

    expect(result.category).toBe('rename_conflict')
  })
})

describe('categorizeConflicts', () => {
  it('returns empty array for empty input', () => {
    const result = categorizeConflicts([])
    expect(result).toEqual([])
  })

  it('categorizes multiple conflicts independently', () => {
    const inputs: CategorizationInput[] = [
      {
        conflict: createConflictEntry({ documentPath: 'file1.md' }),
        local: { exists: true, contentHash: 'a' },
        remote: { exists: true, contentHash: 'b' },
      },
      {
        conflict: createConflictEntry({ documentPath: 'file2.md' }),
        local: { exists: false },
        remote: { exists: true, contentHash: 'c' },
      },
      {
        conflict: createConflictEntry({ documentPath: 'file3.md' }),
        local: { exists: true, contentHash: 'd' },
        remote: { exists: false },
      },
    ]

    const results = categorizeConflicts(inputs)

    expect(results).toHaveLength(3)
    expect(results[0]!.category).toBe('content_conflict')
    expect(results[0]!.documentPath).toBe('file1.md')
    expect(results[1]!.category).toBe('local_deleted')
    expect(results[1]!.documentPath).toBe('file2.md')
    expect(results[2]!.category).toBe('remote_deleted')
    expect(results[2]!.documentPath).toBe('file3.md')
  })

  it('preserves input order in output', () => {
    const inputs: CategorizationInput[] = [
      {
        conflict: createConflictEntry({ documentPath: 'z-last.md' }),
        local: { exists: true },
        remote: { exists: true },
      },
      {
        conflict: createConflictEntry({ documentPath: 'a-first.md' }),
        local: { exists: true },
        remote: { exists: true },
      },
    ]

    const results = categorizeConflicts(inputs)

    expect(results[0]!.documentPath).toBe('z-last.md')
    expect(results[1]!.documentPath).toBe('a-first.md')
  })
})

describe('applyDefaultCategory', () => {
  it('assigns content_conflict as default category', () => {
    const conflict = createConflictEntry()

    const result = applyDefaultCategory(conflict)

    expect(result.category).toBe('content_conflict')
  })

  it('preserves all original ConflictEntry fields', () => {
    const conflict = createConflictEntry({
      documentPath: 'special/path.md',
    })

    const result = applyDefaultCategory(conflict)

    expect(result.documentPath).toBe('special/path.md')
    expect(result.local).toEqual(conflict.local)
    expect(result.remote).toEqual(conflict.remote)
    expect(result.detectedAt).toBe(conflict.detectedAt)
  })

  it('does not add contentHash fields', () => {
    const conflict = createConflictEntry()

    const result = applyDefaultCategory(conflict)

    expect(result.localContentHash).toBeUndefined()
    expect(result.remoteContentHash).toBeUndefined()
  })
})
