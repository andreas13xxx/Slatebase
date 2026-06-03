/**
 * Error classes for the Plugin Compatibility Layer.
 *
 * All errors extend the base PluginError class and include a pluginId
 * and error code for structured error handling and reporting.
 */

/**
 * Base error for all plugin-system errors.
 * Provides pluginId and code for structured error identification.
 */
export class PluginError extends Error {
  public readonly pluginId: string;
  public readonly code: string;

  constructor(message: string, pluginId: string, code: string) {
    super(message);
    this.name = 'PluginError';
    this.pluginId = pluginId;
    this.code = code;
  }
}

/**
 * Manifest validation failed — missing required fields, invalid format, etc.
 */
export class ManifestValidationError extends PluginError {
  public readonly field: string;

  constructor(pluginId: string, field: string, detail: string) {
    super(
      `Manifest validation failed for "${pluginId}": ${detail}`,
      pluginId,
      'MANIFEST_INVALID'
    );
    this.name = 'ManifestValidationError';
    this.field = field;
  }
}

/**
 * Bundle evaluation failed — syntax error, missing export, or runtime error during evaluation.
 */
export class BundleEvaluationError extends PluginError {
  public readonly cause: Error;

  constructor(pluginId: string, cause: Error) {
    super(
      `Bundle evaluation failed for "${pluginId}": ${cause.message}`,
      pluginId,
      'BUNDLE_EVAL_FAILED'
    );
    this.name = 'BundleEvaluationError';
    this.cause = cause;
  }
}

/**
 * Plugin lifecycle error — onload timeout, onload/onunload exception.
 */
export class LifecycleError extends PluginError {
  public readonly phase: 'onload' | 'onunload';

  constructor(pluginId: string, phase: 'onload' | 'onunload', detail: string) {
    super(
      `Lifecycle error in "${pluginId}" during ${phase}: ${detail}`,
      pluginId,
      'LIFECYCLE_ERROR'
    );
    this.name = 'LifecycleError';
    this.phase = phase;
  }
}

/**
 * Security violation — cross-vault access, blocked API, blocked network request.
 */
export class SecurityViolationError extends PluginError {
  public readonly violation: string;

  constructor(pluginId: string, violation: string) {
    super(
      `Security violation by "${pluginId}": ${violation}`,
      pluginId,
      'SECURITY_VIOLATION'
    );
    this.name = 'SecurityViolationError';
    this.violation = violation;
  }
}

/**
 * Settings persistence error — load or save failed.
 */
export class SettingsError extends PluginError {
  public readonly operation: 'load' | 'save';

  constructor(pluginId: string, operation: 'load' | 'save', detail: string) {
    super(
      `Settings ${operation} failed for "${pluginId}": ${detail}`,
      pluginId,
      'SETTINGS_ERROR'
    );
    this.name = 'SettingsError';
    this.operation = operation;
  }
}

/**
 * Plugin installation/upload error — invalid ZIP, missing files, version conflict, etc.
 */
export class InstallationError extends PluginError {
  constructor(pluginId: string, detail: string) {
    super(
      `Installation failed for "${pluginId}": ${detail}`,
      pluginId,
      'INSTALL_FAILED'
    );
    this.name = 'InstallationError';
  }
}
