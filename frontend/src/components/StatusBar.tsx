/**
 * StatusBar — Bottom status bar displaying clock and extensible plugin items.
 *
 * Positioned at the bottom of the application layout. Shows the current time
 * (updated every second). Renders plugin-registered status bar items via
 * imperative DOM append (plugins manipulate their element directly).
 *
 * @module components/StatusBar
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from '../i18n'
import { Clock } from 'lucide-react'
import {
  getStatusBarItems,
  onStatusBarItemsChange,
} from '../plugins/compat/status-bar-registry'
import type { StatusBarItemEntry } from '../plugins/compat/status-bar-registry'
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
 * Also renders plugin status bar items via imperative DOM append.
 */
export function StatusBar() {
  const { t } = useTranslation()
  const [time, setTime] = useState<string>(formatTime)
  const [pluginItems, setPluginItems] = useState<StatusBarItemEntry[]>(getStatusBarItems)
  const pluginContainerRef = useRef<HTMLDivElement>(null)

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

  // Subscribe to status bar item changes from plugin registry
  useEffect(() => {
    const unsubscribe = onStatusBarItemsChange((items) => {
      setPluginItems([...items])
    })
    return unsubscribe
  }, [])

  // Imperatively mount plugin elements into the container
  const mountPluginItems = useCallback((container: HTMLDivElement | null) => {
    if (!container) return
    // Clear existing children
    container.innerHTML = ''
    // Append each plugin's element
    for (const item of pluginItems) {
      container.appendChild(item.element)
    }
  }, [pluginItems])

  // Re-mount when pluginItems change
  useEffect(() => {
    mountPluginItems(pluginContainerRef.current)
  }, [mountPluginItems])

  return (
    <footer className="status-bar" role="contentinfo" aria-label={t('statusBar.ariaLabel')}>
      <div className="status-bar__left">
        <div className="status-bar__item status-bar__clock" aria-live="off" aria-label={t('statusBar.clock')}>
          <Clock size={12} aria-hidden="true" />
          <time>{time}</time>
        </div>
      </div>
      <div
        className="status-bar__right"
        ref={pluginContainerRef}
        role="group"
        aria-label={t('statusBar.pluginItems')}
      />
    </footer>
  )
}
