import { describe, it, expect, vi } from 'vitest'
import { requestReveal, consumePendingReveal } from './revealFileBridge'

describe('requestReveal', () => {
  it('carries the target vault in the event and the pending request', () => {
    const listener = vi.fn()
    window.addEventListener('slatebase:reveal-file', listener)
    requestReveal('notes', 'folder', 'v2')
    window.removeEventListener('slatebase:reveal-file', listener)
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ path: 'notes', kind: 'folder', vaultId: 'v2' })
    expect(consumePendingReveal()).toEqual({ path: 'notes', kind: 'folder', vaultId: 'v2' })
  })

  it('omits vaultId when none is given (selected vault applies)', () => {
    requestReveal('a.md')
    expect(consumePendingReveal()).toEqual({ path: 'a.md', kind: 'file' })
    expect(consumePendingReveal()).toBeNull()
  })
})
