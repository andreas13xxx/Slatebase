import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import type { Dispatch } from 'react'
import { FileExplorer } from './FileExplorer'
import { AppContext, initialState } from '../state'
import { FeatureContext } from '../state/featureContext'
import { initialFeatureState } from '../state/featureState'
import { TabProvider } from '../state/tabContext'
import { OPEN_PUBLIC_SHARE_EVENT } from '../public-share/publicShareEvents'
import type { AppAction, DirectoryTree, VaultInfo } from '../types'
import type { IApiClient } from '../api'
import { clear as clearWorkspaceStore } from '../state/workspaceStore'

const tree: DirectoryTree = {
  name: 'root', type: 'directory', path: '', itemCount: 3,
  children: [
    { name: 'Docs', type: 'directory', path: 'Docs', itemCount: 0, children: [] },
    { name: 'readme.md', type: 'file', path: 'readme.md', size: 256 },
    { name: 'photo.png', type: 'file', path: 'photo.png', size: 256 },
  ],
}

function renderExplorer(options: { featureEnabled: boolean | null; permission?: VaultInfo['permission'] }) {
  const vault: VaultInfo = { id: 'vault-123', name: 'Test Vault', permission: options.permission ?? 'owner', ownerName: 'admin' }
  const dispatch = vi.fn() as Dispatch<AppAction>
  const apiClient = { fetchVaultTree: vi.fn().mockResolvedValue(tree) } as unknown as IApiClient
  const explorer = React.createElement(
    AppContext.Provider,
    { value: { state: { ...initialState, vaults: [vault], vaultTrees: { 'vault-123': tree }, vaultTreesLoading: new Set<string>() }, dispatch, apiClient } },
    React.createElement(TabProvider, null, React.createElement(FileExplorer)),
  )
  render(
    options.featureEnabled === null
      ? explorer
      : React.createElement(
        FeatureContext.Provider,
        { value: { state: initialFeatureState, dispatch: vi.fn(), isEnabled: (name: string) => options.featureEnabled === true && name === 'public-shares' } },
        explorer,
      ),
  )
}

async function openMenuFor(label: string) {
  const user = userEvent.setup()
  await user.click(screen.getByText('Test Vault'))
  await user.pointer({ keys: '[MouseRight]', target: screen.getByText(label) })
  return user
}

afterEach(() => {
  cleanup()
  clearWorkspaceStore()
})

describe('FileExplorer public link menu item', () => {
  it('is offered for a note when the feature is enabled, and opens the dialog event', async () => {
    renderExplorer({ featureEnabled: true })
    const received: Array<{ vaultId: string; filePath: string }> = []
    const listener = (e: Event) => { received.push((e as CustomEvent).detail) }
    window.addEventListener(OPEN_PUBLIC_SHARE_EVENT, listener)
    try {
      const user = await openMenuFor('readme')
      await user.click(screen.getByText('Öffentlichen Link verwalten'))
      expect(received).toEqual([{ vaultId: 'vault-123', filePath: 'readme.md' }])
    } finally {
      window.removeEventListener(OPEN_PUBLIC_SHARE_EVENT, listener)
    }
  })

  it('is hidden when the feature is disabled', async () => {
    renderExplorer({ featureEnabled: false })
    await openMenuFor('readme')
    expect(screen.getByText('Versionen')).toBeInTheDocument()
    expect(screen.queryByText('Öffentlichen Link verwalten')).toBeNull()
  })

  it('is hidden without a feature context (the explorer still renders)', async () => {
    renderExplorer({ featureEnabled: null })
    await openMenuFor('readme')
    expect(screen.queryByText('Öffentlichen Link verwalten')).toBeNull()
  })

  it('is not offered for non-notes or folders', async () => {
    renderExplorer({ featureEnabled: true })
    const user = await openMenuFor('photo')
    expect(screen.queryByText('Öffentlichen Link verwalten')).toBeNull()
    await user.keyboard('{Escape}')
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('Docs') })
    expect(screen.queryByText('Öffentlichen Link verwalten')).toBeNull()
  })

  it('is not offered to read-only users', async () => {
    renderExplorer({ featureEnabled: true, permission: 'read' })
    await openMenuFor('readme')
    expect(screen.queryByText('Öffentlichen Link verwalten')).toBeNull()
  })
})
