/**
 * Frontend-side property type definitions.
 * Mirrors the backend's property-type/types.ts for API communication.
 */

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

/** Type-specific options. */
export interface PropertyTypeOptions {
  allowedValues?: string[] | undefined
  dateFormat?: string | undefined
}

/** A single registered property-key definition. */
export interface PropertyTypeEntry {
  key: string
  type: PropertyType
  options?: PropertyTypeOptions | undefined
}

/** The full per-vault registry document. */
export interface PropertyTypeRegistry {
  entries: PropertyTypeEntry[]
}
