import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginRegistry } from './plugin-registry';
import type { IRegistryApiClient, PluginRegistryData } from './plugin-registry';
import type { PluginManifestData, PluginPermissions } from './types';

function createMockApiClient(overrides: Partial<IRegistryApiClient> = {}): IRegistryApiClient {
  return {
    loadRegistry: vi.fn().mockResolvedValue(null),
    saveRegistry: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createManifest(overrides: Partial<PluginManifestData> = {}): PluginManifestData {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    ...overrides,
  };
}

describe('PluginRegistry', () => {
  let registry: PluginRegistry;
  let apiClient: IRegistryApiClient;

  beforeEach(() => {
    apiClient = createMockApiClient();
    registry = new PluginRegistry(apiClient, 'vault-123');
  });

  describe('register()', () => {
    it('adds a new plugin entry with default permissions and unknown compatibility', () => {
      const manifest = createManifest();
      registry.register(manifest, 'inactive');

      const plugins = registry.listPlugins();
      expect(plugins).toHaveLength(1);
      expect(plugins[0]).toEqual({
        pluginId: 'test-plugin',
        manifest,
        status: 'inactive',
        permissions: {
          network: false,
          networkAllowlist: [],
          filesystemWrite: false,
          domManipulation: false,
        },
        compatibilityLevel: 'unknown',
      });
    });

    it('uses the manifest id as the pluginId', () => {
      registry.register(createManifest({ id: 'my-plugin' }), 'active');

      const plugins = registry.listPlugins();
      expect(plugins[0]?.pluginId).toBe('my-plugin');
    });

    it('supports multiple plugins', () => {
      registry.register(createManifest({ id: 'plugin-a' }), 'active');
      registry.register(createManifest({ id: 'plugin-b' }), 'inactive');

      expect(registry.listPlugins()).toHaveLength(2);
    });
  });

  describe('listPlugins()', () => {
    it('returns empty array when no plugins are registered', () => {
      expect(registry.listPlugins()).toEqual([]);
    });

    it('returns all registered plugins', () => {
      registry.register(createManifest({ id: 'a' }), 'active');
      registry.register(createManifest({ id: 'b' }), 'inactive');
      registry.register(createManifest({ id: 'c' }), 'error');

      const plugins = registry.listPlugins();
      expect(plugins).toHaveLength(3);
      const ids = plugins.map(p => p.pluginId);
      expect(ids).toContain('a');
      expect(ids).toContain('b');
      expect(ids).toContain('c');
    });
  });

  describe('updateStatus()', () => {
    it('updates the status of an existing plugin', () => {
      registry.register(createManifest(), 'inactive');
      registry.updateStatus('test-plugin', 'active');

      const plugins = registry.listPlugins();
      expect(plugins[0]?.status).toBe('active');
    });

    it('sets error message when provided', () => {
      registry.register(createManifest(), 'inactive');
      registry.updateStatus('test-plugin', 'error', 'Timeout during onload');

      const plugins = registry.listPlugins();
      expect(plugins[0]?.status).toBe('error');
      expect(plugins[0]?.error).toBe('Timeout during onload');
    });

    it('clears error when status updated without error', () => {
      registry.register(createManifest(), 'inactive');
      registry.updateStatus('test-plugin', 'error', 'Some error');
      registry.updateStatus('test-plugin', 'active');

      const plugins = registry.listPlugins();
      expect(plugins[0]?.error).toBeUndefined();
    });

    it('does nothing for non-existent plugin', () => {
      registry.updateStatus('non-existent', 'active');
      expect(registry.listPlugins()).toHaveLength(0);
    });

    it('persists to backend after status update', async () => {
      registry.register(createManifest(), 'inactive');
      registry.updateStatus('test-plugin', 'active');

      // Wait for async persistToBackend to complete
      await vi.waitFor(() => {
        expect(apiClient.saveRegistry).toHaveBeenCalled();
      });
    });
  });

  describe('remove()', () => {
    it('removes a plugin from the registry', () => {
      registry.register(createManifest(), 'inactive');
      registry.remove('test-plugin');

      expect(registry.listPlugins()).toHaveLength(0);
    });

    it('does nothing for non-existent plugin', () => {
      registry.register(createManifest(), 'inactive');
      registry.remove('non-existent');

      expect(registry.listPlugins()).toHaveLength(1);
    });

    it('persists to backend after removal', async () => {
      registry.register(createManifest(), 'inactive');
      registry.remove('test-plugin');

      await vi.waitFor(() => {
        expect(apiClient.saveRegistry).toHaveBeenCalled();
      });
    });
  });

  describe('getPermissions()', () => {
    it('returns permissions for a registered plugin', () => {
      registry.register(createManifest(), 'active');

      const perms = registry.getPermissions('test-plugin');
      expect(perms).toEqual({
        network: false,
        networkAllowlist: [],
        filesystemWrite: false,
        domManipulation: false,
      });
    });

    it('returns default permissions for non-existent plugin', () => {
      const perms = registry.getPermissions('non-existent');
      expect(perms).toEqual({
        network: false,
        networkAllowlist: [],
        filesystemWrite: false,
        domManipulation: false,
      });
    });
  });

  describe('setPermissions()', () => {
    it('updates permissions for a registered plugin', () => {
      registry.register(createManifest(), 'active');

      const newPerms: PluginPermissions = {
        network: true,
        networkAllowlist: ['api.example.com'],
        filesystemWrite: true,
        domManipulation: false,
      };
      registry.setPermissions('test-plugin', newPerms);

      const perms = registry.getPermissions('test-plugin');
      expect(perms).toEqual(newPerms);
    });

    it('does nothing for non-existent plugin', () => {
      const newPerms: PluginPermissions = {
        network: true,
        networkAllowlist: [],
        filesystemWrite: true,
        domManipulation: true,
      };
      registry.setPermissions('non-existent', newPerms);
      // Should not throw
      expect(registry.listPlugins()).toHaveLength(0);
    });

    it('persists to backend after permission change', async () => {
      registry.register(createManifest(), 'active');
      registry.setPermissions('test-plugin', {
        network: true,
        networkAllowlist: [],
        filesystemWrite: false,
        domManipulation: false,
      });

      await vi.waitFor(() => {
        expect(apiClient.saveRegistry).toHaveBeenCalled();
      });
    });
  });

  describe('setCompatibilityLevel()', () => {
    it('updates compatibility level for a registered plugin', () => {
      registry.register(createManifest(), 'active');
      registry.setCompatibilityLevel('test-plugin', 'full');

      const plugins = registry.listPlugins();
      expect(plugins[0]?.compatibilityLevel).toBe('full');
    });

    it('supports all valid levels', () => {
      registry.register(createManifest(), 'active');

      registry.setCompatibilityLevel('test-plugin', 'partial');
      expect(registry.listPlugins()[0]?.compatibilityLevel).toBe('partial');

      registry.setCompatibilityLevel('test-plugin', 'unsupported');
      expect(registry.listPlugins()[0]?.compatibilityLevel).toBe('unsupported');

      registry.setCompatibilityLevel('test-plugin', 'unknown');
      expect(registry.listPlugins()[0]?.compatibilityLevel).toBe('unknown');
    });

    it('does nothing for non-existent plugin', () => {
      registry.setCompatibilityLevel('non-existent', 'full');
      expect(registry.listPlugins()).toHaveLength(0);
    });
  });

  describe('loadFromBackend()', () => {
    it('loads and populates registry from backend data', async () => {
      const data: PluginRegistryData = {
        version: 1,
        plugins: {
          'plugin-a': {
            status: 'active',
            permissions: {
              network: true,
              networkAllowlist: ['example.com'],
              filesystemWrite: false,
              domManipulation: false,
            },
            compatibilityLevel: 'full',
            manifest: { id: 'plugin-a', name: 'Plugin A', version: '2.0.0' },
          },
          'plugin-b': {
            status: 'error',
            permissions: {
              network: false,
              networkAllowlist: [],
              filesystemWrite: false,
              domManipulation: false,
            },
            compatibilityLevel: 'partial',
            manifest: { id: 'plugin-b', name: 'Plugin B', version: '1.0.0' },
            error: 'Timeout',
          },
        },
      };
      apiClient = createMockApiClient({
        loadRegistry: vi.fn().mockResolvedValue(data),
      });
      registry = new PluginRegistry(apiClient, 'vault-123');

      await registry.loadFromBackend();

      const plugins = registry.listPlugins();
      expect(plugins).toHaveLength(2);

      const pluginA = plugins.find(p => p.pluginId === 'plugin-a');
      expect(pluginA?.status).toBe('active');
      expect(pluginA?.permissions.network).toBe(true);
      expect(pluginA?.compatibilityLevel).toBe('full');

      const pluginB = plugins.find(p => p.pluginId === 'plugin-b');
      expect(pluginB?.status).toBe('error');
      expect(pluginB?.error).toBe('Timeout');
    });

    it('clears existing entries before loading', async () => {
      registry.register(createManifest({ id: 'old-plugin' }), 'active');

      const data: PluginRegistryData = {
        version: 1,
        plugins: {
          'new-plugin': {
            status: 'inactive',
            permissions: {
              network: false,
              networkAllowlist: [],
              filesystemWrite: false,
              domManipulation: false,
            },
            compatibilityLevel: 'unknown',
            manifest: { id: 'new-plugin', name: 'New', version: '1.0.0' },
          },
        },
      };
      apiClient = createMockApiClient({
        loadRegistry: vi.fn().mockResolvedValue(data),
      });
      registry = new PluginRegistry(apiClient, 'vault-123');
      registry.register(createManifest({ id: 'old-plugin' }), 'active');

      await registry.loadFromBackend();

      const plugins = registry.listPlugins();
      expect(plugins).toHaveLength(1);
      expect(plugins[0]?.pluginId).toBe('new-plugin');
    });

    it('handles null response from backend gracefully', async () => {
      apiClient = createMockApiClient({
        loadRegistry: vi.fn().mockResolvedValue(null),
      });
      registry = new PluginRegistry(apiClient, 'vault-123');
      registry.register(createManifest(), 'active');

      await registry.loadFromBackend();

      // Should keep existing entries since backend returned null
      expect(registry.listPlugins()).toHaveLength(1);
    });

    it('handles missing loadRegistry method gracefully', async () => {
      apiClient = {};
      registry = new PluginRegistry(apiClient, 'vault-123');
      registry.register(createManifest(), 'active');

      await registry.loadFromBackend();

      // Should keep existing entries
      expect(registry.listPlugins()).toHaveLength(1);
    });

    it('handles backend errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      apiClient = createMockApiClient({
        loadRegistry: vi.fn().mockRejectedValue(new Error('Network error')),
      });
      registry = new PluginRegistry(apiClient, 'vault-123');
      registry.register(createManifest(), 'active');

      await registry.loadFromBackend();

      // Should keep existing entries on error
      expect(registry.listPlugins()).toHaveLength(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load registry')
      );
      consoleSpy.mockRestore();
    });
  });

  describe('persistToBackend()', () => {
    it('serializes all entries and saves to backend', async () => {
      registry.register(createManifest({ id: 'p1' }), 'active');
      registry.register(createManifest({ id: 'p2' }), 'inactive');

      await registry.persistToBackend();

      expect(apiClient.saveRegistry).toHaveBeenCalledWith('vault-123', {
        version: 1,
        plugins: {
          'p1': {
            status: 'active',
            permissions: {
              network: false,
              networkAllowlist: [],
              filesystemWrite: false,
              domManipulation: false,
            },
            compatibilityLevel: 'unknown',
            manifest: expect.objectContaining({ id: 'p1' }),
            error: undefined,
          },
          'p2': {
            status: 'inactive',
            permissions: {
              network: false,
              networkAllowlist: [],
              filesystemWrite: false,
              domManipulation: false,
            },
            compatibilityLevel: 'unknown',
            manifest: expect.objectContaining({ id: 'p2' }),
            error: undefined,
          },
        },
      });
    });

    it('handles missing saveRegistry method gracefully', async () => {
      apiClient = {};
      registry = new PluginRegistry(apiClient, 'vault-123');
      registry.register(createManifest(), 'active');

      // Should not throw
      await registry.persistToBackend();
    });

    it('handles backend errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      apiClient = createMockApiClient({
        saveRegistry: vi.fn().mockRejectedValue(new Error('Network error')),
      });
      registry = new PluginRegistry(apiClient, 'vault-123');
      registry.register(createManifest(), 'active');

      await registry.persistToBackend();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to persist registry')
      );
      consoleSpy.mockRestore();
    });
  });

  describe('deny-by-default permissions (R8.7)', () => {
    it('new plugins have all permissions disabled', () => {
      registry.register(createManifest(), 'active');

      const perms = registry.getPermissions('test-plugin');
      expect(perms.network).toBe(false);
      expect(perms.networkAllowlist).toEqual([]);
      expect(perms.filesystemWrite).toBe(false);
      expect(perms.domManipulation).toBe(false);
    });
  });
});
