# Implementation Plan: Realtime Infrastructure (SSE)

## Overview

SSE-basierte Echtzeit-Push-Infrastruktur die das bestehende Polling ersetzt. Backend: neues `realtime`-Modul mit ConnectionManager, EventBus, PresenceService und SSE-Route. Frontend: EventSource-Client, RealtimeProvider, Toast-Notifications, Connection-Indicator und State-Erweiterungen für Chat/App. Feature-Toggle `realtime` gatet das gesamte Subsystem.

## Tasks

- [x] 1. Backend realtime module foundation (types, interfaces, errors)
  - [x] 1.1 Create `backend/src/realtime/types.ts` with all interfaces and type definitions
    - Define `ConnectionEntry`, `IConnectionManager`, `SseEvent`, `SseEventType`, `EventTarget`, `PublishOptions`, `IEventBus`, `IPresenceService`, `ConnectionStatus` types
    - Define `ReplayBufferEntry` interface for the circular buffer
    - Define rate limiter state types
    - Use `I`-prefix for interfaces, named exports only
    - _Requirements: 1.1, 2.1, 3.1, 3.3_
  - [x] 1.2 Create `backend/src/realtime/errors.ts` with SSE-specific error classes
    - Implement `ConnectionLimitError` (code: `CONNECTION_LIMIT_REACHED`, retryAfter: 30)
    - Implement `FeatureDisabledError` (code: `FEATURE_DISABLED`)
    - Implement `EventDeliveryError` (connectionId, cause)
    - _Requirements: 2.7, 2.8, 9.4_
  - [x] 1.3 Create `backend/src/realtime/index.ts` barrel export
    - Export all types, interfaces, errors, and implementations
    - _Requirements: 1.1–1.10, 2.1–2.8, 3.1–3.9_

- [x] 2. Event Replay Buffer implementation
  - [x] 2.1 Create `backend/src/realtime/event-replay-buffer.ts`
    - Implement per-user circular buffer (configurable size, default 100)
    - `push(userId, event)` — adds event to user's buffer
    - `getEventsSince(userId, lastEventId)` — returns events with ID > lastEventId in order
    - TTL-based eviction (5 minutes, configurable via `SLATEBASE_SSE_REPLAY_TTL`)
    - Monotonically increasing event IDs (global counter)
    - _Requirements: 1.9, 4.10_
  - [ ]* 2.2 Create `backend/src/realtime/event-replay-buffer.test.ts`
    - Test: push and retrieve events in correct order
    - Test: getEventsSince returns only events after given ID
    - Test: buffer evicts oldest when capacity reached
    - Test: TTL-based eviction removes stale events
    - Test: empty buffer returns empty array
    - Test: invalid/unknown lastEventId returns all buffered events
    - Test: per-user isolation (user A cannot see user B events)
    - _Requirements: 1.9_

- [x] 3. Rate Limiter implementation
  - [x] 3.1 Create `backend/src/realtime/rate-limiter.ts`
    - Implement per-user per-event-type sliding window rate limiter
    - Default: max 10 events per type per second
    - When exceeded: discard older events, keep only the most recent per type
    - `shouldAllow(userId, eventType)` — returns boolean
    - `recordEvent(userId, eventType)` — tracks the event
    - Automatic cleanup of expired windows
    - _Requirements: 3.9, 10.3_
  - [ ]* 3.2 Create `backend/src/realtime/rate-limiter.test.ts`
    - Test: allows events within limit
    - Test: blocks events exceeding 10/second per type
    - Test: different event types have independent limits
    - Test: different users have independent limits
    - Test: window slides correctly (events expire after 1s)
    - Test: cleanup removes expired entries
    - _Requirements: 3.9, 10.3_

- [x] 4. Connection Manager implementation
  - [x] 4.1 Create `backend/src/realtime/connection-manager.ts`
    - Implement `IConnectionManager` interface
    - Primary index: `Map<connectionId, ConnectionEntry>`
    - Secondary index: `Map<userId, Set<connectionId>>`
    - `register(userId, stream, lastEventId?)` — enforces per-user limit (evicts oldest), returns connectionId
    - `remove(connectionId)` — cleanup resources, emit disconnect callback if last connection
    - `send(connectionIds, event)` — serialize SSE and write to streams (skip draining connections)
    - `sendToUser(userId, event)` — send to all non-draining connections of a user
    - `broadcast(event)` — send to all non-draining connections
    - `startHeartbeat()` — 30s interval sending `:heartbeat\n\n` comment
    - `shutdown()` — send `server:shutdown` event, close all connections
    - Global connection limit (default 1000, configurable) with 80% threshold for rejection
    - `onUserConnected` / `onUserDisconnected` callback registration
    - Accept `ILogger` dependency for structured logging
    - _Requirements: 1.8, 1.10, 2.1–2.8, 10.1, 10.4, 10.5, 10.6_
  - [ ]* 4.2 Create `backend/src/realtime/connection-manager.test.ts`
    - Test: register creates connection and returns ID
    - Test: per-user limit (4th connection evicts oldest)
    - Test: evicted connection receives close event before removal
    - Test: remove cleans up both indexes
    - Test: remove triggers onUserDisconnected when last connection removed
    - Test: register triggers onUserConnected on first connection
    - Test: send skips draining connections
    - Test: global limit at 80% rejects new connections
    - Test: heartbeat sends to all active connections
    - Test: shutdown sends server:shutdown and closes all
    - Test: getConnectionCount returns correct count
    - Test: isConnected returns true/false correctly
    - Use mock ServerResponse objects (writable streams)
    - _Requirements: 1.8, 1.10, 2.1–2.8, 10.4, 10.5, 10.6_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Event Bus implementation
  - [x] 6.1 Create `backend/src/realtime/event-bus.ts`
    - Implement `IEventBus` interface
    - Accept `IConnectionManager`, `IPresenceService` (optional), replay buffer, rate limiter, and `ILogger` as dependencies
    - `publish(options)` — resolve target users, apply authorization, rate limit, batch, and dispatch via ConnectionManager
    - `nextEventId()` — monotonically increasing counter (string format)
    - `getEventsSince(userId, lastEventId)` — delegate to replay buffer
    - SSE serialization: `event: <type>\nid: <id>\ndata: <JSON>\n\n`
    - Batching: group events within 100ms window, max 20 per batch
    - `excludeUserId` support for sender exclusion
    - Skip delivery to draining connections
    - _Requirements: 3.1–3.9, 10.2, 10.5_
  - [ ]* 6.2 Create `backend/src/realtime/event-bus.test.ts`
    - Test: publish routes event to correct user connections
    - Test: excludeUserId prevents delivery to sender
    - Test: broadcast delivers to all connected users
    - Test: SSE serialization format is correct (event/id/data/newlines)
    - Test: rate limiting drops excess events
    - Test: events are stored in replay buffer
    - Test: getEventsSince returns buffered events
    - Test: nextEventId is monotonically increasing
    - Test: draining connections are excluded
    - Use mock ConnectionManager and mock streams
    - _Requirements: 3.1–3.9, 10.2, 10.5_

- [x] 7. Presence Service implementation
  - [x] 7.1 Create `backend/src/realtime/presence-service.ts`
    - Implement `IPresenceService` interface
    - `markOnline(userId)` — set user as online, cancel pending grace period
    - `startGracePeriod(userId)` — start 60s timer, on expiry mark offline and invoke callback
    - `cancelGracePeriod(userId)` — cancel pending timer
    - `isOnline(userId)` / `getOnlineUsers()` — query current status
    - `getVisibleOnlineUsers(userId)` — filter by shared non-archived conversations (needs conversation store dependency)
    - `onStatusChange(callback)` — register listener for online/offline transitions
    - Grace period: 60s before marking offline (configurable)
    - _Requirements: 7.1, 7.2, 7.5_
  - [ ]* 7.2 Create `backend/src/realtime/presence-service.test.ts`
    - Test: markOnline sets user to online
    - Test: startGracePeriod after 60s marks user offline
    - Test: cancelGracePeriod prevents offline transition
    - Test: reconnect during grace period keeps user online
    - Test: onStatusChange fires on transitions (not during grace period)
    - Test: getOnlineUsers returns only online users
    - Test: getVisibleOnlineUsers filters by shared conversations
    - Use fake timers (vi.useFakeTimers)
    - _Requirements: 7.1, 7.2, 7.5_

- [x] 8. SSE Routes (endpoint handler)
  - [x] 8.1 Create `backend/src/api/sseRoutes.ts`
    - `GET /api/v1/events` — SSE endpoint
    - Protected by `authMiddleware` + `createFeatureGuard('realtime')`
    - Set response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`
    - Accept token from `Authorization: Bearer <token>` header OR `?token=` query param
    - Read `Last-Event-ID` header for replay
    - Register connection with ConnectionManager
    - On global limit exceeded (80%): return 503 with `Retry-After: 30`
    - On connection close: remove from ConnectionManager
    - Send initial `presence:init` event with visible online users
    - Replay missed events if `Last-Event-ID` provided
    - _Requirements: 1.1–1.10, 2.7, 2.8, 7.6, 10.6, 10.7_
  - [ ]* 8.2 Create `backend/src/api/sseRoutes.test.ts`
    - Test: authenticated request returns 200 with correct headers
    - Test: unauthenticated request returns 401
    - Test: disabled feature returns 403 with FEATURE_DISABLED code
    - Test: token from query param works
    - Test: Last-Event-ID triggers replay
    - Test: global limit returns 503 with Retry-After header
    - Test: X-Accel-Buffering: no header is set
    - Test: initial presence:init event is sent
    - _Requirements: 1.1–1.10, 2.7, 2.8, 7.6, 10.6, 10.7_

- [x] 9. Feature toggle registration
  - [x] 9.1 Register `realtime` feature toggle in composition root
    - Register with FeatureRegistry: name `realtime`, default `false`, type `hot`
    - Add `onChange` listener: when disabled, send `server:feature-disabled` to all clients and close connections within 10s
    - When enabled, no server-side action needed (clients poll feature state)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 10. Composition root wiring + service integration hooks
  - [x] 10.1 Wire realtime services in `backend/src/index.ts`
    - Instantiate: EventReplayBuffer, RateLimiter, ConnectionManager, PresenceService, EventBus
    - Dependency order: ReplayBuffer → RateLimiter → ConnectionManager → PresenceService → EventBus
    - Register ConnectionManager callbacks: `onUserConnected` → `presenceService.markOnline`, `onUserDisconnected` → `presenceService.startGracePeriod`
    - Register PresenceService `onStatusChange` → publish `presence:update` via EventBus
    - Start heartbeat timer: `connectionManager.startHeartbeat()`
    - Register graceful shutdown: send shutdown event on SIGTERM/SIGINT
    - Register SSE routes with Hono app
    - _Requirements: 1.5, 1.8, 2.3, 2.6, 7.1, 7.2, 9.1_
  - [x] 10.2 Add EventBus hooks to ChatService
    - After message creation: publish `chat:message` event to conversation participants (exclude sender)
    - After unread count change: publish `chat:unread` event to affected user
    - Accept optional `IEventBus` dependency (existing pattern with optional services)
    - _Requirements: 3.4, 3.5_
  - [x] 10.3 Add EventBus hooks to VaultController
    - After file save/delete/rename: publish `vault:change` event (exclude triggering user)
    - After sync conflict detected: publish `sync:conflict` event to vault owner
    - Accept optional `IEventBus` dependency
    - _Requirements: 3.7, 3.8_
  - [x] 10.4 Add SSE config to backend config schema
    - Add `SLATEBASE_SSE_*` env var support in config/index.ts
    - `maxConnections` (default 1000), `maxPerUser` (default 3), `heartbeatInterval` (default 30000)
    - `replayBufferSize` (default 100), `replayTtl` (default 300000)
    - `batchWindow` (default 100), `batchMax` (default 20)
    - _Requirements: 2.7, 10.2_

- [x] 11. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Frontend realtime state (reducer, context, actions)
  - [x] 12.1 Create `frontend/src/state/realtimeState.ts`
    - Define `RealtimeState`: `{ connectionStatus, lastEventId, reconnectAttempts }`
    - Define `RealtimeAction` union type: `CONNECTION_STATUS_CHANGED`, `LAST_EVENT_ID_UPDATED`, `RECONNECT_ATTEMPT`, `RECONNECT_RESET`
    - Implement `realtimeReducer`
    - Export `initialRealtimeState`
    - _Requirements: 4.8_
  - [x] 12.2 Create `frontend/src/state/realtimeContext.ts`
    - Create `RealtimeProvider` component with `useReducer(realtimeReducer, initialRealtimeState)`
    - Export `useRealtimeContext()` hook
    - Context value: `{ state, dispatch }`
    - _Requirements: 4.8_
  - [x] 12.3 Create `frontend/src/state/realtimeActions.ts`
    - Implement exponential backoff calculation: `min(1000 * 2^N + jitter, 60000)` where jitter is ±500ms
    - Implement `computeReconnectDelay(attempt: number): number`
    - _Requirements: 4.2_
  - [ ]* 12.4 Write unit tests for realtimeState reducer and actions
    - Create `frontend/src/state/realtimeState.test.ts`
    - Test: all action types produce correct state transitions
    - Test: initial state is correct
    - Test: backoff calculation respects bounds (never negative, never > 60000ms)
    - Test: backoff grows exponentially (1s, 2s, 4s, 8s, 16s...)
    - _Requirements: 4.2, 4.8_

- [x] 13. EventSource client with reconnect logic
  - [x] 13.1 Create `frontend/src/state/useEventSource.ts` hook
    - Connect to `/api/v1/events?token=<sessionToken>` when enabled
    - Track `Last-Event-ID` from received events
    - On disconnect: exponential backoff reconnect (initial 1s, max 60s, factor 2, jitter ±500ms)
    - After 5 consecutive failures: switch to `fallback` status
    - On successful reconnect: reset counter, set status `connected`
    - On 401/403: stop reconnecting, set status `disconnected`
    - On event parse error: log and skip, continue listening
    - Page Visibility API: 5-min timer to close on hidden, immediate reconnect on visible
    - On logout: close connection synchronously before token removal
    - Send `Last-Event-ID` header on reconnect for replay
    - Dispatch incoming events to a provided callback
    - _Requirements: 4.1–4.11_
  - [ ]* 13.2 Write unit tests for useEventSource hook
    - Create `frontend/src/state/useEventSource.test.ts`
    - Test: connects when enabled with correct URL
    - Test: dispatches events to callback
    - Test: reconnects with backoff on disconnect
    - Test: switches to fallback after 5 failures
    - Test: stops on 401/403
    - Test: handles page visibility (timer start/cancel)
    - Test: sends Last-Event-ID on reconnect
    - Use mock EventSource (vi.fn() based)
    - _Requirements: 4.1–4.11_

- [x] 14. Realtime Provider (event routing, polling toggle)
  - [x] 14.1 Create `frontend/src/components/RealtimeProvider.tsx`
    - Wrap `RealtimeProvider` context + `useEventSource` hook
    - Route incoming events by type to appropriate handlers:
      - `chat:message` → dispatch to ChatProvider (insert message or update preview)
      - `chat:unread` → dispatch to ChatProvider (update globalUnreadCount)
      - `presence:update` / `presence:init` → update local presence map
      - `vault:change` → trigger tree reload via AppProvider
      - `sync:conflict` → trigger toast notification
      - `notification:toast` → add to toast queue
      - `server:shutdown` / `server:feature-disabled` → handle gracefully
    - Disable 30s chat polling when connected, re-enable on fallback
    - Disable visibility-change refresh handler when connected
    - On reconnect (`fallback` → `connected`): trigger full refresh of unread + conversation list
    - Deduplication: skip `chat:message` if messageId already in state
    - If feature `realtime` is disabled: skip connection, use polling only
    - _Requirements: 5.1–5.9, 6.6–6.8, 8.1–8.6_
  - [ ]* 14.2 Write unit tests for RealtimeProvider event routing
    - Create `frontend/src/components/RealtimeProvider.test.tsx`
    - Test: chat:message for active conversation inserts message
    - Test: chat:message for inactive conversation updates preview + reorders
    - Test: chat:message with duplicate ID is skipped
    - Test: chat:unread updates globalUnreadCount
    - Test: vault:change triggers tree reload
    - Test: polling disabled when connected
    - Test: polling re-enabled on fallback
    - Test: full refresh on reconnect
    - Test: feature disabled → no connection attempt
    - _Requirements: 5.1–5.9, 8.1–8.6_

- [x] 15. Toast Notification component + CSS tokens
  - [x] 15.1 Create `frontend/src/components/ToastNotification.tsx`
    - Render toast stack at bottom-right (position: fixed, 16px offset)
    - Support variants: `info`, `success`, `warning`, `error`
    - Auto-dismiss after 5s with 300ms fade-out CSS animation
    - Close button (Lucide X icon, 14px)
    - Vertical stacking, max 5 visible (oldest removed when 6th added)
    - Each toast: icon (variant-specific Lucide icon) + message text + close button
    - German labels where appropriate
    - _Requirements: 6.1–6.5_
  - [x] 15.2 Create `frontend/src/components/ToastNotification.css`
    - Toast container positioning (fixed, bottom-right, z-index)
    - Variant styles using CSS Custom Properties tokens
    - Fade-in/fade-out animations (300ms)
    - Responsive stacking with gap
    - _Requirements: 6.1–6.5, 6.9_
  - [x] 15.3 Add toast design tokens to `frontend/src/index.css`
    - Define in `:root`: `--toast-info-bg`, `--toast-info-border`, `--toast-info-icon`, (same for success, warning, error)
    - Define in `:root[data-theme="dark"]` block
    - Define in `@media (prefers-color-scheme: dark)` block
    - Define connection indicator tokens: `--connection-connected`, `--connection-connecting`, `--connection-disconnected`, `--connection-fallback`
    - Define presence token: `--presence-online`
    - _Requirements: 6.9_
  - [ ]* 15.4 Write unit tests for ToastNotification
    - Create `frontend/src/components/ToastNotification.test.tsx`
    - Test: renders toast with correct variant class
    - Test: auto-dismiss after 5s (fake timers)
    - Test: close button removes toast immediately
    - Test: max 5 toasts visible, oldest removed on overflow
    - Test: fade-out animation class applied before removal
    - _Requirements: 6.1–6.5_

- [x] 16. Connection Indicator component
  - [x] 16.1 Create `frontend/src/components/ConnectionIndicator.tsx`
    - Small indicator showing connection status (connected/connecting/disconnected/fallback)
    - Use CSS tokens for each state color
    - Tooltip with status description (German labels)
    - Only visible when feature `realtime` is enabled (Requirement 9.5/9.6)
    - Lucide icon: Wifi/WifiOff or colored dot
    - _Requirements: 4.8, 9.5, 9.6_
  - [ ]* 16.2 Write unit tests for ConnectionIndicator
    - Create `frontend/src/components/ConnectionIndicator.test.tsx`
    - Test: renders correct status indicator for each state
    - Test: hidden when feature disabled
    - Test: tooltip shows German status text
    - _Requirements: 4.8, 9.5, 9.6_

- [x] 17. Checkpoint - Ensure all frontend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Chat state extensions (new actions for realtime messages)
  - [x] 18.1 Extend `frontend/src/state/chatState.ts` with new actions
    - Add `REALTIME_MESSAGE_RECEIVED` action: insert message into `messages` (if current conversation), deduplicate by messageId
    - Add `REALTIME_UNREAD_UPDATED` action: set `globalUnreadCount` to payload value
    - Add `REALTIME_CONVERSATION_PREVIEW_UPDATED` action: update `lastMessagePreview` (truncate to 100 chars + ellipsis) and `lastMessageTimestamp`, move conversation to index 0
    - _Requirements: 5.1, 5.2, 5.3, 5.9_
  - [ ]* 18.2 Write unit tests for chat state extensions
    - Create or extend `frontend/src/state/chatState.test.ts`
    - Test: REALTIME_MESSAGE_RECEIVED inserts message for active conversation
    - Test: REALTIME_MESSAGE_RECEIVED with duplicate messageId is no-op
    - Test: REALTIME_UNREAD_UPDATED sets correct count
    - Test: REALTIME_CONVERSATION_PREVIEW_UPDATED reorders conversations
    - Test: preview truncated to 100 chars with ellipsis
    - _Requirements: 5.1, 5.2, 5.3, 5.9_

- [x] 19. App state extensions (vault tree reload)
  - [x] 19.1 Extend `frontend/src/state/index.ts` with vault tree reload action
    - Add `VAULT_TREE_RELOAD_REQUESTED` action type
    - On receiving this action: trigger API call to reload tree for specified vaultId
    - Use existing `VAULT_TREE_LOADED` action to update state after successful fetch
    - On failure: log error, keep existing tree state unchanged
    - _Requirements: 5.6, 5.8_
  - [ ]* 19.2 Write unit tests for vault tree reload action
    - Test: VAULT_TREE_RELOAD_REQUESTED dispatches tree load
    - Test: failure keeps existing tree unchanged
    - _Requirements: 5.6, 5.8_

- [x] 20. Presence UI in chat (online indicators)
  - [x] 20.1 Add presence indicators to `frontend/src/components/ConversationList.tsx`
    - Show green dot (8px diameter) next to username for online participants
    - Use `--presence-online` CSS token
    - For group conversations: show indicator per participant
    - Presence data from RealtimeProvider context
    - _Requirements: 7.3, 7.4_
  - [ ]* 20.2 Write unit tests for presence indicators
    - Create or extend `frontend/src/components/ConversationList.test.tsx`
    - Test: online user shows green dot
    - Test: offline user has no indicator
    - Test: group conversation shows multiple indicators
    - _Requirements: 7.3, 7.4_

- [x] 21. App integration wiring
  - [x] 21.1 Wire RealtimeProvider into App component hierarchy
    - Place `RealtimeProvider` inside `AuthProvider` and `FeatureProvider`, wrapping `AppProvider`
    - Pass session token and feature state to RealtimeProvider
    - Add `ConnectionIndicator` to appropriate location in layout (e.g., status bar or toolbar)
    - Ensure toast container is rendered at app root level
    - _Requirements: 4.1, 9.5, 9.6_
  - [x] 21.2 Integrate polling toggle with existing ChatProvider
    - ChatProvider's 30s polling interval: respect `connectionStatus === 'connected'` → disable polling
    - ChatProvider's visibility-change handler: respect connected status → disable handler
    - On fallback: re-enable both mechanisms
    - _Requirements: 5.4, 5.5, 5.7, 8.1, 8.2_

- [x] 22. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- No PBT (property-based tests) per project convention — thorough example-based unit tests used instead
- Backend uses `.js` extensions on all relative imports
- Frontend uses no extensions (Vite resolves)
- All new CSS colors defined as tokens in `index.css` (never hardcoded)
- EventBus accepts optional dependencies (existing pattern: `eventBus?: IEventBus`)
- Connection Manager uses `ServerResponse` from Node.js `http` module for streams

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1", "10.4"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "7.1"] },
    { "id": 4, "tasks": ["6.1", "7.2"] },
    { "id": 5, "tasks": ["6.2", "8.1"] },
    { "id": 6, "tasks": ["8.2", "9.1"] },
    { "id": 7, "tasks": ["10.1", "10.2", "10.3"] },
    { "id": 8, "tasks": ["12.1", "12.3", "15.3"] },
    { "id": 9, "tasks": ["12.2", "12.4", "15.1", "15.2"] },
    { "id": 10, "tasks": ["13.1", "15.4", "16.1"] },
    { "id": 11, "tasks": ["13.2", "16.2", "18.1"] },
    { "id": 12, "tasks": ["14.1", "18.2", "19.1"] },
    { "id": 13, "tasks": ["14.2", "19.2", "20.1"] },
    { "id": 14, "tasks": ["20.2", "21.1", "21.2"] }
  ]
}
```
