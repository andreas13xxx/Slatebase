/**
 * BasePanelView — pinning a `.base` file to a side panel.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BasePanelView } from './BasePanelView'
import { AppContext, initialState } from '../../state'
import { FeatureContext } from '../../state/featureContext'
import { initialFeatureState } from '../../state/featureState'
import {
  _reset as resetVaultSettings,
  setActiveVault,
} from '../../state/vaultSettingsStore'
import { loadBasePanelPath, saveBasePanelPath } from '../side-panel/utils/persistence'
import type { DirectoryTree } from '../../types'
import type { IApiClient } from '../../api'

const tree: DirectoryTree = {
  name: 'root',
  path: '',
  type: 'directory',
  children: [
    { name: 'Tasks.base', path: 'Dashboards/Tasks.base', type: 'file' },
    { name: 'Other.base', path: 'Other.base', type: 'file' },
    { name: 'note.md', path: 'note.md', type: 'file' },
  ],
}

function renderPanel(options: { basesEnabled?: boolean; vaultId?: string | null; tree?: DirectoryTree | null } = {}) {
  const { basesEnabled = true, vaultId = 'v1', tree: directoryTree = tree } = options
  const onOpenNote = vi.fn()
  const appValue = {
    state: { ...initialState, directoryTree },
    dispatch: vi.fn(),
    apiClient: {
      fetchFileContent: vi.fn().mockResolvedValue({ content: 'views:\n  - type: table\n', isBinary: false }),
      queryBase: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    } as unknown as IApiClient,
  }
  render(
    React.createElement(
      FeatureContext.Provider,
      { value: { state: initialFeatureState, dispatch: vi.fn(), isEnabled: (name: string) => basesEnabled && name === 'bases' } },
      React.createElement(
        AppContext.Provider,
        { value: appValue },
        React.createElement(BasePanelView, { panel: 'context', vaultId, activeFilePath: 'note.md', onOpenNote }),
      ),
    ),
  )
  return { onOpenNote }
}

describe('BasePanelView', () => {
  beforeEach(async () => {
    resetVaultSettings()
    await setActiveVault('v1')
  })

  it('shows the feature-disabled hint when bases is off', () => {
    renderPanel({ basesEnabled: false })
    expect(screen.getByText(/Bases/).closest('.feature-disabled-hint')).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('shows a "no vault" placeholder without a selected vault', () => {
    renderPanel({ vaultId: null })
    expect(screen.getByText('Kein Vault ausgewählt.')).toBeTruthy()
  })

  it('lists every .base file in the vault as a picker option', () => {
    renderPanel()
    const select = screen.getByRole('combobox') as HTMLSelectElement
    const optionValues = Array.from(select.options).map((o) => o.value)
    expect(optionValues).toEqual(['', 'Other.base', 'Dashboards/Tasks.base'])
  })

  it('shows a hint when the vault has no .base file at all', () => {
    const empty: DirectoryTree = { name: 'root', path: '', type: 'directory', children: [{ name: 'note.md', path: 'note.md', type: 'file' }] }
    renderPanel({ tree: empty })
    expect(screen.getByText('Keine .base-Datei in diesem Vault.')).toBeTruthy()
  })

  it('shows a "pick one" hint when base files exist but none is chosen', () => {
    renderPanel()
    expect(screen.getByText('Wähle eine Base aus der Liste.')).toBeTruthy()
  })

  it('renders the embedded base and persists the choice once one is picked', async () => {
    renderPanel()
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'Dashboards/Tasks.base' } })
    await waitFor(() => expect(screen.getByText('Laden…')).toBeTruthy())
    expect(loadBasePanelPath('context')).toBe('Dashboards/Tasks.base')
  })

  it('restores a previously pinned path on mount, without the user picking it again', async () => {
    saveBasePanelPath('context', 'Other.base')
    renderPanel()
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('Other.base')
    await waitFor(() => expect(screen.getByText('Laden…')).toBeTruthy())
  })

  it('a pin on the "sidebar" panel does not affect the "context" panel', () => {
    saveBasePanelPath('sidebar', 'Other.base')
    renderPanel()
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('')
  })
})
