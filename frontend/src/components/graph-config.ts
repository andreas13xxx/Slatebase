/**
 * GraphConfig — Configuration for the knowledge graph visualization.
 *
 * Manages graph appearance (colors, layout, node visibility) with
 * localStorage persistence. Falls back to Design Token defaults.
 */

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

/** Complete graph configuration. */
export interface GraphConfig {
  colors: GraphColorConfig
  layout: GraphLayoutConfig
  nodes: GraphNodeConfig
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
}

// ─── localStorage Key ────────────────────────────────────────────────────────

const STORAGE_KEY = 'slatebase-graph-config'

// ─── Public Functions ────────────────────────────────────────────────────────

/**
 * Loads the graph configuration from localStorage.
 * Returns defaults if no config is stored or if stored JSON is corrupt.
 * Merges partial configs with defaults (missing keys get default values).
 *
 * @returns The current graph configuration
 */
export function loadGraphConfig(): GraphConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return { ...DEFAULT_GRAPH_CONFIG }
    }

    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') {
      return { ...DEFAULT_GRAPH_CONFIG }
    }

    return mergeWithDefaults(parsed as Partial<GraphConfig>)
  } catch {
    // Corrupt JSON or other error — return defaults
    return { ...DEFAULT_GRAPH_CONFIG }
  }
}

/**
 * Saves the graph configuration to localStorage.
 *
 * @param config - The configuration to persist
 */
export function saveGraphConfig(config: GraphConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

/**
 * Resets the graph configuration by removing it from localStorage.
 * The next `loadGraphConfig()` call will return defaults.
 */
export function resetGraphConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
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

  return { colors, layout, nodes }
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
