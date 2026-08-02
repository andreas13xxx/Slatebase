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
      // Force-inject scope onto the instance right before onload.
      // Kanban accesses this.scope.keys() during onload.
      // Set unconditionally — some bundlers' class field initializers may have
      // overwritten it to undefined during construction.
      (record.instance as unknown as Record<string, unknown>).scope = {
        keys: [] as unknown[],
        register: () => ({}),
        unregister: () => {},
      };

      const onloadResult = record.instance.onload();
      const onloadPromise = onloadResult instanceof Promise
        ? onloadResult
        : Promise.resolve();

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
    if (notifyStatusChange) {
      this.deps.onStatusChange(pluginId, 'deactivated');
    }
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
  var process = { platform: 'linux', env: {}, version: 'v22.0.0', versions: { node: '22.0.0' }, cwd: function() { return '/'; } };
}
if (!window.__slatebaseOriginalFetch) {
  window.__slatebaseOriginalFetch = window.fetch.bind(window);
}
if (!window.__slatebaseProxyFetch) {
  const __originalFetch = window.__slatebaseOriginalFetch;
  const __slatebaseToken = () => localStorage.getItem('slatebase_token') || '';
  const __slatebaseCsrf = () => localStorage.getItem('slatebase_csrf') || '';
  function __isCrossOrigin(url) {
    try { return new URL(url, window.location.origin).origin !== window.location.origin; }
    catch { return false; }
  }
  async function __proxyFetch(url, method, headers, body, contentType) {
    console.log('[ProxyFetch] >>>', method, url);
    const r = await __originalFetch('/api/v1/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + __slatebaseToken(), 'X-CSRF-Token': __slatebaseCsrf() },
      body: JSON.stringify({ url, method: method || 'GET', headers, body: typeof body === 'string' ? body : undefined, contentType })
    });
    const data = await r.json();
    const respStatus = data.status || 200;
    console.log('[ProxyFetch] <<<', method, url, 'status:', respStatus);
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
      console.log('[ProxyXHR] >>>', _method, _url);
      __proxyFetch(_url, _method, _headers, bodyStr, ct).then(function(response) {
        console.log('[ProxyXHR] <<<', _method, _url, 'status:', response.status);
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
function require(id) {
  if (id === 'obsidian') {
    const obs = window.obsidian || {};
    if (!obs.EditorSuggest) {
      obs.EditorSuggest = class EditorSuggest { constructor() { this.scope = { keys: [], register(){return {}}, unregister(){} }; this.suggestEl = document.createElement('div'); } };
    }
    if (!obs.Component) {
      obs.Component = class Component { load(){} unload(){} onload(){} onunload(){} addChild(c){return c} removeChild(c){return c} register(){} registerEvent(){} registerInterval(id){return id} registerDomEvent(){} };
    }
    if (!obs.Plugin) {
      obs.Plugin = class Plugin extends obs.Component {
        constructor(app) { super(); this.app = app; this.manifest = {}; this.scope = { keys: [], register(){}, unregister(){} }; this._children = []; }
        onload(){} onunload(){} loadData(){ return Promise.resolve(null); } saveData(){ return Promise.resolve(); }
        addCommand(){} addSettingTab(){} registerEvent(){} registerView(){} registerEditorSuggest(){}
        registerHoverLinkSource(){} registerInterval(id){ return id; } registerDomEvent(el,ev,h){ el.addEventListener(ev,h); }
        register(){} addRibbonIcon(){ return document.createElement('div'); } addStatusBarItem(){ return document.createElement('div'); }
        addChild(c){ this._children.push(c); if(c&&c.load) c.load(); return c; }
        removeChild(c){ const i=this._children.indexOf(c); if(i>=0) this._children.splice(i,1); if(c&&c.unload) c.unload(); return c; }
        registerMarkdownPostProcessor(p){ return p; } registerMarkdownCodeBlockProcessor(){ return {}; }
        registerEditorExtension(){} registerExtensions(){} registerObsidianProtocolHandler(){} removeCommand(){} registerCliHandler(){}
      };
    }
    if (!obs.requireApiVersion) {
      obs.requireApiVersion = function() { return true; };
    }
    if (!obs.MarkdownRenderChild) {
      obs.MarkdownRenderChild = class MarkdownRenderChild extends obs.Component {
        constructor(containerEl) { super(); this.containerEl = containerEl; }
      };
    }
    if (!obs.ConfirmationModal) {
      obs.ConfirmationModal = class ConfirmationModal extends (obs.Modal || class { constructor(){} open(){} close(){} onOpen(){} onClose(){} }) {
        constructor(app) { super(app); }
      };
    }
    if (!obs.SettingPage) {
      obs.SettingPage = class SettingPage {
        constructor() { this.rootEl = document.createElement('div'); this.titlebarEl = document.createElement('div'); this.containerEl = document.createElement('div'); this.title = ''; }
        display(){} hide(){}
      };
    }
    if (!obs.Events) {
      obs.Events = class Events {
        constructor() { this._e = {}; }
        on(name, cb) { if (!this._e[name]) this._e[name] = []; this._e[name].push(cb); return { id: 0 }; }
        off(name, cb) { if (this._e[name]) this._e[name] = this._e[name].filter(f => f !== cb); }
        offref() {}
        trigger(name, ...args) { if (this._e[name]) this._e[name].forEach(cb => { try { cb(...args); } catch(e) { console.error(e); } }); }
        tryTrigger() {}
      };
    }
    if (!obs.Scope) {
      obs.Scope = class Scope {
        constructor() { this._h = []; }
        register(mods, key, func) { const h = { modifiers: mods, key, func }; this._h.push(h); return h; }
        unregister(h) { const i = this._h.indexOf(h); if (i >= 0) this._h.splice(i, 1); }
      };
    }
    if (!obs.Keymap) {
      obs.Keymap = class Keymap {
        static isModifier(evt, mod) { if (mod === 'Mod') return evt.metaKey || evt.ctrlKey; return false; }
        static isModEvent(evt) { if (!evt) return false; return (evt.metaKey || evt.ctrlKey) ? 'tab' : false; }
        pushScope() {} popScope() {}
      };
    }
    if (!obs.addIcon) obs.addIcon = function() {};
    if (!obs.setIcon) obs.setIcon = function(el) { return el; };
    if (!obs.getIcon) obs.getIcon = function() { return null; };
    if (!obs.getIconIds) obs.getIconIds = function() { return []; };
    if (!obs.removeIcon) obs.removeIcon = function() {};
    if (!obs.apiVersion) obs.apiVersion = '1.4.0';
    if (!obs.parseYaml) obs.parseYaml = function(s) { try { return JSON.parse(s); } catch { return {}; } };
    if (!obs.stringifyYaml) obs.stringifyYaml = function(o) { return JSON.stringify(o, null, 2); };
    if (!obs.parseLinktext) obs.parseLinktext = function(t) { const i = t.indexOf('#'); return i < 0 ? { path: t, subpath: '' } : { path: t.slice(0, i), subpath: t.slice(i) }; };
    if (!obs.getLinkpath) obs.getLinkpath = function(t) { const i = t.indexOf('#'); return i < 0 ? t : t.slice(0, i); };
    if (!obs.normalizePath) obs.normalizePath = function(p) { return p.replace(/\\\\/g,'/').replace(/\\/\\//g,'/').replace(/^\\//, ''); };
    if (!obs.htmlToMarkdown) obs.htmlToMarkdown = function(h) { return typeof h === 'string' ? h.replace(/<[^>]*>/g, '') : (h.textContent || ''); };
    if (!obs.sanitizeHTMLToDom) obs.sanitizeHTMLToDom = function(h) { const t = document.createElement('template'); t.innerHTML = h; return t.content; };
    if (!obs.getAllTags) obs.getAllTags = function(cache) { if (!cache) return null; var tags = []; if (cache.tags) { for (var i = 0; i < cache.tags.length; i++) { tags.push(cache.tags[i].tag); } } if (cache.frontmatter) { var fm = cache.frontmatter; var fmTags = fm.tags || fm.tag; if (Array.isArray(fmTags)) { for (var j = 0; j < fmTags.length; j++) { var t = fmTags[j]; tags.push(t.startsWith('#') ? t : '#' + t); } } else if (typeof fmTags === 'string') { fmTags.split(',').forEach(function(t) { t = t.trim(); if (t) tags.push(t.startsWith('#') ? t : '#' + t); }); } } return tags.length > 0 ? tags : null; };
    if (!obs.prepareFuzzySearch) obs.prepareFuzzySearch = function() { return function() { return null; }; };
    if (!obs.prepareSimpleSearch) obs.prepareSimpleSearch = function() { return function() { return null; }; };
    if (!obs.getFrontMatterInfo) obs.getFrontMatterInfo = function(c) { if (!c.startsWith('---')) return { exists: false, frontmatter: '', from: 0, to: 0, contentStart: 0 }; const e = c.indexOf('\\n---', 3); if (e < 0) return { exists: false, frontmatter: '', from: 0, to: 0, contentStart: 0 }; return { exists: true, frontmatter: c.slice(4, e), from: 4, to: e, contentStart: e + 4 }; };
    if (!obs.getLanguage) obs.getLanguage = function() { return (navigator.language || 'en').split('-')[0]; };
    if (!obs.debounce) obs.debounce = function(cb, timeout, resetTimer) { var timer = null; var debounced = function() { var args = arguments; var ctx = this; if (resetTimer && timer) { clearTimeout(timer); } if (!timer || resetTimer) { timer = setTimeout(function() { timer = null; cb.apply(ctx, args); }, timeout || 0); } }; debounced.cancel = function() { if (timer) { clearTimeout(timer); timer = null; } return debounced; }; debounced.run = function() { if (timer) { clearTimeout(timer); timer = null; return cb.apply(this, arguments); } }; return debounced; };
    if (!obs.BaseComponent) obs.BaseComponent = class BaseComponent { constructor(){} then(cb){cb(this);return this;} setDisabled(){return this;} };
    if (!obs.ValueComponent) obs.ValueComponent = class ValueComponent extends obs.BaseComponent { getValue(){} setValue(){return this;} registerOptionListener(){return this;} };
    if (!obs.MarkdownPreviewRenderer) obs.MarkdownPreviewRenderer = { registerPostProcessor(){}, unregisterPostProcessor(){}, createCodeBlockPostProcessor(){ return function(){}; } };
    if (!obs.MarkdownRenderer) obs.MarkdownRenderer = { render: async function(_app, md, el) { el.innerHTML = md.replace(/</g,'&lt;').replace(/>/g,'&gt;'); }, renderMarkdown: async function(md, el) { el.innerHTML = md.replace(/</g,'&lt;').replace(/>/g,'&gt;'); } };
    if (!obs.Notice) obs.Notice = class Notice { constructor(message, duration) { this.noticeEl = document.createElement('div'); this.noticeEl.isShown = () => this._shown; this.messageEl = document.createElement('div'); this.containerEl = document.createElement('div'); this._shown = true; const msg = typeof message === 'string' ? message : (message && message.textContent) || ''; if (window.__slatebaseShowNotice) window.__slatebaseShowNotice(msg, duration); } setMessage(message) { const msg = typeof message === 'string' ? message : (message && message.textContent) || ''; if (window.__slatebaseShowNotice) window.__slatebaseShowNotice(msg); return this; } hide() { this._shown = false; } isShown() { return this._shown; } };
    if (!obs.requestUrl) obs.requestUrl = function(params) { const opts = typeof params === 'string' ? { url: params } : params; const token = localStorage.getItem('slatebase_token') || ''; const csrf = localStorage.getItem('slatebase_csrf') || ''; const p = fetch('/api/v1/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'X-CSRF-Token': csrf }, body: JSON.stringify({ url: opts.url, method: opts.method || 'GET', headers: opts.headers, body: opts.body ? (typeof opts.body === 'string' ? opts.body : btoa(String.fromCharCode(...new Uint8Array(opts.body)))) : undefined, contentType: opts.contentType }) }).then(async function(r) { const data = await r.json(); if (!r.ok) throw new Error(data.message || 'Proxy request failed'); const result = { status: data.status, headers: data.headers || {} }; if (data.text !== undefined) { result.text = data.text; try { result.json = JSON.parse(data.text); } catch(e) { result.json = null; } result.arrayBuffer = new TextEncoder().encode(data.text).buffer; } else if (data.arrayBuffer) { const bin = atob(data.arrayBuffer); const bytes = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i); result.arrayBuffer = bytes.buffer; result.text = new TextDecoder().decode(bytes); try { result.json = JSON.parse(result.text); } catch(e) { result.json = null; } } console.log('[requestUrl]', opts.method || 'GET', opts.url, '->', result.status); return result; }); p.text = p.then(function(r){return r.text||''}); p.json = p.then(function(r){return r.json}); p.arrayBuffer = p.then(function(r){return r.arrayBuffer}); return p; };
    if (!obs.request) obs.request = function(params) { return obs.requestUrl(params).then(function(r) { return r.text || ''; }); };
    if (!obs.EditableFileView) obs.EditableFileView = obs.FileView || class {};
    if (!obs.MarkdownView) obs.MarkdownView = class MarkdownView { constructor(leaf) { this.leaf = leaf; this.editor = null; this.file = null; this.contentEl = document.createElement('div'); this.containerEl = document.createElement('div'); this.previewMode = { rerender(){} }; this.currentMode = { get(){ return ''; }, set(){} }; } getViewType(){ return 'markdown'; } getDisplayText(){ return this.file?.basename || 'Markdown'; } getMode(){ return 'source'; } getViewData(){ return this.editor?.getValue() || ''; } clear(){} setViewData(d){ if(this.editor) this.editor.setValue(d); } showSearch(){} };
    if (!obs.FileSystemAdapter) obs.FileSystemAdapter = class FileSystemAdapter { getName(){ return 'slatebase'; } getBasePath(){ return '/'; } getFullPath(p){ return p; } };
    if (!obs.AbstractInputSuggest) obs.AbstractInputSuggest = class { constructor(app, el) { this.app = app; this.textInputEl = el; } open(){} close(){} setValue(v){ if (this.textInputEl) this.textInputEl.value = v; } getValue(){ return this.textInputEl ? this.textInputEl.value : ''; } onSelect(){ return this; } };
    if (!obs.ExtraButtonComponent) obs.ExtraButtonComponent = class { constructor(el) { this.extraSettingsEl = document.createElement('div'); el.appendChild(this.extraSettingsEl); } setIcon(){ return this; } setTooltip(){ return this; } onClick(){ return this; } setDisabled(){ return this; } then(cb){ cb(this); return this; } };
    if (!obs.ColorComponent) obs.ColorComponent = class { constructor(el) { this.colorEl = document.createElement('input'); this.colorEl.type = 'color'; el.appendChild(this.colorEl); } getValue(){ return this.colorEl.value; } setValue(v){ this.colorEl.value = v; return this; } onChange(){ return this; } setDisabled(){ return this; } then(cb){ cb(this); return this; } };
    if (!obs.SearchComponent) obs.SearchComponent = class { constructor(el) { this.inputEl = document.createElement('input'); this.clearButtonEl = document.createElement('div'); el.appendChild(this.inputEl); } getValue(){ return this.inputEl.value; } setValue(v){ this.inputEl.value = v; return this; } setPlaceholder(p){ this.inputEl.placeholder = p; return this; } onChange(){ return this; } setDisabled(){ return this; } then(cb){ cb(this); return this; } };
    if (!obs.MomentFormatComponent) obs.MomentFormatComponent = class { constructor(el) { this.inputEl = document.createElement('input'); this.sampleEl = document.createElement('span'); el.appendChild(this.inputEl); } setDefaultFormat(){ return this; } setSampleEl(){ return this; } getValue(){ return this.inputEl.value; } setValue(v){ this.inputEl.value = v; return this; } onChange(){ return this; } then(cb){ cb(this); return this; } };
    if (!obs.ProgressBarComponent) obs.ProgressBarComponent = class { constructor(el) { this.progressEl = document.createElement('progress'); el.appendChild(this.progressEl); } getValue(){ return 0; } setValue(v){ this.progressEl.value = v; return this; } then(cb){ cb(this); return this; } };
    return obs;
  }
  if (id === 'obsidian-daily-notes-interface') return window.__obsidianDailyNotesInterface || {};
  if (id === 'moment') return window.moment;
  if (id === '@codemirror/state') return window.__codemirrorState || { StateField: { define: function(c) { return c; } }, StateEffect: { define: function() { return { of: function(v) { return { value: v }; } }; } }, Facet: { define: function() { return { of: function(){return {};}, compute: function(){return {};} }; } }, Prec: { highest: function(e){return e;}, high: function(e){return e;}, default: function(e){return e;}, low: function(e){return e;}, lowest: function(e){return e;} }, Compartment: class { of(e){return e;} reconfigure(e){return {effects:e};} }, RangeValue: class { eq(){return false;} }, RangeSet: { empty: {}, of: function(){return {};} }, EditorSelection: { single: function(a,h){return {anchor:a,head:h||a};}, cursor: function(p){return {anchor:p,head:p};} }, EditorState: { create: function(){return {};} }, Transaction: {} };
  if (id === '@codemirror/view') return window.__codemirrorView || { EditorView: { theme: function(){return {};}, baseTheme: function(){return {};}, domEventHandlers: function(){return {};}, updateListener: { of: function(){return {};} }, editable: { of: function(){return {};} }, decorations: { of: function(){return {};}, compute: function(){return {};} }, lineWrapping: {} }, ViewPlugin: { fromClass: function(){return {};}, define: function(){return {};} }, Decoration: { mark: function(){return {};}, widget: function(){return {};}, line: function(){return {};}, set: function(){return {};}, none: {} }, WidgetType: class { toDOM(){return document.createElement('span');} eq(){return false;} }, keymap: { of: function(){return {};} } };
  if (id === '@codemirror/language') return window.__codemirrorLanguage || { syntaxTree: function(){return {resolve:function(){return null;}};}, ensureSyntaxTree: function(){return null;}, StreamLanguage: { define: function(){return {};} }, LanguageSupport: class { constructor(){} }, syntaxHighlighting: function(){return {};}, indentUnit: { of: function(){return {};} } };
  if (id === '@codemirror/commands') return {};
  if (id === '@codemirror/autocomplete') return {};
  if (id === '@codemirror/search') return {};
  if (id === '@codemirror/lint') return {};
  if (id === '@codemirror/history') return {};
  if (id.startsWith('@codemirror/')) return {};
  if (id === '@lezer/common') return { Tree: class { constructor(){} static empty = {} }, NodeType: { none: {} }, NodeSet: class { constructor(){} }, Parser: class { parse(){ return {}; } } };
  if (id === '@lezer/lr') return { LRParser: { deserialize: function(spec) { return { configure: function(){ return this; }, parse: function(){ return {}; }, startParse: function(){ return { advance: function(){ return null; } }; } }; } } };
  if (id === '@lezer/highlight') return { tags: {}, Tag: { define: function(){ return {}; } }, styleTags: function(){ return {}; }, classHighlighter: {}, defaultHighlightStyle: {}, HighlightStyle: { define: function(){ return {}; } } };
  if (id.startsWith('@lezer/')) return {};
  console.warn('[PluginLoader] Unknown require:', id);
  return {};
}
if (!window.CodeMirror) { window.CodeMirror = { defineMode: function(){}, defineMIME: function(){}, defineExtension: function(){}, defineOption: function(){}, registerHelper: function(){}, registerGlobalHelper: function(){}, modes: {}, mimeModes: {}, resolveMode: function(){return {};}, getMode: function(){return {token:function(){return null;}};}, Pass: {} }; }
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
