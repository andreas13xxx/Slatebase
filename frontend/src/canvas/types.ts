/**
 * Canvas data model types — Obsidian-compatible .canvas JSON format.
 * Supports text, file, link, and group nodes with edges between them.
 * Forward-compatible: unknown fields are preserved via _unknown passthrough.
 */

// ─── Base Node ────────────────────────────────────────────────────────────────

/** Base properties shared by all canvas node types. */
export interface BaseNode {
  /** Unique node identifier. */
  id: string
  /** X coordinate (pixels). */
  x: number
  /** Y coordinate (pixels). */
  y: number
  /** Width in pixels. */
  width: number
  /** Height in pixels. */
  height: number
  /** Obsidian color: "1"–"6" or hex value. */
  color?: string
  /** Unknown properties preserved for round-trip compatibility. */
  _unknown?: Record<string, unknown>
}

// ─── Node Types ───────────────────────────────────────────────────────────────

/** A text node containing Markdown content. */
export interface TextNode extends BaseNode {
  type: 'text'
  /** Markdown text content. */
  text: string
}

/** A file node referencing a vault file. */
export interface FileNode extends BaseNode {
  type: 'file'
  /** Vault-relative file path. */
  file: string
  /** Optional subpath (heading or block reference). */
  subpath?: string
}

/** A link node referencing an external URL. */
export interface LinkNode extends BaseNode {
  type: 'link'
  /** External URL. */
  url: string
}

/** A group node that visually contains other nodes. */
export interface GroupNode extends BaseNode {
  type: 'group'
  /** Optional group label. */
  label?: string
  /** Background image or color. */
  background?: string
  /** Background display style. */
  backgroundStyle?: 'cover' | 'ratio' | 'exact'
}

/** Discriminated union of all canvas node types. */
export type CanvasNode = TextNode | FileNode | LinkNode | GroupNode

// ─── Edge ─────────────────────────────────────────────────────────────────────

/** Side of a node where an edge connects. */
export type EdgeSide = 'top' | 'right' | 'bottom' | 'left'

/** Edge endpoint style. */
export type EdgeEnd = 'none' | 'arrow'

/** A directed connection between two nodes. */
export interface CanvasEdge {
  /** Unique edge identifier. */
  id: string
  /** Source node ID. */
  fromNode: string
  /** Source anchor side. */
  fromSide: EdgeSide
  /** Source endpoint style. */
  fromEnd?: EdgeEnd
  /** Target node ID. */
  toNode: string
  /** Target anchor side. */
  toSide: EdgeSide
  /** Target endpoint style (default: arrow). */
  toEnd?: EdgeEnd
  /** Edge color (Obsidian "1"–"6" or hex). */
  color?: string
  /** Optional edge label. */
  label?: string
  /** Unknown properties preserved for round-trip compatibility. */
  _unknown?: Record<string, unknown>
}

// ─── Document ─────────────────────────────────────────────────────────────────

/** A complete canvas document. */
export interface CanvasDocument {
  /** All nodes on the canvas. */
  nodes: CanvasNode[]
  /** All edges connecting nodes. */
  edges: CanvasEdge[]
  /** Unknown top-level properties preserved for round-trip compatibility. */
  _unknown?: Record<string, unknown>
}

// ─── Parse Result ─────────────────────────────────────────────────────────────

/** A validation error encountered during parsing. */
export interface CanvasValidationError {
  /** Error message. */
  message: string
  /** Path to the problematic field (e.g. "nodes[2].id"). */
  path?: string
}

/** Result of parsing a canvas JSON string. */
export interface CanvasParseResult {
  /** Whether parsing succeeded. */
  success: boolean
  /** Parsed document (only present on success). */
  document?: CanvasDocument
  /** Validation errors (only present on failure). */
  errors?: CanvasValidationError[]
}
