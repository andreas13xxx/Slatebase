import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadGraphConfig, saveGraphConfig, resetGraphConfig, DEFAULT_GRAPH_CONFIG, _resetGraphSession } from './graph-config'
import type { GraphConfig } from './graph-config'
import { _reset as resetVaultSettings, setActiveVault, updateVaultSettings } from '../state/vaultSettingsStore'
import {
  _reset as resetGraphStore,
  initialize as initializeGraphStore,
  setActiveVault as setActiveGraphVault,
} from '../state/vaultGraphStore'
import { showToast } from './ToastNotification'
import type { IApiClient } from '../api'

vi.mock('./ToastNotification', () => ({ showToast: vi.fn() }))

/** Writes a raw (possibly partial or invalid) payload into the vault settings. */
function seedStoredConfig(raw: string): void {
  updateVaultSettings({ graph: JSON.parse(raw) as Record<string, unknown> })
}

/** A fake server for the vault's graph.json. */
function createGraphClient(initial: Record<string, unknown> = {}, refuse = false) {
  const state = { file: { ...initial } }
  return {
    state,
    getGraphConfig: vi.fn(async () => ({ ...state.file })),
    patchGraphConfig: vi.fn(async (_vaultId: string, patch: Record<string, unknown>) => {
      if (refuse) throw { message: 'Kein Schreibzugriff' }
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete state.file[key]
        else state.file[key] = value
      }
      return { ...state.file }
    }),
  }
}

async function useGraphFile(client: ReturnType<typeof createGraphClient>): Promise<void> {
  resetGraphStore()
  initializeGraphStore(client as unknown as IApiClient)
  await setActiveGraphVault('vault-1')
}

describe('GraphConfig', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    _resetGraphSession()
    // The personal part lives in the active vault's settings, the vault part in graph.json.
    resetVaultSettings()
    await setActiveVault('vault-1')
    await useGraphFile(createGraphClient())
  })

  it('loadGraphConfig returns defaults when nothing is stored for the vault', () => {
    const config = loadGraphConfig()
    expect(config).toEqual(DEFAULT_GRAPH_CONFIG)
  })

  it('saveGraphConfig → loadGraphConfig round-trip preserves values', () => {
    const custom: GraphConfig = {
      colors: {
        fileNode: '#ff0000',
        unresolvedNode: '#00ff00',
        tagNode: '#0000ff',
        propertyNode: '#ffff00',
        edge: '#ff00ff',
        highlight: '#00ffff',
      },
      layout: {
        repulsion: 100,
        linkStrength: 0.15,
        linkDistance: 60,
        centerGravity: 0.05,
      },
      nodes: {
        showTags: true,
        showProperties: true,
        selectedPropertyKeys: ['status', 'priority'],
      },
      localGraph: {
        hops: 3,
      },
    }

    saveGraphConfig(custom)
    const loaded = loadGraphConfig()
    expect(loaded.colors).toEqual(custom.colors)
    expect(loaded.nodes).toEqual(custom.nodes)
    expect(loaded.localGraph).toEqual(custom.localGraph)
    for (const key of Object.keys(custom.layout) as Array<keyof GraphConfig['layout']>) {
      expect(loaded.layout[key]).toBeCloseTo(custom.layout[key], 4)
    }
  })

  it('keeps the forces and the tag switch in the vault\'s graph.json, in Obsidian\'s names, and the rest personal', async () => {
    const client = createGraphClient({ search: 'path:Notes', colorGroups: [] })
    await useGraphFile(client)

    saveGraphConfig({
      ...DEFAULT_GRAPH_CONFIG,
      colors: { ...DEFAULT_GRAPH_CONFIG.colors, fileNode: '#123456' },
      layout: { ...DEFAULT_GRAPH_CONFIG.layout, repulsion: 100 },
      nodes: { ...DEFAULT_GRAPH_CONFIG.nodes, showTags: true },
    })

    await vi.waitFor(() => expect(client.patchGraphConfig).toHaveBeenCalled())
    expect(client.patchGraphConfig.mock.calls[0]?.[1]).toEqual({ repelStrength: 20, showTags: true })
    expect(client.state.file).toMatchObject({ search: 'path:Notes', colorGroups: [], repelStrength: 20, showTags: true })
    expect(loadGraphConfig().colors.fileNode).toBe('#123456')
  })

  it('does not write graph.json when only the personal part changes', async () => {
    const client = createGraphClient()
    await useGraphFile(client)
    saveGraphConfig({ ...DEFAULT_GRAPH_CONFIG, localGraph: { hops: 4 } })
    expect(client.patchGraphConfig).not.toHaveBeenCalled()
    expect(loadGraphConfig().localGraph.hops).toBe(4)
  })

  it('shows what another user or Obsidian wrote into graph.json', async () => {
    await useGraphFile(createGraphClient({ repelStrength: 20, showTags: true, linkDistance: 500 }))
    const config = loadGraphConfig()
    expect(config.layout.repulsion).toBeCloseTo(100, 4)
    expect(config.layout.linkDistance).toBeCloseTo(60, 4)
    expect(config.nodes.showTags).toBe(true)
  })

  it('ignores the layout and tag switch an older version stored per user', () => {
    seedStoredConfig(JSON.stringify({ layout: { repulsion: 300 }, nodes: { showTags: true } }))
    const config = loadGraphConfig()
    expect(config.layout).toEqual(DEFAULT_GRAPH_CONFIG.layout)
    expect(config.nodes.showTags).toBe(false)
  })

  it('without write access the change holds for this session only, with a hint', async () => {
    await useGraphFile(createGraphClient({}, true))

    saveGraphConfig({ ...DEFAULT_GRAPH_CONFIG, layout: { ...DEFAULT_GRAPH_CONFIG.layout, repulsion: 100 } })

    await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith('info', expect.stringContaining('nur in dieser Sitzung')))
    expect(loadGraphConfig().layout.repulsion).toBe(100)
  })

  it('resetGraphConfig causes next load to return defaults', () => {
    const custom: GraphConfig = {
      ...DEFAULT_GRAPH_CONFIG,
      colors: { ...DEFAULT_GRAPH_CONFIG.colors, fileNode: '#123456' },
    }
    saveGraphConfig(custom)

    resetGraphConfig()
    const config = loadGraphConfig()
    expect(config).toEqual(DEFAULT_GRAPH_CONFIG)
  })

  it('resetGraphConfig removes the forces and the tag switch from graph.json and keeps its other keys', async () => {
    const client = createGraphClient({ repelStrength: 20, showTags: true, linkStrength: 0.5, search: 'x' })
    await useGraphFile(client)

    resetGraphConfig()

    await vi.waitFor(() => expect(client.patchGraphConfig).toHaveBeenCalled())
    expect(client.state.file).toEqual({ search: 'x' })
    expect(loadGraphConfig().layout).toEqual(DEFAULT_GRAPH_CONFIG.layout)
  })

  it('loadGraphConfig returns defaults for a stored value of the wrong shape', () => {
    // Parsing corrupt JSON is now the settings store's job; what this module
    // still has to survive is a stored object that carries nothing it knows.
    updateVaultSettings({ graph: { unrelated: 'value' } })
    const config = loadGraphConfig()
    expect(config).toEqual(DEFAULT_GRAPH_CONFIG)
  })

  it('loadGraphConfig merges partial config with defaults for missing keys', () => {
    // Store only colors, missing layout and nodes
    const partial = {
      colors: {
        fileNode: '#aabbcc',
        unresolvedNode: '#112233',
        tagNode: '#445566',
        propertyNode: '#778899',
        edge: '#aabbcc',
        highlight: '#ddeeff',
      },
    }
    seedStoredConfig(JSON.stringify(partial))

    const config = loadGraphConfig()
    expect(config.colors.fileNode).toBe('#aabbcc')
    expect(config.layout).toEqual(DEFAULT_GRAPH_CONFIG.layout)
    expect(config.nodes).toEqual(DEFAULT_GRAPH_CONFIG.nodes)
    expect(config.localGraph).toEqual(DEFAULT_GRAPH_CONFIG.localGraph)
  })

  it('loadGraphConfig clamps localGraph.hops to the valid range [1, 5]', () => {
    seedStoredConfig(JSON.stringify({ localGraph: { hops: 42 } }))
    expect(loadGraphConfig().localGraph.hops).toBe(5)

    seedStoredConfig(JSON.stringify({ localGraph: { hops: -3 } }))
    expect(loadGraphConfig().localGraph.hops).toBe(1)

    seedStoredConfig(JSON.stringify({ localGraph: { hops: 'not a number' } }))
    expect(loadGraphConfig().localGraph.hops).toBe(DEFAULT_GRAPH_CONFIG.localGraph.hops)
  })

  it('loadGraphConfig uses defaults for invalid value types', () => {
    const invalid = {
      colors: {
        fileNode: 123, // wrong type
        unresolvedNode: null,
        tagNode: '#10b981',
        propertyNode: '#f59e0b',
        edge: '#cbd5e1',
        highlight: '#6366f1',
      },
      layout: {
        repulsion: 'not a number',
        linkStrength: 0.5,
        linkDistance: 30,
        centerGravity: 0.1,
      },
      nodes: {
        showTags: 'yes', // wrong type
        showProperties: false,
        selectedPropertyKeys: [1, 2, 3], // wrong element type
      },
    }
    seedStoredConfig(JSON.stringify(invalid))

    const config = loadGraphConfig()
    // Invalid values should fall back to defaults
    expect(config.colors.fileNode).toBe(DEFAULT_GRAPH_CONFIG.colors.fileNode)
    expect(config.colors.unresolvedNode).toBe(DEFAULT_GRAPH_CONFIG.colors.unresolvedNode)
    expect(config.colors.tagNode).toBe('#10b981') // valid, kept
    expect(config.layout.repulsion).toBe(DEFAULT_GRAPH_CONFIG.layout.repulsion) // invalid, fallback
    expect(config.layout.linkStrength).toBe(DEFAULT_GRAPH_CONFIG.layout.linkStrength) // the vault's graph.json decides, not the personal copy
    expect(config.nodes.showTags).toBe(DEFAULT_GRAPH_CONFIG.nodes.showTags) // invalid, fallback
    expect(config.nodes.selectedPropertyKeys).toEqual(DEFAULT_GRAPH_CONFIG.nodes.selectedPropertyKeys) // invalid, fallback
  })

  it('loadGraphConfig handles null stored value', () => {
    seedStoredConfig('null')
    const config = loadGraphConfig()
    expect(config).toEqual(DEFAULT_GRAPH_CONFIG)
  })
})
