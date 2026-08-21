/**
 * Property-type module barrel export.
 */

export { PropertyTypeStore, PropertyTypeReservedKeyError, PropertyTypeMaxEntriesError } from './property-type-store.js'
export type { VaultPathResolver } from './property-type-store.js'
export { DEFAULT_PROPERTY_TYPE_REGISTRY, RESERVED_PROPERTY_KEYS } from './types.js'
export type {
  IPropertyTypeService,
  PropertyType,
  PropertyTypeEntry,
  PropertyTypeOptions,
  PropertyTypeRegistry,
} from './types.js'
export {
  propertyTypeSchema,
  propertyTypeEntrySchema,
  propertyTypeRegistrySchema,
  propertyTypeOptionsSchema,
} from './validation.js'
export type {
  PropertyTypeInput,
  PropertyTypeEntryInput,
  PropertyTypeRegistryInput,
} from './validation.js'
