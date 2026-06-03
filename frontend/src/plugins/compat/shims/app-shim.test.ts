import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppShim } from './app-shim';
import type {
  IVaultShim,
  IWorkspaceShim,
  IMetadataCacheShim,
  PluginInstance,
  TFile,
  TAbstractFile,
  EventRef,
  CachedMetadata,
} from '../types';

/** Creates a minimal mock VaultShim */
function createMockVaultShim(): IVaultShim {
  return {
    read: vi.fn().mockResolvedValue('content'),
    modify: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({ path: 'new.md', name: 'new.md', basename: 'new', extension: 'md', stat: { mtime: 0, ctime: 0, size: 0 }, parent: null }),
    delete: vi.fn().mockResolvedValue(undefined),
    getAbstractFileByPath: vi.fn().mockReturnValue(null),
    getMarkdownFiles: vi.fn().mockReturnValue([]),
    getFiles: vi.fn().mockReturnValue([]),
    getName: vi.fn().mockReturnValue('TestVault'),
    on: vi.fn().mockReturnValue({ id: '1', event: 'test', callback: () => {} }),
    off: vi.fn(),
    trigger: vi.fn(),
  };
}

/** Creates a minimal mock WorkspaceShim */
function createMockWorkspaceShim(): IWorkspaceShim {
  return {
    getActiveFile: vi.fn().mockReturnValue(null),
    on: vi.fn().mockReturnValue({ id: '1', event: 'test', callback: () => {} }),
    off: vi.fn(),
    trigger: vi.fn(),
  };
}

/** Creates a minimal mock MetadataCacheShim */
function createMockMetadataCacheShim(): IMetadataCacheShim {
  return {
    getFileCache: vi.fn().mockReturnValue(null),
    getFirstLinkpathDest: vi.fn().mockReturnValue(null),
    resolvedLinks: {},
    on: vi.fn().mockReturnValue({ id: '1', event: 'test', callback: () => {} }),
    off: vi.fn(),
    trigger: vi.fn(),
  };
}

/** Creates a minimal mock PluginInstance */
function createMockPluginInstance(id: string): PluginInstance {
  return {
    manifest: { id, name: `Plugin ${id}`, version: '1.0.0' },
    app: {} as unknown as PluginInstance['app'],
    onload: vi.fn(),
    onunload: vi.fn(),
    loadData: vi.fn().mockResolvedValue(null),
    saveData: vi.fn().mockResolvedValue(undefined),
    addCommand: vi.fn(),
    registerEvent: vi.fn(),
  };
}

describe('AppShim', () => {
  let vault: IVaultShim;
  let workspace: IWorkspaceShim;
  let metadataCache: IMetadataCacheShim;

  beforeEach(() => {
    vault = createMockVaultShim();
    workspace = createMockWorkspaceShim();
    metadataCache = createMockMetadataCacheShim();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should expose vault, workspace, metadataCache properties', () => {
      const app = new AppShim({ vault, workspace, metadataCache, pluginId: 'test-plugin' });

      expect(app.vault).toBe(vault);
      expect(app.workspace).toBe(workspace);
      expect(app.metadataCache).toBe(metadataCache);
    });

    it('should expose plugins property with empty initial state', () => {
      const app = new AppShim({ vault, workspace, metadataCache, pluginId: 'test-plugin' });

      expect(app.plugins.plugins).toEqual({});
      expect(app.plugins.enabledPlugins).toEqual(new Set());
      expect(app.plugins.getPlugin('nonexistent')).toBeUndefined();
    });
  });

  describe('plugins property', () => {
    it('should register a plugin', () => {
      const app = new AppShim({ vault, workspace, metadataCache, pluginId: 'test-plugin' });
      const plugin = createMockPluginInstance('my-plugin');

      app.registerPlugin('my-plugin', plugin);

      expect(app.plugins.plugins['my-plugin']).toBe(plugin);
      expect(app.plugins.enabledPlugins.has('my-plugin')).toBe(true);
      expect(app.plugins.getPlugin('my-plugin')).toBe(plugin);
    });

    it('should unregister a plugin', () => {
      const app = new AppShim({ vault, workspace, metadataCache, pluginId: 'test-plugin' });
      const plugin = createMockPluginInstance('my-plugin');

      app.registerPlugin('my-plugin', plugin);
      app.unregisterPlugin('my-plugin');

      expect(app.plugins.plugins['my-plugin']).toBeUndefined();
      expect(app.plugins.enabledPlugins.has('my-plugin')).toBe(false);
      expect(app.plugins.getPlugin('my-plugin')).toBeUndefined();
    });

    it('should handle multiple plugins', () => {
      const app = new AppShim({ vault, workspace, metadataCache, pluginId: 'test-plugin' });
      const pluginA = createMockPluginInstance('plugin-a');
      const pluginB = createMockPluginInstance('plugin-b');

      app.registerPlugin('plugin-a', pluginA);
      app.registerPlugin('plugin-b', pluginB);

      expect(app.plugins.enabledPlugins.size).toBe(2);
      expect(app.plugins.getPlugin('plugin-a')).toBe(pluginA);
      expect(app.plugins.getPlugin('plugin-b')).toBe(pluginB);
    });

    it('should handle unregistering a non-existent plugin gracefully', () => {
      const app = new AppShim({ vault, workspace, metadataCache, pluginId: 'test-plugin' });

      expect(() => app.unregisterPlugin('nonexistent')).not.toThrow();
    });
  });

  describe('Proxy-based non-emulated access', () => {
    it('should return no-op function for non-emulated property access', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const app = AppShim.create({ vault, workspace, metadataCache, pluginId: 'test-plugin' });

      const result = (app as Record<string, unknown>)['someUnknownProp'];

      expect(typeof result).toBe('function');
      expect((result as () => unknown)()).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('test-plugin')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('someUnknownProp')
      );
    });

    it('should log warning only once per property name', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const app = AppShim.create({ vault, workspace, metadataCache, pluginId: 'test-plugin' });

      // Access same property multiple times
      (app as Record<string, unknown>)['unknownMethod'];
      (app as Record<string, unknown>)['unknownMethod'];
      (app as Record<string, unknown>)['unknownMethod'];

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('should log separate warnings for different property names', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const app = AppShim.create({ vault, workspace, metadataCache, pluginId: 'test-plugin' });

      (app as Record<string, unknown>)['propA'];
      (app as Record<string, unknown>)['propB'];

      expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    it('should not log warnings for emulated properties', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const app = AppShim.create({ vault, workspace, metadataCache, pluginId: 'test-plugin' });

      // Access emulated properties
      const v = app.vault;
      const w = app.workspace;
      const mc = app.metadataCache;
      const p = app.plugins;

      expect(warnSpy).not.toHaveBeenCalled();
      expect(v).toBe(vault);
      expect(w).toBe(workspace);
      expect(mc).toBe(metadataCache);
      expect(p).toBeDefined();
    });

    it('should allow registerPlugin/unregisterPlugin through proxy', () => {
      const app = AppShim.create({ vault, workspace, metadataCache, pluginId: 'test-plugin' });
      const plugin = createMockPluginInstance('my-plugin');

      app.registerPlugin('my-plugin', plugin);
      expect(app.plugins.getPlugin('my-plugin')).toBe(plugin);

      app.unregisterPlugin('my-plugin');
      expect(app.plugins.getPlugin('my-plugin')).toBeUndefined();
    });

    it('should include plugin ID in warning message', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const app = AppShim.create({ vault, workspace, metadataCache, pluginId: 'custom-plugin-id' });

      (app as Record<string, unknown>)['nonExistent'];

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('custom-plugin-id')
      );
    });

    it('should not trigger warnings for symbol properties', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const app = AppShim.create({ vault, workspace, metadataCache, pluginId: 'test-plugin' });

      // Symbol access should pass through without warning
      const sym = Symbol('test');
      (app as unknown as Record<symbol, unknown>)[sym];

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('create static method', () => {
    it('should return a proxied AppShim instance', () => {
      const app = AppShim.create({ vault, workspace, metadataCache, pluginId: 'test-plugin' });

      expect(app).toBeDefined();
      expect(app.vault).toBe(vault);
      expect(app.workspace).toBe(workspace);
      expect(app.metadataCache).toBe(metadataCache);
    });

    it('should allow normal vault operations through the proxy', async () => {
      const app = AppShim.create({ vault, workspace, metadataCache, pluginId: 'test-plugin' });

      const name = app.vault.getName();
      expect(name).toBe('TestVault');
      expect(vault.getName).toHaveBeenCalled();
    });
  });

  describe('per-plugin warning isolation', () => {
    it('should track warnings independently per AppShim instance', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const app1 = AppShim.create({ vault, workspace, metadataCache, pluginId: 'plugin-a' });
      const app2 = AppShim.create({ vault, workspace, metadataCache, pluginId: 'plugin-b' });

      // Both instances access the same non-emulated property
      (app1 as Record<string, unknown>)['sharedProp'];
      (app2 as Record<string, unknown>)['sharedProp'];

      // Each instance should log its own warning
      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('plugin-a'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('plugin-b'));
    });
  });
});
