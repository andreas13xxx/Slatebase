import type { SseEvent, ReplayBufferEntry } from './types.js'

/** Configuration options for the EventReplayBuffer. */
export interface ReplayBufferConfig {
  /** Maximum number of events to keep per user. Defaults to 100. */
  bufferSize?: number
  /** Time-to-live in milliseconds for buffered events. Defaults to 300000 (5 minutes). */
  ttlMs?: number
}

/**
 * Per-user circular buffer for SSE event replay on reconnect.
 * Stores the last N events per user with TTL-based eviction.
 * Events older than the configured TTL are evicted regardless of buffer capacity.
 */
export class EventReplayBuffer {
  private readonly buffers: Map<string, ReplayBufferEntry[]> = new Map()
  private readonly bufferSize: number
  private readonly ttlMs: number
  private eventCounter = 0

  constructor(config?: ReplayBufferConfig) {
    this.bufferSize = config?.bufferSize ?? (Number(process.env['SLATEBASE_SSE_REPLAY_BUFFER_SIZE']) || 100)
    this.ttlMs = config?.ttlMs ?? (Number(process.env['SLATEBASE_SSE_REPLAY_TTL']) || 300_000)
  }

  /**
   * Generate the next monotonically increasing event ID.
   * @returns A string representation of the next event ID.
   */
  nextEventId(): string {
    this.eventCounter++
    return String(this.eventCounter)
  }

  /**
   * Push an event into a user's replay buffer.
   * Evicts stale entries (TTL) and oldest entries (capacity) before adding.
   * @param userId - The user whose buffer to add to.
   * @param event - The SSE event to store.
   */
  push(userId: string, event: SseEvent): void {
    let buffer = this.buffers.get(userId)
    if (!buffer) {
      buffer = []
      this.buffers.set(userId, buffer)
    }

    // Evict stale entries based on TTL
    const now = Date.now()
    const ttlThreshold = now - this.ttlMs
    const freshEntries = buffer.filter(entry => entry.timestamp > ttlThreshold)

    // Evict oldest if at capacity
    while (freshEntries.length >= this.bufferSize) {
      freshEntries.shift()
    }

    // Add new entry
    freshEntries.push({
      id: event.id,
      event,
      timestamp: now,
    })

    this.buffers.set(userId, freshEntries)
  }

  /**
   * Get all events for a user with an ID strictly greater than the given lastEventId.
   * If lastEventId is unknown, invalid, or not found in the buffer, returns all buffered events for that user.
   * Events are returned in monotonically increasing order.
   * @param userId - The user whose events to retrieve.
   * @param lastEventId - The last event ID the client received.
   * @returns Array of SSE events after the given ID.
   */
  getEventsSince(userId: string, lastEventId: string): SseEvent[] {
    const buffer = this.buffers.get(userId)
    if (!buffer || buffer.length === 0) {
      return []
    }

    // Evict stale entries based on TTL
    const now = Date.now()
    const ttlThreshold = now - this.ttlMs
    const freshEntries = buffer.filter(entry => entry.timestamp > ttlThreshold)
    this.buffers.set(userId, freshEntries)

    if (freshEntries.length === 0) {
      return []
    }

    const numericId = Number(lastEventId)

    // If lastEventId is invalid (NaN) or not a positive number, return all buffered events
    if (Number.isNaN(numericId) || numericId <= 0) {
      return freshEntries.map(entry => entry.event)
    }

    // Check if lastEventId exists in the buffer (known ID)
    const idExists = freshEntries.some(entry => Number(entry.id) === numericId)
    if (!idExists) {
      // Unknown ID — return all buffered events
      return freshEntries.map(entry => entry.event)
    }

    // Return events with numeric ID > lastEventId
    return freshEntries
      .filter(entry => Number(entry.id) > numericId)
      .map(entry => entry.event)
  }

  /**
   * Get the number of buffered events for a specific user.
   * @param userId - The user to check.
   * @returns Number of currently buffered events.
   */
  getBufferSize(userId: string): number {
    const buffer = this.buffers.get(userId)
    return buffer ? buffer.length : 0
  }

  /**
   * Clear all buffered events for a specific user.
   * @param userId - The user whose buffer to clear.
   */
  clear(userId: string): void {
    this.buffers.delete(userId)
  }

  /**
   * Clear all buffers for all users.
   */
  clearAll(): void {
    this.buffers.clear()
  }
}
