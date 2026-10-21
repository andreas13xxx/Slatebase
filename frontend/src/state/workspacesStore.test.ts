import { describe, it, expect, beforeEach } from 'vitest'
import type { IApiClient } from '../api'
import { initialize, setActiveVault, _reset } from './vaultSettingsStore'
import {
  buildWorkspace, saveWorkspace, getWorkspaces, findWorkspace,
  renameWorkspace, deleteWorkspace, parseWorkspace,
} from './workspacesStore'
import type { PersistedPaneTree } from './paneTreeState'

const tree: PersistedPaneTree = {
  root: { kind: 'pane', id: 'p1', tabs: [], activeTabId: null },
  activePaneId: 'p1',
}

/** A no-op api client whose vault-settings reads reject, so setActiveVault keeps the local copy. */
function offlineClient(): IApiClient {
  return {
    getVaultSettings: async () => { throw new Error('offline') },
    saveVaultSettings: async (_v: string, patch: unknown) => ({ settings: patch }),
  } as unknown as IApiClient
}

beforeEach(async () => {
  _reset()
  localStorage.clear()
  initialize(offlineClient())
  await setActiveVault('v1')
})

describe('buildWorkspace', () => {
  it('trims the name and attaches optional panel layouts', () => {
    const ws = buildWorkspace('  My Layout  ', tree, null, null)
    expect(ws.name).toBe('My Layout')
    expect(ws.paneTree).toBe(tree)
    expect(ws.sidebarPanel).toBeUndefined()
    expect(ws.contextPanel).toBeUndefined()
    expect(typeof ws.savedAt).toBe('string')
  })
})

describe('save / get / overwrite', () => {
  it('saves and reads back a workspace', () => {
    saveWorkspace(buildWorkspace('A', tree, null, null))
    expect(getWorkspaces().map((w) => w.name)).toEqual(['A'])
    expect(findWorkspace('a')?.name).toBe('A') // case-insensitive lookup
  })

  it('overwrites a same-name workspace instead of duplicating', () => {
    saveWorkspace(buildWorkspace('A', tree, null, null))
    saveWorkspace(buildWorkspace('a', tree, null, null)) // same name, different case
    expect(getWorkspaces()).toHaveLength(1)
  })
})

describe('rename / delete', () => {
  it('renames a workspace', () => {
    saveWorkspace(buildWorkspace('A', tree, null, null))
    expect(renameWorkspace('A', 'B')).toBe(true)
    expect(getWorkspaces().map((w) => w.name)).toEqual(['B'])
  })

  it('refuses a rename that collides with an existing name', () => {
    saveWorkspace(buildWorkspace('A', tree, null, null))
    saveWorkspace(buildWorkspace('B', tree, null, null))
    expect(renameWorkspace('A', 'B')).toBe(false)
    expect(getWorkspaces().map((w) => w.name).sort()).toEqual(['A', 'B'])
  })

  it('deletes a workspace by name', () => {
    saveWorkspace(buildWorkspace('A', tree, null, null))
    deleteWorkspace('A')
    expect(getWorkspaces()).toHaveLength(0)
  })
})

describe('parseWorkspace (lenient)', () => {
  it('rejects an entry without a name or pane tree', () => {
    expect(parseWorkspace({ paneTree: tree })).toBeNull()
    expect(parseWorkspace({ name: 'X' })).toBeNull()
    expect(parseWorkspace(null)).toBeNull()
  })

  it('keeps the valid entries and drops a broken one in getWorkspaces', async () => {
    // Write a mix of a good and a broken entry straight into the store.
    const { updateVaultSettings } = await import('./vaultSettingsStore')
    updateVaultSettings({
      workspaces: [
        { name: 'Good', savedAt: '2026-01-01T00:00:00Z', paneTree: tree },
        { name: '', paneTree: tree }, // broken: empty name
        { notAWorkspace: true },       // broken: no name/tree
      ] as unknown as Record<string, unknown>[],
    })
    expect(getWorkspaces().map((w) => w.name)).toEqual(['Good'])
  })
})
