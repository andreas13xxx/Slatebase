/**
 * Feature-Toggle error classes.
 *
 * Domain-specific errors for the feature toggle system.
 * These are mapped to HTTP status codes in the controller layer.
 */

/**
 * Thrown when a feature toggle is queried or modified that does not exist in the registry.
 */
export class FeatureNotFoundError extends Error {
  public readonly code = 'FEATURE_NOT_FOUND'

  constructor(public readonly featureName: string) {
    super(`Feature '${featureName}' is not registered`)
    this.name = 'FeatureNotFoundError'
  }
}

/**
 * Thrown when attempting to register a feature that already exists in the registry.
 */
export class FeatureAlreadyRegisteredError extends Error {
  public readonly code = 'FEATURE_ALREADY_REGISTERED'

  constructor(public readonly featureName: string) {
    super(`Feature '${featureName}' is already registered`)
    this.name = 'FeatureAlreadyRegisteredError'
  }
}

/**
 * Thrown when a feature name does not conform to the required format.
 * Valid format: [a-z][a-z0-9-]{0,63} (1–64 characters, starting with lowercase letter).
 */
export class InvalidFeatureNameError extends Error {
  public readonly code = 'INVALID_FEATURE_NAME'

  constructor(public readonly featureName: string, public readonly reason: string) {
    super(`Invalid feature name '${featureName}': ${reason}`)
    this.name = 'InvalidFeatureNameError'
  }
}
