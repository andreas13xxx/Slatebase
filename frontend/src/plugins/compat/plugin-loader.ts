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
 * CSP: Plugin bundles are executed via Blob URL + dynamic import() (see evaluateBundle()).
 * This does NOT require 'unsafe-eval' in script-src. It DOES require 'blob:' in script-src
 * so the browser permits importing the generated blob: URL as a JavaScript module.
 * No eval() or new Function() is used anywhere in this module or in sandbox.ts.
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
import { Scope } from './obsidian-api-extensions';
// Interpolated (not imported!) into the wrappedBundle string template below —
// that string is Blob-URL-imported into the plugin's own module scope, which
// has no access to this file's imports. Keeping the storage key in one place
// still avoids a hardcoded 'slatebase_token' literal drifting out of sync.
import { STORAGE_KEY_TOKEN, STORAGE_KEY_CSRF } from '../../state/authContext';

// Populates the `window.obsidian` namespace that the injected
// `require('obsidian')` hands to every evaluated bundle. Called here rather than
// relied upon transitively, so the namespace is guaranteed complete no matter
// which entry point reaches the loader first. Idempotent.
import { installObsidianGlobals } from './install-globals';
import { withPluginContextAsync } from './plugin-execution-context';
import { containAsyncUnload, takePendingUnload } from './async-lifecycle';
import { createBrowserPathShim } from './browser-path-shim';
import { preloadAllBuiltInIcons } from './lucide-icons';
// Node's Buffer — plugins that bundle git/crypto tooling (e.g. obsidian-git's
// isomorphic-git dependency) reference it directly at module top level, not
// just inside onload(), so it must exist before the bundle evaluates.
import { Buffer } from 'buffer';

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
  /** Deactivate a plugin (calls onunload + cleanup); optionally suppresses the status callback for runtime-only unloads */
  deactivatePlugin(pluginId: string, notifyStatusChange?: boolean): Promise<void>;
  /** Deactivate and remove a plugin instance so a later enable evaluates a fresh bundle */
  unloadPlugin(pluginId: string, notifyStatusChange?: boolean): Promise<void>;
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

/**
 * How long deactivatePlugin() waits for an `async onunload()` to settle before
 * cleaning up anyway. Short: teardown that takes longer than this is hung, and
 * the vault switch waiting on it must not be.
 */
const ONUNLOAD_TIMEOUT_MS = 3_000;

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
    // The namespace must be complete before any bundle evaluates.
    installObsidianGlobals();
    (window as unknown as { __slatebasePath?: ReturnType<typeof createBrowserPathShim> }).__slatebasePath ??= createBrowserPathShim();
    (window as unknown as { Buffer?: typeof Buffer }).Buffer ??= Buffer;
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
      // Some plugins (e.g. Excalidraw) resolve icons once into a frozen
      // React tree at module top level via getIcon() — see
      // preloadAllBuiltInIcons's docs for why that needs the icon cache
      // warmed *before* the bundle's own code runs, not just before onload().
      await preloadAllBuiltInIcons();
      module = await this.evaluateBundle(bundle);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const bundleError = new BundleEvaluationError(pluginId, error);
      this.setStatus(pluginId, 'error', manifest, bundleError.message);
      console.error(`[PluginLoader] Plugin "${pluginId}" failed to evaluate:`, error);
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
      console.error(`[PluginLoader] Plugin "${pluginId}" has an invalid bundle:`, error.message);
      throw bundleError;
    }

    // Instantiate the plugin with the AppShim
    let instance: PluginInstance;
    try {
      const app = this.deps.appShimFactory(pluginId);
      const manifestData = this.toManifestData(manifest);
      // Obsidian instantiates plugins as `new Plugin(app, manifest)`. Passing
      // the manifest here (not just assigning it afterwards) is what makes it
      // visible to class-field initializers and constructor bodies, which is
      // where plugins commonly capture their own version.
      instance = new (PluginClass as new (app: IAppShim, manifest: PluginManifestData) => PluginInstance)(app, manifestData);
      // Re-assert it: a subclass constructor that skips `super(app, manifest)`
      // (or a bundler shim that drops the second argument) would otherwise
      // leave the instance without one.
      instance.manifest = manifestData;
      // Register the instance into app.plugins so `app.plugins.getPlugin(id)`
      // resolves — plugins commonly look themselves (or each other) up this way
      // to reach `.settings` (e.g. Excalidraw does this during its own onload).
      (app as unknown as { registerPlugin?: (id: string, inst: PluginInstance) => void }).registerPlugin?.(pluginId, instance);
      // Call post-instantiation hook (e.g. to wire addCommand to CommandRegistry)
      if (this.deps.onPluginInstantiated) {
        this.deps.onPluginInstantiated(pluginId, instance);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const bundleError = new BundleEvaluationError(pluginId, error);
      this.setStatus(pluginId, 'error', manifest, bundleError.message);
      console.error(`[PluginLoader] Plugin "${pluginId}" failed to instantiate:`, error);
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
      // Force-inject scope onto the instance right before onload — a real Scope
      // so `app.keymap.pushScope(this.scope)` (the standard Obsidian pattern for
      // view/plugin-local hotkeys) actually participates in dispatch, not just a
      // crash-guard. Kanban also accesses this.scope.keys directly during onload.
      // Set unconditionally — some bundlers' class field initializers may have
      // overwritten it to undefined during construction.
      (record.instance as unknown as { scope: Scope }).scope = new Scope();

      // Scoped so createEl() calls made during onload — including everything
      // after an internal `await` inside an async onload(), not just its first
      // synchronous chunk (see withPluginContextAsync) — and, via captured
      // pluginId on registered listeners/deferred callbacks, afterward too
      // (see plugin-execution-context.ts) get tagged with this plugin's id.
      const onloadPromise = withPluginContextAsync(pluginId, async () => {
        try {
          return await record.instance.onload();
        } catch (err) {
          console.error(`[PluginLoader] Plugin "${pluginId}" onload() rejected:`, err);
          throw err;
        }
      });

      // LiveSync (and similar plugins) do `void this._startUp()` in onload — fire-and-forget.
      // Add a temporary unhandledrejection listener to catch any async errors during startup.
      const startupErrors: Error[] = [];
      const rejectionHandler = (event: PromiseRejectionEvent) => {
        startupErrors.push(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
        console.error(`[PluginLoader] Unhandled rejection during "${pluginId}" startup:`, event.reason);
      };
      window.addEventListener('unhandledrejection', rejectionHandler);

      await Promise.race([
        onloadPromise,
        this.createTimeout(ONLOAD_TIMEOUT_MS, pluginId),
      ]);

      // Give async startup a moment to settle, then remove the listener
      await new Promise(resolve => setTimeout(resolve, 100));
      window.removeEventListener('unhandledrejection', rejectionHandler);

      // The plugin may have been unloaded while its asynchronous onload was
      // still pending (for example during a vault switch). Never resurrect it.
      if (this.plugins.get(pluginId) !== record || record.status === 'deactivated') {
        return;
      }

      record.status = 'active';
      this.deps.onStatusChange(pluginId, 'active');
      console.info(`[PluginLoader] Plugin "${pluginId}" activated`);
    } catch (err) {
      if (this.plugins.get(pluginId) !== record || record.status === 'deactivated') {
        return;
      }
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
   * @param notifyStatusChange - Whether to publish a persistent inactive status (false for runtime-only unloads)
   */
  async deactivatePlugin(pluginId: string, notifyStatusChange = true): Promise<void> {
    const record = this.plugins.get(pluginId);
    if (!record) {
      return; // Plugin not loaded, nothing to deactivate
    }

    // Prefer unload(): the Component/Plugin base class releases what it tracked
    // (registered cleanups, event refs, intervals, child components) and calls
    // onunload() itself. Calling onunload() directly would skip all of that.
    // Fall back for instances that only define onunload().
    const instance = record.instance as { unload?: () => unknown; onunload: () => unknown };
    try {
      if (typeof instance.unload === 'function') {
        // Component.unload() returns void but parks an async onunload() on the
        // instance for takePendingUnload() below (see async-lifecycle.ts).
        instance.unload();
      } else {
        containAsyncUnload(instance, pluginId, instance.onunload());
      }
    } catch (err) {
      console.error(
        `[PluginLoader] Plugin "${pluginId}" threw during onunload:`,
        err
      );
    }

    // A plugin that declared `async onunload()` is still tearing itself down
    // here. Wait for it — bounded, because a teardown that hangs must not
    // block a vault switch — so the sandbox cleanup below doesn't pull state
    // out from under work the plugin is still doing. Rejections are already
    // contained and logged by containAsyncUnload(); this never throws.
    const pendingUnload = takePendingUnload(instance);
    if (pendingUnload) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        pendingUnload,
        new Promise<void>(resolve => {
          timeoutId = setTimeout(() => {
            console.warn(
              `[PluginLoader] Plugin "${pluginId}" async onunload() did not settle within ${ONUNLOAD_TIMEOUT_MS}ms — continuing cleanup`
            );
            resolve();
          }, ONUNLOAD_TIMEOUT_MS);
        }),
      ]);
      // The loser of the race is never cancelled by Promise.race itself: leave
      // the timer running and a teardown that finished in time still gets a
      // "did not settle" warning three seconds later.
      if (timeoutId !== undefined) clearTimeout(timeoutId);
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

    // Remove from the shared plugins registry so a stale/unloaded instance
    // isn't returned by another plugin's `app.plugins.getPlugin(id)`.
    (window as unknown as { app?: { plugins?: { unregisterPlugin?: (id: string) => void } } })
      .app?.plugins?.unregisterPlugin?.(pluginId);

    record.status = 'deactivated';
    if (notifyStatusChange) {
      this.deps.onStatusChange(pluginId, 'deactivated');
    }
    console.info(`[PluginLoader] Plugin "${pluginId}" deactivated`);
  }

  /**
   * Deactivate and remove a plugin instance from the loader.
   * A later enable therefore evaluates the current bundle and creates a fresh instance.
   *
   * @param pluginId - The plugin to unload
   * @param notifyStatusChange - Whether to publish a persistent inactive status
   */
  async unloadPlugin(pluginId: string, notifyStatusChange = true): Promise<void> {
    if (!this.plugins.has(pluginId)) {
      return;
    }
    await this.deactivatePlugin(pluginId, notifyStatusChange);
    this.plugins.delete(pluginId);
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
    // Obsidian plugin bundles are CJS format (esbuild output) with require('obsidian').
    // We wrap the bundle in a CJS-to-ESM adapter that provides require() and module.exports.
    const wrappedBundle = `
if (typeof process === 'undefined') {
  // type: 'renderer' matters, not just cosmetic — real Obsidian desktop *is* an
  // Electron renderer process, and libraries bundled into plugins (e.g. obsidian-git's
  // vendored js-sha256) use \`process.type !== 'renderer'\` as their "genuine Node.js
  // main process" detection heuristic to pick a fast path that assumes real Node
  // builtins (Buffer, crypto). Without this, they wrongly take that path here — where
  // esbuild has already tree-shaken the underlying require('buffer')/require('crypto')
  // calls down to empty stubs at plugin-build time — and crash on the undefined result
  // (e.g. "Cannot read properties of undefined (reading 'from')") instead of falling
  // back to their universal/browser-safe implementation.
  var process = { platform: 'linux', env: {}, version: 'v22.0.0', versions: { node: '22.0.0' }, type: 'renderer', cwd: function() { return '/'; } };
}
if (typeof global === 'undefined') {
  var global = window;
}
if (typeof Buffer === 'undefined') {
  var Buffer = window.Buffer;
}
if (!window.__slatebaseOriginalFetch) {
  window.__slatebaseOriginalFetch = window.fetch.bind(window);
}
if (!window.__slatebaseProxyWarned) {
  window.__slatebaseProxyWarned = new Set();
}
if (!window.__slatebaseProxyFetch) {
  const __originalFetch = window.__slatebaseOriginalFetch;
  const __slatebaseToken = () => localStorage.getItem('${STORAGE_KEY_TOKEN}') || '';
  const __slatebaseCsrf = () => localStorage.getItem('${STORAGE_KEY_CSRF}') || '';
  function __isCrossOrigin(url) {
    try { return new URL(url, window.location.origin).origin !== window.location.origin; }
    catch { return false; }
  }
  async function __proxyFetch(url, method, headers, body, contentType) {
    const r = await __originalFetch('/api/v1/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + __slatebaseToken(), 'X-CSRF-Token': __slatebaseCsrf() },
      body: JSON.stringify({ url, method: method || 'GET', headers, body: typeof body === 'string' ? body : undefined, contentType })
    });
    const data = await r.json();
    const respStatus = data.status || 200;
    if (respStatus >= 400) {
      const warnKey = method + ' ' + url + ' ' + respStatus;
      if (!window.__slatebaseProxyWarned.has(warnKey)) {
        window.__slatebaseProxyWarned.add(warnKey);
        console.warn('[ProxyFetch] Proxied request failed:', method, url, 'status:', respStatus);
      }
    }
    if (!r.ok) {
      return new Response(JSON.stringify({ error: data.message || 'Proxy error' }), {
        status: respStatus,
        statusText: respStatus.toString(),
        headers: { 'Content-Type': 'application/json' }
      });
    }
    let respBody = null;
    const respHeaders = new Headers(data.headers || {});
    if (data.text !== undefined) { respBody = data.text; }
    else if (data.arrayBuffer) { const bin = atob(data.arrayBuffer); const bytes = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i); respBody = bytes.buffer; }
    return new Response(respBody, { status: respStatus, statusText: respStatus.toString(), headers: respHeaders });
  }
  window.__slatebaseProxyFetch = function(input, init) {
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : (input instanceof Request ? input.url : ''));
    if (url && __isCrossOrigin(url)) {
      // Merge init from Request object if input is a Request
      var effectiveInit = init || {};
      if (input instanceof Request) {
        if (!effectiveInit.method) effectiveInit.method = input.method;
        if (!effectiveInit.headers) {
          var rh = {};
          input.headers.forEach(function(v,k){ rh[k]=v; });
          effectiveInit.headers = rh;
        }
        if (!effectiveInit.body && input.body) {
          // Request body is a ReadableStream — read it
          return input.text().then(function(text) {
            effectiveInit.body = text;
            return window.__slatebaseProxyFetch(url, effectiveInit);
          });
        }
      }
      const method = (effectiveInit.method) ? effectiveInit.method.toUpperCase() : 'GET';
      const headers = {};
      if (effectiveInit.headers) {
        if (effectiveInit.headers instanceof Headers) { effectiveInit.headers.forEach(function(v,k){ headers[k]=v; }); }
        else if (typeof effectiveInit.headers === 'object') { Object.assign(headers, effectiveInit.headers); }
      }
      let body = undefined;
      if (effectiveInit.body != null) {
        if (typeof effectiveInit.body === 'string') { body = effectiveInit.body; }
        else if (effectiveInit.body instanceof ArrayBuffer) { body = btoa(String.fromCharCode.apply(null, new Uint8Array(effectiveInit.body))); }
        else if (effectiveInit.body instanceof Uint8Array) { body = btoa(String.fromCharCode.apply(null, effectiveInit.body)); }
        else if (effectiveInit.body instanceof Blob) {
          return effectiveInit.body.text().then(function(text) {
            const ct2 = headers['Content-Type'] || headers['content-type'] || undefined;
            return __proxyFetch(url, method, headers, text, ct2);
          });
        }
        else { body = String(effectiveInit.body); }
      }
      const ct = headers['Content-Type'] || headers['content-type'] || undefined;
      return __proxyFetch(url, method, headers, body, ct);
    }
    return __originalFetch(input, init);
  };
}
window.fetch = window.__slatebaseProxyFetch;
if (!window.__slatebaseXHRPatched) {
  window.__slatebaseXHRPatched = true;
  var __OriginalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    var xhr = new __OriginalXHR();
    var _url = '';
    var _method = 'GET';
    var _headers = {};
    var _async = true;
    var _origOpen = xhr.open.bind(xhr);
    var _origSend = xhr.send.bind(xhr);
    var _origSetHeader = xhr.setRequestHeader.bind(xhr);
    xhr.open = function(method, url, async) {
      _method = method;
      _url = typeof url === 'string' ? url : String(url);
      _async = async !== false;
      if (!__isCrossOrigin(_url)) {
        _origOpen.apply(xhr, arguments);
      }
    };
    xhr.setRequestHeader = function(name, value) {
      _headers[name] = value;
      if (!__isCrossOrigin(_url)) {
        _origSetHeader(name, value);
      }
    };
    xhr.send = function(body) {
      if (!__isCrossOrigin(_url)) {
        _origSend(body);
        return;
      }
      var bodyStr = (body && typeof body === 'string') ? body : undefined;
      var ct = _headers['Content-Type'] || _headers['content-type'] || undefined;
      __proxyFetch(_url, _method, _headers, bodyStr, ct).then(function(response) {
        Object.defineProperty(xhr, 'status', { value: response.status, writable: false, configurable: true });
        Object.defineProperty(xhr, 'statusText', { value: response.statusText || '', writable: false, configurable: true });
        Object.defineProperty(xhr, 'readyState', { value: 4, writable: false, configurable: true });
        response.text().then(function(text) {
          Object.defineProperty(xhr, 'responseText', { value: text, writable: false, configurable: true });
          Object.defineProperty(xhr, 'response', { value: text, writable: false, configurable: true });
          var headerLines = [];
          response.headers.forEach(function(v,k){ headerLines.push(k + ': ' + v); });
          Object.defineProperty(xhr, 'getAllResponseHeaders', { value: function(){ return headerLines.join('\\r\\n'); }, configurable: true });
          Object.defineProperty(xhr, 'getResponseHeader', { value: function(name){ var l = name.toLowerCase(); for(var i=0;i<headerLines.length;i++){ if(headerLines[i].toLowerCase().startsWith(l+':')) return headerLines[i].split(': ').slice(1).join(': '); } return null; }, configurable: true });
          if (xhr.onreadystatechange) xhr.onreadystatechange(new Event('readystatechange'));
          xhr.dispatchEvent(new Event('readystatechange'));
          var loadEvt = new ProgressEvent('load');
          if (xhr.onload) xhr.onload(loadEvt);
          xhr.dispatchEvent(loadEvt);
          var loadendEvt = new ProgressEvent('loadend');
          if (xhr.onloadend) xhr.onloadend(loadendEvt);
          xhr.dispatchEvent(loadendEvt);
        });
      }).catch(function(err) {
        console.error('[ProxyXHR] Error', _method, _url, err);
        Object.defineProperty(xhr, 'readyState', { value: 4, writable: false, configurable: true });
        var errEvt = new ProgressEvent('error');
        if (xhr.onerror) xhr.onerror(errEvt);
        xhr.dispatchEvent(errEvt);
      });
    };
    return xhr;
  };
  window.XMLHttpRequest.prototype = __OriginalXHR.prototype;
  window.XMLHttpRequest.UNSENT = 0;
  window.XMLHttpRequest.OPENED = 1;
  window.XMLHttpRequest.HEADERS_RECEIVED = 2;
  window.XMLHttpRequest.LOADING = 3;
  window.XMLHttpRequest.DONE = 4;
}
const module = { exports: {} };
const exports = module.exports;
const __requireWarnedModules = new Set();
const __requireStubGapsWarned = new Set();
// A plain {} for an unrecognized require() target is a crash trap: the first
// method call a plugin makes on it (e.g. require('fs').readFileSync(...))
// throws an uncaught TypeError, unlike every other unimplemented API in this
// app which is Proxy-protected and safely no-ops. This wraps the stub the
// same way, so an unavailable module degrades like everything else instead
// of being the one way a plugin can crash outright.
function __unknownModuleStub(id) {
  return new Proxy({}, {
    get: function(target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return target[prop];
      var key = id + '::' + String(prop);
      if (!__requireStubGapsWarned.has(key)) {
        __requireStubGapsWarned.add(key);
        console.warn('[PluginLoader] Plugin accessed "' + String(prop) + '" on unavailable module "' + id + '" — returning a no-op. Plugin features depending on this module will not work.');
      }
      return function() { return undefined; };
    }
  });
}
function require(id) {
  if (id === 'obsidian') {
    // The namespace is fully populated by the compat layer before any plugin
    // evaluates (see setting-tab.ts, which ends with registerFallbackShims()).
    return window.obsidian || {};
  }
  if (id === 'obsidian-daily-notes-interface') return window.__obsidianDailyNotesInterface || {};
  if (id === 'moment') return window.moment;
  if (id === 'path' || id === 'node:path') return window.__slatebasePath || {};
  if (id === 'buffer' || id === 'node:buffer') return { Buffer: window.Buffer };
  if (id === '@codemirror/state') return window.__codemirrorState || {};
  if (id === '@codemirror/view') return window.__codemirrorView || {};
  if (id === '@codemirror/language') return window.__codemirrorLanguage || {};
  if (id === '@codemirror/commands') return window.__codemirrorCommands || {};
  if (id === '@codemirror/autocomplete') return window.__codemirrorAutocomplete || {};
  if (id === '@codemirror/search') return window.__codemirrorSearch || {};
  if (id === '@codemirror/lint') return window.__codemirrorLint || {};
  // Folded into @codemirror/commands during the CM6 beta; the shim re-exports
  // the real history API under the legacy module name.
  if (id === '@codemirror/history') return window.__codemirrorHistory || {};
  if (id.startsWith('@codemirror/')) { if (!__requireWarnedModules.has(id)) { __requireWarnedModules.add(id); console.warn('[PluginLoader] Module "' + id + '" is not available — returning a safe stub. Plugin features using this module may not work.'); } return __unknownModuleStub(id); }
  if (id === '@lezer/common') return window.__lezerCommon || {};
  if (id === '@lezer/lr') return window.__lezerLr || {};
  if (id === '@lezer/highlight') return window.__lezerHighlight || {};
  if (id.startsWith('@lezer/')) { if (!__requireWarnedModules.has(id)) { __requireWarnedModules.add(id); console.warn('[PluginLoader] Module "' + id + '" is not available — returning a safe stub.'); } return __unknownModuleStub(id); }
  if (!__requireWarnedModules.has(id)) { __requireWarnedModules.add(id); console.warn('[PluginLoader] Unknown module "' + id + '" — returning a safe stub. Plugin features using this module will not work.'); }
  return __unknownModuleStub(id);
}
if (!window.CodeMirror) { window.CodeMirror = { defineMode: function(){}, defineMIME: function(){}, defineExtension: function(){}, defineOption: function(){}, registerHelper: function(){}, registerGlobalHelper: function(){}, modes: {}, mimeModes: {}, resolveMode: function(){return {};}, getMode: function(){return {token:function(){return null;}};}, Pass: {} }; }
if (!window.CodeMirrorAdapter) { window.CodeMirrorAdapter = { commands: {}, Vim: { defineAction: function(){}, handleEx: function(){}, enterInsertMode: function(){}, mapCommand: function(){} } }; }
${bundle}
export default module.exports.default || module.exports;
`;
    const blob = new Blob([wrappedBundle], { type: 'application/javascript' });
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
   * Convert a PluginManifest (Zod-inferred) to PluginManifestData (runtime type).
   *
   * Copies the manifest wholesale. Picking out a fixed field list dropped
   * everything else the manifest declares — authorUrl, fundingUrl, helpUrl,
   * isDesktopOnly — even though both manifest schemas use `.passthrough()`
   * specifically to keep those fields around for the plugin to read.
   */
  private toManifestData(manifest: PluginManifest): PluginManifestData {
    return {
      ...manifest,
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
    };
  }
}
