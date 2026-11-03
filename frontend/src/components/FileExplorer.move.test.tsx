import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import React from 'react'
import { FileExplorer } from './FileExplorer'
import { AppContext, initialState } from '../state'
import { TabProvider } from '../state/tabContext'
import { clear as clearWorkspaceStore } from '../state/workspaceStore'
import type { AppState, DirectoryTree, VaultInfo } from '../types'
import type { IApiClient } from '../api'

const vault: VaultInfo = { id: 'v1', name: 'Test Vault', permission: 'owner', ownerName: 'admin' }
const tree: DirectoryTree = {
  name: 'root', type: 'directory', path: '', itemCount: 2,
  children: [
    { name: 'docs', type: 'directory', path: 'docs', itemCount: 0, children: [] },
    { name: 'readme.md', type: 'file', path: 'readme.md', size: 1 },
  ],
}

/** Context-menu rows carry the role on the <li>; the click handler sits on the button inside. */
function clickMenuItem(name: RegExp) {
  fireEvent.click(within(screen.getByRole('menuitem', { name })).getByRole('button'))
}

async function rowFor(container: HTMLElement, text: string): Promise<HTMLElement> {
  // The vault starts collapsed; expand it so its entries render.
  fireEvent.click(screen.getByText('Test Vault'))
  return await waitFor(() => {
    const row = Array.from(container.querySelectorAll('.tree-node-row')).find((r) => r.textContent?.includes(text))
    if (!row) throw new Error(`row ${text} not found`)
    return row as HTMLElement
  })
}

function renderExplorer() {
  const apiClient = {
    moveContent: vi.fn().mockResolvedValue(undefined),
    getDirectoryTree: vi.fn().mockResolvedValue(tree),
    getVaultTree: vi.fn().mockResolvedValue(tree),
  } as unknown as IApiClient
  const state: AppState = { ...initialState, vaults: [vault], selectedVaultId: 'v1', vaultTrees: { v1: tree } }
  const utils = render(
    React.createElement(
      AppContext.Provider,
      { value: { state, dispatch: vi.fn(), apiClient } },
      React.createElement(TabProvider, null, React.createElement(FileExplorer)),
    ),
  )
  return { apiClient, ...utils }
}

describe('FileExplorer "Move to…" picker', () => {
  beforeEach(() => { clearWorkspaceStore() })

  it('moves a file into a folder chosen in the dialog (no window.prompt)', async () => {
    const prompt = vi.spyOn(window, 'prompt')
    const { apiClient, container } = renderExplorer()
    const row = await rowFor(container, 'readme')
    fireEvent.contextMenu(row)
    await screen.findByRole('menuitem', { name: /Verschieben|Move/ })
    clickMenuItem(/Verschieben|Move/)
    fireEvent.click(await screen.findByRole('button', { name: 'docs' }))
    await waitFor(() => expect(apiClient.moveContent).toHaveBeenCalledWith('v1', 'readme.md', 'docs/readme.md'))
    expect(prompt).not.toHaveBeenCalled()
  })

  it('offers "Move" for folders too and excludes the folder itself as target', async () => {
    const { container } = renderExplorer()
    const row = await rowFor(container, 'docs')
    fireEvent.contextMenu(row)
    await screen.findByRole('menuitem', { name: /Verschieben|Move/ })
    clickMenuItem(/Verschieben|Move/)
    await screen.findByRole('dialog')
    expect(screen.queryByRole('button', { name: 'docs' })).toBeNull()
  })
})
