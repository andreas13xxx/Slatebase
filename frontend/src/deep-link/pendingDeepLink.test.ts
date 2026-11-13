import { describe, it, expect, beforeEach } from 'vitest'
import {
  PENDING_DEEP_LINK_KEY,
  PENDING_DEEP_LINK_TTL_MS,
  consumePendingDeepLink,
  storePendingDeepLink,
} from './pendingDeepLink'

function createMemoryStorage() {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

describe('pendingDeepLink', () => {
  let storage: ReturnType<typeof createMemoryStorage>
  beforeEach(() => {
    storage = createMemoryStorage()
  })

  it('returns a stored target exactly once', () => {
    const target = { vault: 'v', path: 'a.md', anchor: { kind: 'heading' as const, text: 'H' } }
    storePendingDeepLink(target, 1000, storage)
    expect(consumePendingDeepLink(2000, storage)).toEqual(target)
    expect(consumePendingDeepLink(2000, storage)).toBeNull()
  })

  it('replaces a target that is still waiting', () => {
    storePendingDeepLink({ vault: 'v', path: 'a.md', anchor: null }, 1000, storage)
    storePendingDeepLink({ vault: 'v', path: 'b.md', anchor: null }, 1500, storage)
    expect(consumePendingDeepLink(2000, storage)?.path).toBe('b.md')
  })

  it('expires after ten minutes, and still removes the entry', () => {
    storePendingDeepLink({ vault: 'v', path: null, anchor: null }, 0, storage)
    expect(consumePendingDeepLink(PENDING_DEEP_LINK_TTL_MS + 1, storage)).toBeNull()
    expect(storage.data.has(PENDING_DEEP_LINK_KEY)).toBe(false)
  })

  it('accepts a target right at the limit', () => {
    storePendingDeepLink({ vault: 'v', path: null, anchor: null }, 0, storage)
    expect(consumePendingDeepLink(PENDING_DEEP_LINK_TTL_MS, storage)).toEqual({ vault: 'v', path: null, anchor: null })
  })

  it('rejects a timestamp from the future', () => {
    storePendingDeepLink({ vault: 'v', path: null, anchor: null }, 5000, storage)
    expect(consumePendingDeepLink(1000, storage)).toBeNull()
  })

  it.each([
    ['not json', '{oops'],
    ['not an object', '"x"'],
    ['missing target', JSON.stringify({ savedAt: 1 })],
    ['unsafe path', JSON.stringify({ savedAt: 1, target: { vault: 'v', path: '../x.md', anchor: null } })],
    ['empty vault', JSON.stringify({ savedAt: 1, target: { vault: '', path: null, anchor: null } })],
    ['anchor without path', JSON.stringify({ savedAt: 1, target: { vault: 'v', path: null, anchor: { kind: 'heading', text: 'x' } } })],
    ['bad anchor', JSON.stringify({ savedAt: 1, target: { vault: 'v', path: 'a.md', anchor: { kind: 'x' } } })],
  ])('ignores tampered storage: %s', (_name, raw) => {
    storage.setItem(PENDING_DEEP_LINK_KEY, raw)
    expect(consumePendingDeepLink(2, storage)).toBeNull()
  })

  it('survives a storage that throws', () => {
    const broken = {
      getItem: () => { throw new Error('denied') },
      removeItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    }
    expect(() => storePendingDeepLink({ vault: 'v', path: null, anchor: null }, 0, broken)).not.toThrow()
    expect(consumePendingDeepLink(0, broken)).toBeNull()
  })
})
