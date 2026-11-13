import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import type { Dispatch } from 'react'
import { FileExplorer } from './FileExplorer'
import { AppContext, initialState } from '../state'
import { TabProvider } from '../state/tabContext'
import type { AppAction, DirectoryTree, VaultInfo } from '../types'
import type { IApiClient } from '../api'
import { clear as clearWorkspaceStore } from '../state/workspaceStore'

const tree: DirectoryTree = {
  name: 'root', type: 'directory', path: '', itemCount: 2,
  children: [
    { name: 'Docs', type: 'directory', path: 'Docs', itemCount: 0, children: [] },
    { name: 'readme.md', type: 'file', path: 'readme.md', size: 256 },
  ],
}

function renderExplorer(permission: VaultInfo['permission']) {
  const vault: VaultInfo = { id: 'vault-123', name: 'Test Vault', permission, ownerName: 'admin' }
  const dispatch = vi.fn() as Dispatch<AppAction>
  const apiClient = { fetchVaultTree: vi.fn().mockResolvedValue(tree) } as unknown as IApiClient
  render(
    React.createElement(
      AppContext.Provider,
      { value: { state: { ...initialState, vaults: [vault], vaultTrees: { 'vault-123': tree }, vaultTreesLoading: new Set<string>() }, dispatch, apiClient } },
      React.createElement(TabProvider, null, React.createElement(FileExplorer)),
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

describe('FileExplorer "Link kopieren" menu item', () => {
  it('copies the deep link of a file', async () => {
    renderExplorer('owner')
    const user = await openMenuFor('readme')
    // userEvent.setup() installs its own clipboard stub; read it back instead of replacing it.
    await user.click(screen.getByText('Link kopieren'))
    await waitFor(async () => {
      expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/open?vault=vault-123&file=readme.md`)
    })
  })

  it('is offered to read-only users for a file, next to the "no actions" hint', async () => {
    renderExplorer('read')
    await openMenuFor('readme')
    expect(screen.getByText('Link kopieren')).toBeInTheDocument()
    expect(screen.getByText('Keine Aktionen verfügbar')).toBeInTheDocument()
  })

  it('is not offered for folders', async () => {
    renderExplorer('owner')
    await openMenuFor('Docs')
    expect(screen.queryByText('Link kopieren')).toBeNull()
  })
})
