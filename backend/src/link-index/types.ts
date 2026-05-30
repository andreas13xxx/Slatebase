// ─── Graph Data Models ───────────────────────────────────────────────────────

/**
 * A single node in the knowledge graph, representing a markdown file
 * or an unresolved link target.
 */
export interface GraphNode {
  /** Relative file path from vault root (normalized, forward slashes). */
  path: string
  /** Filename without extension, used as the display label. */
  label: string
  /** Whether the file physically exists in the vault. */
  exists: boolean
}

/**
 * A single edge in the knowledge graph, representing a wikilink
 * from one file to another.
 */
export interface GraphEdge {
  /** Source file path (the file containing the wikilink). */
  source: string
  /** Target file path (the linked file). */
  target: string
}

/**
 * The full graph structure for visualization, consisting of nodes and edges.
 */
export interface GraphData {
  /** All nodes in the graph (existing files and unresolved link targets). */
  nodes: GraphNode[]
  /** All edges in the graph (one per forward link). */
  edges: GraphEdge[]
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
   * @returns Nodes (with existence flag) and edges
   */
  getGraph(): GraphData

  /**
   * Whether the index has been initialized (loaded or rebuilt).
   */
  isReady(): boolean
}
