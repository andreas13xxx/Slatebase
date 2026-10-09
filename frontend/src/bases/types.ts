/**
 * Bases data model types — Obsidian-compatible `.base` YAML format.
 *
 * A `.base` file declares, over a vault's metadata layer: which notes to
 * include (filters), which columns to show (properties + formulas), and one
 * or more named views (table first). Forward-compatible: unknown fields are
 * preserved via `_unknown` passthrough, mirroring the Canvas parser so a
 * round-trip never drops newer Obsidian `.base` fields.
 *
 * This file only models the on-disk shape. Query execution lives in
 * `query-engine.ts`; formula evaluation in `formula/`.
 */

// ─── Filters ────────────────────────────────────────────────────────────────

/** Comparison operators usable in a property filter condition. */
export type BaseFilterOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'exists'
  | 'empty'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'

/** A single leaf condition — matches on a property, a tag, a path glob, or a file-metadata field. */
export interface BaseFilterCondition {
  /** Property key this condition tests (mutually exclusive with `tag`/`path`/`file`). */
  property?: string
  /** Tag name this condition tests (presence/absence). */
  tag?: string
  /** Path glob (same syntax as the search module's `path:` operator). */
  path?: string
  /** File-metadata field: `name`, `ctime`, or `mtime`. */
  file?: 'name' | 'ctime' | 'mtime'
  /** Operator; defaults to `eq` for property/file, to presence for `tag`/`path`. */
  op?: BaseFilterOperator
  /** Comparison value (string, number, or boolean). */
  value?: string | number | boolean
  /** Negate the condition. */
  not?: boolean
  /** Unknown fields preserved for round-trip compatibility. */
  _unknown?: Record<string, unknown>
}

/** An AND group — every child must match. */
export interface BaseFilterAnd {
  and: BaseFilterNode[]
}

/** An OR group — at least one child must match. */
export interface BaseFilterOr {
  or: BaseFilterNode[]
}

/** A filter node is either a leaf condition or a nested AND/OR group. */
export type BaseFilterNode = BaseFilterCondition | BaseFilterAnd | BaseFilterOr

// ─── Formulas ─────────────────────────────────────────────────────────────────

/**
 * A map of formula column id → expression source. The expression is evaluated
 * per row by the `formula/` interpreter and is display-only (never written
 * back into a note).
 */
export type BaseFormulas = Record<string, string>

// ─── Column / property display metadata ─────────────────────────────────────

/** Per-column display metadata (display name and future column hints). */
export interface BaseColumnMeta {
  /** Human-readable column header. Falls back to the key if absent. */
  displayName?: string
  /** Unknown fields preserved for round-trip compatibility. */
  _unknown?: Record<string, unknown>
}

/** Map of column id (property key or formula id) → display metadata. */
export type BaseProperties = Record<string, BaseColumnMeta>

// ─── Views ──────────────────────────────────────────────────────────────────

/** Sort direction for a view column. */
export type BaseSortDirection = 'asc' | 'desc'

/** A single sort clause within a view. */
export interface BaseSortClause {
  /** Column id (property key or formula id) to sort by. */
  column: string
  /** Direction; defaults to `asc`. */
  direction?: BaseSortDirection
}

/**
 * A named view within a base. Only `table` is modelled functionally in the
 * first version; other `type` values are preserved verbatim via `_unknown`.
 */
export interface BaseView {
  /** View type. The first version renders `table`; others round-trip untouched. */
  type: string
  /** View name shown in the view switcher. */
  name?: string
  /** Ordered list of column ids to display. */
  order?: string[]
  /** Sort clauses applied in order. */
  sort?: BaseSortClause[]
  /**
   * Column id (property key) to group rows by. Used by the `cards` (Kanban)
   * view: each distinct value becomes a column of cards; notes with no value
   * fall into an "Ohne {property}" column. Ignored by the table view.
   */
  groupBy?: string
  /** Unknown fields preserved for round-trip compatibility. */
  _unknown?: Record<string, unknown>
}

// ─── Document ─────────────────────────────────────────────────────────────────

/** A parsed `.base` document. */
export interface BaseDocument {
  /** Root filter node, or undefined when the base includes the whole vault. */
  filters?: BaseFilterNode
  /** Formula column definitions (id → expression). */
  formulas?: BaseFormulas
  /** Per-column display metadata. */
  properties?: BaseProperties
  /** Named views; at least one is expected for rendering. */
  views: BaseView[]
  /** Unknown top-level fields preserved for round-trip compatibility. */
  _unknown?: Record<string, unknown>
}

// ─── Query / row model (runtime, not persisted) ──────────────────────────────

/** A resolved table row: a note plus the raw values of its requested columns. */
export interface BaseRow {
  /** Vault-relative path of the note. */
  path: string
  /** File name without extension (the `file.name` pseudo-column). */
  fileName: string
  /** Raw property values keyed by property key. */
  values: Record<string, unknown>
}

// ─── Parse result ─────────────────────────────────────────────────────────────

/** A single validation error with an optional path into the document. */
export interface BaseValidationError {
  message: string
  path?: string
}

/** Result of parsing a `.base` file: either a document or a list of errors. */
export type BaseParseResult =
  | { success: true; document: BaseDocument; errors?: BaseValidationError[] }
  | { success: false; errors: BaseValidationError[] }

// ─── Query wire types (mirror backend BaseQuerySpec / BaseQueryResult) ────────

/** A single sort clause sent to the backend query route. */
export interface BaseQuerySortWire {
  column: string
  direction?: 'asc' | 'desc'
}

/** Normalized query spec posted to `POST /vaults/:vaultId/bases/query`. */
export interface BaseQuerySpecWire {
  filters?: BaseFilterNode
  columns: string[]
  sort?: BaseQuerySortWire[]
  limit?: number
}

/** A single row returned by the backend query. */
export interface BaseQueryRowWire {
  path: string
  fileName: string
  ctime?: number
  mtime?: number
  values: Record<string, string[]>
}

/** The backend query response. */
export interface BaseQueryResultWire {
  rows: BaseQueryRowWire[]
  total: number
}
