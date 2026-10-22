import { describe, it, expect, afterEach } from 'vitest'
import type { IApiClient, VaultAliasesResponse } from '../api'
import {
  loadAliasData,
  refreshAliasMap,
  getAliasMapSnapshot,
  getAliasEntriesSnapshot,
  clearAliasMap,
} from './aliasStore'

function mockClient(aliases: VaultAliasesResponse['aliases']): IApiClient {
  return {
    getVaultAliases: async () => ({ aliases }),
  } as unknown as IApiClient
}

afterEach(() => {
  clearAliasMap()
})

describe('loadAliasData', () => {
  it('lowercases map keys but keeps original-cased entries', async () => {
    const { map, entries } = await loadAliasData(
      mockClient([{ alias: 'Mein Alias', path: 'a.md' }]),
      'v1',
    )
    expect(map.get('mein alias')).toEqual(['a.md'])
    expect(map.get('Mein Alias')).toBeUndefined()
    expect(entries).toEqual([{ alias: 'Mein Alias', path: 'a.md' }])
  })

  it('folds several files under one alias into one map key', async () => {
    const { map } = await loadAliasData(
      mockClient([
        { alias: 'shared', path: 'a.md' },
        { alias: 'Shared', path: 'b.md' },
      ]),
      'v1',
    )
    expect(map.get('shared')).toEqual(['a.md', 'b.md'])
  })

  it('does not duplicate a repeated alias/path pair', async () => {
    const { map } = await loadAliasData(
      mockClient([
        { alias: 'dup', path: 'a.md' },
        { alias: 'dup', path: 'a.md' },
      ]),
      'v1',
    )
    expect(map.get('dup')).toEqual(['a.md'])
  })

  it('returns empty structures for no aliases', async () => {
    const { map, entries } = await loadAliasData(mockClient([]), 'v1')
    expect(map.size).toBe(0)
    expect(entries).toEqual([])
  })
})

describe('refreshAliasMap snapshots', () => {
  it('publishes the loaded map and entries for the current vault', async () => {
    await refreshAliasMap(mockClient([{ alias: 'Foo', path: 'foo.md' }]), 'v1')
    expect(getAliasMapSnapshot().get('foo')).toEqual(['foo.md'])
    expect(getAliasEntriesSnapshot()).toEqual([{ alias: 'Foo', path: 'foo.md' }])
  })

  it('keeps the last good map when a reload fails', async () => {
    await refreshAliasMap(mockClient([{ alias: 'Foo', path: 'foo.md' }]), 'v1')
    const failing = {
      getVaultAliases: async () => {
        throw new Error('network')
      },
    } as unknown as IApiClient
    // Same vault id so the holder does not reset before the fetch runs.
    await refreshAliasMap(failing, 'v1')
    expect(getAliasMapSnapshot().get('foo')).toEqual(['foo.md'])
  })

  it('clears the snapshot', async () => {
    await refreshAliasMap(mockClient([{ alias: 'Foo', path: 'foo.md' }]), 'v1')
    clearAliasMap()
    expect(getAliasMapSnapshot().size).toBe(0)
    expect(getAliasEntriesSnapshot()).toEqual([])
  })
})
