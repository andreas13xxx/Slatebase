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

/**
 * A filter node in the Obsidian `.base` format. A leaf is an EXPRESSION STRING
 * (`'status != "done"'`, `file.hasTag("book")`), evaluated by the shared
 * expression engine (`formula/`); a group is one of `and`/`or`/`not` holding
 * further nodes. `not` is a group operator (every child must be false), not a
 * per-condition flag — this matches Obsidian, and replaces the earlier
 * invented object-condition schema (removed; no backward compatibility).
 */
export type BaseFilterNode = string | BaseFilterAnd | BaseFilterOr | BaseFilterNot

/** An AND group — every child must match. */
export interface BaseFilterAnd {
  and: BaseFilterNode[]
}

/** An OR group — at least one child must match. */
export interface BaseFilterOr {
  or: BaseFilterNode[]
}

/** A NOT group — none of the children may match. */
export interface BaseFilterNot {
  not: BaseFilterNode[]
}

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
 * Grouping spec for a view (the Obsidian `groupBy` object). `property` is the
 * column id to group by; `direction` orders the groups (case preserved from
 * the file, compared case-insensitively).
 */
export interface BaseGroupBy {
  property: string
  direction?: string
}

/** Per-view summary assignment: column id → named summary (e.g. `Average`). */
export type BaseSummaries = Record<string, string>

/**
 * A named view within a base. `table` and `cards` render in-app; other
 * `type` values are handed to a plugin-registered view or round-trip untouched.
 */
export interface BaseView {
  /** View type. `table`/`cards` render in-app; others via a plugin or `_unknown`. */
  type: string
  /** View name shown in the view switcher. */
  name?: string
  /** Ordered list of column ids to display. */
  order?: string[]
  /** Sort clauses applied in order. */
  sort?: BaseSortClause[]
  /**
   * Grouping spec. Used by the `cards` (Kanban) view: each distinct value of
   * `groupBy.property` becomes a column of cards; notes with no value fall into
   * an "Ohne {property}" column. Ignored by the table view.
   */
  groupBy?: BaseGroupBy
  /** View-level filter (concatenated with the document filter via AND). */
  filters?: BaseFilterNode
  /** Maximum rows this view shows. */
  limit?: number
  /** Column id → named summary aggregation. */
  summaries?: BaseSummaries
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
  /** Custom summary formula definitions (id → expression). */
  summaries?: BaseSummaries
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

/**
 * Normalized query spec posted to `POST /vaults/:vaultId/bases/query`. Carries
 * no filters: the Obsidian filter expressions are evaluated by the caller
 * (`filterRows`), the backend only returns candidate rows.
 */
export interface BaseQuerySpecWire {
  columns: string[]
  sort?: BaseQuerySortWire[]
  limit?: number
}

/** A single row returned by the backend query. */
export interface BaseQueryRowWire {
  path: string
  fileName: string
  ctime?: number | undefined
  mtime?: number | undefined
  /** File extension without the dot (`file.ext`), e.g. `md`. */
  ext?: string | undefined
  /** Parent folder path (`file.folder`), '' for a vault-root file. */
  folder?: string | undefined
  /** All tags on the file (`file.tags`), without the leading `#`. */
  tags?: string[] | undefined
  /** Internal link targets in the file (`file.links`), vault-relative. */
  links?: string[] | undefined
  values: Record<string, string[]>
}

/** The backend query response. */
export interface BaseQueryResultWire {
  rows: BaseQueryRowWire[]
  total: number
}
