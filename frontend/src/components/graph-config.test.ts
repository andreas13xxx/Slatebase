import { describe, it, expect, beforeEach } from 'vitest'
import { loadGraphConfig, saveGraphConfig, resetGraphConfig, DEFAULT_GRAPH_CONFIG } from './graph-config'
import type { GraphConfig } from './graph-config'

describe('GraphConfig', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loadGraphConfig returns defaults when localStorage is empty', () => {
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
        linkStrength: 0.5,
        linkDistance: 60,
        centerGravity: 0.2,
      },
      nodes: {
        showTags: true,
        showProperties: true,
        selectedPropertyKeys: ['status', 'priority'],
      },
    }

    saveGraphConfig(custom)
    const loaded = loadGraphConfig()
    expect(loaded).toEqual(custom)
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

  it('loadGraphConfig returns defaults when localStorage contains corrupt JSON', () => {
    localStorage.setItem('slatebase-graph-config', 'not valid json{{{')
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
    localStorage.setItem('slatebase-graph-config', JSON.stringify(partial))

    const config = loadGraphConfig()
    expect(config.colors.fileNode).toBe('#aabbcc')
    expect(config.layout).toEqual(DEFAULT_GRAPH_CONFIG.layout)
    expect(config.nodes).toEqual(DEFAULT_GRAPH_CONFIG.nodes)
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
    localStorage.setItem('slatebase-graph-config', JSON.stringify(invalid))

    const config = loadGraphConfig()
    // Invalid values should fall back to defaults
    expect(config.colors.fileNode).toBe(DEFAULT_GRAPH_CONFIG.colors.fileNode)
    expect(config.colors.unresolvedNode).toBe(DEFAULT_GRAPH_CONFIG.colors.unresolvedNode)
    expect(config.colors.tagNode).toBe('#10b981') // valid, kept
    expect(config.layout.repulsion).toBe(DEFAULT_GRAPH_CONFIG.layout.repulsion) // invalid, fallback
    expect(config.layout.linkStrength).toBe(0.5) // valid, kept
    expect(config.nodes.showTags).toBe(DEFAULT_GRAPH_CONFIG.nodes.showTags) // invalid, fallback
    expect(config.nodes.selectedPropertyKeys).toEqual(DEFAULT_GRAPH_CONFIG.nodes.selectedPropertyKeys) // invalid, fallback
  })

  it('loadGraphConfig handles null stored value', () => {
    localStorage.setItem('slatebase-graph-config', 'null')
    const config = loadGraphConfig()
    expect(config).toEqual(DEFAULT_GRAPH_CONFIG)
  })
})
