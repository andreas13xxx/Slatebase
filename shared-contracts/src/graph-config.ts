// `<vault>/.obsidian/graph.json` — settings of the graph view, flat, same for everyone who opens the
// vault. Names are taken from real files and forum posts (`colorGroups` only from forum posts); the
// number ranges and defaults are assumptions (`verified: false`). Keys of the file that Slatebase's
// graph has no function for (`search`, `showAttachments`, colour groups, display options, ...) are
// kept and written back unchanged.
//
// Slatebase's graph simulation uses other scales than Obsidian's, so the four force settings are
// converted relative to their defaults: Obsidian's default values map to Slatebase's default
// values, and the conversion is linear from there. It is an approximation, not an identity.

import {
  cfg,
  configDefaults,
  configValueProblem,
  describeConfigDeviations,
  isConfigKey,
  mergeConfig,
  type ConfigKeyMeta,
  type ConfigValue,
  type ConfigValues,
} from './config-table.js'

export const GRAPH_CONFIG_KEYS = {
  // Used by Slatebase's graph
  showTags: cfg.bool(false, true),
  // The ranges are wide enough for every position of Slatebase's sliders after conversion (repulsion
  // 10-500, link strength 0.01-1, link distance 10-200, centre gravity 0.01-1); they are not Obsidian's own.
  centerStrength: cfg.number(0.518713248970312, 0, 6, true),
  repelStrength: cfg.number(10, 0, 100, true),
  linkStrength: cfg.number(1, 0, 4, true),
  linkDistance: cfg.number(250, 0, 2000, true),
  // Kept and written back unchanged
  search: cfg.string('', 1024, true, 'passthrough'),
  showAttachments: cfg.bool(false, true, 'passthrough'),
  hideUnresolved: cfg.bool(false, true, 'passthrough'),
  showOrphans: cfg.bool(true, true, 'passthrough'),
  showArrow: cfg.bool(false, true, 'passthrough'),
  textFadeMultiplier: cfg.number(0, -3, 3, true, 'passthrough'),
  nodeSizeMultiplier: cfg.number(1, 0, 5, true, 'passthrough'),
  lineSizeMultiplier: cfg.number(1, 0, 5, true, 'passthrough'),
  scale: cfg.number(1, 0, 20, true, 'passthrough'),
  close: cfg.bool(true, true, 'passthrough'),
  'collapse-filter': cfg.bool(true, true, 'passthrough'),
  'collapse-color-groups': cfg.bool(true, true, 'passthrough'),
  'collapse-display': cfg.bool(true, true, 'passthrough'),
  'collapse-forces': cfg.bool(true, true, 'passthrough'),
  colorGroups: cfg.json([], 64 * 1024, false, 'passthrough'),
} as const satisfies Record<string, ConfigKeyMeta>

export type GraphConfigKey = keyof typeof GRAPH_CONFIG_KEYS
export type GraphConfigValue<K extends GraphConfigKey> = ConfigValue<typeof GRAPH_CONFIG_KEYS, K>
export type GraphConfigValues = ConfigValues<typeof GRAPH_CONFIG_KEYS>

export const GRAPH_CONFIG_DEFAULTS: Readonly<GraphConfigValues> = configDefaults(GRAPH_CONFIG_KEYS)

export function isGraphConfigKey(key: string): key is GraphConfigKey {
  return isConfigKey(GRAPH_CONFIG_KEYS, key)
}

export function graphConfigValueProblem(key: GraphConfigKey, value: unknown): string | null {
  return configValueProblem(GRAPH_CONFIG_KEYS[key], value)
}

export function describeGraphDeviations(fields: Record<string, unknown>) {
  return describeConfigDeviations(GRAPH_CONFIG_KEYS, fields)
}

export function mergeGraphConfig(fields: Record<string, unknown>): Record<string, unknown> {
  return mergeConfig(GRAPH_CONFIG_KEYS, GRAPH_CONFIG_DEFAULTS, fields)
}

/** The force settings of Slatebase's graph simulation (see graph-config.ts in the frontend). */
export interface GraphLayout {
  repulsion: number
  linkStrength: number
  linkDistance: number
  centerGravity: number
}

/** Slatebase's defaults for those settings; Obsidian's defaults convert to these. */
export const SLATEBASE_GRAPH_LAYOUT_DEFAULTS: Readonly<GraphLayout> = {
  repulsion: 50,
  linkStrength: 0.3,
  linkDistance: 30,
  centerGravity: 0.1,
}

const D = GRAPH_CONFIG_DEFAULTS
const S = SLATEBASE_GRAPH_LAYOUT_DEFAULTS

/** graph.json forces → Slatebase's simulation settings. */
export function graphLayoutFromFile(values: Pick<GraphConfigValues, 'repelStrength' | 'linkStrength' | 'linkDistance' | 'centerStrength'>): GraphLayout {
  return {
    repulsion: (values.repelStrength / D.repelStrength) * S.repulsion,
    linkStrength: (values.linkStrength / D.linkStrength) * S.linkStrength,
    linkDistance: (values.linkDistance / D.linkDistance) * S.linkDistance,
    centerGravity: (values.centerStrength / D.centerStrength) * S.centerGravity,
  }
}

/** Slatebase's simulation settings → the values to write into graph.json, clamped to the table's ranges. */
export function graphLayoutToFile(layout: GraphLayout): Pick<GraphConfigValues, 'repelStrength' | 'linkStrength' | 'linkDistance' | 'centerStrength'> {
  const clamp = (key: 'repelStrength' | 'linkStrength' | 'linkDistance' | 'centerStrength', value: number): number => {
    const spec = GRAPH_CONFIG_KEYS[key]
    return Math.min(spec.max, Math.max(spec.min, Math.round(value * 1e6) / 1e6))
  }
  return {
    repelStrength: clamp('repelStrength', (layout.repulsion / S.repulsion) * D.repelStrength),
    linkStrength: clamp('linkStrength', (layout.linkStrength / S.linkStrength) * D.linkStrength),
    linkDistance: clamp('linkDistance', (layout.linkDistance / S.linkDistance) * D.linkDistance),
    centerStrength: clamp('centerStrength', (layout.centerGravity / S.centerGravity) * D.centerStrength),
  }
}
