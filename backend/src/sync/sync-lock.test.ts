import { describe, it, expect, beforeEach } from 'vitest'
import { SyncLock } from './sync-lock.js'

describe('SyncLock', () => {
  let lock: SyncLock

  beforeEach(() => {
    lock = new SyncLock()
  })

  it('acquire returns true on first call', () => {
    const result = lock.acquire('vault-1')
    expect(result).toBe(true)
  })

  it('acquire returns false on second call (already locked)', () => {
    lock.acquire('vault-1')
    const result = lock.acquire('vault-1')
    expect(result).toBe(false)
  })

  it('release allows re-acquisition', () => {
    lock.acquire('vault-1')
    lock.release('vault-1')
    const result = lock.acquire('vault-1')
    expect(result).toBe(true)
  })

  it('isLocked returns true when vault is locked', () => {
    lock.acquire('vault-1')
    expect(lock.isLocked('vault-1')).toBe(true)
  })

  it('isLocked returns false when vault is not locked', () => {
    expect(lock.isLocked('vault-1')).toBe(false)
  })

  it('isLocked returns false after release', () => {
    lock.acquire('vault-1')
    lock.release('vault-1')
    expect(lock.isLocked('vault-1')).toBe(false)
  })

  it('multiple vaults can be locked independently', () => {
    lock.acquire('vault-1')
    lock.acquire('vault-2')

    expect(lock.isLocked('vault-1')).toBe(true)
    expect(lock.isLocked('vault-2')).toBe(true)

    lock.release('vault-1')

    expect(lock.isLocked('vault-1')).toBe(false)
    expect(lock.isLocked('vault-2')).toBe(true)
  })

  it('release on non-locked vault does not throw', () => {
    expect(() => lock.release('non-existent')).not.toThrow()
  })
})
