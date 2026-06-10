/**
 * Declarative feature registry for the feature toggle system.
 *
 * Manages the registration of feature toggle definitions with
 * name validation, description validation, and duplicate checking.
 * Stores definitions in an in-memory Map for O(1) lookups.
 */

import type { FeatureToggleDefinition, IFeatureRegistry } from './types.js'
import { FeatureAlreadyRegisteredError, InvalidFeatureNameError } from './errors.js'

/**
 * Valid feature name pattern: starts with lowercase letter,
 * followed by 0–63 lowercase letters, digits, or hyphens.
 * Total length: 1–64 characters.
 */
const FEATURE_NAME_REGEX = /^[a-z][a-z0-9-]{0,63}$/

/**
 * In-memory registry for feature toggle definitions.
 * Implements IFeatureRegistry with validation on registration.
 */
export class FeatureRegistry implements IFeatureRegistry {
  private readonly definitions: Map<string, FeatureToggleDefinition> = new Map()

  /**
   * Registers a new feature toggle definition.
   * Validates the name format, description length, and checks for duplicates.
   *
   * @param definition - The feature toggle definition to register
   * @throws InvalidFeatureNameError if the name does not match the required format
   * @throws FeatureAlreadyRegisteredError if a feature with the same name already exists
   */
  register(definition: FeatureToggleDefinition): void {
    this.validateName(definition.name)
    this.validateDescription(definition.description)

    if (this.definitions.has(definition.name)) {
      throw new FeatureAlreadyRegisteredError(definition.name)
    }

    this.definitions.set(definition.name, definition)
  }

  /**
   * Returns all registered feature toggle definitions.
   */
  getAll(): FeatureToggleDefinition[] {
    return [...this.definitions.values()]
  }

  /**
   * Checks whether a feature name is registered.
   *
   * @param name - The feature name to check
   * @returns true if the feature is registered, false otherwise
   */
  has(name: string): boolean {
    return this.definitions.has(name)
  }

  /**
   * Returns the definition of a feature, or undefined if not registered.
   *
   * @param name - The feature name to look up
   * @returns The feature definition or undefined
   */
  get(name: string): FeatureToggleDefinition | undefined {
    return this.definitions.get(name)
  }

  /**
   * Validates that a feature name matches the required format.
   * Pattern: [a-z][a-z0-9-]{0,63} (1–64 chars, starts with lowercase letter)
   */
  private validateName(name: string): void {
    if (!name) {
      throw new InvalidFeatureNameError(name, 'name must not be empty')
    }

    if (name.length > 64) {
      throw new InvalidFeatureNameError(name, 'name must not exceed 64 characters')
    }

    if (!/^[a-z]/.test(name)) {
      throw new InvalidFeatureNameError(name, 'name must start with a lowercase letter')
    }

    if (!FEATURE_NAME_REGEX.test(name)) {
      throw new InvalidFeatureNameError(name, 'name must match pattern [a-z][a-z0-9-]{0,63}')
    }
  }

  /**
   * Validates that a description is between 1 and 256 characters (trimmed).
   */
  private validateDescription(description: string): void {
    const trimmed = description.trim()
    if (trimmed.length === 0) {
      throw new InvalidFeatureNameError('', 'description must not be empty')
    }
    if (trimmed.length > 256) {
      throw new InvalidFeatureNameError('', 'description must not exceed 256 characters')
    }
  }
}
