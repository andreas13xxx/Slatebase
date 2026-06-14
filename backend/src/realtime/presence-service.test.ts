import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PresenceService } from './presence-service.js'
import type { IConversationAccessor } from './presence-service.js'
import type { ILogger } from '../logger/index.js'

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

function createMockConversationAccessor(
  sharedUsers: Record<string, string[]> = {},
  usernames: Record<string, string> = {}
): IConversationAccessor {
  return {
    getUsersWithSharedConversations: vi.fn(async (userId: string) => sharedUsers[userId] ?? []),
    getUsername: vi.fn(async (userId: string) => usernames[userId]),
  }
}

describe('PresenceService', () => {
  let logger: ILogger

  beforeEach(() => {
    vi.useFakeTimers()
    logger = createMockLogger()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('markOnline', () => {
    it('marks a user as online', () => {
      const service = new PresenceService({ logger })
      service.markOnline('user1')
      expect(service.isOnline('user1')).toBe(true)
    })

    it('emits online callback when user was previously offline', () => {
      const service = new PresenceService({ logger })
      const callback = vi.fn()
      service.onStatusChange(callback)

      service.markOnline('user1')

      expect(callback).toHaveBeenCalledWith('user1', 'online')
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('does not emit callback when user is already online', () => {
      const service = new PresenceService({ logger })
      service.markOnline('user1')

      const callback = vi.fn()
      service.onStatusChange(callback)

      service.markOnline('user1')

      expect(callback).not.toHaveBeenCalled()
    })

    it('cancels pending grace period timer', () => {
      const service = new PresenceService({ logger, gracePeriodMs: 5000 })
      service.markOnline('user1')
      service.startGracePeriod('user1')

      // Reconnect within grace period
      service.markOnline('user1')

      // Advance past grace period — should not mark offline
      vi.advanceTimersByTime(6000)
      expect(service.isOnline('user1')).toBe(true)
    })
  })

  describe('startGracePeriod', () => {
    it('marks user offline after grace period expires', () => {
      const service = new PresenceService({ logger, gracePeriodMs: 5000 })
      service.markOnline('user1')
      service.startGracePeriod('user1')

      vi.advanceTimersByTime(5000)

      expect(service.isOnline('user1')).toBe(false)
    })

    it('emits offline callback when grace period expires', () => {
      const service = new PresenceService({ logger, gracePeriodMs: 5000 })
      service.markOnline('user1')

      const callback = vi.fn()
      service.onStatusChange(callback)
      callback.mockClear()

      service.startGracePeriod('user1')
      vi.advanceTimersByTime(5000)

      expect(callback).toHaveBeenCalledWith('user1', 'offline')
    })

    it('does not mark offline before grace period expires', () => {
      const service = new PresenceService({ logger, gracePeriodMs: 60000 })
      service.markOnline('user1')
      service.startGracePeriod('user1')

      vi.advanceTimersByTime(59999)

      expect(service.isOnline('user1')).toBe(true)
    })

    it('uses default 60s grace period', () => {
      const service = new PresenceService({ logger })
      service.markOnline('user1')
      service.startGracePeriod('user1')

      vi.advanceTimersByTime(59999)
      expect(service.isOnline('user1')).toBe(true)

      vi.advanceTimersByTime(1)
      expect(service.isOnline('user1')).toBe(false)
    })

    it('cancels previous timer when starting a new grace period', () => {
      const service = new PresenceService({ logger, gracePeriodMs: 5000 })
      service.markOnline('user1')

      service.startGracePeriod('user1')
      vi.advanceTimersByTime(3000)

      // Start a new grace period (resets the timer)
      service.startGracePeriod('user1')
      vi.advanceTimersByTime(3000)
      expect(service.isOnline('user1')).toBe(true)

      vi.advanceTimersByTime(2000)
      expect(service.isOnline('user1')).toBe(false)
    })
  })

  describe('cancelGracePeriod', () => {
    it('cancels the timer so user stays online', () => {
      const service = new PresenceService({ logger, gracePeriodMs: 5000 })
      service.markOnline('user1')
      service.startGracePeriod('user1')

      service.cancelGracePeriod('user1')
      vi.advanceTimersByTime(10000)

      expect(service.isOnline('user1')).toBe(true)
    })

    it('does nothing if no timer is active', () => {
      const service = new PresenceService({ logger })
      // Should not throw
      service.cancelGracePeriod('user1')
    })
  })

  describe('isOnline', () => {
    it('returns false for unknown users', () => {
      const service = new PresenceService({ logger })
      expect(service.isOnline('unknown')).toBe(false)
    })

    it('returns true for online users', () => {
      const service = new PresenceService({ logger })
      service.markOnline('user1')
      expect(service.isOnline('user1')).toBe(true)
    })
  })

  describe('getOnlineUsers', () => {
    it('returns empty array when no users are online', () => {
      const service = new PresenceService({ logger })
      expect(service.getOnlineUsers()).toEqual([])
    })

    it('returns all online user IDs', () => {
      const service = new PresenceService({ logger })
      service.markOnline('user1')
      service.markOnline('user2')
      service.markOnline('user3')

      const online = service.getOnlineUsers()
      expect(online).toHaveLength(3)
      expect(online).toContain('user1')
      expect(online).toContain('user2')
      expect(online).toContain('user3')
    })
  })

  describe('getVisibleOnlineUsers', () => {
    it('returns empty array when no conversation accessor is provided', async () => {
      const service = new PresenceService({ logger })
      service.markOnline('user1')

      const result = await service.getVisibleOnlineUsers('user2')
      expect(result).toEqual([])
    })

    it('returns only online users with shared conversations', async () => {
      const accessor = createMockConversationAccessor(
        { user1: ['user2', 'user3', 'user4'] },
        { user2: 'Alice', user3: 'Bob', user4: 'Charlie' }
      )
      const service = new PresenceService({ logger, conversationAccessor: accessor })
      service.markOnline('user2')
      service.markOnline('user3')
      // user4 is NOT online

      const result = await service.getVisibleOnlineUsers('user1')
      expect(result).toHaveLength(2)
      expect(result).toContainEqual({ userId: 'user2', username: 'Alice' })
      expect(result).toContainEqual({ userId: 'user3', username: 'Bob' })
    })

    it('excludes users whose username cannot be resolved', async () => {
      const accessor = createMockConversationAccessor(
        { user1: ['user2'] },
        {} // user2 has no username
      )
      const service = new PresenceService({ logger, conversationAccessor: accessor })
      service.markOnline('user2')

      const result = await service.getVisibleOnlineUsers('user1')
      expect(result).toEqual([])
    })

    it('returns empty array when no shared users are online', async () => {
      const accessor = createMockConversationAccessor(
        { user1: ['user2', 'user3'] },
        { user2: 'Alice', user3: 'Bob' }
      )
      const service = new PresenceService({ logger, conversationAccessor: accessor })
      // No one is online

      const result = await service.getVisibleOnlineUsers('user1')
      expect(result).toEqual([])
    })
  })

  describe('onStatusChange', () => {
    it('supports multiple callbacks', () => {
      const service = new PresenceService({ logger })
      const cb1 = vi.fn()
      const cb2 = vi.fn()
      service.onStatusChange(cb1)
      service.onStatusChange(cb2)

      service.markOnline('user1')

      expect(cb1).toHaveBeenCalledWith('user1', 'online')
      expect(cb2).toHaveBeenCalledWith('user1', 'online')
    })

    it('handles callback errors gracefully', () => {
      const service = new PresenceService({ logger })
      const badCallback = vi.fn(() => { throw new Error('callback error') })
      const goodCallback = vi.fn()
      service.onStatusChange(badCallback)
      service.onStatusChange(goodCallback)

      service.markOnline('user1')

      // Both callbacks are called even if the first throws
      expect(badCallback).toHaveBeenCalled()
      expect(goodCallback).toHaveBeenCalledWith('user1', 'online')
      expect(logger.error).toHaveBeenCalled()
    })
  })

  describe('grace period state machine', () => {
    it('full lifecycle: offline → online → grace → reconnect → online', () => {
      const service = new PresenceService({ logger, gracePeriodMs: 5000 })
      const callback = vi.fn()
      service.onStatusChange(callback)

      // User comes online
      service.markOnline('user1')
      expect(callback).toHaveBeenCalledWith('user1', 'online')
      expect(service.isOnline('user1')).toBe(true)

      // User disconnects — grace period starts
      service.startGracePeriod('user1')
      vi.advanceTimersByTime(3000)
      expect(service.isOnline('user1')).toBe(true)

      // User reconnects within grace period
      service.markOnline('user1')
      vi.advanceTimersByTime(10000)
      expect(service.isOnline('user1')).toBe(true)

      // Only the initial 'online' callback should have fired (no offline, no duplicate online)
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('full lifecycle: offline → online → grace → expires → offline', () => {
      const service = new PresenceService({ logger, gracePeriodMs: 5000 })
      const callback = vi.fn()
      service.onStatusChange(callback)

      service.markOnline('user1')
      service.startGracePeriod('user1')
      vi.advanceTimersByTime(5000)

      expect(service.isOnline('user1')).toBe(false)
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenNthCalledWith(1, 'user1', 'online')
      expect(callback).toHaveBeenNthCalledWith(2, 'user1', 'offline')
    })
  })
})
