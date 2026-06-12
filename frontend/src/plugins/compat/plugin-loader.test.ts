/**
 * Unit tests for PluginLoader — bundle evaluation, lifecycle management, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginLoader } from './plugin-loader';
import type { PluginLoaderDeps, PluginLoaderStatus, BundleEvaluator } from './plugin-loader';
import type { PluginManifest } from './manifest-parser';
import type { IAppShim, IPluginSandbox } from './types';
import { BundleEvaluationError, LifecycleError } from './errors';

// ─── Test Helpers ──────────────────────────────────────────────────────────────

function createMockAppShim(): IAppShim {
  return {
    vault: {} as IAppShim['vault'],
    workspace: {} as IAppShim['workspace'],
    metadataCache: {} as IAppShim['metadataCache'],
    plugins: {
      plugins: {},
      enabledPlugins: new Set(),
      getPlugin: () => undefined,
    },
  };
}

function createMockSandbox(): IPluginSandbox {
  return {
    createContext: vi.fn(),
    startMonitoring: vi.fn(),
    stopMonitoring: vi.fn(),
    cleanup: vi.fn(),
  };
}

/**
 * Create a mock bundle evaluator that simulates evaluating plugin code.
 * Returns a module with a default export class that has standard lifecycle methods.
 */
function createMockBundleEvaluator(options?: {
  onloadFn?: () => void | Promise<void>;
  onunloadFn?: () => void;
  noDefaultExport?: boolean;
  nonFunctionExport?: boolean;
  constructorThrows?: boolean;
  evaluationThrows?: boolean;
}): BundleEvaluator {
  return async (_bundle: string): Promise<Record<string, unknown>> => { // eslint-disable-line @typescript-eslint/no-unused-vars
    if (options?.evaluationThrows) {
      throw new SyntaxError('Unexpected token');
    }

    if (options?.noDefaultExport) {
      return { foo: 42 };
    }

    if (options?.nonFunctionExport) {
      return { default: 'not a class' };
    }

    if (options?.constructorThrows) {
      return {
        default: class {
          constructor() { throw new Error('constructor exploded'); }
        },
      };
    }

    return {
      default: class MockPlugin {
        manifest = { id: 'test', name: 'Test', version: '1.0.0' };
        app: IAppShim;
        constructor(app: IAppShim) {
          this.app = app;
        }
        onload() { return options?.onloadFn?.(); }
        onunload() { options?.onunloadFn?.(); }
        loadData() { return Promise.resolve(null); }
        saveData(_data: unknown) { return Promise.resolve(); } // eslint-disable-line @typescript-eslint/no-unused-vars
        addCommand() {}
        registerEvent() {}
      },
    };
  };
}

function createMockDeps(overrides?: Partial<PluginLoaderDeps>): PluginLoaderDeps {
  return {
    appShimFactory: overrides?.appShimFactory ?? vi.fn(() => createMockAppShim()),
    sandbox: overrides?.sandbox ?? createMockSandbox(),
    onStatusChange: overrides?.onStatusChange ?? vi.fn(),
    bundleEvaluator: overrides?.bundleEvaluator ?? createMockBundleEvaluator(),
  };
}

function createValidManifest(overrides?: Partial<PluginManifest>): PluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    author: 'Test Author',
    description: 'A test plugin',
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('PluginLoader', () => {
  let deps: PluginLoaderDeps;
  let loader: PluginLoader;

  beforeEach(() => {
    deps = createMockDeps();
    loader = new PluginLoader(deps);
  });

  describe('loadPlugin', () => {
    it('should load a valid plugin bundle and return the instance', async () => {
      const manifest = createValidManifest();

      const instance = await loader.loadPlugin('test-plugin', 'bundle-code', manifest);

      expect(instance).toBeDefined();
      expect(instance.manifest.id).toBe('test-plugin');
      expect(instance.manifest.name).toBe('Test Plugin');
      expect(instance.manifest.version).toBe('1.0.0');
    });

    it('should call appShimFactory with the plugin ID', async () => {
      const manifest = createValidManifest();

      await loader.loadPlugin('my-plugin', 'bundle-code', manifest);

      expect(deps.appShimFactory).toHaveBeenCalledWith('my-plugin');
    });

    it('should set status to loaded after successful load', async () => {
      const manifest = createValidManifest();

      await loader.loadPlugin('test-plugin', 'bundle-code', manifest);

      expect(loader.getStatus('test-plugin')).toBe('loaded');
      expect(deps.onStatusChange).toHaveBeenCalledWith('test-plugin', 'loaded');
    });

    it('should throw BundleEvaluationError for bundle with no default export', async () => {
      const manifest = createValidManifest();
      deps = createMockDeps({ bundleEvaluator: createMockBundleEvaluator({ noDefaultExport: true }) });
      loader = new PluginLoader(deps);

      await expect(loader.loadPlugin('test-plugin', 'bundle', manifest))
        .rejects.toThrow(BundleEvaluationError);

      expect(deps.onStatusChange).toHaveBeenCalledWith('test-plugin', 'error', expect.any(String));
    });

    it('should throw BundleEvaluationError for bundle with non-function default export', async () => {
      const manifest = createValidManifest();
      deps = createMockDeps({ bundleEvaluator: createMockBundleEvaluator({ nonFunctionExport: true }) });
      loader = new PluginLoader(deps);

      await expect(loader.loadPlugin('test-plugin', 'bundle', manifest))
        .rejects.toThrow(BundleEvaluationError);
    });

    it('should throw BundleEvaluationError for bundle with syntax errors', async () => {
      const manifest = createValidManifest();
      deps = createMockDeps({ bundleEvaluator: createMockBundleEvaluator({ evaluationThrows: true }) });
      loader = new PluginLoader(deps);

      await expect(loader.loadPlugin('test-plugin', 'bundle', manifest))
        .rejects.toThrow(BundleEvaluationError);

      expect(deps.onStatusChange).toHaveBeenCalledWith('test-plugin', 'error', expect.any(String));
    });

    it('should throw BundleEvaluationError when constructor throws', async () => {
      const manifest = createValidManifest();
      deps = createMockDeps({ bundleEvaluator: createMockBundleEvaluator({ constructorThrows: true }) });
      loader = new PluginLoader(deps);

      await expect(loader.loadPlugin('test-plugin', 'bundle', manifest))
        .rejects.toThrow(BundleEvaluationError);
    });

    it('should store the plugin instance after successful load', async () => {
      const manifest = createValidManifest();

      await loader.loadPlugin('test-plugin', 'bundle', manifest);

      expect(loader.getPlugin('test-plugin')).toBeDefined();
    });
  });

  describe('activatePlugin', () => {
    it('should call onload() and set status to active', async () => {
      const manifest = createValidManifest();
      await loader.loadPlugin('test-plugin', 'bundle', manifest);

      await loader.activatePlugin('test-plugin');

      expect(loader.getStatus('test-plugin')).toBe('active');
      expect(deps.onStatusChange).toHaveBeenCalledWith('test-plugin', 'active');
    });

    it('should be a no-op if plugin is already active', async () => {
      const manifest = createValidManifest();
      await loader.loadPlugin('test-plugin', 'bundle', manifest);
      await loader.activatePlugin('test-plugin');

      const callCount = (deps.onStatusChange as ReturnType<typeof vi.fn>).mock.calls.length;
      await loader.activatePlugin('test-plugin'); // second call should be no-op
      const newCallCount = (deps.onStatusChange as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(newCallCount).toBe(callCount); // no new status change
    });

    it('should throw LifecycleError if plugin is not loaded', async () => {
      await expect(loader.activatePlugin('unknown-plugin'))
        .rejects.toThrow(LifecycleError);
    });

    it('should throw LifecycleError when onload() throws', async () => {
      const onloadFn = () => { throw new Error('onload failed'); };
      deps = createMockDeps({ bundleEvaluator: createMockBundleEvaluator({ onloadFn }) });
      loader = new PluginLoader(deps);

      const manifest = createValidManifest();
      await loader.loadPlugin('test-plugin', 'bundle', manifest);

      await expect(loader.activatePlugin('test-plugin'))
        .rejects.toThrow(LifecycleError);

      expect(loader.getStatus('test-plugin')).toBe('error');
      expect(deps.onStatusChange).toHaveBeenCalledWith('test-plugin', 'error', expect.any(String));
    });

    it('should throw LifecycleError when onload() exceeds 10s timeout', async () => {
      vi.useFakeTimers();

      const onloadFn = () => new Promise<void>(() => {}); // never resolves
      deps = createMockDeps({ bundleEvaluator: createMockBundleEvaluator({ onloadFn }) });
      loader = new PluginLoader(deps);

      const manifest = createValidManifest();
      await loader.loadPlugin('test-plugin', 'bundle', manifest);

      const activatePromise = loader.activatePlugin('test-plugin');

      // Advance timers past the 10s timeout
      vi.advanceTimersByTime(10_001);

      await expect(activatePromise).rejects.toThrow(LifecycleError);
      expect(loader.getStatus('test-plugin')).toBe('error');

      vi.useRealTimers();
    });
  });

  describe('deactivatePlugin', () => {
    it('should call onunload() and cleanup via sandbox', async () => {
      const manifest = createValidManifest();
      await loader.loadPlugin('test-plugin', 'bundle', manifest);
      await loader.activatePlugin('test-plugin');

      await loader.deactivatePlugin('test-plugin');

      expect(loader.getStatus('test-plugin')).toBe('deactivated');
      expect(deps.sandbox.cleanup).toHaveBeenCalledWith('test-plugin');
      expect(deps.onStatusChange).toHaveBeenCalledWith('test-plugin', 'deactivated');
    });

    it('should perform cleanup even when onunload() throws', async () => {
      const onunloadFn = () => { throw new Error('onunload failed'); };
      deps = createMockDeps({ bundleEvaluator: createMockBundleEvaluator({ onunloadFn }) });
      loader = new PluginLoader(deps);

      const manifest = createValidManifest();
      await loader.loadPlugin('test-plugin', 'bundle', manifest);
      await loader.activatePlugin('test-plugin');

      // Should not throw — onunload exception is caught
      await loader.deactivatePlugin('test-plugin');

      expect(deps.sandbox.cleanup).toHaveBeenCalledWith('test-plugin');
      expect(loader.getStatus('test-plugin')).toBe('deactivated');
    });

    it('should be a no-op for unknown plugins', async () => {
      await loader.deactivatePlugin('unknown');
      // No error thrown
      expect(deps.sandbox.cleanup).not.toHaveBeenCalled();
    });
  });

  describe('uninstallPlugin', () => {
    it('should deactivate active plugin and remove from state', async () => {
      const manifest = createValidManifest();
      await loader.loadPlugin('test-plugin', 'bundle', manifest);
      await loader.activatePlugin('test-plugin');

      await loader.uninstallPlugin('test-plugin');

      expect(loader.getPlugin('test-plugin')).toBeUndefined();
      expect(loader.getRecord('test-plugin')).toBeUndefined();
      expect(deps.sandbox.cleanup).toHaveBeenCalledWith('test-plugin');
    });

    it('should remove loaded-but-not-active plugin without deactivation flow', async () => {
      const manifest = createValidManifest();
      await loader.loadPlugin('test-plugin', 'bundle', manifest);

      await loader.uninstallPlugin('test-plugin');

      expect(loader.getPlugin('test-plugin')).toBeUndefined();
    });

    it('should be a no-op for unknown plugins', async () => {
      await loader.uninstallPlugin('unknown');
      // No error thrown
    });
  });

  describe('getPlugins', () => {
    it('should return a map of all loaded plugin instances', async () => {
      await loader.loadPlugin('plugin-a', 'bundle', createValidManifest({ id: 'plugin-a' }));
      await loader.loadPlugin('plugin-b', 'bundle', createValidManifest({ id: 'plugin-b' }));

      const plugins = loader.getPlugins();
      expect(plugins.size).toBe(2);
      expect(plugins.has('plugin-a')).toBe(true);
      expect(plugins.has('plugin-b')).toBe(true);
    });

    it('should return empty map when no plugins loaded', () => {
      expect(loader.getPlugins().size).toBe(0);
    });
  });

  describe('getPlugin', () => {
    it('should return instance for loaded plugin', async () => {
      const manifest = createValidManifest();
      await loader.loadPlugin('test-plugin', 'bundle', manifest);
      expect(loader.getPlugin('test-plugin')).toBeDefined();
    });

    it('should return undefined for unknown plugin', () => {
      expect(loader.getPlugin('nonexistent')).toBeUndefined();
    });
  });

  describe('loadAllActive', () => {
    it('should load and activate all plugins in order', async () => {
      const statusChanges: Array<[string, PluginLoaderStatus]> = [];
      deps = createMockDeps({
        onStatusChange: vi.fn((id: string, status: PluginLoaderStatus) => {
          statusChanges.push([id, status]);
        }),
      });
      loader = new PluginLoader(deps);

      await loader.loadAllActive([
        { pluginId: 'a', bundle: 'bundle-a', manifest: createValidManifest({ id: 'a' }) },
        { pluginId: 'b', bundle: 'bundle-b', manifest: createValidManifest({ id: 'b' }) },
      ]);

      expect(loader.getStatus('a')).toBe('active');
      expect(loader.getStatus('b')).toBe('active');

      // Verify order: a loaded, a active, b loaded, b active
      expect(statusChanges[0]).toEqual(['a', 'loaded']);
      expect(statusChanges[1]).toEqual(['a', 'active']);
      expect(statusChanges[2]).toEqual(['b', 'loaded']);
      expect(statusChanges[3]).toEqual(['b', 'active']);
    });

    it('should continue loading remaining plugins when one fails', async () => {
      // First call fails (evaluation error), second call succeeds
      let callCount = 0;
      const evaluator: BundleEvaluator = async (_bundle: string) => { // eslint-disable-line @typescript-eslint/no-unused-vars
        callCount++;
        if (callCount === 1) {
          throw new SyntaxError('bad bundle');
        }
        return {
          default: class {
            manifest = { id: 'good', name: 'Good', version: '1.0.0' };
            app: IAppShim;
            constructor(app: IAppShim) { this.app = app; }
            onload() {}
            onunload() {}
            loadData() { return Promise.resolve(null); }
            saveData() { return Promise.resolve(); }
            addCommand() {}
            registerEvent() {}
          },
        };
      };

      deps = createMockDeps({ bundleEvaluator: evaluator });
      loader = new PluginLoader(deps);

      await loader.loadAllActive([
        { pluginId: 'bad', bundle: 'bad-bundle', manifest: createValidManifest({ id: 'bad' }) },
        { pluginId: 'good', bundle: 'good-bundle', manifest: createValidManifest({ id: 'good' }) },
      ]);

      // 'good' should be active despite 'bad' failing
      expect(loader.getStatus('good')).toBe('active');
    });

    it('should handle empty plugin list', async () => {
      await loader.loadAllActive([]);
      expect(loader.getPlugins().size).toBe(0);
    });
  });
});
