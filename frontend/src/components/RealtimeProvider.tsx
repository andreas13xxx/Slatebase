/**
 * RealtimeProvider component — routes incoming SSE events to appropriate
 * state handlers (Chat, App, Presence, Toast) and manages polling toggle
 * based on connection status.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import React from 'react'
import { RealtimeProvider as RealtimeStateProvider, useRealtimeContext } from '../state/realtimeContext'
import { useEventSource, type SseEventData } from '../state/useEventSource'
import { showToast } from './ToastNotification'
import type { ConnectionStatus } from '../state/realtimeState'

/** Callback props for communicating with other providers. */
export interface RealtimeEventHandlers {
  /** Called when a chat:message event is received for the active conversation. */
  onChatMessage?: (data: Record<string, unknown>) => void
  /** Called when a chat:unread event is received with the new total. */
  onChatUnread?: (totalUnread: number) => void
  /** Called when a vault:change event is received. */
  onVaultChange?: (vaultId: string, data?: Record<string, unknown>) => void
  /** Called when a presence:update event is received. */
  onPresenceUpdate?: (userId: string, username: string, status: string) => void
  /** Called when a presence:init event is received with the initial online users list. */
  onPresenceInit?: (onlineUsers: Array<{ userId: string; username: string }>) => void
  /** Called when transitioning from fallback to connected (full refresh needed). */
  onReconnect?: () => void
  /** Called when polling should be enabled (fallback/disconnected state). */
  onPollingEnabled?: () => void
  /** Called when polling should be disabled (connected state). */
  onPollingDisabled?: () => void
}

/** Props for the RealtimeProvider component. */
export interface RealtimeProviderProps {
  children: React.ReactNode
  /** Session token for SSE authentication. */
  token: string | null
  /** Whether the realtime feature is enabled (from FeatureProvider). */
  featureEnabled: boolean
  /** Event handler callbacks for integration with other providers. */
  handlers?: RealtimeEventHandlers
  /** Set of message IDs already in chat state (for deduplication). */
  knownMessageIds?: Set<string>
  /** Current conversation ID (for routing chat:message events). */
  currentConversationId?: string | null
}

/**
 * Inner component that uses the realtime context and manages the EventSource connection.
 * Separated so it can access useRealtimeContext() inside the provider.
 */
function RealtimeInner({
  token,
  featureEnabled,
  handlers,
  knownMessageIds,
  currentConversationId,
}: Omit<RealtimeProviderProps, 'children'>) {
  const { state, dispatch } = useRealtimeContext()
  const previousStatusRef = useRef<ConnectionStatus>(state.connectionStatus)
  const handlersRef = useRef(handlers)
  const knownMessageIdsRef = useRef(knownMessageIds)
  const currentConversationIdRef = useRef(currentConversationId)

  // Keep refs up to date without causing re-renders
  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  useEffect(() => {
    knownMessageIdsRef.current = knownMessageIds
  }, [knownMessageIds])

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId
  }, [currentConversationId])

  // Local presence map state
  const [, setPresenceMap] = useState<Map<string, { username: string; status: string }>>(new Map())

  /** Route incoming SSE events to the appropriate handler. */
  const handleEvent = useCallback((eventType: string, data: SseEventData) => {
    const payload = data.payload

    switch (eventType) {
      case 'chat:message': {
        const messageId = payload.messageId as string | undefined
        // Deduplication: skip if messageId already in state
        if (messageId && knownMessageIdsRef.current?.has(messageId)) {
          return
        }
        handlersRef.current?.onChatMessage?.(payload)
        break
      }

      case 'chat:unread': {
        const totalUnread = payload.totalUnread as number | undefined
        if (totalUnread !== undefined) {
          handlersRef.current?.onChatUnread?.(totalUnread)
        }
        break
      }

      case 'presence:update': {
        const userId = payload.userId as string | undefined
        const username = payload.username as string | undefined
        const status = payload.status as string | undefined
        if (userId && username && status) {
          setPresenceMap((prev) => {
            const next = new Map(prev)
            if (status === 'offline') {
              next.delete(userId)
            } else {
              next.set(userId, { username, status })
            }
            return next
          })
          handlersRef.current?.onPresenceUpdate?.(userId, username, status)
        }
        break
      }

      case 'presence:init': {
        const onlineUsers = payload.onlineUsers as Array<{ userId: string; username: string }> | undefined
        if (Array.isArray(onlineUsers)) {
          setPresenceMap(() => {
            const next = new Map<string, { username: string; status: string }>()
            for (const user of onlineUsers) {
              next.set(user.userId, { username: user.username, status: 'online' })
            }
            return next
          })
          handlersRef.current?.onPresenceInit?.(onlineUsers)
        }
        break
      }

      case 'vault:change': {
        const vaultId = payload.vaultId as string | undefined
        if (vaultId) {
          handlersRef.current?.onVaultChange?.(vaultId, payload)
        }
        // Show toast notification for vault changes by other users
        const vaultUsername = payload.username as string | undefined
        const vaultPath = payload.path as string | undefined
        if (vaultUsername && vaultPath) {
          const fileName = vaultPath.length > 50
            ? vaultPath.slice(0, 50) + '\u2026'
            : vaultPath
          showToast('info', `${vaultUsername} hat ${fileName} geändert`)
        }
        break
      }

      case 'sync:conflict': {
        const conflictPath = payload.path as string | undefined
        if (conflictPath) {
          const fileName = conflictPath.length > 50
            ? conflictPath.slice(0, 50) + '\u2026'
            : conflictPath
          showToast('warning', `Sync-Konflikt: ${fileName}`)
        }
        break
      }

      case 'notification:toast': {
        const variant = payload.variant as 'info' | 'success' | 'warning' | 'error' | undefined
        const message = payload.message as string | undefined
        if (variant && message) {
          showToast(variant, message)
        }
        break
      }

      case 'server:shutdown': {
        showToast('warning', 'Server wird heruntergefahren. Verbindung wird getrennt.')
        break
      }

      case 'server:feature-disabled': {
        showToast('warning', 'Echtzeit-Updates wurden vom Administrator deaktiviert.')
        break
      }

      default:
        // Unknown event type — log and skip
        console.warn('[RealtimeProvider] Unknown event type:', eventType)
        break
    }
  }, [])

  // Connect the EventSource hook
  useEventSource({
    token,
    enabled: featureEnabled && token !== null,
    dispatch,
    onEvent: handleEvent,
  })

  // Track connection status transitions for polling toggle and reconnect refresh
  useEffect(() => {
    const prevStatus = previousStatusRef.current
    const currentStatus = state.connectionStatus
    previousStatusRef.current = currentStatus

    if (prevStatus === currentStatus) return

    if (currentStatus === 'connected') {
      // Disable polling when connected
      handlersRef.current?.onPollingDisabled?.()

      // On reconnect from fallback → connected: trigger full refresh
      if (prevStatus === 'fallback') {
        handlersRef.current?.onReconnect?.()
      }
    } else if (currentStatus === 'fallback' || currentStatus === 'disconnected') {
      // Re-enable polling when not connected
      handlersRef.current?.onPollingEnabled?.()
    }
  }, [state.connectionStatus])

  return null
}

/**
 * RealtimeProvider wraps children with SSE connection management
 * and event routing. Place inside AuthProvider and FeatureProvider.
 *
 * Event routing:
 * - chat:message → onChatMessage callback
 * - chat:unread → onChatUnread callback
 * - presence:update / presence:init → local presence map + callbacks
 * - vault:change → onVaultChange callback + toast
 * - sync:conflict → toast notification
 * - notification:toast → toast notification
 * - server:shutdown / server:feature-disabled → warning toast
 */
export function RealtimeProviderComponent({
  children,
  token,
  featureEnabled,
  handlers,
  knownMessageIds,
  currentConversationId,
}: RealtimeProviderProps) {
  return React.createElement(
    RealtimeStateProvider,
    null,
    React.createElement(RealtimeInner, {
      token,
      featureEnabled,
      handlers,
      knownMessageIds,
      currentConversationId,
    }),
    children,
  )
}

export { RealtimeProviderComponent as RealtimeProvider }
