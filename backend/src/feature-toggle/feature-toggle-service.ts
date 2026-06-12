/**
 * Feature Toggle Service implementation.
 *
 * Manages in-memory toggle state with priority layering:
 * default → config → env → runtime
 *
 * Provides synchronous O(1) lookups via isEnabled() and supports
 * runtime state changes via setEnabled() with listener notification.
 */

import type {
  FeatureChangeListener,
  FeatureToggleDefinition,
  FeatureToggleState,
  FeatureToggleUpdateResult,
  IFeatureRegistry,
  IFeatureToggleService,
} from './types.js'
import { FeatureNotFoundError } from './errors.js'

/** Internal state per toggle */
interface ToggleEntry {
  definition: FeatureToggleDefinition
  /** Current effective value — determined by env, config, or runtime change */
  currentEnabled: boolean
  /** Source of the current value (for debugging/logging) */
  source: 'default' | 'config' | 'env' | 'runtime'
}

/**
 * Regex for valid feature name characters in isEnabled queries.
 * Accepts alphanumeric, hyphens, and underscores. Length 1–128.
 */
const VALID_QUERY_NAME_REGEX = /^[a-zA-Z0-9_-]+$/

/**
 * Maps a feature name to its corresponding environment variable name.
 * Algorithm: SLATEBASE_FEATURE_ + name with hyphens replaced by underscores, uppercased.
 *
 * @param featureName - The feature name to map
 * @returns The environment variable name
 */
export function featureNameToEnvVar(featureName: string): string {
  return 'SLATEBASE_FEATURE_' + featureName.replaceAll('-', '_').toUpperCase()
}

/**
 * Parses a string value as a boolean (case-insensitive).
 * Accepts: "true"/"1" → true, "false"/"0" → false.
 * Returns undefined for any other value (invalid/ignored).
 *
 * @param value - The string value to parse
 * @returns The parsed boolean or undefined if invalid
 */
export function parseBooleanEnvValue(value: string): boolean | undefined {
  const lower = value.toLowerCase()
  if (lower === 'true' || lower === '1') {
    return true
  }
  if (lower === 'false' || lower === '0') {
    return false
  }
  return undefined
}

/**
 * Validates whether a feature name is valid for isEnabled() queries.
 * Valid names: non-empty, not whitespace-only, 1–128 chars, alphanumeric/hyphens/underscores.
 *
 * @param name - The feature name to validate
 * @returns true if the name is valid for querying
 */
function isValidQueryName(name: string): boolean {
  if (!name || name.trim().length === 0) {
    return false
  }
  if (name.length > 128) {
    return false
  }
  return VALID_QUERY_NAME_REGEX.test(name)
}

/**
 * In-memory feature toggle service.
 *
 * Initializes state from registry definitions, config file values,
 * persisted overrides, and environment variable overrides.
 * Supports runtime changes via setEnabled() with listener notification
 * and optional persistence callback.
 *
 * Priority order (highest wins): env > persisted > config > default
 */
export class FeatureToggleService implements IFeatureToggleService {
  private readonly toggles: Map<string, ToggleEntry> = new Map()
  private readonly listeners: FeatureChangeListener[] = []
  private onPersist: ((toggles: Record<string, boolean>) => Promise<void>) | undefined

  /**
   * Creates a new FeatureToggleService.
   *
   * @param registry - The feature registry containing all definitions
   * @param featuresConfig - The features section from default.json
   * @param persistedState - Previously persisted toggle overrides (from features.json)
   * @param env - Environment variables (defaults to process.env for testability)
   */
  constructor(
    registry: IFeatureRegistry,
    featuresConfig: Record<string, { enabled: boolean }>,
    persistedState: Record<string, boolean> = {},
    env: Record<string, string | undefined> = process.env,
  ) {
    this.initialize(registry, featuresConfig, persistedState, env)
  }

  /**
   * Registers a persistence callback invoked after every setEnabled() call.
   * The callback receives all current runtime-overridden toggle states.
   *
   * @param fn - Async function that persists the toggle map to disk
   */
  setPersistCallback(fn: (toggles: Record<string, boolean>) => Promise<void>): void {
    this.onPersist = fn
  }

  /**
   * Synchronously checks whether a feature is enabled.
   * Returns false for unknown, unregistered, or invalid feature names without throwing.
   * O(1) lookup via Map.
   *
   * @param featureName - The feature name to check
   * @returns true if the feature is registered and enabled, false otherwise
   */
  isEnabled(featureName: string): boolean {
    if (!isValidQueryName(featureName)) {
      return false
    }

    const entry = this.toggles.get(featureName)
    if (!entry) {
      return false
    }

    return entry.currentEnabled
  }

  /**
   * Changes the toggle state at runtime.
   * Notifies registered listeners if the value actually changes.
   * Persists the new state to disk via the persist callback (fire-and-forget).
   *
   * @param featureName - The feature name to change
   * @param enabled - The new enabled state
   * @returns The update result including restart requirement info
   * @throws FeatureNotFoundError if the feature is not registered
   */
  setEnabled(featureName: string, enabled: boolean): FeatureToggleUpdateResult {
    const entry = this.toggles.get(featureName)
    if (!entry) {
      throw new FeatureNotFoundError(featureName)
    }

    const previousEnabled = entry.currentEnabled
    entry.currentEnabled = enabled
    entry.source = 'runtime'

    // Notify listeners only if the value actually changed
    if (previousEnabled !== enabled) {
      this.notifyListeners(featureName, enabled)
    }

    // Persist the current runtime overrides (fire-and-forget)
    if (this.onPersist) {
      const runtimeToggles = this.getRuntimeToggles()
      this.onPersist(runtimeToggles).catch(() => {
        // Swallow persistence errors — in-memory state is authoritative
      })
    }

    return {
      name: featureName,
      enabled,
      restartRequired: entry.definition.type === 'cold',
    }
  }

  /**
   * Returns the state of all registered toggles.
   *
   * @returns Array of all toggle states
   */
  getAll(): FeatureToggleState[] {
    const result: FeatureToggleState[] = []
    for (const entry of this.toggles.values()) {
      result.push({
        name: entry.definition.name,
        enabled: entry.currentEnabled,
        type: entry.definition.type,
        description: entry.definition.description,
      })
    }
    return result
  }

  /**
   * Returns the state of a single toggle, or undefined if not found.
   *
   * @param featureName - The feature name to look up
   * @returns The toggle state or undefined
   */
  get(featureName: string): FeatureToggleState | undefined {
    const entry = this.toggles.get(featureName)
    if (!entry) {
      return undefined
    }

    return {
      name: entry.definition.name,
      enabled: entry.currentEnabled,
      type: entry.definition.type,
      description: entry.definition.description,
    }
  }

  /**
   * Registers a listener that is called when any toggle changes value.
   * Listeners are only notified when the value actually changes (not on redundant sets).
   *
   * @param listener - The callback to invoke on changes
   */
  onChange(listener: FeatureChangeListener): void {
    this.listeners.push(listener)
  }

  /**
   * Initializes toggle state from registry definitions, config, persisted state, and environment.
   * Priority: default < config < persisted < env (runtime overrides all via setEnabled).
   */
  private initialize(
    registry: IFeatureRegistry,
    featuresConfig: Record<string, { enabled: boolean }>,
    persistedState: Record<string, boolean>,
    env: Record<string, string | undefined>,
  ): void {
    const definitions = registry.getAll()

    for (const definition of definitions) {
      // Start with definition default
      let currentEnabled = definition.defaultEnabled
      let source: ToggleEntry['source'] = 'default'

      // Apply config override if present
      const configEntry = featuresConfig[definition.name]
      if (configEntry !== undefined) {
        currentEnabled = configEntry.enabled
        source = 'config'
      }

      // Apply persisted override if present
      const persistedValue = persistedState[definition.name]
      if (persistedValue !== undefined) {
        currentEnabled = persistedValue
        source = 'runtime'
      }

      // Apply env-var override if present and valid (highest priority)
      const envVarName = featureNameToEnvVar(definition.name)
      const envValue = env[envVarName]
      if (envValue !== undefined) {
        const parsed = parseBooleanEnvValue(envValue)
        if (parsed !== undefined) {
          currentEnabled = parsed
          source = 'env'
        }
        // Invalid env values are silently ignored (config/default remains)
      }

      this.toggles.set(definition.name, {
        definition,
        currentEnabled,
        source,
      })
    }
  }

  /**
   * Returns a map of all toggles that have been set at runtime (source === 'runtime').
   * Used for persistence — only runtime overrides need to be saved.
   */
  private getRuntimeToggles(): Record<string, boolean> {
    const result: Record<string, boolean> = {}
    for (const [name, entry] of this.toggles.entries()) {
      if (entry.source === 'runtime') {
        result[name] = entry.currentEnabled
      }
    }
    return result
  }

  /**
   * Notifies all registered listeners of a toggle change.
   * Exceptions in listeners are caught and ignored to prevent cascading failures.
   */
  private notifyListeners(featureName: string, enabled: boolean): void {
    for (const listener of this.listeners) {
      try {
        listener(featureName, enabled)
      } catch {
        // Swallow listener exceptions to prevent cascading failures
      }
    }
  }
}
