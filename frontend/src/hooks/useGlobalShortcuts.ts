import { useEffect } from 'react'
import type { Dispatch } from 'react'
import { matchesShortcut } from '../state/keybindingsStore'
import type { PanelAction, PanelState } from '../state/panelState'
import type { TabAction, TabState } from '../state/tabState'

/** Params for useGlobalShortcuts — the app-wide keyboard shortcuts registered on `document`/`window`. */
export interface UseGlobalShortcutsParams {
  /** Both panels' sections are searched for 'search', since it can now live on either side. */
  leftPanelSections: PanelState['sections']
  leftPanelDispatch: Dispatch<PanelAction>
  rightPanelSections: PanelState['sections']
  rightPanelDispatch: Dispatch<PanelAction>
  setShowRightPanel: (show: boolean) => void
  setShowSidebar: (show: boolean) => void
  tabs: TabState['tabs']
  activeTabId: TabState['activeTabId']
  tabDispatch: Dispatch<TabAction>
  setSettingsOpen: (open: boolean) => void
  onDailyNote: () => void
  /** Navigation history back/forward (Requirement 1.10). */
  onNavigateBack: () => void
  onNavigateForward: () => void
}

/**
 * Registers the app's global keyboard shortcuts:
 * - Vault search (default: Ctrl+Shift+F / Cmd+Shift+F) — also triggered by the
 *   Command Palette's `slatebase:open-search` custom window event.
 * - Toggle editor mode (default: Ctrl+E / Cmd+E)
 * - Settings panel (default: Ctrl+,)
 * - Daily note (Ctrl+Alt+D)
 * - Navigate back/forward (default: Alt+Left / Alt+Right)
 *
 * Next/previous tab (Ctrl+Shift+] / Ctrl+Shift+[) is registered in
 * `CommandPaletteContainer.tsx` instead, not here — it needs `commandRegistry`
 * from `usePluginContext()`, and `PluginProvider` is mounted *inside* AppContent's
 * own render tree (not above it), so this hook (called at the top of AppContent)
 * cannot reach it.
 *
 * Extracted from AppContent — these were five separate document/window
 * listener effects with no rendering logic of their own.
 */
export function useGlobalShortcuts({
  leftPanelSections,
  leftPanelDispatch,
  rightPanelSections,
  rightPanelDispatch,
  setShowRightPanel,
  setShowSidebar,
  tabs,
  activeTabId,
  tabDispatch,
  setSettingsOpen,
  onDailyNote,
  onNavigateBack,
  onNavigateForward,
}: UseGlobalShortcutsParams): void {
  // Vault search: opens whichever panel currently hosts the search view
  // (right by default, but it can be dragged to the left), activates it, and
  // focuses the input. Shared between the keyboard shortcut and the Command
  // Palette's custom event since both need identical behavior.
  useEffect(() => {
    const openSearchPanel = () => {
      const rightSearchSection = rightPanelSections.find(s => s.viewIds.includes('search'))
      if (rightSearchSection) {
        setShowRightPanel(true)
        rightPanelDispatch({ type: 'SET_ACTIVE_VIEW', sectionId: rightSearchSection.id, viewId: 'search' })
      } else {
        const leftSearchSection = leftPanelSections.find(s => s.viewIds.includes('search'))
        if (leftSearchSection) {
          setShowSidebar(true)
          leftPanelDispatch({ type: 'SET_ACTIVE_VIEW', sectionId: leftSearchSection.id, viewId: 'search' })
        }
      }
      // Focus the search input after the panel renders
      setTimeout(() => {
        const input = document.querySelector('.search-panel__input') as HTMLInputElement | null
        if (input) {
          input.focus()
          input.select()
        }
      }, 50)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesShortcut('slatebase:open-search', e)) {
        e.preventDefault()
        openSearchPanel()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('slatebase:open-search', openSearchPanel)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('slatebase:open-search', openSearchPanel)
    }
  }, [leftPanelSections, leftPanelDispatch, rightPanelSections, rightPanelDispatch, setShowRightPanel, setShowSidebar])

  // Toggle editor mode
  useEffect(() => {
    const handleToggleMode = (e: KeyboardEvent) => {
      if (matchesShortcut('slatebase:toggle-mode', e)) {
        e.preventDefault()
        const activeTab = tabs.find(t => t.id === activeTabId)
        if (activeTab && !activeTab.isBinary && activeTab.filePath !== '__graph__' && !activeTab.fileName.endsWith('.canvas')) {
          tabDispatch({ type: 'TOGGLE_MODE', payload: { tabId: activeTab.id } })
        }
      }
    }

    document.addEventListener('keydown', handleToggleMode)
    return () => document.removeEventListener('keydown', handleToggleMode)
  }, [tabs, activeTabId, tabDispatch])

  // Settings panel
  useEffect(() => {
    const handleSettingsShortcut = (e: KeyboardEvent) => {
      if (matchesShortcut('slatebase:open-settings', e)) {
        e.preventDefault()
        setSettingsOpen(true)
      }
    }

    document.addEventListener('keydown', handleSettingsShortcut)
    return () => document.removeEventListener('keydown', handleSettingsShortcut)
  }, [setSettingsOpen])

  // Daily note
  useEffect(() => {
    const handleDailyNoteShortcut = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        onDailyNote()
      }
    }

    document.addEventListener('keydown', handleDailyNoteShortcut)
    return () => document.removeEventListener('keydown', handleDailyNoteShortcut)
  }, [onDailyNote])

  // Navigate back / forward (Requirement 1.10)
  useEffect(() => {
    const handleNavShortcut = (e: KeyboardEvent) => {
      if (matchesShortcut('slatebase:navigate-back', e)) {
        e.preventDefault()
        onNavigateBack()
      } else if (matchesShortcut('slatebase:navigate-forward', e)) {
        e.preventDefault()
        onNavigateForward()
      }
    }

    document.addEventListener('keydown', handleNavShortcut)
    return () => document.removeEventListener('keydown', handleNavShortcut)
  }, [onNavigateBack, onNavigateForward])
}
