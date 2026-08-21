/**
 * Property-type data models.
 * Persisted as `.slatebase/property-types.json` inside each vault's data directory.
 * Defines the declared value types for frontmatter property keys.
 */

// ─── Data Model ──────────────────────────────────────────────────────────────

/** Supported property value types. */
export type PropertyType =
  | 'text'
  | 'number'
  | 'date'
  | 'datetime'
  | 'checkbox'
  | 'list'
  | 'tags'
  | 'aliases'

/** Type-specific options (extensible). */
export interface PropertyTypeOptions {
  /** For 'list'/'text': predefined allowed values (shown as dropdown). */
  allowedValues?: string[] | undefined
  /** For 'date'/'datetime': display format hint (informational, not enforced). */
  dateFormat?: string | undefined
}

/** A single registered property-key definition. */
export interface PropertyTypeEntry {
  /** The frontmatter key name. */
  key: string
  /** The declared value type. */
  type: PropertyType
  /** Optional type-specific configuration. */
  options?: PropertyTypeOptions | undefined
}

/** The full per-vault registry document. */
export interface PropertyTypeRegistry {
  entries: PropertyTypeEntry[]
}

/** Default (empty) registry for new/missing vaults. */
export const DEFAULT_PROPERTY_TYPE_REGISTRY: PropertyTypeRegistry = {
  entries: [],
}

/**
 * Property keys with fixed type assignments that the user cannot change.
 * These are Obsidian conventions.
 */
export const RESERVED_PROPERTY_KEYS: Record<string, PropertyType> = {
  tags: 'tags',
  aliases: 'aliases',
}

// ─── Service Interface ───────────────────────────────────────────────────────

/** Service for reading and writing per-vault property type definitions. */
export interface IPropertyTypeService {
  /** Get the full registry for a vault. Returns empty entries for missing files. */
  getRegistry(vaultId: string): Promise<PropertyTypeRegistry>
  /** Replace the entire registry atomically. Validates max entries. */
  saveRegistry(vaultId: string, registry: PropertyTypeRegistry): Promise<PropertyTypeRegistry>
  /** Add or update a single property-key entry (merge, not full replace). */
  upsertEntry(vaultId: string, entry: PropertyTypeEntry): Promise<PropertyTypeRegistry>
}
