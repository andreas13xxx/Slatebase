import { randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type { ILogger } from '../logger/index.js'
import type { ConnectionEntry, IConnectionManager, SseEvent } from './types.js'
import { ConnectionLimitError } from './errors.js'

/** Configuration options for the ConnectionManager. */
export interface ConnectionManagerConfig {
  /** Maximum total simultaneous SSE connections. Defaults to 1000. */
  maxConnections?: number
  /** Maximum SSE connections per user. Defaults to 3. */
  maxPerUser?: number
  /** Heartbeat interval in milliseconds. Defaults to 30000. */
  heartbeatInterval?: number
}

/**
 * Manages active SSE connections, enforces per-user and global limits,
 * sends heartbeats, and handles cleanup.
 */
export class ConnectionManager implements IConnectionManager {
  private readonly connections: Map<string, ConnectionEntry> = new Map()
  private readonly userConnections: Map<string, Set<string>> = new Map()
  private readonly maxConnections: number
  private readonly maxPerUser: number
  private readonly heartbeatIntervalMs: number
  private heartbeatTimer: NodeJS.Timeout | null = null
  private readonly disconnectedCallbacks: Array<(userId: string) => void> = []
  private readonly connectedCallbacks: Array<(userId: string) => void> = []
  private readonly logger: ILogger

  constructor(config: ConnectionManagerConfig, logger: ILogger) {
    this.maxConnections = config.maxConnections ?? 1000
    this.maxPerUser = config.maxPerUser ?? 3
    this.heartbeatIntervalMs = config.heartbeatInterval ?? 30000
    this.logger = logger
  }

  /**
   * Register a new SSE connection. Enforces global limit (80% threshold)
   * and per-user limit (evicts oldest if exceeded). Returns connectionId.
   */
  register(userId: string, stream: ServerResponse, lastEventId?: string): string {
    // Check global connection limit at 80% threshold
    const threshold = Math.floor(this.maxConnections * 0.8)
    if (this.connections.size >= threshold) {
      this.logger.warn('Global connection limit threshold reached', {
        current: this.connections.size,
        threshold,
        maxConnections: this.maxConnections,
      })
      throw new ConnectionLimitError()
    }

    // Check per-user limit and evict oldest if needed
    const userConns = this.userConnections.get(userId)
    if (userConns && userConns.size >= this.maxPerUser) {
      this.evictOldest(userId)
    }

    const connectionId = randomUUID()
    const entry: ConnectionEntry = {
      connectionId,
      userId,
      connectedAt: new Date().toISOString(),
      lastEventId: lastEventId ?? '',
      stream,
      draining: false,
    }

    // Add to primary index
    this.connections.set(connectionId, entry)

    // Add to secondary index
    let userSet = this.userConnections.get(userId)
    if (!userSet) {
      userSet = new Set()
      this.userConnections.set(userId, userSet)
    }
    userSet.add(connectionId)

    // If this is the user's first connection, emit connected callback
    if (userSet.size === 1) {
      for (const callback of this.connectedCallbacks) {
        try {
          callback(userId)
        } catch (err) {
          this.logger.error('Error in onUserConnected callback', { userId, error: String(err) })
        }
      }
    }

    this.logger.info('SSE connection registered', { connectionId, userId, total: this.connections.size })
    return connectionId
  }

  /**
   * Remove a connection and clean up resources. Emits disconnect callback
   * if this was the user's last connection.
   */
  remove(connectionId: string): void {
    const entry = this.connections.get(connectionId)
    if (!entry) {
      return
    }

    // Remove from primary index
    this.connections.delete(connectionId)

    // Remove from secondary index
    const userSet = this.userConnections.get(entry.userId)
    if (userSet) {
      userSet.delete(connectionId)
      if (userSet.size === 0) {
        this.userConnections.delete(entry.userId)

        // Emit disconnected callback if this was the last connection
        for (const callback of this.disconnectedCallbacks) {
          try {
            callback(entry.userId)
          } catch (err) {
            this.logger.error('Error in onUserDisconnected callback', { userId: entry.userId, error: String(err) })
          }
        }
      }
    }

    this.logger.debug('SSE connection removed', { connectionId, userId: entry.userId, total: this.connections.size })
  }

  /** Get all active connections for a user. */
  getConnectionsForUser(userId: string): ConnectionEntry[] {
    const userSet = this.userConnections.get(userId)
    if (!userSet) {
      return []
    }
    const entries: ConnectionEntry[] = []
    for (const connId of userSet) {
      const entry = this.connections.get(connId)
      if (entry) {
        entries.push(entry)
      }
    }
    return entries
  }

  /** Get all active connection entries (for broadcast). */
  getAllConnections(): ConnectionEntry[] {
    return Array.from(this.connections.values())
  }

  /** Check if a user has at least one active connection. */
  isConnected(userId: string): boolean {
    const userSet = this.userConnections.get(userId)
    return userSet !== undefined && userSet.size > 0
  }

  /** Get total number of active connections. */
  getConnectionCount(): number {
    return this.connections.size
  }

  /** Send an SSE event to specific connections. Skips draining connections. */
  send(connectionIds: string[], event: SseEvent): void {
    const serialized = this.serializeEvent(event)
    for (const connId of connectionIds) {
      const entry = this.connections.get(connId)
      if (!entry || entry.draining) {
        continue
      }
      this.writeToStream(entry, serialized)
    }
  }

  /** Send an SSE event to all connections of a user. Skips draining connections. */
  sendToUser(userId: string, event: SseEvent): void {
    const userSet = this.userConnections.get(userId)
    if (!userSet) {
      return
    }
    const serialized = this.serializeEvent(event)
    for (const connId of userSet) {
      const entry = this.connections.get(connId)
      if (!entry || entry.draining) {
        continue
      }
      this.writeToStream(entry, serialized)
    }
  }

  /** Broadcast an SSE event to all connected clients. Skips draining connections. */
  broadcast(event: SseEvent): void {
    const serialized = this.serializeEvent(event)
    for (const entry of this.connections.values()) {
      if (entry.draining) {
        continue
      }
      this.writeToStream(entry, serialized)
    }
  }

  /** Start heartbeat timer (called once at server startup). */
  startHeartbeat(): void {
    if (this.heartbeatTimer) {
      return
    }
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat()
    }, this.heartbeatIntervalMs)
    this.logger.info('SSE heartbeat started', { intervalMs: this.heartbeatIntervalMs })
  }

  /** Graceful shutdown: send server:shutdown event and close all connections. */
  async shutdown(): Promise<void> {
    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    // Broadcast shutdown event
    const shutdownEvent: SseEvent = {
      type: 'server:shutdown',
      id: '0',
      data: { reason: 'shutdown' },
      timestamp: new Date().toISOString(),
    }
    this.broadcast(shutdownEvent)

    // End all streams
    for (const entry of this.connections.values()) {
      try {
        entry.stream.end()
      } catch {
        // Ignore errors when ending streams during shutdown
      }
    }

    // Clear all indexes
    this.connections.clear()
    this.userConnections.clear()

    this.logger.info('SSE connection manager shut down')
  }

  /** Register a callback when a user's last connection is removed. */
  onUserDisconnected(callback: (userId: string) => void): void {
    this.disconnectedCallbacks.push(callback)
  }

  /** Register a callback when a user's first connection is established. */
  onUserConnected(callback: (userId: string) => void): void {
    this.connectedCallbacks.push(callback)
  }

  /**
   * Evicts the oldest connection for a user. Sends a close event to the
   * evicted connection and marks it as draining before removal.
   */
  private evictOldest(userId: string): void {
    const userConns = this.getConnectionsForUser(userId)
    if (userConns.length === 0) {
      return
    }

    // Find oldest by connectedAt timestamp
    let oldest = userConns[0]!
    for (let i = 1; i < userConns.length; i++) {
      const conn = userConns[i]!
      if (conn.connectedAt < oldest.connectedAt) {
        oldest = conn
      }
    }

    // Send a close event to the evicted connection
    const closeEvent: SseEvent = {
      type: 'server:shutdown',
      id: '0',
      data: { reason: 'evicted' },
      timestamp: new Date().toISOString(),
    }
    const serialized = this.serializeEvent(closeEvent)
    try {
      oldest.stream.write(serialized)
    } catch {
      // Ignore write errors on eviction
    }

    // Mark as draining
    oldest.draining = true

    // Remove from indexes
    this.connections.delete(oldest.connectionId)
    const userSet = this.userConnections.get(userId)
    if (userSet) {
      userSet.delete(oldest.connectionId)
      // Don't emit disconnect callback — we're evicting, not truly disconnecting
      // (the user still has connections or is about to get a new one)
    }

    this.logger.info('Evicted oldest SSE connection for user', {
      connectionId: oldest.connectionId,
      userId,
    })
  }

  /**
   * Serializes an SSE event into the wire format.
   * Format: `event: <type>\nid: <id>\ndata: <JSON>\n\n`
   */
  private serializeEvent(event: SseEvent): string {
    const json = JSON.stringify(event.data)
    return `event: ${event.type}\nid: ${event.id}\ndata: ${json}\n\n`
  }

  /**
   * Writes serialized SSE data to a connection's stream.
   * On error, removes the connection.
   */
  private writeToStream(entry: ConnectionEntry, data: string): void {
    try {
      entry.stream.write(data)
    } catch (err) {
      this.logger.warn('Failed to write to SSE stream, removing connection', {
        connectionId: entry.connectionId,
        userId: entry.userId,
        error: String(err),
      })
      this.remove(entry.connectionId)
    }
  }

  /** Sends a heartbeat comment to all non-draining connections. */
  private sendHeartbeat(): void {
    const heartbeat = ':heartbeat\n\n'
    for (const entry of this.connections.values()) {
      if (entry.draining) {
        continue
      }
      try {
        entry.stream.write(heartbeat)
      } catch {
        this.remove(entry.connectionId)
      }
    }
  }
}
