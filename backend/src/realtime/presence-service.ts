import type { IPresenceService } from './types.js'
import type { ILogger } from '../logger/index.js'

/** Minimal interface for querying conversation participants. */
export interface IConversationAccessor {
  /** Get user IDs that share at least one non-archived conversation with the given user. */
  getUsersWithSharedConversations(userId: string): Promise<string[]>
  /** Get username for a userId. */
  getUsername(userId: string): Promise<string | undefined>
}

/**
 * Tracks online status based on active SSE connections
 * with a configurable grace period for brief disconnections.
 */
export class PresenceService implements IPresenceService {
  private readonly onlineUsers: Set<string> = new Set()
  private readonly graceTimers: Map<string, NodeJS.Timeout> = new Map()
  private readonly statusChangeCallbacks: Array<(userId: string, status: 'online' | 'offline') => void> = []
  private readonly conversationAccessor: IConversationAccessor | undefined
  private readonly logger: ILogger
  private readonly gracePeriodMs: number

  constructor(deps: {
    conversationAccessor?: IConversationAccessor
    logger: ILogger
    gracePeriodMs?: number
  }) {
    this.conversationAccessor = deps.conversationAccessor
    this.logger = deps.logger
    this.gracePeriodMs = deps.gracePeriodMs ?? 60000
  }

  /**
   * Mark a user as online.
   * Cancels any pending grace period timer. If the user was previously offline,
   * emits an 'online' status change callback.
   */
  markOnline(userId: string): void {
    this.cancelGracePeriod(userId)

    const wasOffline = !this.onlineUsers.has(userId)
    this.onlineUsers.add(userId)

    if (wasOffline) {
      this.logger.debug('User marked online', { userId })
      this.emitStatusChange(userId, 'online')
    }
  }

  /**
   * Start the offline grace period for a user.
   * After the configured grace period expires without a reconnection,
   * the user will be marked offline and an 'offline' callback emitted.
   */
  startGracePeriod(userId: string): void {
    // Cancel any existing timer before starting a new one
    this.cancelGracePeriod(userId)

    this.logger.debug('Grace period started', { userId, gracePeriodMs: this.gracePeriodMs })

    const timer = setTimeout(() => {
      this.graceTimers.delete(userId)
      this.onlineUsers.delete(userId)
      this.logger.debug('Grace period expired, user marked offline', { userId })
      this.emitStatusChange(userId, 'offline')
    }, this.gracePeriodMs)

    this.graceTimers.set(userId, timer)
  }

  /**
   * Cancel a pending grace period timer for a user.
   * Does nothing if no timer is active for the user.
   */
  cancelGracePeriod(userId: string): void {
    const timer = this.graceTimers.get(userId)
    if (timer) {
      clearTimeout(timer)
      this.graceTimers.delete(userId)
      this.logger.debug('Grace period cancelled', { userId })
    }
  }

  /** Check if a user is currently online. */
  isOnline(userId: string): boolean {
    return this.onlineUsers.has(userId)
  }

  /** Get all online user IDs. */
  getOnlineUsers(): string[] {
    return Array.from(this.onlineUsers)
  }

  /**
   * Get online users visible to a specific user.
   * Filters by users who share at least one non-archived conversation
   * with the requesting user, and returns their usernames.
   */
  async getVisibleOnlineUsers(userId: string): Promise<Array<{ userId: string; username: string }>> {
    if (!this.conversationAccessor) {
      return []
    }

    const sharedUserIds = await this.conversationAccessor.getUsersWithSharedConversations(userId)
    const visibleOnline: Array<{ userId: string; username: string }> = []

    for (const sharedUserId of sharedUserIds) {
      if (this.onlineUsers.has(sharedUserId)) {
        const username = await this.conversationAccessor.getUsername(sharedUserId)
        if (username) {
          visibleOnline.push({ userId: sharedUserId, username })
        }
      }
    }

    return visibleOnline
  }

  /**
   * Register a callback for online/offline transitions.
   * The callback is invoked after the grace period expires (for offline)
   * or immediately when a user comes online.
   */
  onStatusChange(callback: (userId: string, status: 'online' | 'offline') => void): void {
    this.statusChangeCallbacks.push(callback)
  }

  /** Emit a status change to all registered callbacks. */
  private emitStatusChange(userId: string, status: 'online' | 'offline'): void {
    for (const callback of this.statusChangeCallbacks) {
      try {
        callback(userId, status)
      } catch (err) {
        this.logger.error('Error in status change callback', { userId, status, error: String(err) })
      }
    }
  }
}
