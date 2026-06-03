/**
 * PluginLoader — Loads, evaluates, and manages the lifecycle of Obsidian-compatible plugins.
 *
 * Responsibilities:
 * - Load plugin bundles as ES modules via Blob URL + dynamic import()
 * - Instantiate exported Plugin class with AppShim
 * - Handle missing/invalid exports, syntax errors, runtime exceptions
 * - Async loading after First Contentful Paint (max 50ms FCP delay)
 * - Lifecycle: activate (onload with 10s timeout), deactivate (onunload + full cleanup)
 * - Exception handling: mark as error, log, continue with remaining plugins
 *
 * @module plugin-loader
 */

import type { PluginManifest } from './manifest-parser';
import type {
  IAppShim,
  IPluginSandbox,
  PluginInstance,
  PluginManifestData,
} from './types';
import { BundleEvaluationError, LifecycleError } from './errors';

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Internal plugin status used by the loader */
export type PluginLoaderStatus = 'loaded' | 'active' | 'error' | 'deactivated';

/** Internal record for a loaded plugin */
export interface PluginRecord {
  instance: PluginInstance;
  status: PluginLoaderStatus;
  manifest: PluginManifest;
}

/**
 * IPluginLoader — Interface for the plugin loader module.
 */
export interface IPluginLoader {
  /** Load and evaluate a plugin bundle */
  loadPlugin(pluginId: string, bundle: string, manifest: PluginManifest): Promise<PluginInstance>;
  /** Activate a loaded plugin (calls onload) */
  activatePlugin(pluginId: string): Promise<void>;
  /** Deactivate a plugin (calls onunload, cleanup) */
  deactivatePlugin(pluginId: string): Promise<void>;
  /** Uninstall a plugin completely */
  uninstallPlugin(pluginId: string): Promise<void>;
  /** Get all loaded plugin instances */
  getPlugins(): Map<string, PluginInstance>;
  /** Get a specific plugin instance */
  getPlugin(pluginId: string): PluginInstance | undefined;
}

/**
 * BundleEvaluator — Function that evaluates a plugin bundle string and returns the module.
 * Can be swapped for testing purposes.
 */
export type BundleEvaluator = (bundle: string) => Promise<Record<string, unknown>>;

/** Dependencies injected into the PluginLoader via constructor */
export interface PluginLoaderDeps {
  /** Factory function that creates an AppShim for a given plugin */
  appShimFactory: (pluginId: string) => IAppShim;
  /** Plugin sandbox reference for resource cleanup */
  sandbox: IPluginSandbox;
  /** Callback when plugin status changes (for UI updates) */
  onStatusChange: (pluginId: string, status: PluginLoaderStatus, error?: string) => void;
  /** Optional bundle evaluator (defaults to Blob URL + dynamic import) */
  bundleEvaluator?: BundleEvaluator;
  /** Optional hook called after plugin instantiation (before activation). Used to wire addCommand etc. */
  onPluginInstantiated?: (pluginId: string, instance: PluginInstance) => void;
}

/** Timeout for onload() in milliseconds */
const ONLOAD_TIMEOUT_MS = 10_000;

// ─── Implementation ────────────────────────────────────────────────────────────

/**
 * PluginLoader — Manages plugin bundle evaluation, instantiation, and lifecycle.
 *
 * Tracks plugin state internally and delegates resource cleanup to the PluginSandbox.
 */
export class PluginLoader implements IPluginLoader {
  private readonly plugins: Map<string, PluginRecord> = new Map();
  private readonly deps: PluginLoaderDeps;

  constructor(deps: PluginLoaderDeps) {
    this.deps = deps;
  }

  /**
   * Load and evaluate a plugin bundle.
   *
   * The bundle is expected to have a default export of a Plugin class constructor.
   * Uses Blob URL + dynamic import() for ES module evaluation.
   *
   * @param pluginId - Unique plugin identifier
   * @param bundle - JavaScript source code string (the main.js content)
   * @param manifest - Validated plugin manifest
   * @returns The instantiated PluginInstance
   * @throws BundleEvaluationError if the bundle cannot be evaluated or has invalid exports
   */
  async loadPlugin(pluginId: string, bundle: string, manifest: PluginManifest): Promise<PluginInstance> {
    let module: Record<string, unknown>;

    try {
      module = await this.evaluateBundle(bundle);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const bundleError = new BundleEvaluationError(pluginId, error);
      this.setStatus(pluginId, 'error', manifest, bundleError.message);
      throw bundleError;
    }

    // Check that module.default is a constructor function
    const PluginClass = module['default'];
    if (!PluginClass || typeof PluginClass !== 'function') {
      const error = new Error(
        PluginClass === undefined
          ? 'Bundle has no default export'
          : 'Default export is not a constructor function'
      );
      const bundleError = new BundleEvaluationError(pluginId, error);
      this.setStatus(pluginId, 'error', manifest, bundleError.message);
      throw bundleError;
    }

    // Instantiate the plugin with the AppShim
    let instance: PluginInstance;
    try {
      const app = this.deps.appShimFactory(pluginId);
      instance = new (PluginClass as new (app: IAppShim) => PluginInstance)(app);
      // Ensure manifest data is attached
      instance.manifest = this.toManifestData(manifest);
      // Call post-instantiation hook (e.g. to wire addCommand to CommandRegistry)
      if (this.deps.onPluginInstantiated) {
        this.deps.onPluginInstantiated(pluginId, instance);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const bundleError = new BundleEvaluationError(pluginId, error);
      this.setStatus(pluginId, 'error', manifest, bundleError.message);
      throw bundleError;
    }

    // Store the plugin record
    const record: PluginRecord = {
      instance,
      status: 'loaded',
      manifest,
    };
    this.plugins.set(pluginId, record);
    this.deps.onStatusChange(pluginId, 'loaded');

    return instance;
  }

  /**
   * Activate a loaded plugin by calling its onload() method.
   *
   * Wraps onload() in a Promise.race with a 10-second timeout.
   * If onload() throws or times out, the plugin is marked as error
   * and activation continues without affecting other plugins.
   *
   * @param pluginId - The plugin to activate
   * @throws LifecycleError if onload() times out or throws (after marking as error)
   */
  async activatePlugin(pluginId: string): Promise<void> {
    const record = this.plugins.get(pluginId);
    if (!record) {
      throw new LifecycleError(pluginId, 'onload', 'Plugin not loaded');
    }

    if (record.status === 'active') {
      return; // Already active, no-op
    }

    try {
      const onloadResult = record.instance.onload();
      const onloadPromise = onloadResult instanceof Promise
        ? onloadResult
        : Promise.resolve();

      await Promise.race([
        onloadPromise,
        this.createTimeout(ONLOAD_TIMEOUT_MS, pluginId),
      ]);

      record.status = 'active';
      this.deps.onStatusChange(pluginId, 'active');
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const lifecycleError = new LifecycleError(pluginId, 'onload', detail);
      record.status = 'error';
      this.deps.onStatusChange(pluginId, 'error', detail);
      console.error(`[PluginLoader] Plugin "${pluginId}" failed during onload:`, err);
      throw lifecycleError;
    }
  }

  /**
   * Deactivate a plugin by calling its onunload() method and performing full cleanup.
   *
   * The cleanup is performed regardless of whether onunload() throws an exception.
   * Cleanup is delegated to the PluginSandbox's cleanup(pluginId) method.
   *
   * @param pluginId - The plugin to deactivate
   */
  async deactivatePlugin(pluginId: string): Promise<void> {
    const record = this.plugins.get(pluginId);
    if (!record) {
      return; // Plugin not loaded, nothing to deactivate
    }

    // Call onunload() in try/catch — cleanup happens regardless
    try {
      record.instance.onunload();
    } catch (err) {
      console.error(
        `[PluginLoader] Plugin "${pluginId}" threw during onunload:`,
        err
      );
    }

    // Full resource cleanup via sandbox — regardless of onunload exceptions
    try {
      this.deps.sandbox.cleanup(pluginId);
    } catch (err) {
      console.error(
        `[PluginLoader] Error during sandbox cleanup for plugin "${pluginId}":`,
        err
      );
    }

    record.status = 'deactivated';
    this.deps.onStatusChange(pluginId, 'deactivated');
  }

  /**
   * Uninstall a plugin completely — deactivates it if active and removes from internal state.
   *
   * @param pluginId - The plugin to uninstall
   */
  async uninstallPlugin(pluginId: string): Promise<void> {
    const record = this.plugins.get(pluginId);
    if (!record) {
      return;
    }

    // Deactivate if still active
    if (record.status === 'active') {
      await this.deactivatePlugin(pluginId);
    }

    // Remove from internal state
    this.plugins.delete(pluginId);
  }

  /**
   * Get all loaded plugin instances.
   *
   * @returns Map of pluginId to PluginInstance for all tracked plugins
   */
  getPlugins(): Map<string, PluginInstance> {
    const result = new Map<string, PluginInstance>();
    for (const [id, record] of this.plugins) {
      result.set(id, record.instance);
    }
    return result;
  }

  /**
   * Get a specific plugin instance by ID.
   *
   * @param pluginId - The plugin ID to look up
   * @returns The PluginInstance or undefined if not found
   */
  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId)?.instance;
  }

  /**
   * Get the internal status of a plugin.
   *
   * @param pluginId - The plugin to check
   * @returns The PluginLoaderStatus or undefined if plugin not tracked
   */
  getStatus(pluginId: string): PluginLoaderStatus | undefined {
    return this.plugins.get(pluginId)?.status;
  }

  /**
   * Get the full internal plugin record (for testing/inspection).
   *
   * @param pluginId - The plugin to look up
   * @returns The PluginRecord or undefined
   */
  getRecord(pluginId: string): PluginRecord | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Load all active plugins in registration order.
   *
   * This method is called at startup. Plugins that fail to load or activate
   * are marked as error, and the loader continues with remaining plugins.
   *
   * Designed to be called after First Contentful Paint to avoid delaying
   * the initial page render.
   *
   * @param pluginsToLoad - Array of { pluginId, bundle, manifest } in registration order
   */
  async loadAllActive(
    pluginsToLoad: Array<{ pluginId: string; bundle: string; manifest: PluginManifest }>
  ): Promise<void> {
    for (const { pluginId, bundle, manifest } of pluginsToLoad) {
      try {
        await this.loadPlugin(pluginId, bundle, manifest);
        await this.activatePlugin(pluginId);
      } catch (err) {
        // Mark as error, log, continue with remaining plugins
        console.error(
          `[PluginLoader] Failed to load/activate plugin "${pluginId}":`,
          err
        );
        // Status is already set to 'error' by loadPlugin or activatePlugin
      }
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────────

  /**
   * Evaluate a plugin bundle string as an ES module.
   *
   * Uses the injected bundleEvaluator if provided (e.g. for testing),
   * otherwise falls back to Blob URL + dynamic import() (browser context).
   *
   * @param bundle - The JavaScript source code
   * @returns The imported module object
   */
  private async evaluateBundle(bundle: string): Promise<Record<string, unknown>> {
    if (this.deps.bundleEvaluator) {
      return this.deps.bundleEvaluator(bundle);
    }

    // Default: browser-based evaluation via Blob URL + dynamic import()
    const blob = new Blob([bundle], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    try {
      const module = await import(/* @vite-ignore */ url);
      return module as Record<string, unknown>;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Create a timeout promise that rejects after the specified duration.
   *
   * @param ms - Timeout in milliseconds
   * @param pluginId - Plugin ID for error messages
   * @returns A promise that rejects with a timeout error
   */
  private createTimeout(ms: number, pluginId: string): Promise<never> {
    return new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`onload() timed out after ${ms}ms for plugin "${pluginId}"`));
      }, ms);
    });
  }

  /**
   * Update the internal status of a plugin and notify via callback.
   *
   * @param pluginId - The plugin to update
   * @param status - New status
   * @param manifest - Plugin manifest (for creating/updating the record)
   * @param error - Optional error message
   */
  private setStatus(
    pluginId: string,
    status: PluginLoaderStatus,
    _manifest: PluginManifest,
    error?: string
  ): void {
    const existing = this.plugins.get(pluginId);
    if (existing) {
      existing.status = status;
    }
    this.deps.onStatusChange(pluginId, status, error);
  }

  /**
   * Convert a PluginManifest (Zod-inferred) to PluginManifestData (minimal runtime type).
   */
  private toManifestData(manifest: PluginManifest): PluginManifestData {
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      minAppVersion: manifest.minAppVersion,
      author: manifest.author,
      description: manifest.description,
    };
  }
}
