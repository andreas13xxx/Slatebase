// ─── Graph Data Models ───────────────────────────────────────────────────────

/** Discriminated node type for knowledge graph nodes. */
export type GraphNodeType = 'file' | 'tag' | 'property'

/** Discriminated edge type for knowledge graph edges. */
export type GraphEdgeType = 'link' | 'tag' | 'property'

/**
 * A single node in the knowledge graph.
 * Can represent a markdown file, unresolved link target, tag, or property value.
 */
export interface GraphNode {
  /** Unique node identifier (file path for files, `tag:<name>` for tags, `prop:<key>:<value>` for properties). */
  id: string
  /** Node type discriminator. */
  type: GraphNodeType
  /** Relative file path from vault root. Only present for type 'file'. */
  path?: string
  /** Display label for the node. */
  label: string
  /** Whether the file physically exists in the vault. Only meaningful for type 'file'. */
  exists: boolean
}

/**
 * A single edge in the knowledge graph.
 */
export interface GraphEdge {
  /** Source node ID. */
  source: string
  /** Target node ID. */
  target: string
  /** Edge type discriminator. */
  type: GraphEdgeType
}

/**
 * The full graph structure for visualization, consisting of nodes and edges.
 */
export interface GraphData {
  /** All nodes in the graph. */
  nodes: GraphNode[]
  /** All edges in the graph. */
  edges: GraphEdge[]
}

/**
 * Options for querying the graph with optional tag/property inclusion.
 */
export interface GraphQueryOptions {
  /** Include tag nodes and tag edges in the graph. */
  includeTags?: boolean | undefined
  /** Include property nodes and edges for the specified keys. */
  includePropertyKeys?: string[] | undefined
}

/**
 * Aggregated metadata about the graph (tags and property keys with counts).
 */
export interface GraphMeta {
  /** All tags across all files, sorted by count descending. */
  tags: Array<{ name: string; count: number }>
  /** All property keys across all files, sorted by count descending. */
  propertyKeys: Array<{ key: string; count: number }>
}

/**
 * Response for a backlinks query for a specific file.
 */
export interface BacklinksResponse {
  /** File path that was queried (relative to vault root). */
  path: string
  /** Files that link to this path (source file paths). */
  backlinks: string[]
}

// ─── Wikilink Parsing ──────────────────────────────────────────────────────────

/**
 * A single wikilink extracted from a markdown string.
 * Results must be identical to the frontend `extractWikilinks()` function.
 */
export interface ParsedWikilink {
  /** Link target (filename or relative path, without extension). */
  target: string
  /** Display text shown for the link. */
  display: string
  /** Heading reference within the target file, or null if none. */
  heading: string | null
  /** Block reference within the target file (e.g., "block-id" from `[[page#^block-id]]`), or null if none. */
  blockRef: string | null
  /** Position of the wikilink within the source markdown. */
  position: {
    /** 1-based line number. */
    line: number
    /** 1-based column number. */
    column: number
  }
}

// ─── Link Index Interface ────────────────────────────────────────────────────

/**
 * Abstraction for the link index implementation.
 * Allows switching from a JSON-based in-memory index to SQLite
 * without changing consuming code. Persistence is an internal
 * implementation detail and is not exposed through this interface.
 */
export interface ILinkIndex {
  /**
   * Rebuilds the entire index by parsing all markdown files in the vault.
   * Called on first init or when the persisted index is invalid.
   */
  rebuild(): Promise<void>

  /**
   * Updates the index for a single file (added or modified).
   * Parses the content and updates forward links + reverse map.
   * @param filePath - Relative path from vault root (normalized, forward slashes)
   * @param content - Markdown content of the file
   */
  updateFile(filePath: string, content: string): Promise<void>

  /**
   * Removes all index entries for a deleted file.
   * Cleans up forward links and backlink references.
   * @param filePath - Relative path from vault root
   */
  removeFile(filePath: string): Promise<void>

  /**
   * Handles a file rename by removing the old path and adding the new path.
   * @param oldPath - Previous relative path
   * @param newPath - New relative path
   * @param content - Current markdown content
   */
  renameFile(oldPath: string, newPath: string, content: string): Promise<void>

  /**
   * Returns forward links for a specific file.
   * @param filePath - Relative path from vault root
   * @returns Array of target file paths this file links to
   */
  getForwardLinks(filePath: string): string[]

  /**
   * Returns backlinks for a specific file.
   * @param filePath - Relative path from vault root
   * @returns Array of source file paths that link to this file
   */
  getBacklinks(filePath: string): string[]

  /**
   * Returns the full graph structure for visualization.
   * Optionally includes tag and property nodes based on query options.
   * @param options - Optional query options for including tags/properties
   * @returns Nodes (with type and existence flag) and edges (with type)
   */
  getGraph(options?: GraphQueryOptions): GraphData

  /**
   * Returns aggregated metadata about tags and property keys in the index.
   * Useful for populating filter/settings UIs.
   * @returns Tags with counts and property keys with counts, sorted descending
   */
  getGraphMeta(): GraphMeta

  /**
   * Whether the index has been initialized (loaded or rebuilt).
   */
  isReady(): boolean
}
