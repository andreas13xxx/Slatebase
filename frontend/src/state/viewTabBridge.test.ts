import { describe, it, expect, vi } from 'vitest'
import { requestViewTab, setViewTabHandler } from './viewTabBridge'

describe('viewTabBridge', () => {
  it('reports false while no handler is mounted', () => {
    expect(requestViewTab({ type: 'empty' })).toBe(false)
  })

  it('hands the request to the mounted handler and returns its answer', () => {
    const handler = vi.fn(() => true)
    const off = setViewTabHandler(handler)
    expect(requestViewTab({ type: 'file-recovery', file: 'a.md' })).toBe(true)
    expect(handler).toHaveBeenCalledWith({ type: 'file-recovery', file: 'a.md' })
    off()
    expect(requestViewTab({ type: 'empty' })).toBe(false)
  })

  it('does not drop a newer handler when an older one unregisters late', () => {
    const first = vi.fn(() => true)
    const second = vi.fn(() => true)
    const offFirst = setViewTabHandler(first)
    const offSecond = setViewTabHandler(second)
    offFirst()
    expect(requestViewTab({ type: 'empty' })).toBe(true)
    expect(second).toHaveBeenCalled()
    offSecond()
  })
})
