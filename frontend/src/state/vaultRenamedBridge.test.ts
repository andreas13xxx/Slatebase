import { describe, it, expect, vi } from 'vitest'
import { appReducer } from './index'
import { dispatchVaultRenamed, onVaultRenamed } from './vaultRenamedBridge'
import type { AppState } from '../types'

describe('vaultRenamedBridge', () => {
  it('delivers events to subscribers until they unsubscribe', () => {
    const cb = vi.fn()
    const off = onVaultRenamed(cb)
    dispatchVaultRenamed({ vaultId: 'v1', name: 'Neu' })
    off()
    dispatchVaultRenamed({ vaultId: 'v1', name: 'Später' })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({ vaultId: 'v1', name: 'Neu' })
  })
})

describe('VAULT_RENAMED reducer', () => {
  it('renames only the addressed vault', () => {
    const state = {
      vaults: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    } as unknown as AppState
    const next = appReducer(state, { type: 'VAULT_RENAMED', payload: { vaultId: 'b', name: 'B2' } })
    expect(next.vaults.map((v) => v.name)).toEqual(['A', 'B2'])
  })
})
