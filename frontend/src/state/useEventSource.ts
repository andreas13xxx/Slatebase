/**
 * Custom React hook managing an EventSource (SSE) connection with
 * exponential backoff reconnect and Page Visibility API integration.
 */

import { useEffect, useRef, useCallback } from 'react'
import type { Dispatch } from 'react'
import { computeReconnectDelay } from './realtimeActions'
import type { RealtimeAction, ConnectionStatus } from './realtimeState'

/** Shape of an incoming SSE event's parsed data field. */
export interface SseEventData {
  type: string
  payload: Record<string, unknown>
  timestamp: string
}

/** Options passed to the useEventSource hook. */
export interface UseEventSourceOptions {
  /** Session token for authentication (appended as query param). */
  token: string | null
  /** Whether the SSE connection should be active (feature enabled + authenticated). */
  enabled: boolean
  /** Dispatch function for RealtimeAction state updates. */
  dispatch: Dispatch<RealtimeAction>
  /** Callback invoked for each successfully parsed SSE event. */
  onEvent: (eventType: string, data: SseEventData) => void
}

/** Maximum consecutive reconnect failures before giving up. */
const MAX_RECONNECT_ATTEMPTS = 5

/** Duration (ms) the tab can remain hidden before closing the connection. */
const VISIBILITY_TIMEOUT_MS = 5 * 60 * 1000

/** Named event types the server may send. */
const SSE_EVENT_TYPES = [
  'chat:message',
  'chat:unread',
  'presence:update',
  'presence:init',
  'vault:change',
  'sync:conflict',
  'notification:toast',
  'server:shutdown',
] as const

/**
 * Manages an EventSource connection lifecycle including:
 * - Connect to /api/v1/events?token=<sessionToken> when enabled
 * - Track Last-Event-ID from received events
 * - Exponential backoff reconnect on disconnect (1s initial, 60s max, factor 2, jitter ±500ms)
 * - After 5 consecutive failures: stop reconnecting, set status disconnected
 * - On successful connection: reset counter, set status connected
 * - On 401/403: stop reconnecting, set status disconnected
 * - On event parse error: log and skip, continue listening
 * - Page Visibility API: 5-min timer to close on hidden, immediate reconnect on visible
 * - On logout (enabled becomes false): close connection synchronously
 * - Send Last-Event-ID header on reconnect for replay
 * - Dispatch incoming events to onEvent callback
 */
export function useEventSource(options: UseEventSourceOptions): void {
  const { token, enabled, dispatch, onEvent } = options

  // Refs for mutable state that persists across renders without causing re-renders
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const visibilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptCountRef = useRef(0)
  const lastEventIdRef = useRef<string | null>(null)
  const isConnectingRef = useRef(false)
  const shouldReconnectRef = useRef(true)

  // Stable refs for callbacks — updated via effect to satisfy eslint
  const onEventRef = useRef(onEvent)
  const dispatchRef = useRef(dispatch)

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    dispatchRef.current = dispatch
  }, [dispatch])

  /** Helper to update connection status via dispatch. */
  const setStatus = useCallback((status: ConnectionStatus) => {
    dispatchRef.current({ type: 'CONNECTION_STATUS_CHANGED', payload: status })
  }, [])

  /** Close the current EventSource connection and clear reconnect timer. */
  const closeConnection = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (eventSourceRef.current !== null) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    isConnectingRef.current = false
  }, [])

  // Use a ref for the connect function so it can self-reference in setTimeout
  const connectRef = useRef<() => void>(() => {})

  /** Establish a new EventSource connection. */
  const connect = useCallback(() => {
    if (!token || !enabled) return
    if (isConnectingRef.current) return

    isConnectingRef.current = true
    setStatus('connecting')

    // Build URL with token and optional Last-Event-ID
    let url = `/api/v1/events?token=${encodeURIComponent(token)}`
    if (lastEventIdRef.current) {
      url += `&lastEventId=${encodeURIComponent(lastEventIdRef.current)}`
    }

    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onopen = () => {
      isConnectingRef.current = false
      attemptCountRef.current = 0
      dispatchRef.current({ type: 'RECONNECT_RESET' })
      setStatus('connected')
    }

    es.onmessage = (event: MessageEvent) => {
      // Track Last-Event-ID
      if (event.lastEventId) {
        lastEventIdRef.current = event.lastEventId
        dispatchRef.current({ type: 'LAST_EVENT_ID_UPDATED', payload: event.lastEventId })
      }

      // Parse event data
      try {
        const data = JSON.parse(event.data as string) as SseEventData
        onEventRef.current(data.type, data)
      } catch (err) {
        // On parse error: log and skip, continue listening
        console.warn('[useEventSource] Failed to parse SSE event data:', err)
      }
    }

    /** Handler for named SSE events (event: <type>). */
    const handleNamedEvent = (event: MessageEvent) => {
      // Track Last-Event-ID
      if (event.lastEventId) {
        lastEventIdRef.current = event.lastEventId
        dispatchRef.current({ type: 'LAST_EVENT_ID_UPDATED', payload: event.lastEventId })
      }

      // Parse and dispatch
      try {
        const data = JSON.parse(event.data as string) as SseEventData
        onEventRef.current(event.type, data)
      } catch (err) {
        console.warn('[useEventSource] Failed to parse SSE event data:', err)
      }
    }

    // Listen for all named event types that the server may send
    for (const eventType of SSE_EVENT_TYPES) {
      es.addEventListener(eventType, handleNamedEvent as EventListener)
    }

    es.onerror = () => {
      isConnectingRef.current = false
      es.close()
      eventSourceRef.current = null

      if (!shouldReconnectRef.current) {
        setStatus('disconnected')
        return
      }

      // Increment attempt counter
      attemptCountRef.current += 1
      dispatchRef.current({ type: 'RECONNECT_ATTEMPT' })

      // After 5 consecutive failures: stop reconnecting
      if (attemptCountRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setStatus('disconnected')
        return
      }

      // Schedule reconnect with exponential backoff
      setStatus('connecting')
      const delay = computeReconnectDelay(attemptCountRef.current - 1)
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null
        connectRef.current()
      }, delay)
    }
  }, [token, enabled, setStatus])

  // Keep connectRef in sync
  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  // Main effect: manage connection lifecycle
  useEffect(() => {
    if (!enabled || !token) {
      // On logout or disabled: close connection synchronously
      closeConnection()
      shouldReconnectRef.current = false
      setStatus('disconnected')
      return
    }

    // Enable reconnecting
    shouldReconnectRef.current = true
    attemptCountRef.current = 0

    // Connect
    connect()

    // Cleanup on unmount or when dependencies change
    return () => {
      shouldReconnectRef.current = false
      closeConnection()
    }
  }, [enabled, token, connect, closeConnection, setStatus])

  // Page Visibility API effect
  useEffect(() => {
    if (!enabled || !token) return

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Start 5-minute timer to close connection
        visibilityTimerRef.current = setTimeout(() => {
          visibilityTimerRef.current = null
          closeConnection()
          setStatus('disconnected')
        }, VISIBILITY_TIMEOUT_MS)
      } else {
        // Tab became visible
        if (visibilityTimerRef.current !== null) {
          // Timer still running — cancel it, connection is still alive
          clearTimeout(visibilityTimerRef.current)
          visibilityTimerRef.current = null
        } else if (eventSourceRef.current === null && shouldReconnectRef.current) {
          // Connection was already closed — reconnect immediately
          attemptCountRef.current = 0
          connectRef.current()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (visibilityTimerRef.current !== null) {
        clearTimeout(visibilityTimerRef.current)
        visibilityTimerRef.current = null
      }
    }
  }, [enabled, token, closeConnection, setStatus])
}
