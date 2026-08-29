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
import { useFeatureContext } from '../../state/featureContext'
import type { SettingsSection } from '../../state/settingsState'
import { SECTION_LABELS } from '../../state/settingsLabels'
import { SETTINGS_SECTIONS } from '../../state/settingsRegistry'
import { FeatureDisabledHint } from './ui'
import { ProfilePage } from '../ProfilePage'
import { ChangePasswordPage } from '../ChangePasswordPage'
import { SessionsPage } from '../SessionsPage'
import { McpTokensPage } from '../McpTokensPage'
import { PluginManagementPage } from '../PluginManagementPage'
import { AdminConfigPage } from '../AdminConfigPage'
import { AdminUsersPage } from '../AdminUsersPage'
import { AdminVaultsPage } from '../AdminVaultsPage'
import { AccountDeletionSection } from './AccountDeletionSection'
import { FeatureTogglesSection } from './FeatureTogglesSection'
import { ServerRestartSection } from './ServerRestartSection'
import { VaultConfigSection } from './VaultConfigSection'
import { CssSnippetsSection } from './CssSnippetsSection'
import { GitSyncSection } from './GitSyncSection'
import { MailImportSection } from './MailImportSection'
import { KeybindingsSection } from './KeybindingsSection'
import { AppearanceSection } from './AppearanceSection'
import { WelcomeVaultSection } from './WelcomeVaultSection'
import { MyVaultsPage } from '../MyVaultsPage'

/**
 * Content component that renders the active settings section.
 * Reads navigation state from SettingsContext, the API client from AppContext,
 * and the active vault from AppContext.
 * Focuses the section heading on navigation changes for screen reader accessibility.
 */
export function SettingsContent() {
  const { state } = useSettingsContext()
  const { apiClient, state: appState } = useAppContext()
  const { isEnabled } = useFeatureContext()
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
      {renderSection(state.section, appState.selectedVaultId, apiClient, isEnabled)}
    </div>
  )
}

/**
 * Renders the appropriate component for the given section.
 * For vault-specific sections, shows a fallback message if no vault is selected.
 * For sections gated behind a backend feature toggle (see `feature` on
 * ISettingsSectionDef), shows FeatureDisabledHint instead when it's off —
 * derived from the registry rather than a second per-case check, so a newly
 * feature-gated section can't drift out of sync with the registry (see the
 * same reasoning in settingsPersistence.ts's isValidSectionForCategory).
 */
function renderSection(
  section: SettingsSection,
  selectedVaultId: string | null,
  apiClient: import('../../api').IApiClient | null,
  isEnabled: (featureName: string) => boolean,
): React.JSX.Element | null {
  if (apiClient === null) {
    return <p className="settings-content-error">API-Client nicht verfügbar.</p>
  }

  const sectionDef = SETTINGS_SECTIONS.find((def) => def.id === section)
  if (sectionDef?.feature !== undefined && !isEnabled(sectionDef.feature)) {
    return <FeatureDisabledHint featureName={SECTION_LABELS[section]} />
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
    case 'appearance':
      return <AppearanceSection />
    case 'my-vaults':
      return (
        <>
          <MyVaultsPage apiClient={apiClient} />
          <WelcomeVaultSection apiClient={apiClient} />
        </>
      )
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
    case 'css-snippets':
      if (selectedVaultId === null) {
        return <p className="settings-content-no-vault">Kein Vault aktiv. Bitte wähle einen Vault im Datei-Explorer aus.</p>
      }
      return <CssSnippetsSection />
    case 'git-sync':
      if (selectedVaultId === null) {
        return <p className="settings-content-no-vault">Kein Vault aktiv. Bitte wähle einen Vault im Datei-Explorer aus.</p>
      }
      return <GitSyncSection />
    case 'mail-import':
      if (selectedVaultId === null) {
        return <p className="settings-content-no-vault">Kein Vault aktiv. Bitte wähle einen Vault im Datei-Explorer aus.</p>
      }
      return <MailImportSection />
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
