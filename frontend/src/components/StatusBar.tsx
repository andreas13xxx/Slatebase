/**
 * StatusBar — Bottom status bar displaying clock, vault name, word/character
 * count, cursor position, and extensible plugin items.
 *
 * Positioned at the bottom of the application layout. Each built-in item is
 * independently toggleable via useStatusBarItemVisibility (Requirement 6).
 * Plugin items are synced into the DOM via a diff (add/remove only) instead
 * of a full clear+reappend, so a plugin mutating its own element's content
 * never gets torn out of the DOM (Requirement 7).
 *
 * @module components/StatusBar
 */

import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react'
import { useTranslation } from '../i18n'
import { Clock, Vault as VaultIcon, FileText, MoveVertical } from 'lucide-react'
import {
  getStatusBarItems,
  onStatusBarItemsChange,
} from '../plugins/compat/status-bar-registry'
import type { StatusBarItemEntry } from '../plugins/compat/status-bar-registry'
import { useStatusBarItemVisibility } from '../hooks/useStatusBarItemVisibility'
import { useWordStats } from '../hooks/useWordStats'
import { useCursorPosition, goToLine } from '../hooks/useCursorPosition'
import { useAppContext } from '../state'
import { useFocusTrap } from '../hooks/useFocusTrap'
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

/** Vault-name item (Requirement 6.6). */
function VaultNameItem() {
  const { t } = useTranslation()
  const { visible } = useStatusBarItemVisibility('vaultName')
  const { state } = useAppContext()
  const vault = state.vaults.find((v) => v.id === state.selectedVaultId)

  if (!visible || !vault) return null

  return (
    <div className="status-bar__item status-bar__vault-name" aria-label={t('statusBar.vaultNameAriaLabel')}>
      <VaultIcon size={12} aria-hidden="true" />
      <span>{vault.name}</span>
    </div>
  )
}

/** Word/character count item, with selection counts when applicable (Requirement 4). */
function WordStatsItem() {
  const { t } = useTranslation()
  const { visible } = useStatusBarItemVisibility('wordStats')
  const stats = useWordStats()

  if (!visible) return null
  // No active editor (no file tab, or the active file is not a text file) — Requirement 4.4
  if (stats.words === 0 && stats.characters === 0 && stats.selectedWords === null) {
    return null
  }

  const label =
    stats.selectedWords !== null
      ? t('statusBar.wordStatsSelection', { selected: stats.selectedWords, total: stats.words })
      : t('statusBar.wordStats', { words: stats.words, characters: stats.characters })

  return (
    <div className="status-bar__item status-bar__word-stats" aria-label={t('statusBar.wordStatsAriaLabel')}>
      <FileText size={12} aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

/** Cursor position item with a "go to line" popover (Requirement 5). */
function CursorPositionItem() {
  const { t } = useTranslation()
  const { visible } = useStatusBarItemVisibility('cursorPosition')
  const position = useCursorPosition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [lineInput, setLineInput] = useState('')
  const dialogRef = useFocusTrap<HTMLDivElement>({
    isActive: dialogOpen,
    onEscape: () => setDialogOpen(false),
  })

  const openDialog = useCallback(() => {
    if (!position) return
    setLineInput(String(position.line))
    setDialogOpen(true)
  }, [position])

  const confirmGoToLine = useCallback((e: FormEvent) => {
    e.preventDefault()
    const parsed = Number.parseInt(lineInput, 10)
    if (Number.isFinite(parsed)) {
      goToLine(parsed)
    }
    setDialogOpen(false)
  }, [lineInput])

  if (!visible || !position) return null

  const label =
    position.selectedLines !== null
      ? `${position.line}:${position.column} (${t('statusBar.cursorSelectedLines', { count: position.selectedLines })})`
      : `${position.line}:${position.column}`

  return (
    <div className="status-bar__item-wrapper">
      <button
        type="button"
        className="status-bar__item status-bar__cursor-position"
        aria-label={t('statusBar.cursorPositionAriaLabel')}
        onClick={openDialog}
      >
        <MoveVertical size={12} aria-hidden="true" />
        <span>{label}</span>
      </button>
      {dialogOpen && (
        <div className="status-bar__goto-line-popover" ref={dialogRef} role="dialog" aria-label={t('statusBar.goToLineTitle')}>
          <div className="status-bar__goto-line-title">{t('statusBar.goToLineTitle')}</div>
          <form onSubmit={confirmGoToLine}>
            <label className="status-bar__goto-line-field-label" htmlFor="status-bar-goto-line-input">{t('statusBar.goToLineLabel')}</label>
            <input
              id="status-bar-goto-line-input"
              className="status-bar__goto-line-input"
              type="number"
              min={1}
              value={lineInput}
              onChange={(e) => setLineInput(e.target.value)}
              autoFocus
            />
            <div className="status-bar__goto-line-actions">
              <button type="submit" className="status-bar__goto-line-btn status-bar__goto-line-btn--primary">{t('statusBar.goToLineConfirm')}</button>
              <button type="button" className="status-bar__goto-line-btn" onClick={() => setDialogOpen(false)}>{t('statusBar.goToLineCancel')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/**
 * Sync the plugin-item container to the current registry state via a diff:
 * only elements no longer present are removed, only newly-registered
 * elements are appended. Elements a plugin already owns are never touched,
 * so in-place mutations (textContent/innerHTML) never get torn out of the
 * DOM (Requirement 7.1, 7.2). Registration order (registry push order) is
 * preserved (Requirement 7.3).
 */
function syncPluginItems(
  container: HTMLDivElement,
  prevItems: StatusBarItemEntry[],
  nextItems: StatusBarItemEntry[]
): void {
  const nextElements = new Set(nextItems.map((i) => i.element))
  for (const item of prevItems) {
    if (!nextElements.has(item.element)) {
      item.element.remove()
    }
  }
  const prevElements = new Set(prevItems.map((i) => i.element))
  for (const item of nextItems) {
    if (!prevElements.has(item.element)) {
      container.appendChild(item.element)
    }
  }
}

/**
 * StatusBar component rendered at the bottom of the app.
 * Shows the current time, updated every minute (on the minute boundary).
 * Also renders plugin status bar items via imperative DOM append.
 */
export function StatusBar() {
  const { t } = useTranslation()
  const [time, setTime] = useState<string>(formatTime)
  const { visible: clockVisible } = useStatusBarItemVisibility('clock')
  const [pluginItems, setPluginItems] = useState<StatusBarItemEntry[]>(getStatusBarItems)
  const pluginContainerRef = useRef<HTMLDivElement>(null)
  const prevPluginItemsRef = useRef<StatusBarItemEntry[]>([])

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

  // Diff-sync plugin elements into the container whenever the item set changes
  useEffect(() => {
    const container = pluginContainerRef.current
    if (!container) return
    syncPluginItems(container, prevPluginItemsRef.current, pluginItems)
    prevPluginItemsRef.current = pluginItems
  }, [pluginItems])

  return (
    <footer className="status-bar" role="contentinfo" aria-label={t('statusBar.ariaLabel')}>
      <div className="status-bar__left">
        {clockVisible && (
          <div className="status-bar__item status-bar__clock" aria-live="off" aria-label={t('statusBar.clock')}>
            <Clock size={12} aria-hidden="true" />
            <time>{time}</time>
          </div>
        )}
        <VaultNameItem />
        <WordStatsItem />
        <CursorPositionItem />
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
