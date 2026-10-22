import { describe, expect, it } from 'vitest'
import type { IApiClient } from '../../../api/index'
import { VaultAdapterShim } from './vault-adapter-shim'

// Regression: Remotely Save takes the non-desktop path when `vault.adapter` is not a FileSystemAdapter and calls
// `adapter.getResourcePath("").split("?")[0]` to identify the vault. The proxy used to answer with a no-op stub that
// returns undefined, so the plugin's onload() failed with "Cannot read properties of undefined (reading 'split')".
describe('VaultAdapterShim.getResourcePath', () => {
  function createAdapter(vaultId = 'vault-1'): VaultAdapterShim & Record<string, unknown> {
    const instance = new VaultAdapterShim(vaultId, {} as IApiClient, () => ({ name: '', path: '', type: 'directory', children: [] }))
    return VaultAdapterShim.wrapWithProxy(instance)
  }

  it('returns a string for the vault root, so .split("?")[0] works', () => {
    const base = (createAdapter()['getResourcePath'] as (p: string) => string)('').split('?')[0]
    expect(base).toBe('/api/v1/vaults/vault-1/files')
  })

  it('returns the raw-file URL, encoded, in the same scheme as vault.getResourcePath', () => {
    const url = (createAdapter()['getResourcePath'] as (p: string) => string)('notes/a b.md')
    expect(url).toBe('/api/v1/vaults/vault-1/files?path=notes%2Fa%20b.md&raw=true')
  })

  it('yields a different base per vault', () => {
    const a = (createAdapter('a')['getResourcePath'] as (p: string) => string)('').split('?')[0]
    const b = (createAdapter('b')['getResourcePath'] as (p: string) => string)('').split('?')[0]
    expect(a).not.toBe(b)
  })
})
