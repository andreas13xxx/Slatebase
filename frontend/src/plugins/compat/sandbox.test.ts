import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PluginSandbox, createDefaultPermissions } from './sandbox';
import type { PluginPermissions } from './types';

describe('PluginSandbox', () => {
  let sandbox: PluginSandbox;
  let deactivateCalls: Array<{ pluginId: string; reason: string }>;

  beforeEach(() => {
    deactivateCalls = [];
    sandbox = new PluginSandbox('vault-123', (pluginId, reason) => {
      deactivateCalls.push({ pluginId, reason });
    });
  });

  afterEach(() => {
    // Cleanup any remaining monitors
    sandbox.cleanup('test-plugin');
  });

  describe('createDefaultPermissions', () => {
    it('returns deny-by-default permissions', () => {
      const perms = createDefaultPermissions();
      expect(perms.network).toBe(false);
      expect(perms.networkAllowlist).toEqual([]);
      expect(perms.filesystemWrite).toBe(false);
      expect(perms.domManipulation).toBe(false);
    });
  });

  describe('createContext', () => {
    it('creates a sandbox context with correct properties', () => {
      const permissions = createDefaultPermissions();
      const context = sandbox.createContext('my-plugin', permissions);

      expect(context.pluginId).toBe('my-plugin');
      expect(context.vaultId).toBe('vault-123');
      expect(context.storagePrefix).toBe('slatebase_plugin_my-plugin_');
      expect(context.permissions).toBe(permissions);
      expect(context.trackedResources.timers.size).toBe(0);
      expect(context.trackedResources.domElements.size).toBe(0);
      expect(context.trackedResources.eventListeners).toHaveLength(0);
      expect(context.trackedResources.websockets.size).toBe(0);
    });

    it('stores context retrievable via getContext', () => {
      const permissions = createDefaultPermissions();
      sandbox.createContext('my-plugin', permissions);

      const retrieved = sandbox.getContext('my-plugin');
      expect(retrieved).toBeDefined();
      expect(retrieved?.pluginId).toBe('my-plugin');
    });
  });

  describe('validateVaultAccess', () => {
    it('does not throw when vault ID matches', () => {
      sandbox.createContext('my-plugin', createDefaultPermissions());
      expect(() => sandbox.validateVaultAccess('my-plugin', 'vault-123')).not.toThrow();
    });

    it('throws when vault ID does not match', () => {
      sandbox.createContext('my-plugin', createDefaultPermissions());
      expect(() => sandbox.validateVaultAccess('my-plugin', 'other-vault')).toThrow(
        /Security violation.*other-vault.*vault-123/
      );
    });
  });

  describe('createStorageProxy', () => {
    let mockStorage: Storage;

    beforeEach(() => {
      const store: Record<string, string> = {};
      mockStorage = {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { for (const k of Object.keys(store)) delete store[k]; },
        key: (index: number) => Object.keys(store)[index] ?? null,
        get length() { return Object.keys(store).length; },
      };
    });

    it('prefixes keys on setItem and getItem', () => {
      sandbox.createContext('my-plugin', createDefaultPermissions());
      const proxy = sandbox.createStorageProxy('my-plugin', mockStorage);

      // Use the proxied methods
      const setItem = proxy.setItem as (key: string, value: string) => void;
      const getItem = proxy.getItem as (key: string) => string | null;

      setItem('foo', 'bar');
      expect(getItem('foo')).toBe('bar');

      // Verify it's stored with prefix in the underlying storage
      expect(mockStorage.getItem('slatebase_plugin_my-plugin_foo')).toBe('bar');
    });

    it('removeItem uses prefixed key', () => {
      sandbox.createContext('my-plugin', createDefaultPermissions());
      const proxy = sandbox.createStorageProxy('my-plugin', mockStorage);

      const setItem = proxy.setItem as (key: string, value: string) => void;
      const removeItem = proxy.removeItem as (key: string) => void;
      const getItem = proxy.getItem as (key: string) => string | null;

      setItem('key1', 'value1');
      removeItem('key1');
      expect(getItem('key1')).toBeNull();
    });

    it('clear only removes keys with the plugin prefix', () => {
      sandbox.createContext('my-plugin', createDefaultPermissions());
      const proxy = sandbox.createStorageProxy('my-plugin', mockStorage);

      // Put something in without prefix (another plugin's data)
      mockStorage.setItem('slatebase_plugin_other_key', 'other-value');
      mockStorage.setItem('unrelated_key', 'unrelated-value');

      const setItem = proxy.setItem as (key: string, value: string) => void;
      const clear = proxy.clear as () => void;

      setItem('mykey', 'myval');
      clear();

      // Plugin's key should be gone
      expect(mockStorage.getItem('slatebase_plugin_my-plugin_mykey')).toBeNull();
      // Other keys should remain
      expect(mockStorage.getItem('slatebase_plugin_other_key')).toBe('other-value');
      expect(mockStorage.getItem('unrelated_key')).toBe('unrelated-value');
    });

    it('throws QuotaExceededError when storage exceeds 5 MB', () => {
      sandbox.createContext('my-plugin', createDefaultPermissions());
      const proxy = sandbox.createStorageProxy('my-plugin', mockStorage);

      const setItem = proxy.setItem as (key: string, value: string) => void;

      // Create a string that exceeds 5 MB (5 MB + 1 byte)
      const largeValue = 'x'.repeat(5 * 1024 * 1024 + 1);

      expect(() => setItem('big', largeValue)).toThrow(/Storage quota exceeded/);
    });

    it('allows writes within the 5 MB limit', () => {
      sandbox.createContext('my-plugin', createDefaultPermissions());
      const proxy = sandbox.createStorageProxy('my-plugin', mockStorage);

      const setItem = proxy.setItem as (key: string, value: string) => void;
      const getItem = proxy.getItem as (key: string) => string | null;

      const value = 'x'.repeat(1000);
      setItem('small', value);
      expect(getItem('small')).toBe(value);
    });

    it('throws error when no context exists', () => {
      expect(() => sandbox.createStorageProxy('nonexistent', mockStorage)).toThrow(
        /No sandbox context found/
      );
    });
  });

  describe('createFetchProxy', () => {
    it('blocks all requests when network permission is false', async () => {
      sandbox.createContext('my-plugin', createDefaultPermissions());
      const proxiedFetch = sandbox.createFetchProxy('my-plugin');

      await expect(proxiedFetch('https://example.com/api')).rejects.toThrow(
        /Network access denied/
      );
    });

    it('blocks requests to domains not in allowlist', async () => {
      const permissions: PluginPermissions = {
        network: true,
        networkAllowlist: ['api.example.com'],
        filesystemWrite: false,
        domManipulation: false,
      };
      sandbox.createContext('my-plugin', permissions);
      const proxiedFetch = sandbox.createFetchProxy('my-plugin');

      await expect(proxiedFetch('https://evil.com/steal')).rejects.toThrow(
        /not in allowlist/
      );
    });

    it('allows requests to domains in the allowlist', async () => {
      const permissions: PluginPermissions = {
        network: true,
        networkAllowlist: ['api.example.com'],
        filesystemWrite: false,
        domManipulation: false,
      };
      sandbox.createContext('my-plugin', permissions);
      const proxiedFetch = sandbox.createFetchProxy('my-plugin');

      // Mock global fetch to verify it gets called
      const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
      vi.stubGlobal('fetch', mockFetch);

      await proxiedFetch('https://api.example.com/data');
      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/data', undefined);

      vi.unstubAllGlobals();
    });

    it('supports wildcard subdomain matching', async () => {
      const permissions: PluginPermissions = {
        network: true,
        networkAllowlist: ['*.example.com'],
        filesystemWrite: false,
        domManipulation: false,
      };
      sandbox.createContext('my-plugin', permissions);
      const proxiedFetch = sandbox.createFetchProxy('my-plugin');

      const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
      vi.stubGlobal('fetch', mockFetch);

      await proxiedFetch('https://sub.example.com/data');
      expect(mockFetch).toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('blocks empty allowlist even with network permission', async () => {
      const permissions: PluginPermissions = {
        network: true,
        networkAllowlist: [],
        filesystemWrite: false,
        domManipulation: false,
      };
      sandbox.createContext('my-plugin', permissions);
      const proxiedFetch = sandbox.createFetchProxy('my-plugin');

      await expect(proxiedFetch('https://any.com/api')).rejects.toThrow(
        /not in allowlist/
      );
    });
  });

  describe('createXHRProxy', () => {
    it('creates a proxied XMLHttpRequest constructor', () => {
      const permissions: PluginPermissions = {
        network: true,
        networkAllowlist: ['api.example.com'],
        filesystemWrite: false,
        domManipulation: false,
      };
      sandbox.createContext('my-plugin', permissions);
      const XHRProxy = sandbox.createXHRProxy('my-plugin');

      expect(XHRProxy).toBeDefined();
      expect(typeof XHRProxy).toBe('function');
    });
  });

  describe('Timer proxies', () => {
    it('createSetTimeoutProxy tracks timer IDs', () => {
      sandbox.createContext('test-plugin', createDefaultPermissions());
      const proxiedTimeout = sandbox.createSetTimeoutProxy('test-plugin');

      const id = proxiedTimeout(() => {}, 1000);
      const context = sandbox.getContext('test-plugin');
      expect(context?.trackedResources.timers.has(id)).toBe(true);

      // Cleanup
      clearTimeout(id);
    });

    it('createSetIntervalProxy tracks timer IDs', () => {
      sandbox.createContext('test-plugin', createDefaultPermissions());
      const proxiedInterval = sandbox.createSetIntervalProxy('test-plugin');

      const id = proxiedInterval(() => {}, 1000);
      const context = sandbox.getContext('test-plugin');
      expect(context?.trackedResources.timers.has(id)).toBe(true);

      // Cleanup
      clearInterval(id);
    });
  });

  describe('Resource tracking', () => {
    it('trackDomElement adds element to tracked resources', () => {
      sandbox.createContext('test-plugin', createDefaultPermissions());
      const element = document.createElement('div');
      sandbox.trackDomElement('test-plugin', element);

      const context = sandbox.getContext('test-plugin');
      expect(context?.trackedResources.domElements.has(element)).toBe(true);
    });

    it('trackEventListener adds listener to tracked resources', () => {
      sandbox.createContext('test-plugin', createDefaultPermissions());
      const target = new EventTarget();
      const listener = () => {};
      sandbox.trackEventListener('test-plugin', target, 'click', listener);

      const context = sandbox.getContext('test-plugin');
      expect(context?.trackedResources.eventListeners).toHaveLength(1);
      expect(context?.trackedResources.eventListeners[0]).toEqual({
        target,
        event: 'click',
        listener,
      });
    });

    it('trackWebSocket adds websocket to tracked resources', () => {
      sandbox.createContext('test-plugin', createDefaultPermissions());
      // Create a mock WebSocket
      const mockWs = { close: vi.fn() } as unknown as WebSocket;
      sandbox.trackWebSocket('test-plugin', mockWs);

      const context = sandbox.getContext('test-plugin');
      expect(context?.trackedResources.websockets.has(mockWs)).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('clears all tracked timers', () => {
      sandbox.createContext('test-plugin', createDefaultPermissions());
      const proxiedTimeout = sandbox.createSetTimeoutProxy('test-plugin');
      const proxiedInterval = sandbox.createSetIntervalProxy('test-plugin');

      proxiedTimeout(() => {}, 10000);
      proxiedInterval(() => {}, 10000);

      const context = sandbox.getContext('test-plugin');
      expect(context?.trackedResources.timers.size).toBe(2);

      sandbox.cleanup('test-plugin');

      // Context should be removed
      expect(sandbox.getContext('test-plugin')).toBeUndefined();
    });

    it('removes all tracked DOM elements', () => {
      sandbox.createContext('test-plugin', createDefaultPermissions());

      const parent = document.createElement('div');
      const child = document.createElement('span');
      parent.appendChild(child);
      document.body.appendChild(parent);

      sandbox.trackDomElement('test-plugin', child);
      sandbox.cleanup('test-plugin');

      expect(parent.contains(child)).toBe(false);

      // Clean up parent
      document.body.removeChild(parent);
    });

    it('removes all tracked event listeners', () => {
      sandbox.createContext('test-plugin', createDefaultPermissions());

      const target = document.createElement('div');
      const listener = vi.fn();
      target.addEventListener('click', listener);
      sandbox.trackEventListener('test-plugin', target, 'click', listener);

      sandbox.cleanup('test-plugin');

      // Listener should be removed — dispatching event should not call it
      target.dispatchEvent(new Event('click'));
      expect(listener).not.toHaveBeenCalled();
    });

    it('closes all tracked WebSockets', () => {
      sandbox.createContext('test-plugin', createDefaultPermissions());

      const mockWs = { close: vi.fn() } as unknown as WebSocket;
      sandbox.trackWebSocket('test-plugin', mockWs);

      sandbox.cleanup('test-plugin');

      expect(mockWs.close).toHaveBeenCalled();
    });

    it('does nothing when plugin has no context', () => {
      // Should not throw
      expect(() => sandbox.cleanup('nonexistent')).not.toThrow();
    });

    it('removes the context after cleanup', () => {
      sandbox.createContext('test-plugin', createDefaultPermissions());
      sandbox.cleanup('test-plugin');
      expect(sandbox.getContext('test-plugin')).toBeUndefined();
    });

    it('stops monitoring when cleaning up', () => {
      sandbox.createContext('test-plugin', createDefaultPermissions());
      sandbox.startMonitoring('test-plugin');
      sandbox.cleanup('test-plugin');

      // No auto-deactivate should fire after cleanup
      // Wait a bit to ensure the monitor is gone
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(deactivateCalls).toHaveLength(0);
          resolve();
        }, 100);
      });
    });
  });

  describe('startMonitoring / stopMonitoring', () => {
    it('starts monitoring without errors', () => {
      sandbox.createContext('test-plugin', createDefaultPermissions());
      expect(() => sandbox.startMonitoring('test-plugin')).not.toThrow();
      sandbox.stopMonitoring('test-plugin');
    });

    it('stopMonitoring does not throw for unmonitored plugins', () => {
      expect(() => sandbox.stopMonitoring('nonexistent')).not.toThrow();
    });

    it('does not start duplicate monitors', () => {
      sandbox.createContext('test-plugin', createDefaultPermissions());
      sandbox.startMonitoring('test-plugin');
      sandbox.startMonitoring('test-plugin'); // Should be a no-op
      sandbox.stopMonitoring('test-plugin');
    });
  });

  describe('getVaultId', () => {
    it('returns the vault ID', () => {
      expect(sandbox.getVaultId()).toBe('vault-123');
    });
  });
});
