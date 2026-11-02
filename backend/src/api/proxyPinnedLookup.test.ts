// Proxy pinned lookup — regression tests for Node 20+ `all: true` lookups

import { describe, it, expect, vi } from 'vitest'
import { createPinnedLookup } from './proxyRoutes.js'

describe('createPinnedLookup', () => {
  const lookup = createPinnedLookup({ ip: '93.184.216.34', family: 4 })

  it('returns an address array when called with all: true (autoSelectFamily)', () => {
    const cb = vi.fn()
    lookup('example.com', { all: true }, cb)
    expect(cb).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }])
  })

  it('returns a single address when called without all', () => {
    const cb = vi.fn()
    lookup('example.com', {}, cb)
    expect(cb).toHaveBeenCalledWith(null, '93.184.216.34', 4)
  })

  it('ignores the requested hostname', () => {
    const cb = vi.fn()
    lookup('evil.internal', { all: true }, cb)
    expect(cb).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }])
  })
})
