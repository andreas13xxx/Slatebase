/**
 * SettingsSidebar — Navigation sidebar for the unified settings panel.
 * Renders search and the nav list. Vault-specific sections are enabled/disabled
 * based on the app's currently active vault (appState.selectedVaultId).
 *
 * Uses `useSettingsContext()` for state/dispatch/registry,
 * `useAuthContext()` to determine admin status, and
 * `useAppContext()` for the active vault.
 *
 * Handles `initialNav` on mount by dispatching a NAVIGATE action.
 * Calls `onNavSelect?.()` after navigation (used for mobile nav collapse).
 *
 * @module components/settings/SettingsSidebar
 */

import { useEffect, useRef } from 'react'
import { useSettingsContext } from '../../state/settingsContext'
import { useAuthContext } from '../../state/authContext'
import { useAppContext } from '../../state'
import { SettingsSearch } from './SettingsSearch'
import { SettingsNavList } from './SettingsNavList'
import type { SettingsCategory, SettingsSection } from '../../state/settingsState'

/** Props for the SettingsSidebar component. */
export interface SettingsSidebarProps {
  /** Callback invoked when a navigation item is selected (used for mobile nav collapse). */
  onNavSelect?: () => void
  /** Optional initial navigation for deep-links. */
  initialNav?: { category: SettingsCategory; section: SettingsSection }
}

/**
 * Sidebar component for settings navigation.
 *
 * Structure:
 * - SettingsSearch at the top
 * - SettingsNavList for category/section navigation
 *
 * On mount, dispatches a NAVIGATE action if `initialNav` is provided,
 * enabling deep-linking into specific settings sections.
 */
export function SettingsSidebar({ onNavSelect, initialNav }: SettingsSidebarProps) {
  const { state, dispatch, registry } = useSettingsContext()
  const { authState } = useAuthContext()
  const { state: appState } = useAppContext()

  const isAdmin = authState.user?.role === 'admin'
  const initialNavApplied = useRef(false)

  // Handle initialNav on mount: dispatch NAVIGATE to the specified section
  useEffect(() => {
    if (initialNav && !initialNavApplied.current) {
      initialNavApplied.current = true
      dispatch({
        type: 'NAVIGATE',
        payload: { category: initialNav.category, section: initialNav.section },
      })
    }
  }, [initialNav, dispatch])

  return (
    <div className="settings-sidebar">
      <SettingsSearch searchQuery={state.searchQuery} dispatch={dispatch} />

      <SettingsNavList
        state={state}
        isAdmin={isAdmin}
        registry={registry}
        dispatch={dispatch}
        onNavSelect={onNavSelect}
        activeVaultId={appState.selectedVaultId}
      />
    </div>
  )
}
