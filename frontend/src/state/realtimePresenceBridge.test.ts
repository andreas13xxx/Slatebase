import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  onPresenceChange,
  dispatchPresenceChange,
  getOnlineUserIds,
} from './realtimePresenceBridge'

describe('realtimePresenceBridge', () => {
  const unsubscribers: Array<() => void> = []

  afterEach(() => {
    // Unsubscribe all callbacks registered during the test
    for (const unsub of unsubscribers) {
      unsub()
    }
    unsubscribers.length = 0
    // Reset module state to empty
    dispatchPresenceChange(new Set())
  })

  describe('getOnlineUserIds', () => {
    it('returns empty Set initially', () => {
      const result = getOnlineUserIds()

      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(0)
    })

    it('returns last dispatched Set after dispatch', () => {
      const userIds = new Set(['user-1', 'user-2', 'user-3'])

      dispatchPresenceChange(userIds)
      const result = getOnlineUserIds()

      expect(result).toBe(userIds)
      expect(result.size).toBe(3)
      expect(result.has('user-1')).toBe(true)
      expect(result.has('user-2')).toBe(true)
      expect(result.has('user-3')).toBe(true)
    })
  })

  describe('dispatchPresenceChange', () => {
    it('calls all registered subscribers with correct Set', () => {
      const cb1 = vi.fn()
      const cb2 = vi.fn()
      unsubscribers.push(onPresenceChange(cb1))
      unsubscribers.push(onPresenceChange(cb2))

      const userIds = new Set(['alice', 'bob'])
      dispatchPresenceChange(userIds)

      expect(cb1).toHaveBeenCalledTimes(1)
      expect(cb1).toHaveBeenCalledWith(userIds)
      expect(cb2).toHaveBeenCalledTimes(1)
      expect(cb2).toHaveBeenCalledWith(userIds)
    })

    it('multiple subscribers all receive updates', () => {
      const callbacks = [vi.fn(), vi.fn(), vi.fn()]
      for (const cb of callbacks) {
        unsubscribers.push(onPresenceChange(cb))
      }

      const firstSet = new Set(['user-a'])
      const secondSet = new Set(['user-a', 'user-b'])

      dispatchPresenceChange(firstSet)
      dispatchPresenceChange(secondSet)

      for (const cb of callbacks) {
        expect(cb).toHaveBeenCalledTimes(2)
        expect(cb).toHaveBeenNthCalledWith(1, firstSet)
        expect(cb).toHaveBeenNthCalledWith(2, secondSet)
      }
    })
  })

  describe('onPresenceChange', () => {
    it('unsubscribe function removes callback from subscriber set', () => {
      const cb = vi.fn()
      const unsubscribe = onPresenceChange(cb)

      unsubscribe()
      dispatchPresenceChange(new Set(['user-x']))

      expect(cb).not.toHaveBeenCalled()
    })

    it('dispatching after unsubscribe does not call removed callback', () => {
      const stayingCb = vi.fn()
      const removedCb = vi.fn()

      unsubscribers.push(onPresenceChange(stayingCb))
      const unsubRemoved = onPresenceChange(removedCb)

      // First dispatch — both should receive
      dispatchPresenceChange(new Set(['user-1']))
      expect(stayingCb).toHaveBeenCalledTimes(1)
      expect(removedCb).toHaveBeenCalledTimes(1)

      // Unsubscribe one
      unsubRemoved()

      // Second dispatch — only staying callback should receive
      dispatchPresenceChange(new Set(['user-1', 'user-2']))
      expect(stayingCb).toHaveBeenCalledTimes(2)
      expect(removedCb).toHaveBeenCalledTimes(1)
    })
  })
})
