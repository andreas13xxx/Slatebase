import { describe, it, expect, vi } from 'vitest'
import { onOpenInSplit, requestOpenInSplit, isOpenInSplitModifier } from './openInSplitBridge'

describe('openInSplitBridge', () => {
  it('delivers a request to a subscriber', () => {
    const listener = vi.fn()
    const unsub = onOpenInSplit(listener)
    requestOpenInSplit('v1', 'notes/a.md', 'a.md')
    expect(listener).toHaveBeenCalledWith({ vaultId: 'v1', filePath: 'notes/a.md', fileName: 'a.md' })
    unsub()
  })

  it('stops delivering after unsubscribe', () => {
    const listener = vi.fn()
    const unsub = onOpenInSplit(listener)
    unsub()
    requestOpenInSplit('v1', 'notes/a.md', 'a.md')
    expect(listener).not.toHaveBeenCalled()
  })

  it('delivers to multiple subscribers', () => {
    const a = vi.fn()
    const b = vi.fn()
    const unsubA = onOpenInSplit(a)
    const unsubB = onOpenInSplit(b)
    requestOpenInSplit('v1', 'x.md', 'x.md')
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    unsubA()
    unsubB()
  })

  describe('isOpenInSplitModifier', () => {
    it('is true for Ctrl+Alt and Cmd+Alt', () => {
      expect(isOpenInSplitModifier({ ctrlKey: true, altKey: true })).toBe(true)
      expect(isOpenInSplitModifier({ metaKey: true, altKey: true })).toBe(true)
    })

    it('is false for Ctrl alone, Alt alone, or no modifier', () => {
      expect(isOpenInSplitModifier({ ctrlKey: true })).toBe(false)
      expect(isOpenInSplitModifier({ metaKey: true })).toBe(false)
      expect(isOpenInSplitModifier({ altKey: true })).toBe(false)
      expect(isOpenInSplitModifier({})).toBe(false)
    })
  })
})
