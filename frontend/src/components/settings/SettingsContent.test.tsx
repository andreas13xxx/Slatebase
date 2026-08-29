/**
 * Unit tests for SettingsContent's feature-toggle gating: a section whose
 * `ISettingsSectionDef.feature` is off should render FeatureDisabledHint
 * instead of its real content, regardless of vault selection.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { SettingsContent } from './SettingsContent'
import { SettingsContext, type SettingsContextValue } from '../../state/settingsContext'
import { AppContext, type AppContextValue } from '../../state'
import { FeatureContext, type FeatureContextValue } from '../../state/featureContext'
import { createSettingsRegistry } from '../../state/settingsRegistry'
import { initialFeatureState } from '../../state/featureState'
import type { IApiClient } from '../../api'

function renderWithProviders(options: { section: 'git-sync' | 'mail-import' | 'vault-config'; isEnabled: (name: string) => boolean }) {
  const settingsValue: SettingsContextValue = {
    state: { category: 'vault', section: options.section, selectedVaultId: 'v1', searchQuery: '', mobileNavOpen: false },
    dispatch: vi.fn(),
    registry: createSettingsRegistry(),
    vaults: [{ id: 'v1', name: 'Test Vault' }],
  }

  const appValue: AppContextValue = {
    state: {
      vaults: [], selectedVaultId: 'v1', directoryTree: null, vaultTrees: {},
      vaultTreesLoading: new Set(), selectedFile: null, loading: false, error: null,
    },
    dispatch: vi.fn(),
    apiClient: { getGitSyncData: vi.fn(() => new Promise(() => {})) } as unknown as IApiClient,
  }

  const featureValue: FeatureContextValue = { state: initialFeatureState, dispatch: vi.fn(), isEnabled: options.isEnabled }

  return render(
    React.createElement(
      SettingsContext.Provider,
      { value: settingsValue },
      React.createElement(
        AppContext.Provider,
        { value: appValue },
        React.createElement(FeatureContext.Provider, { value: featureValue }, React.createElement(SettingsContent)),
      ),
    ),
  )
}

describe('SettingsContent feature gating', () => {
  it('shows FeatureDisabledHint for a feature-gated section whose toggle is off', () => {
    renderWithProviders({ section: 'git-sync', isEnabled: (name) => name !== 'git-sync' })

    expect(screen.getByText(/ist derzeit deaktiviert/)).toBeInTheDocument()
    expect(screen.getByText(/an einen Administrator/)).toBeInTheDocument()
  })

  it('renders the real section content when the feature is on', () => {
    renderWithProviders({ section: 'git-sync', isEnabled: () => true })

    expect(screen.queryByText(/ist derzeit deaktiviert/)).not.toBeInTheDocument()
  })

  it('does not gate a vault section that has no associated feature', () => {
    renderWithProviders({ section: 'vault-config', isEnabled: () => false })

    expect(screen.queryByText(/ist derzeit deaktiviert/)).not.toBeInTheDocument()
  })
})
