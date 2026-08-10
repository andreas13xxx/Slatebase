/**
 * SettingsPanel — Main container component for the unified settings panel.
 * Renders a full-viewport overlay with sidebar navigation and content area.
 * Uses CSS Container Queries for responsive layout (700px threshold).
 *
 * @module components/settings/SettingsPanel
 */

import { useEffect, useCallback } from 'react'
import React from 'react'
import { useAuthContext } from '../../state/authContext'
import { matchesShortcut } from '../../state/keybindingsStore'
import { useAppContext } from '../../state'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { SettingsProvider } from '../../state/settingsContext'
import { SettingsSidebar } from './SettingsSidebar'
import { SettingsContent } from './SettingsContent'
import type { SettingsCategory, SettingsSection } from '../../state/settingsState'
import './SettingsPanel.css'

/**
 * Props for the SettingsPanel component.
 */
export interface SettingsPanelProps {
  /** Whether the panel is visible. */
  open: boolean
  /** Callback to close the panel. */
  onClose: () => void
  /** Optional initial navigation for deep-links. */
  initialNav?: { category: SettingsCategory; section: SettingsSection }
}

/**
 * Unified settings panel that provides a categorized sidebar navigation
 * with an embedded content area. Wraps children in a SettingsProvider
 * for navigation state management.
 *
 * Features:
 * - Container-query-based responsive layout (sidebar left vs. stacked mobile)
 * - Ctrl+, keyboard shortcut registration
 * - Escape key / overlay click to close
 * - ARIA landmark roles for accessibility
 *
 * @param props - Component props
 */
export function SettingsPanel({ open, onClose, initialNav }: SettingsPanelProps) {
  const { authState } = useAuthContext()
  const { state: appState } = useAppContext()

  const containerRef = useFocusTrap<HTMLDivElement>({
    isActive: open,
    onEscape: onClose,
    returnFocusOnDeactivate: true,
  })

  const isAdmin = authState.user?.role === 'admin'

  const vaults = appState.vaults
    .filter(v => v.permission === 'owner')
    .map(v => ({ id: v.id, name: v.name }))

  // Handle overlay click to close
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  // Global Ctrl+, shortcut registration
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (matchesShortcut('slatebase:open-settings', e)) {
        e.preventDefault()
        if (!open) {
          // The parent component is responsible for opening the panel.
          // This effect handles the case where the panel is already open — focus it.
          return
        }
        // Panel is already open — focus it
        containerRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [open, containerRef])

  if (!open) {
    return null
  }

  return (
    <div
      className="settings-panel-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Einstellungen"
    >
      <div
        className="settings-panel"
        ref={containerRef}
        tabIndex={-1}
      >
        <header className="settings-panel-header">
          <h1 className="settings-panel-title">Einstellungen</h1>
          <button
            className="settings-panel-close-btn"
            onClick={onClose}
            aria-label="Einstellungen schließen"
            type="button"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <SettingsProvider isAdmin={isAdmin} vaults={vaults}>
          <SettingsPanelLayout initialNav={initialNav} />
        </SettingsProvider>
      </div>
    </div>
  )
}

/**
 * Props for the internal layout component.
 */
interface SettingsPanelLayoutProps {
  /** Optional initial navigation for deep-links. */
  initialNav?: { category: SettingsCategory; section: SettingsSection }
}

/**
 * Internal layout component that renders the sidebar and content
 * within the SettingsProvider context.
 * Separated so it can access SettingsContext via hooks.
 */
function SettingsPanelLayout({ initialNav }: SettingsPanelLayoutProps) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)

  const handleMobileToggle = useCallback(() => {
    setMobileNavOpen((prev) => !prev)
  }, [])

  const handleNavSelect = useCallback(() => {
    setMobileNavOpen(false)
  }, [])

  return (
    <div className="settings-panel-layout">
      <button
        className="settings-panel-mobile-toggle"
        onClick={handleMobileToggle}
        aria-expanded={mobileNavOpen}
        aria-controls="settings-sidebar"
        type="button"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        Navigation
      </button>

      <aside
        id="settings-sidebar"
        className="settings-panel-sidebar"
        role="navigation"
        aria-label="Einstellungen-Navigation"
        data-mobile-open={String(mobileNavOpen)}
      >
        <SettingsSidebar onNavSelect={handleNavSelect} initialNav={initialNav} />
      </aside>

      <section
        className="settings-panel-content"
        role="main"
        aria-label="Einstellungen-Inhalt"
      >
        <SettingsContent />
      </section>
    </div>
  )
}
