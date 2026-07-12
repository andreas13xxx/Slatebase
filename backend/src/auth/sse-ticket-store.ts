/**
 * In-memory store for short-lived SSE connection tickets (nonces).
 *
 * Instead of passing the full session token as a URL query parameter for SSE
 * connections (which risks exposure in logs, referrer headers, and browser history),
 * clients first request a one-time ticket via POST /auth/sse-ticket, then connect
 * to the SSE endpoint using ?ticket=<nonce>.
 *
 * Each ticket:
 * - Is bound to a specific userId (from the session that created it)
 * - Has a short TTL (30 seconds by default)
 * - Can only be redeemed once (deleted on first use)
 * - Is stored purely in memory (no filesystem persistence needed)
 */

import { randomBytes } from 'node:crypto'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default ticket time-to-live in milliseconds (30 seconds). */
const DEFAULT_TICKET_TTL_MS = 30_000

/** Ticket length in bytes (results in 64-char hex string). */
const TICKET_LENGTH_BYTES = 32

/** Maximum tickets per user to prevent memory abuse. */
const MAX_TICKETS_PER_USER = 5

/** Cleanup interval in milliseconds (runs every 60 seconds). */
const CLEANUP_INTERVAL_MS = 60_000

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Internal record for a pending SSE ticket.
 */
interface TicketEntry {
  /** The user ID this ticket is bound to. */
  userId: string
  /** Unix timestamp (ms) when this ticket expires. */
  expiresAt: number
}

/**
 * Result of redeeming a ticket.
 */
export interface TicketRedemptionResult {
  /** Whether the ticket was valid and successfully redeemed. */
  valid: boolean
  /** The userId bound to the ticket (only present when valid). */
  userId?: string
}

// ─── Interface ───────────────────────────────────────────────────────────────

/**
 * Store for managing short-lived SSE connection tickets.
 */
export interface ISseTicketStore {
  /** Issue a new ticket for the given userId. Returns the ticket string. */
  issue(userId: string): string

  /** Redeem (consume) a ticket. Returns the bound userId if valid, or null. */
  redeem(ticket: string): TicketRedemptionResult

  /** Get the number of currently stored tickets (for diagnostics). */
  readonly size: number

  /** Stop the background cleanup timer. */
  destroy(): void
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * In-memory SSE ticket store with automatic expiry cleanup.
 */
export class SseTicketStore implements ISseTicketStore {
  private readonly tickets: Map<string, TicketEntry> = new Map()
  private readonly userTicketCount: Map<string, number> = new Map()
  private readonly ttlMs: number
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(ttlMs: number = DEFAULT_TICKET_TTL_MS) {
    this.ttlMs = ttlMs
    this.startCleanup()
  }

  /**
   * Issue a new one-time ticket bound to the given userId.
   * If the user already has MAX_TICKETS_PER_USER pending tickets,
   * the oldest one is evicted before issuing a new one.
   *
   * @param userId - The user ID to bind the ticket to.
   * @returns The generated ticket string (64-char hex).
   */
  issue(userId: string): string {
    // Evict oldest ticket if user has too many
    const count = this.userTicketCount.get(userId) ?? 0
    if (count >= MAX_TICKETS_PER_USER) {
      this.evictOldestForUser(userId)
    }

    const ticket = randomBytes(TICKET_LENGTH_BYTES).toString('hex')
    this.tickets.set(ticket, {
      userId,
      expiresAt: Date.now() + this.ttlMs,
    })
    this.userTicketCount.set(userId, (this.userTicketCount.get(userId) ?? 0) + 1)
    return ticket
  }

  /**
   * Redeem a ticket. The ticket is consumed (deleted) on first use.
   * Returns the bound userId if the ticket is valid and not expired.
   *
   * @param ticket - The ticket string to redeem.
   * @returns Redemption result with validity and userId.
   */
  redeem(ticket: string): TicketRedemptionResult {
    const entry = this.tickets.get(ticket)
    if (entry === undefined) {
      return { valid: false }
    }

    // Always delete the ticket (one-time use)
    this.tickets.delete(ticket)
    this.decrementUserCount(entry.userId)

    // Check expiry
    if (Date.now() > entry.expiresAt) {
      return { valid: false }
    }

    return { valid: true, userId: entry.userId }
  }

  /** Get the number of currently stored tickets. */
  get size(): number {
    return this.tickets.size
  }

  /** Stop the background cleanup timer. */
  destroy(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.removeExpired()
    }, CLEANUP_INTERVAL_MS)
    // Allow the process to exit even if this timer is active
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref()
    }
  }

  private removeExpired(): void {
    const now = Date.now()
    for (const [ticket, entry] of this.tickets) {
      if (now > entry.expiresAt) {
        this.tickets.delete(ticket)
        this.decrementUserCount(entry.userId)
      }
    }
  }

  private evictOldestForUser(userId: string): void {
    let oldestTicket: string | null = null
    let oldestExpiry = Infinity

    for (const [ticket, entry] of this.tickets) {
      if (entry.userId === userId && entry.expiresAt < oldestExpiry) {
        oldestExpiry = entry.expiresAt
        oldestTicket = ticket
      }
    }

    if (oldestTicket !== null) {
      this.tickets.delete(oldestTicket)
      this.decrementUserCount(userId)
    }
  }

  private decrementUserCount(userId: string): void {
    const count = this.userTicketCount.get(userId) ?? 0
    if (count <= 1) {
      this.userTicketCount.delete(userId)
    } else {
      this.userTicketCount.set(userId, count - 1)
    }
  }
}
