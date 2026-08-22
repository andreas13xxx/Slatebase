import { describe, it, expect, afterEach } from 'vitest'
import { getVersion } from './version.js'

describe('getVersion', () => {
  afterEach(() => {
    delete process.env.SLATEBASE_VERSION
  })

  it('returns SLATEBASE_VERSION when set, taking priority over version.json', () => {
    process.env.SLATEBASE_VERSION = '9.9.9'
    expect(getVersion()).toBe('9.9.9')
  })

  it('falls back to the version.json file when the env var is not set', () => {
    delete process.env.SLATEBASE_VERSION
    // backend/version.json is a real, committed file — assert the shape
    // rather than a hardcoded value that would go stale on release.
    expect(getVersion()).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
