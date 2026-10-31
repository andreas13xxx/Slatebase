/**
 * GraphConfig — Configuration for the knowledge graph visualization.
 *
 * Two parts with two homes:
 *  - the force settings (`layout`) and whether tag nodes are shown (`nodes.showTags`) are the vault's:
 *    they live in `.obsidian/graph.json` like in Obsidian, the same for everyone who opens the vault,
 *    and changing them needs write access (`vaultGraphStore`);
 *  - colours, property nodes and the local graph's hops have no Obsidian counterpart and stay a
 *    personal preference per user and vault (`vaultSettingsStore`).
 * Without write access a change of the vault part holds for this session only.
 */

import {
  graphLayoutFromFile,
  graphLayoutToFile,
  type GraphConfigValues,
} from '@slatebase/shared-contracts'
import { getVaultSettings, updateVaultSettings } from '../state/vaultSettingsStore'
import { getGraphValue, updateGraph } from '../state/vaultGraphStore'
import { showToast } from './ToastNotification'

// ─── Interfaces ──────────────────────────────────────────────────────────────

/** Color configuration for graph elements. */
export interface GraphColorConfig {
  /** Color for resolved file nodes. */
  fileNode: string
  /** Color for unresolved (non-existing) nodes. */
  unresolvedNode: string
  /** Color for tag nodes. */
  tagNode: string
  /** Color for property nodes. */
  propertyNode: string
  /** Color for edges/links. */
  edge: string
  /** Highlight/accent color. */
  highlight: string
}

/** Layout force parameters for the d3-force simulation. */
export interface GraphLayoutConfig {
  /** Charge repulsion strength (positive value, applied as negative). Range: 10–500. */
  repulsion: number
  /** Link attraction strength. Range: 0.01–1.0. */
  linkStrength: number
  /** Preferred distance between linked nodes. Range: 10–200. */
  linkDistance: number
  /** Center gravity strength. Range: 0.01–1.0. */
  centerGravity: number
}

/** Node type visibility configuration. */
export interface GraphNodeConfig {
  /** Whether tag nodes are shown. */
  showTags: boolean
  /** Whether property nodes are shown. */
  showProperties: boolean
  /** Selected property keys to display (when showProperties is true). */
  selectedPropertyKeys: string[]
}

/** Lokaler_Graph configuration (Nachbarschaftsradius). */
export interface GraphLocalConfig {
  /** Neighborhood radius in hops. Range: 1–5. */
  hops: number
}

/** Complete graph configuration. */
export interface GraphConfig {
  colors: GraphColorConfig
  layout: GraphLayoutConfig
  nodes: GraphNodeConfig
  localGraph: GraphLocalConfig
}

// ─── Defaults ────────────────────────────────────────────────────────────────

/** Default graph configuration using CSS design token values. */
export const DEFAULT_GRAPH_CONFIG: GraphConfig = {
  colors: {
    fileNode: '#6366f1',
    unresolvedNode: '#94a3b8',
    tagNode: '#10b981',
    propertyNode: '#f59e0b',
    edge: '#cbd5e1',
    highlight: '#6366f1',
  },
  layout: {
    repulsion: 50,
    linkStrength: 0.3,
    linkDistance: 30,
    centerGravity: 0.1,
  },
  nodes: {
    showTags: false,
    showProperties: false,
    selectedPropertyKeys: [],
  },
  localGraph: {
    hops: 1,
  },
}

// ─── Backing store ───────────────────────────────────────────────────────────

/*
 * The personal part lives in `vaultSettingsStore.graph` — per user and per vault, on the server (it
 * used to hold the layout and the tag switch too; those values are ignored there now and the vault's
 * graph.json decides, starting from Obsidian's defaults, which convert to the defaults below). The
 * vault part lives in `vaultGraphStore`.
 */

/** The vault part when the file could not be written: what this session shows instead. */
let sessionOverride: { layout: GraphLayoutConfig; showTags: boolean } | null = null

type ForceKeys = Pick<GraphConfigValues, 'repelStrength' | 'linkStrength' | 'linkDistance' | 'centerStrength'>

function fileForces(): ForceKeys {
  return {
    repelStrength: getGraphValue('repelStrength'),
    linkStrength: getGraphValue('linkStrength'),
    linkDistance: getGraphValue('linkDistance'),
    centerStrength: getGraphValue('centerStrength'),
  }
}

// ─── Public Functions ────────────────────────────────────────────────────────

/**
 * Loads the graph configuration: the personal part from the user's settings, the layout and the
 * tag switch from the vault's graph.json (or, if a change of those could not be saved, from this
 * session). Missing or invalid values get their defaults.
 *
 * @returns The current graph configuration
 */
export function loadGraphConfig(): GraphConfig {
  const stored = getVaultSettings().graph
  const personal = stored === null ? { ...DEFAULT_GRAPH_CONFIG } : mergeWithDefaults(stored as Partial<GraphConfig>)
  const vault = sessionOverride ?? { layout: graphLayoutFromFile(fileForces()), showTags: getGraphValue('showTags') }
  return { ...personal, layout: vault.layout, nodes: { ...personal.nodes, showTags: vault.showTags } }
}

/**
 * Saves the graph configuration: the personal part to the user's settings, and what differs from the
 * vault's graph.json there. Without write access the change holds for this session only, with a hint.
 *
 * @param config - The configuration to persist
 */
export function saveGraphConfig(config: GraphConfig): void {
  updateVaultSettings({ graph: { colors: config.colors, nodes: { ...config.nodes, showTags: DEFAULT_GRAPH_CONFIG.nodes.showTags }, localGraph: config.localGraph } as unknown as Record<string, unknown> })

  // The new state is what the user wants; a failed write puts the session override back below.
  sessionOverride = null
  const forces = graphLayoutToFile(config.layout)
  const current = fileForces()
  const change: Partial<ForceKeys & { showTags: boolean }> = {}
  for (const key of Object.keys(forces) as Array<keyof ForceKeys>) {
    // graphLayoutToFile rounds to 6 decimals; a value that only differs by that is not a change.
    if (Math.abs(forces[key] - current[key]) > 1e-5 * Math.max(1, Math.abs(current[key]))) change[key] = forces[key]
  }
  if (config.nodes.showTags !== getGraphValue('showTags')) change.showTags = config.nodes.showTags
  if (Object.keys(change).length === 0) return

  updateGraph(change).catch(
    () => {
      sessionOverride = { layout: config.layout, showTags: config.nodes.showTags }
      showToast('info', 'Die Graph-Einstellungen gehören zum Vault. Ohne Schreibrecht gelten deine Änderungen nur in dieser Sitzung.')
    },
  )
}

/**
 * Resets the graph configuration: the personal part is dropped, and the forces and the tag switch
 * are removed from graph.json (Obsidian's defaults apply again). Without write access they are reset
 * for this session only.
 * The next `loadGraphConfig()` call will return defaults.
 */
export function resetGraphConfig(): void {
  const resetKeys = { repelStrength: null, linkStrength: null, linkDistance: null, centerStrength: null, showTags: null } as const
  sessionOverride = null
  updateGraph(resetKeys).catch(
    () => {
      sessionOverride = { layout: { ...DEFAULT_GRAPH_CONFIG.layout }, showTags: DEFAULT_GRAPH_CONFIG.nodes.showTags }
      showToast('info', 'Die Graph-Einstellungen gehören zum Vault. Ohne Schreibrecht gilt das Zurücksetzen nur in dieser Sitzung.')
    },
  )
  updateVaultSettings({ graph: null })
}

// ─── Private Helpers ─────────────────────────────────────────────────────────

/**
 * Merges a partial (possibly incomplete) config with the defaults.
 * Ensures all keys are present with valid values.
 */
function mergeWithDefaults(partial: Partial<GraphConfig>): GraphConfig {
  const defaults = DEFAULT_GRAPH_CONFIG

  const colors: GraphColorConfig = {
    fileNode: getStringValue(partial.colors, 'fileNode', defaults.colors.fileNode),
    unresolvedNode: getStringValue(partial.colors, 'unresolvedNode', defaults.colors.unresolvedNode),
    tagNode: getStringValue(partial.colors, 'tagNode', defaults.colors.tagNode),
    propertyNode: getStringValue(partial.colors, 'propertyNode', defaults.colors.propertyNode),
    edge: getStringValue(partial.colors, 'edge', defaults.colors.edge),
    highlight: getStringValue(partial.colors, 'highlight', defaults.colors.highlight),
  }

  const layout: GraphLayoutConfig = {
    repulsion: getNumberValue(partial.layout, 'repulsion', defaults.layout.repulsion),
    linkStrength: getNumberValue(partial.layout, 'linkStrength', defaults.layout.linkStrength),
    linkDistance: getNumberValue(partial.layout, 'linkDistance', defaults.layout.linkDistance),
    centerGravity: getNumberValue(partial.layout, 'centerGravity', defaults.layout.centerGravity),
  }

  const nodes: GraphNodeConfig = {
    showTags: getBooleanValue(partial.nodes, 'showTags', defaults.nodes.showTags),
    showProperties: getBooleanValue(partial.nodes, 'showProperties', defaults.nodes.showProperties),
    selectedPropertyKeys: getStringArrayValue(partial.nodes, 'selectedPropertyKeys', defaults.nodes.selectedPropertyKeys),
  }

  const localGraph: GraphLocalConfig = {
    hops: clampHops(getNumberValue(partial.localGraph, 'hops', defaults.localGraph.hops)),
  }

  return { colors, layout, nodes, localGraph }
}

/** Clamps a hop count to the valid range [1, 5], rounding to the nearest integer. */
function clampHops(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)))
}

function getStringValue(obj: unknown, key: string, fallback: string): string {
  if (obj !== null && obj !== undefined && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key]
    if (typeof val === 'string') return val
  }
  return fallback
}

function getNumberValue(obj: unknown, key: string, fallback: number): number {
  if (obj !== null && obj !== undefined && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key]
    if (typeof val === 'number' && !Number.isNaN(val)) return val
  }
  return fallback
}

function getBooleanValue(obj: unknown, key: string, fallback: boolean): boolean {
  if (obj !== null && obj !== undefined && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key]
    if (typeof val === 'boolean') return val
  }
  return fallback
}

function getStringArrayValue(obj: unknown, key: string, fallback: string[]): string[] {
  if (obj !== null && obj !== undefined && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key]
    if (Array.isArray(val) && val.every((item) => typeof item === 'string')) {
      return val as string[]
    }
  }
  return [...fallback]
}

/**
 * Forgets a session override of the vault part. Test helper.
 * @internal
 */
export function _resetGraphSession(): void {
  sessionOverride = null
}
