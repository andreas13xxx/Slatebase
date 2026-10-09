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
   * Removes all index entries for a deleted file or folder.
   * Cleans up forward links and backlink references; a folder path takes
   * everything indexed below it with it.
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
   * Handles a folder rename or move: drops everything indexed under the old
   * path and re-reads the folder at its new location. Content is read from the
   * vault directory rather than passed in — a folder has none of its own.
   * @param oldPath - Previous relative folder path
   * @param newPath - New relative folder path
   */
  renameDirectory(oldPath: string, newPath: string): Promise<void>

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

  /**
   * Returns file paths having the given property key (and optionally value).
   * Comparison is case-insensitive.
   * @param key - Property key to filter by
   * @param value - Optional value to match (case-insensitive)
   * @returns Array of relative file paths
   */
  getFilesByProperty(key: string, value?: string): string[]

  /**
   * Returns all observed property keys with their occurrence count (number of files).
   * Sorted by count descending.
   */
  getPropertyKeys(): Array<{ key: string; count: number }>

  /**
   * Returns observed values for a property key with their occurrence count.
   * Sorted by count descending, capped at `limit`.
   * @param key - Property key to get values for
   * @param limit - Maximum number of values to return (default: 100)
   */
  getPropertyValues(key: string, limit?: number): Array<{ value: string; count: number }>

  /**
   * Returns file paths matching ALL given property filters (AND combination).
   * Maximum 500 results.
   * @param filters - Array of property filters to apply
   */
  queryByProperties(filters: PropertyFilter[]): string[]

  /**
   * Runs a Bases query: filters notes by a nested AND/OR tree over properties,
   * tags, path globs and file metadata, sorts by one or more columns, and
   * returns each matching note's path plus the raw values of the requested
   * columns. Reads file-metadata (ctime/mtime) from disk on demand. The result
   * is hard-capped; `total` reports the match count before the cap.
   * @param spec - Normalized Bases query specification
   */
  queryForBase(spec: BaseQuerySpec): Promise<BaseQueryResult>
}

// ─── Property Filter ─────────────────────────────────────────────────────────

/** Operator for property-based file queries. */
export type PropertyFilterOperator = 'eq' | 'neq' | 'contains' | 'exists' | 'not_exists'

/** A single filter condition for property-based queries. */
export interface PropertyFilter {
  /** Property key to filter on. */
  key: string
  /** Comparison operator. */
  operator: PropertyFilterOperator
  /** Value to compare against (required for eq/neq/contains, ignored for exists/not_exists). */
  value?: string | undefined
}

// ─── Bases Query ───────────────────────────────────────────────────────────

/**
 * Comparison operators for a Bases filter condition. Superset of
 * PropertyFilterOperator: adds ordered comparisons (lt/lte/gt/gte) and an
 * `empty` check, which the richer Bases query surface needs and the simpler
 * property query does not.
 */
export type BaseQueryOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'exists'
  | 'empty'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'

/**
 * A single leaf condition in a Bases query. Targets exactly one of a property
 * key, a tag, a path glob, or a file-metadata field.
 */
export interface BaseQueryCondition {
  /** Property key to test (mutually exclusive with tag/path/file). */
  property?: string | undefined
  /** Tag name to test for presence/absence. */
  tag?: string | undefined
  /** Path glob (same syntax as the search module's `path:` operator). */
  path?: string | undefined
  /** File-metadata field. */
  file?: 'name' | 'ctime' | 'mtime' | undefined
  /** Operator; implementation defaults per target type. */
  op?: BaseQueryOperator | undefined
  /** Comparison value. */
  value?: string | number | boolean | undefined
  /** Negate the condition. */
  not?: boolean | undefined
}

/** An AND group — every child must match. */
export interface BaseQueryAnd {
  and: BaseQueryNode[]
}

/** An OR group — at least one child must match. */
export interface BaseQueryOr {
  or: BaseQueryNode[]
}

/** A Bases filter node: a leaf condition or a nested AND/OR group. */
export type BaseQueryNode = BaseQueryCondition | BaseQueryAnd | BaseQueryOr

/** A single sort clause for a Bases query. */
export interface BaseQuerySort {
  /** Column id to sort by: a property key, `file.name`, `file.ctime`, or `file.mtime`. */
  column: string
  /** Direction; defaults to ascending. */
  direction?: 'asc' | 'desc' | undefined
}

/** A normalized Bases query specification sent to the index. */
export interface BaseQuerySpec {
  /** Root filter node, or undefined to include every visible note. */
  filters?: BaseQueryNode | undefined
  /** Property keys whose raw values should be returned for each row. */
  columns: string[]
  /** Sort clauses applied in order (property keys or `file.*` fields). */
  sort?: BaseQuerySort[] | undefined
  /** Maximum number of rows to return (hard-capped by the implementation). */
  limit?: number | undefined
}

/** A single resolved Bases query row. */
export interface BaseQueryRow {
  /** Vault-relative file path. */
  path: string
  /** File name without extension (the `file.name` pseudo-column). */
  fileName: string
  /** Creation time (ms since epoch), when available. */
  ctime?: number | undefined
  /** Modification time (ms since epoch), when available. */
  mtime?: number | undefined
  /** Raw property values for the requested columns, keyed by property key. */
  values: Record<string, string[]>
}

/** Result of a Bases query. */
export interface BaseQueryResult {
  rows: BaseQueryRow[]
  /** Total matches before the limit was applied. */
  total: number
}
