/**
 * StatusBar — Bottom status bar displaying clock and extensible plugin items.
 *
 * Positioned at the bottom of the application layout. Shows the current time
 * (updated every second). Designed to be extended with additional status items
 * (e.g. from plugins) in the future.
 *
 * @module components/StatusBar
 */

import { useState, useEffect } from 'react'
import { useTranslation } from '../i18n'
import { Clock } from 'lucide-react'
import './StatusBar.css'

/**
 * Formats the current time as HH:MM.
 */
function formatTime(): string {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * StatusBar component rendered at the bottom of the app.
 * Shows the current time, updated every minute (on the minute boundary).
 */
export function StatusBar() {
  const { t } = useTranslation()
  const [time, setTime] = useState<string>(formatTime)

  useEffect(() => {
    // Update immediately, then align to minute boundaries
    const update = () => setTime(formatTime())

    // Calculate ms until next minute
    const now = new Date()
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds()

    // First timeout aligns to the next minute
    const alignTimeout = setTimeout(() => {
      update()
      // Then update every 60 seconds
      const interval = setInterval(update, 60_000)
      // Store interval for cleanup
      cleanupRef = () => clearInterval(interval)
    }, msUntilNextMinute)

    let cleanupRef: (() => void) | null = null

    return () => {
      clearTimeout(alignTimeout)
      cleanupRef?.()
    }
  }, [])

  return (
    <footer className="status-bar" role="contentinfo" aria-label={t('statusBar.ariaLabel')}>
      <div className="status-bar__item status-bar__clock" aria-live="off">
        <Clock size={12} aria-hidden="true" />
        <time>{time}</time>
      </div>
    </footer>
  )
}
