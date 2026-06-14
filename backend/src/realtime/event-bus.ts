import type { ILogger } from '../logger/index.js'
import type { EventReplayBuffer } from './event-replay-buffer.js'
import type { RateLimiter } from './rate-limiter.js'
import type { IConnectionManager, IEventBus, PublishOptions, SseEvent } from './types.js'

/** Configuration options for the EventBus. */
export interface EventBusConfig {
  /** Connection manager for dispatching events to users. */
  connectionManager: IConnectionManager
  /** Replay buffer for event storage and replay on reconnect. */
  replayBuffer: EventReplayBuffer
  /** Rate limiter for per-user per-type throttling. */
  rateLimiter: RateLimiter
  /** Logger instance. */
  logger: ILogger
  /** Batching window in milliseconds. Default: 100ms. */
  batchWindow?: number
  /** Maximum events per batch. Default: 20. */
  batchMax?: number
}

/**
 * Central pub/sub system that routes events from backend services
 * to appropriate SSE clients. Handles authorization, rate limiting,
 * replay buffering, and dispatch via the ConnectionManager.
 */
export class EventBus implements IEventBus {
  private readonly connectionManager: IConnectionManager
  private readonly replayBuffer: EventReplayBuffer
  private readonly rateLimiter: RateLimiter
  private readonly logger: ILogger

  /** Batching window in milliseconds (reserved for future batching optimization). */
  readonly batchWindow: number
  /** Maximum events per batch (reserved for future batching optimization). */
  readonly batchMax: number

  constructor(config: EventBusConfig) {
    this.connectionManager = config.connectionManager
    this.replayBuffer = config.replayBuffer
    this.rateLimiter = config.rateLimiter
    this.logger = config.logger
    this.batchWindow = config.batchWindow ?? 100
    this.batchMax = config.batchMax ?? 20
  }

  /**
   * Publish an event to targeted users. Handles rate limiting,
   * replay buffer storage, and dispatch via ConnectionManager.
   * Connections marked as draining are excluded from delivery.
   * @param options - Publishing options including type, payload, target, and optional sender exclusion.
   */
  publish(options: PublishOptions): void {
    const { type, payload, target, excludeUserId } = options

    // Generate event ID and create the full SseEvent
    const id = this.replayBuffer.nextEventId()
    const timestamp = new Date().toISOString()
    const event: SseEvent = {
      type,
      id,
      data: { type, payload, timestamp },
      timestamp,
    }

    // Resolve target user IDs
    const targetUserIds = this.resolveTargetUsers(target, excludeUserId)

    if (target.kind === 'broadcast') {
      // For broadcast: store in replay buffer for each connected user, then broadcast
      for (const userId of targetUserIds) {
        if (!this.checkRateLimit(userId, type)) {
          continue
        }
        this.replayBuffer.push(userId, event)
      }
      // Broadcast via ConnectionManager (it skips draining connections internally)
      // We need to handle excludeUserId manually for broadcast
      if (excludeUserId) {
        // Send to all users except the excluded one
        for (const userId of targetUserIds) {
          this.connectionManager.sendToUser(userId, event)
        }
      } else {
        this.connectionManager.broadcast(event)
      }
    } else {
      // For user/users targets: send to each user individually
      for (const userId of targetUserIds) {
        if (!this.checkRateLimit(userId, type)) {
          continue
        }
        this.replayBuffer.push(userId, event)
        this.connectionManager.sendToUser(userId, event)
      }
    }

    this.logger.debug('Event published', { type, id, target: target.kind, targetCount: targetUserIds.length })
  }

  /**
   * Get the next monotonically increasing event ID (string format).
   * Delegates to the replay buffer.
   * @returns The next event ID as a string.
   */
  nextEventId(): string {
    return this.replayBuffer.nextEventId()
  }

  /**
   * Get all events after a given event ID for a specific user (for replay on reconnect).
   * Delegates to the replay buffer.
   * @param userId - The user whose events to retrieve.
   * @param lastEventId - The last event ID the client received.
   * @returns Array of SSE events after the given ID.
   */
  getEventsSince(userId: string, lastEventId: string): SseEvent[] {
    return this.replayBuffer.getEventsSince(userId, lastEventId)
  }

  /**
   * Resolve target user IDs from EventTarget, applying sender exclusion.
   * For broadcast targets, resolves all currently connected users.
   */
  private resolveTargetUsers(
    target: PublishOptions['target'],
    excludeUserId?: string
  ): string[] {
    let userIds: string[]

    switch (target.kind) {
      case 'user':
        userIds = [target.userId]
        break
      case 'users':
        userIds = [...target.userIds]
        break
      case 'broadcast': {
        // Get all unique user IDs from active connections
        const connections = this.connectionManager.getAllConnections()
        const uniqueUsers = new Set<string>()
        for (const conn of connections) {
          if (!conn.draining) {
            uniqueUsers.add(conn.userId)
          }
        }
        userIds = Array.from(uniqueUsers)
        break
      }
    }

    // Apply sender exclusion
    if (excludeUserId) {
      userIds = userIds.filter(id => id !== excludeUserId)
    }

    return userIds
  }

  /**
   * Check rate limit for a user and event type. Records the event if allowed.
   * @returns true if the event should be delivered, false if rate-limited.
   */
  private checkRateLimit(userId: string, type: PublishOptions['type']): boolean {
    if (!this.rateLimiter.shouldAllow(userId, type)) {
      this.logger.debug('Event rate-limited', { userId, type })
      return false
    }
    this.rateLimiter.recordEvent(userId, type)
    return true
  }
}
