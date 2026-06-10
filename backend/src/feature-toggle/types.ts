/**
 * Feature-Toggle type definitions and interfaces.
 *
 * Provides the core data models and service interfaces for the
 * centralized feature toggle system.
 */

/** Toggle type: Hot = immediately effective, Cold = requires restart */
export type ToggleType = 'hot' | 'cold'

/** Definition of a registered feature toggle */
export interface FeatureToggleDefinition {
  /** Feature name in format [a-z][a-z0-9-]{0,63} */
  name: string
  /** Description (1–256 characters) */
  description: string
  /** Default value when neither env var nor runtime change is present */
  defaultEnabled: boolean
  /** Whether the change takes effect immediately or requires a restart */
  type: ToggleType
}

/** Current state of a toggle (API response format) */
export interface FeatureToggleState {
  /** Feature name */
  name: string
  /** Whether the feature is currently enabled */
  enabled: boolean
  /** Toggle type (hot or cold) */
  type: ToggleType
  /** Human-readable description */
  description: string
}

/** Result of a toggle update via the API */
export interface FeatureToggleUpdateResult {
  /** Feature name */
  name: string
  /** New enabled state */
  enabled: boolean
  /** Whether a server restart is required for the change to take effect */
  restartRequired: boolean
}

/** Callback invoked when a toggle changes */
export type FeatureChangeListener = (featureName: string, enabled: boolean) => void

/** Service interface for feature toggle queries and modifications */
export interface IFeatureToggleService {
  /** Synchronous query whether a feature is enabled. Returns false for unknown/invalid names. */
  isEnabled(featureName: string): boolean

  /** Changes the toggle state at runtime. Throws for unknown features. */
  setEnabled(featureName: string, enabled: boolean): FeatureToggleUpdateResult

  /** Returns the state of all registered toggles. */
  getAll(): FeatureToggleState[]

  /** Returns the state of a single toggle, or undefined if not found. */
  get(featureName: string): FeatureToggleState | undefined

  /** Registers a listener that is called on toggle changes. */
  onChange(listener: FeatureChangeListener): void
}

/** Registry interface for declarative feature registration */
export interface IFeatureRegistry {
  /** Registers a new feature. Throws on invalid name or duplicate. */
  register(definition: FeatureToggleDefinition): void

  /** Returns all registered definitions. */
  getAll(): FeatureToggleDefinition[]

  /** Checks whether a feature name is registered. */
  has(name: string): boolean

  /** Returns the definition of a feature, or undefined. */
  get(name: string): FeatureToggleDefinition | undefined
}
