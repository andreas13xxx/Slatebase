// ─── SSE Error Classes ────────────────────────────────────────────────────────

/**
 * Thrown when the global or per-user SSE connection limit is reached.
 * The client should retry after the specified delay.
 */
export class ConnectionLimitError extends Error {
  readonly code = 'CONNECTION_LIMIT_REACHED' as const
  readonly retryAfter = 30

  constructor() {
    super('Connection limit reached')
    this.name = 'ConnectionLimitError'
  }
}

/**
 * Thrown when the realtime feature is disabled via feature toggle.
 */
export class FeatureDisabledError extends Error {
  readonly code = 'FEATURE_DISABLED' as const

  constructor() {
    super('Realtime feature is disabled')
    this.name = 'FeatureDisabledError'
  }
}

/**
 * Thrown when an SSE event cannot be delivered to a connection (socket write error).
 */
export class EventDeliveryError extends Error {
  readonly connectionId: string

  constructor(connectionId: string, cause?: Error) {
    super(`Failed to deliver event to connection ${connectionId}`, { cause })
    this.name = 'EventDeliveryError'
    this.connectionId = connectionId
  }
}
