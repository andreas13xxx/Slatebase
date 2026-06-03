/**
 * PluginSandbox — Proxy-based access control and resource management for plugins.
 *
 * Provides:
 * - Vault isolation: reject API calls with different vault ID
 * - Storage namespace isolation: prefix keys with `slatebase_plugin_<pluginId>_`, enforce 5 MB limit
 * - Network allowlist enforcement: intercept fetch/XMLHttpRequest
 * - Main-thread blocking detection (>5s → auto-deactivate)
 * - Deny-by-default permissions for new plugins
 * - Resource cleanup on deactivation (DOM elements, timers, event listeners, WebSockets)
 */

import type {
  IPluginSandbox,
  PluginPermissions,
  SandboxContext,
  TrackedResources,
} from './types';

/** Maximum storage size per plugin per storage type (5 MB) */
const MAX_STORAGE_SIZE_BYTES = 5 * 1024 * 1024;

/** Main-thread blocking threshold in milliseconds */
const BLOCKING_THRESHOLD_MS = 5000;

/** Heartbeat check interval in milliseconds */
const HEARTBEAT_INTERVAL_MS = 1000;

/**
 * Default permissions for new plugins (deny-by-default).
 */
export function createDefaultPermissions(): PluginPermissions {
  return {
    network: false,
    networkAllowlist: [],
    filesystemWrite: false,
    domManipulation: false,
  };
}

/**
 * PluginSandbox — Isolates plugin execution and monitors resource usage.
 */
export class PluginSandbox implements IPluginSandbox {
  private readonly contexts: Map<string, SandboxContext> = new Map();
  private readonly monitors: Map<string, number> = new Map();
  private readonly lastHeartbeats: Map<string, number> = new Map();
  private readonly vaultId: string;
  private readonly onAutoDeactivate: (pluginId: string, reason: string) => void;

  /**
   * @param vaultId - The vault ID this sandbox is bound to
   * @param onAutoDeactivate - Callback when a plugin is auto-deactivated (e.g., main-thread blocking)
   */
  constructor(
    vaultId: string,
    onAutoDeactivate: (pluginId: string, reason: string) => void
  ) {
    this.vaultId = vaultId;
    this.onAutoDeactivate = onAutoDeactivate;
  }

  /**
   * Create a sandboxed execution context for a plugin.
   */
  createContext(pluginId: string, permissions: PluginPermissions): SandboxContext {
    const trackedResources: TrackedResources = {
      timers: new Set(),
      domElements: new Set(),
      eventListeners: [],
      websockets: new Set(),
    };

    const context: SandboxContext = {
      pluginId,
      vaultId: this.vaultId,
      storagePrefix: `slatebase_plugin_${pluginId}_`,
      permissions,
      trackedResources,
    };

    this.contexts.set(pluginId, context);
    return context;
  }

  /**
   * Start monitoring for main-thread blocking.
   * Uses a heartbeat interval — if the gap between checks exceeds 5s, the plugin is blocking.
   */
  startMonitoring(pluginId: string): void {
    if (this.monitors.has(pluginId)) {
      return;
    }

    this.lastHeartbeats.set(pluginId, Date.now());

    const intervalId = window.setInterval(() => {
      const lastBeat = this.lastHeartbeats.get(pluginId);
      if (lastBeat === undefined) {
        return;
      }

      const now = Date.now();
      const elapsed = now - lastBeat;

      if (elapsed > BLOCKING_THRESHOLD_MS) {
        // Main-thread was blocked for >5s
        this.stopMonitoring(pluginId);
        this.onAutoDeactivate(
          pluginId,
          `Plugin "${pluginId}" blocked the main thread for more than 5 seconds`
        );
        return;
      }

      this.lastHeartbeats.set(pluginId, now);
    }, HEARTBEAT_INTERVAL_MS);

    this.monitors.set(pluginId, intervalId);
  }

  /**
   * Stop monitoring for a plugin.
   */
  stopMonitoring(pluginId: string): void {
    const intervalId = this.monitors.get(pluginId);
    if (intervalId !== undefined) {
      window.clearInterval(intervalId);
      this.monitors.delete(pluginId);
    }
    this.lastHeartbeats.delete(pluginId);
  }

  /**
   * Cleanup ALL tracked resources for a plugin regardless of exceptions.
   * Removes DOM elements, clears timers, removes event listeners, closes WebSockets.
   */
  cleanup(pluginId: string): void {
    const context = this.contexts.get(pluginId);
    if (!context) {
      return;
    }

    const { trackedResources } = context;

    // Clear all tracked timers
    for (const timerId of trackedResources.timers) {
      try {
        window.clearTimeout(timerId);
        window.clearInterval(timerId);
      } catch {
        // Ignore errors during cleanup
      }
    }
    trackedResources.timers.clear();

    // Remove all tracked DOM elements
    for (const element of trackedResources.domElements) {
      try {
        element.remove();
      } catch {
        // Ignore errors during cleanup
      }
    }
    trackedResources.domElements.clear();

    // Remove all tracked event listeners
    for (const { target, event, listener } of trackedResources.eventListeners) {
      try {
        target.removeEventListener(event, listener);
      } catch {
        // Ignore errors during cleanup
      }
    }
    trackedResources.eventListeners.length = 0;

    // Close all tracked WebSockets
    for (const ws of trackedResources.websockets) {
      try {
        ws.close();
      } catch {
        // Ignore errors during cleanup
      }
    }
    trackedResources.websockets.clear();

    // Stop monitoring
    this.stopMonitoring(pluginId);

    // Remove context
    this.contexts.delete(pluginId);
  }

  /**
   * Validate that an API call targets the correct vault.
   * Throws if the vault ID doesn't match.
   */
  validateVaultAccess(pluginId: string, targetVaultId: string): void {
    if (targetVaultId !== this.vaultId) {
      throw new Error(
        `Security violation: Plugin "${pluginId}" attempted to access vault "${targetVaultId}" but is bound to vault "${this.vaultId}"`
      );
    }
  }

  /**
   * Create a proxied localStorage/sessionStorage that enforces namespace isolation and size limits.
   */
  createStorageProxy(pluginId: string, storage: Storage): Storage {
    const context = this.contexts.get(pluginId);
    if (!context) {
      throw new Error(`No sandbox context found for plugin "${pluginId}"`);
    }

    const prefix = context.storagePrefix;

    return new Proxy(storage, {
      get(target, prop: string | symbol) {
        if (prop === 'getItem') {
          return (key: string): string | null => {
            return target.getItem(`${prefix}${key}`);
          };
        }

        if (prop === 'setItem') {
          return (key: string, value: string): void => {
            const prefixedKey = `${prefix}${key}`;

            // Check size limit: calculate total storage used by this plugin
            // Use string byte length (UTF-8 encoded) for size estimation
            const currentSize = calculatePluginStorageSize(target, prefix);
            const newValueSize = getStringByteLength(value);
            const existingValue = target.getItem(prefixedKey);
            const existingSize = existingValue ? getStringByteLength(existingValue) : 0;
            const projectedSize = currentSize - existingSize + newValueSize;

            if (projectedSize > MAX_STORAGE_SIZE_BYTES) {
              throw new DOMException(
                `Storage quota exceeded for plugin "${pluginId}": limit is 5 MB per storage type`,
                'QuotaExceededError'
              );
            }

            target.setItem(prefixedKey, value);
          };
        }

        if (prop === 'removeItem') {
          return (key: string): void => {
            target.removeItem(`${prefix}${key}`);
          };
        }

        if (prop === 'key') {
          return (index: number): string | null => {
            // Only return keys belonging to this plugin
            const pluginKeys = getPluginKeys(target, prefix);
            const key = pluginKeys[index];
            return key !== undefined ? key.slice(prefix.length) : null;
          };
        }

        if (prop === 'length') {
          return getPluginKeys(target, prefix).length;
        }

        if (prop === 'clear') {
          return (): void => {
            // Only clear keys belonging to this plugin
            const pluginKeys = getPluginKeys(target, prefix);
            for (const key of pluginKeys) {
              target.removeItem(key);
            }
          };
        }

        // For other properties, pass through to original
        const value = Reflect.get(target, prop);
        if (typeof value === 'function') {
          return value.bind(target);
        }
        return value;
      },
    });
  }

  /**
   * Create a proxied fetch function that enforces network allowlist.
   */
  createFetchProxy(pluginId: string): typeof fetch {
    const context = this.contexts.get(pluginId);
    if (!context) {
      throw new Error(`No sandbox context found for plugin "${pluginId}"`);
    }

    const { permissions } = context;

    return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      // Block if no network permission
      if (!permissions.network) {
        return Promise.reject(
          new Error(
            `Network access denied for plugin "${pluginId}": no network permission granted`
          )
        );
      }

      // Extract URL from input
      const url = extractUrl(input);
      if (!url) {
        return Promise.reject(
          new Error(`Invalid request URL for plugin "${pluginId}"`)
        );
      }

      // Check domain against allowlist
      const domain = extractDomain(url);
      if (!domain) {
        return Promise.reject(
          new Error(`Cannot determine domain for URL "${url}" in plugin "${pluginId}"`)
        );
      }

      if (!isDomainAllowed(domain, permissions.networkAllowlist)) {
        return Promise.reject(
          new Error(
            `Network request to "${domain}" blocked for plugin "${pluginId}": domain not in allowlist`
          )
        );
      }

      // Allowed — pass through to real fetch
      return fetch(input, init);
    };
  }

  /**
   * Create a proxied XMLHttpRequest constructor that enforces network allowlist.
   */
  createXHRProxy(pluginId: string): typeof XMLHttpRequest {
    const context = this.contexts.get(pluginId);
    if (!context) {
      throw new Error(`No sandbox context found for plugin "${pluginId}"`);
    }

    const { permissions } = context;
    const sandbox = this;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const ProxiedXHR = class extends XMLHttpRequest {
      private _blockedUrl: string | null = null;

      open(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null): void {
        // Block if no network permission
        if (!permissions.network) {
          this._blockedUrl = String(url);
          return;
        }

        const urlStr = String(url);
        const domain = extractDomain(urlStr);

        if (domain && !isDomainAllowed(domain, permissions.networkAllowlist)) {
          this._blockedUrl = urlStr;
          return;
        }

        // If the lint tool complains about unused var, that's fine — `sandbox` is used for context
        void sandbox;

        if (async === undefined) {
          super.open(method, url);
        } else {
          super.open(method, url, async, username ?? undefined, password ?? undefined);
        }
      }

      send(body?: Document | XMLHttpRequestBodyInit | null): void {
        if (this._blockedUrl !== null) {
          // Simulate a network error for blocked requests
          const errorEvent = new ProgressEvent('error');
          this.dispatchEvent(errorEvent);
          if (this.onerror) {
            this.onerror(errorEvent);
          }
          return;
        }
        super.send(body);
      }
    };

    return ProxiedXHR as unknown as typeof XMLHttpRequest;
  }

  /**
   * Wrap setTimeout to track timer IDs for cleanup.
   */
  createSetTimeoutProxy(pluginId: string): typeof setTimeout {
    const context = this.contexts.get(pluginId);
    if (!context) {
      throw new Error(`No sandbox context found for plugin "${pluginId}"`);
    }

    return ((handler: TimerHandler, timeout?: number, ...args: unknown[]): number => {
      const id = window.setTimeout(handler, timeout, ...args);
      context.trackedResources.timers.add(id);
      return id;
    }) as unknown as typeof setTimeout;
  }

  /**
   * Wrap setInterval to track timer IDs for cleanup.
   */
  createSetIntervalProxy(pluginId: string): typeof setInterval {
    const context = this.contexts.get(pluginId);
    if (!context) {
      throw new Error(`No sandbox context found for plugin "${pluginId}"`);
    }

    return ((handler: TimerHandler, timeout?: number, ...args: unknown[]): number => {
      const id = window.setInterval(handler, timeout, ...args);
      context.trackedResources.timers.add(id);
      return id;
    }) as unknown as typeof setInterval;
  }

  /**
   * Track a DOM element created by a plugin for cleanup on deactivation.
   */
  trackDomElement(pluginId: string, element: Element): void {
    const context = this.contexts.get(pluginId);
    if (context) {
      context.trackedResources.domElements.add(element);
    }
  }

  /**
   * Track an event listener added by a plugin for cleanup on deactivation.
   */
  trackEventListener(
    pluginId: string,
    target: EventTarget,
    event: string,
    listener: EventListenerOrEventListenerObject
  ): void {
    const context = this.contexts.get(pluginId);
    if (context) {
      context.trackedResources.eventListeners.push({ target, event, listener });
    }
  }

  /**
   * Track a WebSocket instance opened by a plugin for cleanup on deactivation.
   */
  trackWebSocket(pluginId: string, ws: WebSocket): void {
    const context = this.contexts.get(pluginId);
    if (context) {
      context.trackedResources.websockets.add(ws);
    }
  }

  /**
   * Get the sandbox context for a plugin (if it exists).
   */
  getContext(pluginId: string): SandboxContext | undefined {
    return this.contexts.get(pluginId);
  }

  /**
   * Get the vault ID this sandbox is bound to.
   */
  getVaultId(): string {
    return this.vaultId;
  }
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

/**
 * Calculate total storage size used by a plugin (all keys with the given prefix).
 */
function calculatePluginStorageSize(storage: Storage, prefix: string): number {
  let totalSize = 0;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(prefix)) {
      const value = storage.getItem(key);
      if (value) {
        totalSize += getStringByteLength(value);
      }
    }
  }
  return totalSize;
}

/**
 * Get the byte length of a string (UTF-8 encoding estimation).
 * This is used instead of Blob for compatibility with test environments.
 */
function getStringByteLength(str: string): number {
  // For ASCII-only strings (common case), length === byte length
  // For full accuracy with Unicode, use TextEncoder
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).byteLength;
  }
  // Fallback: assume 1 byte per char (valid for ASCII)
  return str.length;
}

/**
 * Get all storage keys belonging to a plugin.
 */
function getPluginKeys(storage: Storage, prefix: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(prefix)) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Extract URL string from fetch input.
 */
function extractUrl(input: RequestInfo | URL): string | null {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  if (input instanceof Request) {
    return input.url;
  }
  return null;
}

/**
 * Extract domain from a URL string.
 */
function extractDomain(url: string): string | null {
  try {
    // Handle relative URLs by providing a base
    const parsed = new URL(url, 'https://placeholder.invalid');
    // If it was a relative URL (using our placeholder), it's not a network request
    if (parsed.hostname === 'placeholder.invalid') {
      return null;
    }
    return parsed.hostname;
  } catch {
    return null;
  }
}

/**
 * Check if a domain is in the allowlist.
 * Supports exact match and wildcard subdomain match (e.g., "*.example.com").
 */
function isDomainAllowed(domain: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) {
    return false;
  }

  const normalizedDomain = domain.toLowerCase();

  for (const entry of allowlist) {
    const normalizedEntry = entry.toLowerCase();

    // Exact match
    if (normalizedDomain === normalizedEntry) {
      return true;
    }

    // Wildcard subdomain match: *.example.com matches sub.example.com
    if (normalizedEntry.startsWith('*.')) {
      const baseDomain = normalizedEntry.slice(2);
      if (normalizedDomain === baseDomain || normalizedDomain.endsWith(`.${baseDomain}`)) {
        return true;
      }
    }
  }

  return false;
}
