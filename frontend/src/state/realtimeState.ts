/**
 * Realtime state management for SSE connection tracking.
 * Manages connection status, event replay IDs, and reconnection attempts.
 */

/** Possible SSE connection states. */
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'fallback'

/** State for the realtime SSE connection. */
export interface RealtimeState {
  connectionStatus: ConnectionStatus
  lastEventId: string | null
  reconnectAttempts: number
}

/** Actions that can be dispatched to the realtime reducer. */
export type RealtimeAction =
  | { type: 'CONNECTION_STATUS_CHANGED'; payload: ConnectionStatus }
  | { type: 'LAST_EVENT_ID_UPDATED'; payload: string }
  | { type: 'RECONNECT_ATTEMPT' }
  | { type: 'RECONNECT_RESET' }

/** Initial state for the realtime reducer. */
export const initialRealtimeState: RealtimeState = {
  connectionStatus: 'disconnected',
  lastEventId: null,
  reconnectAttempts: 0,
}

/** Reducer for realtime SSE connection state. */
export function realtimeReducer(state: RealtimeState, action: RealtimeAction): RealtimeState {
  switch (action.type) {
    case 'CONNECTION_STATUS_CHANGED':
      return { ...state, connectionStatus: action.payload }
    case 'LAST_EVENT_ID_UPDATED':
      return { ...state, lastEventId: action.payload }
    case 'RECONNECT_ATTEMPT':
      return { ...state, reconnectAttempts: state.reconnectAttempts + 1 }
    case 'RECONNECT_RESET':
      return { ...state, reconnectAttempts: 0 }
    default:
      return state
  }
}
