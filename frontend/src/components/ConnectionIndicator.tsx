import { Wifi, WifiOff } from 'lucide-react'
import type { ConnectionStatus } from '../state/realtimeState'

/** Props for the ConnectionIndicator component. */
export interface ConnectionIndicatorProps {
  /** Current SSE connection status. */
  status: ConnectionStatus
  /** Whether the indicator should be visible (controlled by feature toggle state). */
  visible: boolean
}

/** German labels for each connection status (used as tooltip). */
const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: 'Verbunden',
  connecting: 'Verbindung wird hergestellt…',
  disconnected: 'Getrennt',
  fallback: 'Fallback-Modus (Polling)',
}

/** CSS custom property color for each connection status. */
const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: 'var(--connection-connected)',
  connecting: 'var(--connection-connecting)',
  disconnected: 'var(--connection-disconnected)',
  fallback: 'var(--connection-fallback)',
}

/**
 * Small indicator showing the current SSE connection status.
 * Only rendered when the `realtime` feature toggle is enabled.
 * Uses Lucide Wifi/WifiOff icons colored by CSS design tokens.
 */
export function ConnectionIndicator({ status, visible }: ConnectionIndicatorProps) {
  if (!visible) return null

  const label = STATUS_LABELS[status]
  const color = STATUS_COLORS[status]
  const isOnline = status === 'connected'

  return (
    <div
      className="connection-indicator"
      title={label}
      aria-label={label}
      role="status"
    >
      {isOnline ? (
        <Wifi size={14} style={{ color }} />
      ) : (
        <WifiOff size={14} style={{ color }} />
      )}
    </div>
  )
}
