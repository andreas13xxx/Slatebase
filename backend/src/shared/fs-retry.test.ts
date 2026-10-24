import { describe, it, expect } from 'vitest'
import { isMissing, withRetry } from './fs-retry.js'

function fsError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code })
}

describe('withRetry', () => {
  it('returns the result without retrying on success', async () => {
    let calls = 0
    expect(await withRetry(async () => { calls += 1; return 'ok' })).toBe('ok')
    expect(calls).toBe(1)
  })

  it.each(['EPERM', 'EACCES', 'EBUSY'])('retries a transient %s and then succeeds', async (code) => {
    let calls = 0
    const result = await withRetry(async () => {
      calls += 1
      if (calls < 3) throw fsError(code)
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(calls).toBe(3)
  })

  it('gives up after three attempts and rethrows the transient error', async () => {
    let calls = 0
    await expect(withRetry(async () => { calls += 1; throw fsError('EBUSY') })).rejects.toThrow('EBUSY')
    expect(calls).toBe(3)
  })

  it('does not retry other errors', async () => {
    let calls = 0
    await expect(withRetry(async () => { calls += 1; throw fsError('ENOENT') })).rejects.toThrow('ENOENT')
    expect(calls).toBe(1)
  })
})

describe('isMissing', () => {
  it('is true for ENOENT and ENOTDIR only', () => {
    expect(isMissing(fsError('ENOENT'))).toBe(true)
    expect(isMissing(fsError('ENOTDIR'))).toBe(true)
    expect(isMissing(fsError('EACCES'))).toBe(false)
    expect(isMissing(new Error('plain'))).toBe(false)
    expect(isMissing('ENOENT')).toBe(false)
  })
})
