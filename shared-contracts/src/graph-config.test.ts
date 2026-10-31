import { describe, expect, it } from 'vitest'
import {
  GRAPH_CONFIG_DEFAULTS,
  GRAPH_CONFIG_KEYS,
  SLATEBASE_GRAPH_LAYOUT_DEFAULTS,
  describeGraphDeviations,
  graphConfigValueProblem,
  graphLayoutFromFile,
  graphLayoutToFile,
  mergeGraphConfig,
} from './graph-config.js'
import { configValueProblem } from './config-table.js'

describe('graph.json table', () => {
  it('has a default that satisfies its own spec for every key', () => {
    for (const [key, spec] of Object.entries(GRAPH_CONFIG_KEYS)) {
      expect(configValueProblem(spec, (GRAPH_CONFIG_DEFAULTS as Record<string, unknown>)[key]), key).toBeNull()
    }
  })

  it('accepts a graph.json as Obsidian writes it without a deviation', () => {
    expect(describeGraphDeviations({
      'collapse-filter': true, search: '', showTags: false, showAttachments: false, hideUnresolved: false, showOrphans: true,
      'collapse-color-groups': true, colorGroups: [{ query: 'tag:#a', color: { a: 1, rgb: 14701138 } }],
      'collapse-display': true, showArrow: false, textFadeMultiplier: 0, nodeSizeMultiplier: 1, lineSizeMultiplier: 1,
      'collapse-forces': true, centerStrength: 0.518713248970312, repelStrength: 10, linkStrength: 1, linkDistance: 250,
      scale: 0.5, close: true,
    })).toEqual([])
  })

  it('reports unknown keys and values outside the ranges, and keeps them', () => {
    expect(describeGraphDeviations({ fancy: 1, repelStrength: 99, showTags: 'yes' }).map((d) => d.key)).toEqual(['fancy', 'repelStrength', 'showTags'])
    expect(mergeGraphConfig({ repelStrength: 99, fancy: 1 })).toMatchObject({ repelStrength: 10, fancy: 1 })
    expect(graphConfigValueProblem('colorGroups', 'x'.repeat(70 * 1024))).toMatch(/larger/)
  })
})

describe('force conversion', () => {
  it('maps Obsidian\'s defaults to Slatebase\'s defaults', () => {
    const layout = graphLayoutFromFile(GRAPH_CONFIG_DEFAULTS)
    expect(layout.repulsion).toBeCloseTo(SLATEBASE_GRAPH_LAYOUT_DEFAULTS.repulsion, 9)
    expect(layout.linkStrength).toBeCloseTo(SLATEBASE_GRAPH_LAYOUT_DEFAULTS.linkStrength, 9)
    expect(layout.linkDistance).toBeCloseTo(SLATEBASE_GRAPH_LAYOUT_DEFAULTS.linkDistance, 9)
    expect(layout.centerGravity).toBeCloseTo(SLATEBASE_GRAPH_LAYOUT_DEFAULTS.centerGravity, 9)
  })

  it('round-trips, and scales linearly', () => {
    const layout = { repulsion: 100, linkStrength: 0.15, linkDistance: 60, centerGravity: 0.05 }
    const back = graphLayoutFromFile(graphLayoutToFile(layout))
    for (const key of Object.keys(layout) as Array<keyof typeof layout>) expect(back[key]).toBeCloseTo(layout[key], 4)
    expect(graphLayoutToFile(layout).repelStrength).toBeCloseTo(20, 4)
  })

  it('clamps what Slatebase allows but the file table does not', () => {
    const file = graphLayoutToFile({ repulsion: 5000, linkStrength: 5, linkDistance: 1, centerGravity: 5 })
    expect(file.repelStrength).toBe(20)
    expect(file.linkStrength).toBe(1)
    expect(file.linkDistance).toBe(30)
    expect(file.centerStrength).toBe(1)
  })
})
