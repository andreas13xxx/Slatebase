import type { ServerResponse } from 'node:http'

// ─── SSE Event Types ─────────────────────────────────────────────────────────

/** Supported SSE event types. */
export type SseEventType =
  | 'chat:message'
  | 'chat:unread'
  | 'presence:update'
  | 'presence:init'
  | 'vault:change'
  | 'sync:conflict'
  | 'notification:toast'
  | 'server:shutdown'
  | 'server:feature-disabled'

/** An SSE event to be serialized and sent to clients. */
export interface SseEvent {
  /** Event type identifier. */
  type: SseEventType
  /** Monotonically increasing event ID (string format). */
  id: string
  /** Event payload as a JSON-serializable record. */
  data: Record<string, unknown>
  /** ISO 8601 timestamp of event creation. */
  timestamp: string
}

// ─── Connection Types ────────────────────────────────────────────────────────

/** Metadata stored per active SSE connection. */
export interface ConnectionEntry {
  /** Unique connection identifier (UUID v4). */
  connectionId: string
  /** User ID of the connected client. */
  userId: string
  /** ISO 8601 timestamp when the connection was established. */
  connectedAt: string
  /** Last event ID sent on this connection (for replay). */
  lastEventId: string
  /** The writable stream (Node.js ServerResponse). */
  stream: ServerResponse
  /** Whether the connection is in draining state (being closed). */
  draining: boolean
}

/** Connection status for the frontend EventSource client. */
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'fallback'

// ─── Event Targeting ─────────────────────────────────────────────────────────

/** Audience targeting for event delivery. */
export type EventTarget =
  | { kind: 'user'; userId: string }
  | { kind: 'users'; userIds: string[] }
  | { kind: 'broadcast' }

/** Options for publishing an event via the Event Bus. */
export interface PublishOptions {
  /** Event type. */
  type: SseEventType
  /** Event payload. */
  payload: Record<string, unknown>
  /** Who should receive this event. */
  target: EventTarget
  /** Optional: exclude this userId from delivery (e.g., the sender). */
  excludeUserId?: string
}

// ─── Replay Buffer ───────────────────────────────────────────────────────────

/** Entry stored in the per-user circular replay buffer. */
export interface ReplayBufferEntry {
  /** Monotonic event ID. */
  id: string
  /** The full SSE event. */
  event: SseEvent
  /** Unix timestamp (ms) for TTL-based eviction. */
  timestamp: number
}

// ─── Rate Limiter ────────────────────────────────────────────────────────────

/** Sliding window counter entry for rate limiting. */
export interface RateLimiterEntry {
  /** Number of events recorded in the current window. */
  count: number
  /** Unix timestamp (ms) when the current window started. */
  windowStart: number
}

// ─── Service Interfaces ──────────────────────────────────────────────────────

/**
 * Manages active SSE connections, enforces per-user and global limits,
 * sends heartbeats, and handles cleanup.
 */
export interface IConnectionManager {
  /** Register a new SSE connection. Evicts oldest if per-user limit exceeded. Returns connectionId. */
  register(userId: string, stream: ServerResponse, lastEventId?: string): string

  /** Remove a connection and clean up resources. */
  remove(connectionId: string): void

  /** Get all active connections for a user. */
  getConnectionsForUser(userId: string): ConnectionEntry[]

  /** Get all active connection entries (for broadcast). */
  getAllConnections(): ConnectionEntry[]

  /** Check if a user has at least one active connection. */
  isConnected(userId: string): boolean

  /** Get total number of active connections. */
  getConnectionCount(): number

  /** Send an SSE event to specific connections. */
  send(connectionIds: string[], event: SseEvent): void

  /** Send an SSE event to all connections of a user. */
  sendToUser(userId: string, event: SseEvent): void

  /** Broadcast an SSE event to all connected clients. */
  broadcast(event: SseEvent): void

  /** Start heartbeat timer (called once at server startup). */
  startHeartbeat(): void

  /** Graceful shutdown: send server:shutdown event and close all connections. */
  shutdown(): Promise<void>

  /** Register a callback when a user's last connection is removed. */
  onUserDisconnected(callback: (userId: string) => void): void

  /** Register a callback when a user's first connection is established. */
  onUserConnected(callback: (userId: string) => void): void
}

/**
 * Central pub/sub system that routes events from backend services
 * to appropriate SSE clients.
 */
export interface IEventBus {
  /** Publish an event to targeted users. Handles authorization, rate limiting, and batching. */
  publish(options: PublishOptions): void

  /** Get the next monotonically increasing event ID (string format). */
  nextEventId(): string

  /** Get all events after a given event ID for a specific user (for replay on reconnect). */
  getEventsSince(userId: string, lastEventId: string): SseEvent[]

  /**
   * Subscribe to events of a specific type. The callback is invoked after each
   * publish() call that matches the given type. Useful for cross-cutting concerns
   * like cache invalidation or audit hooks.
   *
   * @param type - The event type to subscribe to, or '*' for all events.
   * @param callback - Function invoked with the publish options after dispatch.
   */
  subscribe(type: SseEventType | '*', callback: (options: PublishOptions) => void): void
}

/**
 * Tracks online status based on active SSE connections
 * with a grace period for brief disconnections.
 */
export interface IPresenceService {
  /** Mark a user as online (called when first SSE connection established). */
  markOnline(userId: string): void

  /** Start the offline grace period (called when last SSE connection lost). */
  startGracePeriod(userId: string): void

  /** Cancel a pending grace period (user reconnected within 60s). */
  cancelGracePeriod(userId: string): void

  /** Check if a user is currently online. */
  isOnline(userId: string): boolean

  /** Get all online user IDs. */
  getOnlineUsers(): string[]

  /** Get online users visible to a specific user (shared non-archived conversations). */
  getVisibleOnlineUsers(userId: string): Promise<Array<{ userId: string; username: string }>>

  /** Register a callback for online/offline transitions (after grace period). */
  onStatusChange(callback: (userId: string, status: 'online' | 'offline') => void): void
}

/**
 * Per-user per-event-type sliding window rate limiter.
 * Enforces a maximum number of events per type within a time window.
 */
export interface IRateLimiter {
  /** Check whether an event of the given type should be allowed for a user. */
  shouldAllow(userId: string, eventType: SseEventType): boolean

  /** Record an event occurrence for rate tracking. */
  recordEvent(userId: string, eventType: SseEventType): void
}
