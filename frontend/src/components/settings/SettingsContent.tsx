/**
 * SettingsContent — Content area for the unified settings panel.
 * Renders the active embedded component based on current navigation state.
 * Manages focus on section change for accessibility (WCAG 2.1 AA).
 *
 * @module components/settings/SettingsContent
 */

import React, { useRef, useEffect } from 'react'
import { useSettingsContext } from '../../state/settingsContext'
import { useAppContext } from '../../state'
import type { SettingsSection } from '../../state/settingsState'
import { ProfilePage } from '../ProfilePage'
import { ChangePasswordPage } from '../ChangePasswordPage'
import { SessionsPage } from '../SessionsPage'
import { McpTokensPage } from '../McpTokensPage'
import { SyncConfigPage } from '../SyncConfigPage'
import { SyncProvider } from '../../state/syncContext'
import { PluginManagementPage } from '../PluginManagementPage'
import { AdminConfigPage } from '../AdminConfigPage'
import { AdminUsersPage } from '../AdminUsersPage'
import { AdminVaultsPage } from '../AdminVaultsPage'
import { AccountDeletionSection } from './AccountDeletionSection'
import { FeatureTogglesSection } from './FeatureTogglesSection'
import { ServerRestartSection } from './ServerRestartSection'
import { VaultConfigSection } from './VaultConfigSection'
import { KeybindingsSection } from './KeybindingsSection'

/** German labels for each settings section heading. */
const SECTION_LABELS: Record<SettingsSection, string> = {
  'profile': 'Profil',
  'password': 'Passwort ändern',
  'sessions': 'Sitzungen',
  'mcp-tokens': 'MCP-Tokens',
  'keybindings': 'Tastaturkürzel',
  'delete-account': 'Konto löschen',
  'sync': 'Synchronisation',
  'plugins': 'Plugins',
  'vault-config': 'Vault-Konfiguration',
  'server-config': 'Serverkonfiguration',
  'user-management': 'Benutzerverwaltung',
  'vault-management': 'Vault-Verwaltung',
  'feature-toggles': 'Feature-Toggles',
  'server-restart': 'Server neu starten',
}

/**
 * Content component that renders the active settings section.
 * Reads navigation state from SettingsContext, the API client from AppContext,
 * and the active vault from AppContext.
 * Focuses the section heading on navigation changes for screen reader accessibility.
 */
export function SettingsContent() {
  const { state } = useSettingsContext()
  const { apiClient, state: appState } = useAppContext()
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Focus heading on section change for accessibility
  useEffect(() => {
    headingRef.current?.focus()
  }, [state.section])

  const label = SECTION_LABELS[state.section]

  return (
    <div className="settings-content">
      <h2 ref={headingRef} tabIndex={-1} className="settings-content-heading">
        {label}
      </h2>
      {renderSection(state.section, appState.selectedVaultId, apiClient)}
    </div>
  )
}

/**
 * Renders the appropriate component for the given section.
 * For vault-specific sections, shows a fallback message if no vault is selected.
 */
function renderSection(
  section: SettingsSection,
  selectedVaultId: string | null,
  apiClient: import('../../api').IApiClient | null,
): React.JSX.Element | null {
  if (apiClient === null) {
    return <p className="settings-content-error">API-Client nicht verfügbar.</p>
  }

  switch (section) {
    case 'profile':
      return <ProfilePage apiClient={apiClient} mode="profile-only" />
    case 'password':
      return <ChangePasswordPage apiClient={apiClient} embedded />
    case 'sessions':
      return <SessionsPage apiClient={apiClient} />
    case 'mcp-tokens':
      return <McpTokensPage apiClient={apiClient} />
    case 'delete-account':
      return <AccountDeletionSection apiClient={apiClient} />
    case 'keybindings':
      return <KeybindingsSection />
    case 'sync':
      if (selectedVaultId === null) {
        return <p className="settings-content-no-vault">Kein Vault aktiv. Bitte wähle einen Vault im Datei-Explorer aus.</p>
      }
      return <SyncProvider><SyncConfigPage vaultId={selectedVaultId} /></SyncProvider>
    case 'plugins':
      if (selectedVaultId === null) {
        return <p className="settings-content-no-vault">Kein Vault aktiv. Bitte wähle einen Vault im Datei-Explorer aus.</p>
      }
      return <PluginManagementPage apiClient={apiClient} vaultId={selectedVaultId} />
    case 'vault-config':
      if (selectedVaultId === null) {
        return <p className="settings-content-no-vault">Kein Vault aktiv. Bitte wähle einen Vault im Datei-Explorer aus.</p>
      }
      return <VaultConfigSection apiClient={apiClient} vaultId={selectedVaultId} />
    case 'server-config':
      return <AdminConfigPage apiClient={apiClient} hideFeatureToggles />
    case 'user-management':
      return <AdminUsersPage apiClient={apiClient} />
    case 'vault-management':
      return <AdminVaultsPage apiClient={apiClient} />
    case 'feature-toggles':
      return <FeatureTogglesSection apiClient={apiClient} />
    case 'server-restart':
      return <ServerRestartSection apiClient={apiClient} />
  }
}
