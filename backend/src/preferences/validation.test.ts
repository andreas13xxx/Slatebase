import { describe, it, expect } from 'vitest'
import { saveRecentFilesSchema, saveFavoritesSchema, saveKeybindingsSchema } from './validation.js'

describe('saveRecentFilesSchema', () => {
  it('accepts a valid list of recent file entries', () => {
    const result = saveRecentFilesSchema.safeParse({
      entries: [{ vaultId: 'v1', path: 'notes/a.md', timestamp: '2026-01-01T00:00:00.000Z' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects an entry missing a required field', () => {
    const result = saveRecentFilesSchema.safeParse({ entries: [{ vaultId: 'v1' }] })
    expect(result.success).toBe(false)
  })

  it('rejects more than 20 entries', () => {
    const entries = Array.from({ length: 21 }, () => ({ vaultId: 'v1', path: 'a.md', timestamp: 't' }))
    const result = saveRecentFilesSchema.safeParse({ entries })
    expect(result.success).toBe(false)
  })
})

describe('saveFavoritesSchema', () => {
  it('accepts a minimal valid favorite entry', () => {
    const result = saveFavoritesSchema.safeParse({
      entries: [{ vaultId: 'v1', path: 'notes/a.md', addedAt: '2026-01-01T00:00:00.000Z' }],
    })
    expect(result.success).toBe(true)
  })

  it('accepts an empty path (valid for search-type favorites)', () => {
    const result = saveFavoritesSchema.safeParse({
      entries: [{ vaultId: 'v1', path: '', addedAt: '2026-01-01T00:00:00.000Z', type: 'search', searchQuery: 'foo' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid type enum value', () => {
    const result = saveFavoritesSchema.safeParse({
      entries: [{ vaultId: 'v1', path: 'a.md', addedAt: 't', type: 'not-a-real-type' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects more than 500 entries', () => {
    const entries = Array.from({ length: 501 }, () => ({ vaultId: 'v1', path: 'a.md', addedAt: 't' }))
    const result = saveFavoritesSchema.safeParse({ entries })
    expect(result.success).toBe(false)
  })
})

describe('saveKeybindingsSchema', () => {
  it('accepts a valid keybinding entry', () => {
    const result = saveKeybindingsSchema.safeParse({ entries: [{ commandId: 'save', shortcut: 'Ctrl+S' }] })
    expect(result.success).toBe(true)
  })

  it('rejects an entry with an empty commandId', () => {
    const result = saveKeybindingsSchema.safeParse({ entries: [{ commandId: '', shortcut: 'Ctrl+S' }] })
    expect(result.success).toBe(false)
  })

  it('rejects more than 200 entries', () => {
    const entries = Array.from({ length: 201 }, (_, i) => ({ commandId: `cmd-${i}`, shortcut: 'x' }))
    const result = saveKeybindingsSchema.safeParse({ entries })
    expect(result.success).toBe(false)
  })
})
