import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IApiClient } from '../api'
import { initialize as initializeSettings, setActiveVault, _reset as resetSettings } from './vaultSettingsStore'
import {
  initialize, loadVaultWorkspaces, buildWorkspace, saveWorkspace, getWorkspaces, findWorkspace,
  renameWorkspace, deleteWorkspace, parseWorkspace, getActiveWorkspaceName, onWorkspacesChange, workspaceSaveProblem, disconnect, _reset,
} from './workspacesStore'
import type { PersistedPaneTree } from './paneTreeState'

vi.mock('../components/ToastNotification', () => ({ showToast: vi.fn() }))

const tree = (file = 'a.md'): PersistedPaneTree => ({
  root: { kind: 'pane', id: 'p1', tabs: [{ vaultId: 'v1', filePath: file, fileName: file, mode: 'live-preview', pinned: false }], activeTabId: `v1::${file}` },
  activePaneId: 'p1',
})

/** An API client over an in-memory workspaces.json, applying PATCH like the server does. */
function createClient(initialFile: Record<string, unknown> = {}) {
  let file: Record<string, unknown> = { ...initialFile }
  const patches: Array<Record<string, unknown>> = []
  const mocks = {
    getWorkspacesConfig: vi.fn(async () => structuredClone(file)),
    patchWorkspacesConfig: vi.fn(async (_vaultId: string, patch: Record<string, unknown>) => {
      patches.push(structuredClone(patch))
      const layouts = { ...((file['workspaces'] as Record<string, unknown> | undefined) ?? {}) }
      for (const [name, layout] of Object.entries((patch['workspaces'] as Record<string, unknown> | undefined) ?? {})) {
        if (layout === null) delete layouts[name]
        else layouts[name] = layout
      }
      file = { ...file, workspaces: layouts }
      if (patch['active'] === null) delete file['active']
      else if (typeof patch['active'] === 'string') file['active'] = patch['active']
      return structuredClone(file)
    }),
  }
  return { client: mocks as unknown as IApiClient, mocks, patches, file: () => file }
}

/** Waits until the writes the store queued have run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function offlineSettingsClient(): IApiClient {
  return {
    getVaultSettings: async () => { throw new Error('offline') },
    saveVaultSettings: async (_v: string, patch: unknown) => ({ settings: patch }),
  } as unknown as IApiClient
}

beforeEach(async () => {
  _reset()
  resetSettings()
  localStorage.clear()
  initializeSettings(offlineSettingsClient())
  await setActiveVault('v1')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

async function connect(file: Record<string, unknown> = {}) {
  const c = createClient(file)
  initialize(c.client)
  await loadVaultWorkspaces('v1')
  return c
}

describe('buildWorkspace', () => {
  it('trims the name and attaches optional panel layouts', () => {
    const ws = buildWorkspace('  My Layout  ', tree(), null, null)
    expect(ws.name).toBe('My Layout')
    expect(ws.sidebarPanel).toBeUndefined()
    expect(typeof ws.savedAt).toBe('string')
  })
})

describe('reading the file', () => {
  it('reads the layouts Slatebase saved, exactly', async () => {
    const c = createClient()
    initialize(c.client)
    await loadVaultWorkspaces('v1')
    saveWorkspace(buildWorkspace('A', tree('x.md'), null, null))
    await settle()

    _reset()
    initialize(createClient(c.file()).client)
    await loadVaultWorkspaces('v1')
    expect(getWorkspaces().map((w) => w.name)).toEqual(['A'])
    expect(findWorkspace('a')?.paneTree).toEqual(tree('x.md'))
  })

  it('reads a layout Obsidian saved from its main tree and names what it skipped', async () => {
    await connect({
      workspaces: {
        FromObsidian: {
          main: { id: '1', type: 'split', direction: 'vertical', children: [{ id: '2', type: 'tabs', children: [
            { id: '3', type: 'leaf', state: { type: 'markdown', state: { file: 'Note.md', mode: 'source' } } },
            { id: '4', type: 'leaf', state: { type: 'weird-plugin', state: {} } },
          ] }] },
        },
        Empty: { main: { type: 'split', children: [] } },
      },
      active: 'FromObsidian',
    })
    expect(getWorkspaces().map((w) => w.name)).toEqual(['FromObsidian']) // the empty one cannot be shown
    expect(getActiveWorkspaceName()).toBe('FromObsidian')
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('FromObsidian: 1 element(s)'))
  })

  it('keeps the cache when the file cannot be read, and shows nothing of the previous vault in another', async () => {
    const c = await connect({ workspaces: { A: { main: {}, slatebase: { savedAt: 'x', paneTree: tree() } } } })
    expect(getWorkspaces()).toHaveLength(1)
    c.mocks.getWorkspacesConfig.mockRejectedValueOnce(new Error('offline'))
    expect(await loadVaultWorkspaces('v1')).toBe(false)
    expect(getWorkspaces()).toHaveLength(1)
    c.mocks.getWorkspacesConfig.mockRejectedValueOnce(new Error('offline'))
    await loadVaultWorkspaces('v2')
    expect(getWorkspaces()).toEqual([])
  })
})

describe('save / overwrite', () => {
  it('writes an Obsidian layout with the Slatebase snapshot, and makes the workspace active', async () => {
    const c = await connect()
    expect(saveWorkspace(buildWorkspace('A', tree('x.md'), null, null))).toBe(true)
    expect(getWorkspaces().map((w) => w.name)).toEqual(['A'])
    await settle()

    const layout = (c.file()['workspaces'] as Record<string, Record<string, unknown>>)['A']!
    expect(layout['main']).toMatchObject({ type: 'split', direction: 'vertical' })
    expect(layout['slatebase']).toMatchObject({ paneTree: tree('x.md') })
    expect(layout['lastOpenFiles']).toEqual(['x.md'])
    expect(c.file()['active']).toBe('A')
    expect(getActiveWorkspaceName()).toBe('A')
  })

  it('overwrites a same-name workspace (any case) instead of duplicating', async () => {
    const c = await connect()
    saveWorkspace(buildWorkspace('Layout', tree('one.md'), null, null))
    saveWorkspace(buildWorkspace('layout', tree('two.md'), null, null))
    await settle()
    expect(getWorkspaces().map((w) => w.name)).toEqual(['Layout'])
    expect(Object.keys(c.file()['workspaces'] as object)).toEqual(['Layout'])
    expect(findWorkspace('LAYOUT')?.paneTree).toEqual(tree('two.md'))
  })

  it('refuses a name the file cannot hold', async () => {
    await connect()
    expect(saveWorkspace(buildWorkspace('__proto__', tree(), null, null))).toBe(false)
    expect(saveWorkspace(buildWorkspace('a\nb', tree(), null, null))).toBe(false)
    expect(saveWorkspace(buildWorkspace('   ', tree(), null, null))).toBe(false)
  })

  it('does nothing without an open vault', () => {
    expect(saveWorkspace(buildWorkspace('A', tree(), null, null))).toBe(false)
  })
})

describe('rename / delete', () => {
  it('renames in one request and moves the active name along', async () => {
    const c = await connect()
    saveWorkspace(buildWorkspace('A', tree(), null, null))
    await settle()
    expect(renameWorkspace('A', 'B')).toBe(true)
    await settle()
    expect(c.patches.at(-1)).toMatchObject({ workspaces: { A: null }, active: 'B' })
    expect(getWorkspaces().map((w) => w.name)).toEqual(['B'])
    expect(c.file()['active']).toBe('B')
  })

  it('refuses a rename onto an existing name (any case), a missing source and a bad name', async () => {
    await connect()
    saveWorkspace(buildWorkspace('A', tree(), null, null))
    saveWorkspace(buildWorkspace('B', tree(), null, null))
    await settle()
    expect(renameWorkspace('A', 'b')).toBe(false)
    expect(renameWorkspace('Nope', 'C')).toBe(false)
    expect(renameWorkspace('A', '')).toBe(false)
    expect(getWorkspaces().map((w) => w.name).sort()).toEqual(['A', 'B'])
  })

  it('deletes a workspace and clears the active name if it was that one', async () => {
    const c = await connect()
    saveWorkspace(buildWorkspace('A', tree(), null, null))
    await settle()
    deleteWorkspace('a')
    await settle()
    expect(getWorkspaces()).toEqual([])
    expect(c.file()['active']).toBeUndefined()
    expect(getActiveWorkspaceName()).toBeNull()
  })

  it('leaves the active name alone when another workspace is deleted', async () => {
    const c = await connect()
    saveWorkspace(buildWorkspace('A', tree(), null, null))
    saveWorkspace(buildWorkspace('B', tree(), null, null))
    await settle()
    deleteWorkspace('A')
    await settle()
    expect(c.file()['active']).toBe('B')
  })
})

describe('writes', () => {
  it('runs one after another, so a rename cannot overtake the save before it', async () => {
    const c = await connect()
    saveWorkspace(buildWorkspace('A', tree(), null, null))
    renameWorkspace('A', 'B')
    await settle()
    await settle()
    expect(Object.keys(c.file()['workspaces'] as object)).toEqual(['B'])
  })

  it('shows the file again when a write is refused', async () => {
    const c = await connect()
    c.mocks.patchWorkspacesConfig.mockRejectedValueOnce(new Error('403'))
    saveWorkspace(buildWorkspace('A', tree(), null, null))
    expect(getWorkspaces()).toHaveLength(1) // shown at once
    await settle()
    await settle()
    expect(getWorkspaces()).toEqual([]) // the file never had it
  })

  it('does not replace unwritten changes with a read of the file', async () => {
    const c = await connect()
    saveWorkspace(buildWorkspace('A', tree(), null, null))
    expect(await loadVaultWorkspaces('v1')).toBe(false)
    await settle()
    expect(c.file()['workspaces']).toHaveProperty('A')
  })

  it('tells listeners about changes', async () => {
    await connect()
    const cb = vi.fn()
    const off = onWorkspacesChange(cb)
    saveWorkspace(buildWorkspace('A', tree(), null, null))
    expect(cb).toHaveBeenCalled()
    off()
  })
})

describe('layouts changed in Obsidian', () => {
  it('a layout whose main tree changed since Slatebase saved it is read from main, keeping the panels', async () => {
    const c = await connect()
    saveWorkspace(buildWorkspace('A', tree('saved.md'), { id: 'side' } as never, null))
    await settle()

    const file = c.file() as { workspaces: Record<string, { main: { children: unknown[] } }> }
    const layout = file.workspaces['A']!
    // Obsidian edits the layout: the open file is another one now
    layout.main = JSON.parse(JSON.stringify(layout.main).replace('saved.md', 'edited.md'))

    _reset()
    initialize(createClient(c.file()).client)
    await loadVaultWorkspaces('v1')
    const ws = findWorkspace('A')!
    expect(JSON.stringify(ws.paneTree)).toContain('edited.md')
    expect(JSON.stringify(ws.paneTree)).not.toContain('saved.md')
    expect(ws.sidebarPanel).toEqual({ id: 'side' })
  })
})

describe('robustness', () => {
  it('returns the same list until the file changes, so a render does not parse every layout again', async () => {
    await connect({ workspaces: { A: { main: { type: 'split', children: [{ type: 'tabs', children: [{ type: 'leaf', state: { type: 'markdown', state: { file: 'x.md' } } }] }] } } } })
    expect(getWorkspaces()).toBe(getWorkspaces())
    expect(findWorkspace('a')!.paneTree).toBe(findWorkspace('A')!.paneTree)
  })

  it('reads the new vault\'s file after a write for the previous vault finished', async () => {
    const a = createClient()
    initialize(a.client)
    await loadVaultWorkspaces('v1')
    saveWorkspace(buildWorkspace('InA', tree(), null, null))
    // switch while the write is still running
    a.mocks.getWorkspacesConfig.mockImplementation(async () => ({ workspaces: { InB: { main: {}, slatebase: { savedAt: 'x', paneTree: tree('b.md') } } } }))
    await loadVaultWorkspaces('v2')
    expect(getWorkspaces()).toEqual([])
    await settle()
    await settle()
    expect(getWorkspaces().map((w) => w.name)).toEqual(['InB'])
  })

  it('a write that outlives its session does not disturb the next one', async () => {
    const c = await connect()
    let release: () => void = () => {}
    c.mocks.patchWorkspacesConfig.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({}) }))
    saveWorkspace(buildWorkspace('Old', tree(), null, null))
    await settle()

    disconnect()
    release()
    await settle()

    const next = createClient()
    initialize(next.client)
    await loadVaultWorkspaces('v1')
    saveWorkspace(buildWorkspace('New', tree(), null, null))
    await settle()
    await settle()
    expect(Object.keys(next.file()['workspaces'] as object)).toEqual(['New'])
    expect(getWorkspaces().map((w) => w.name)).toEqual(['New'])
  })

  it('keeps writing after one write failed in an unexpected way', async () => {
    const c = await connect()
    c.mocks.patchWorkspacesConfig.mockImplementationOnce(() => { throw new Error('sync throw') })
    saveWorkspace(buildWorkspace('A', tree(), null, null))
    saveWorkspace(buildWorkspace('B', tree(), null, null))
    await settle()
    await settle()
    expect(Object.keys(c.file()['workspaces'] as object)).toContain('B')
  })

  it('says why a workspace was refused', async () => {
    expect(workspaceSaveProblem(buildWorkspace('A', tree(), null, null))).toBe('no-vault')
    await connect()
    expect(workspaceSaveProblem(buildWorkspace('a\nb', tree(), null, null))).toBe('invalid-name')
    expect(workspaceSaveProblem(buildWorkspace('A', tree(), null, null))).toBe('limit')
  })
})

describe('parseWorkspace', () => {
  it('reads a workspace of the old per-user list leniently', () => {
    expect(parseWorkspace({ name: 'A', paneTree: { root: {} } })?.name).toBe('A')
    expect(parseWorkspace({ name: '', paneTree: {} })).toBeNull()
    expect(parseWorkspace({ name: 'A' })).toBeNull()
    expect(parseWorkspace(null)).toBeNull()
  })
})
