import { describe, it, expect, vi } from 'vitest'
import { requestBasesView, consumePendingBasesView, onBasesViewRequest } from './basesViewBridge'

describe('basesViewBridge', () => {
  it('parks a request until the view mounts, and hands it over once', () => {
    requestBasesView('a.base', 'Open')
    expect(consumePendingBasesView('a.base')).toBe('Open')
    expect(consumePendingBasesView('a.base')).toBeNull()
  })

  it('reaches a mounted view directly instead of parking', () => {
    const listener = vi.fn()
    const off = onBasesViewRequest('b.base', listener)
    requestBasesView('b.base', 'Done')
    expect(listener).toHaveBeenCalledWith('Done')
    expect(consumePendingBasesView('b.base')).toBeNull()
    off()
    requestBasesView('b.base', 'Later')
    expect(consumePendingBasesView('b.base')).toBe('Later')
  })
})
