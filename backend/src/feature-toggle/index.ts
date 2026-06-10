/**
 * Feature-Toggle module barrel export.
 *
 * Re-exports all public types, interfaces, error classes,
 * the registry, the service, and the middleware factory.
 */

// Re-export all public types and interfaces
export type {
  ToggleType,
  FeatureToggleDefinition,
  FeatureToggleState,
  FeatureToggleUpdateResult,
  FeatureChangeListener,
  IFeatureToggleService,
  IFeatureRegistry,
} from './types.js'

// Re-export error classes
export {
  FeatureNotFoundError,
  FeatureAlreadyRegisteredError,
  InvalidFeatureNameError,
} from './errors.js'

// Re-export registry
export { FeatureRegistry } from './feature-registry.js'

// Re-export service + helpers
export { FeatureToggleService, featureNameToEnvVar, parseBooleanEnvValue } from './feature-toggle-service.js'

// Re-export middleware
export { createFeatureGuard } from './middleware.js'
