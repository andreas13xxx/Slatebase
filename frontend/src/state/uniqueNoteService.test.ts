import { describe, it, expect, vi } from 'vitest'
import type { IApiClient } from '../api'
import { formatUniqueNoteStamp, buildUniqueNotePath, createUniqueNote } from './uniqueNoteService'

describe('formatUniqueNoteStamp', () => {
  it('formats local calendar fields as YYYYMMDDHHmmss', () => {
    // Local time, zero-padded on every field.
    const d = new Date(2026, 0, 5, 9, 3, 7) // 2026-01-05 09:03:07
    expect(formatUniqueNoteStamp(d)).toBe('20260105090307')
  })

  it('zero-pads December / late times correctly', () => {
    const d = new Date(2026, 11, 31, 23, 59, 59)
    expect(formatUniqueNoteStamp(d)).toBe('20261231235959')
  })
})

describe('buildUniqueNotePath', () => {
  it('places the note at the vault root for an empty directory', () => {
    expect(buildUniqueNotePath('', '20260105090307')).toBe('20260105090307.md')
  })

  it('places the note under the configured directory', () => {
    expect(buildUniqueNotePath('Zettel', '20260105090307')).toBe('Zettel/20260105090307.md')
  })
})

describe('createUniqueNote', () => {
  it('creates the note in the configured directory and returns its path', async () => {
    const saveFile = vi.fn().mockResolvedValue({ etag: 'e' })
    const apiClient = {
      getVaultConfig: vi.fn().mockResolvedValue({ uniqueNoteDirectory: 'Zettel' }),
      saveFile,
    } as unknown as IApiClient

    const path = await createUniqueNote(apiClient, 'v1')
    expect(path).toMatch(/^Zettel\/\d{14}\.md$/)
    expect(saveFile).toHaveBeenCalledWith('v1', path, '')
  })

  it('falls back to the vault root when the config is unreadable', async () => {
    const saveFile = vi.fn().mockResolvedValue({ etag: 'e' })
    const apiClient = {
      getVaultConfig: vi.fn().mockRejectedValue(new Error('no config')),
      saveFile,
    } as unknown as IApiClient

    const path = await createUniqueNote(apiClient, 'v1')
    expect(path).toMatch(/^\d{14}\.md$/)
    expect(saveFile).toHaveBeenCalledWith('v1', path, '')
  })

  it('treats a missing uniqueNoteDirectory field as the vault root', async () => {
    const saveFile = vi.fn().mockResolvedValue({ etag: 'e' })
    const apiClient = {
      getVaultConfig: vi.fn().mockResolvedValue({}),
      saveFile,
    } as unknown as IApiClient

    const path = await createUniqueNote(apiClient, 'v1')
    expect(path).toMatch(/^\d{14}\.md$/)
  })
})
