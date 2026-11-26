/**
 * `app.runOpeningBehavior` is Obsidian's startup hook, which plugins replace (Homepage). Each plugin
 * has its own AppShim but there is one app, so the replacement must land in a shared slot and be
 * run once after the vault's plugins have loaded.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShim, resetOpeningBehavior, runVaultOpeningBehavior } from './app-shim';
import { installObsidianGlobals } from '../install-globals';

function makeApp(pluginId: string) {
  const stub = { on: vi.fn(), off: vi.fn() } as never;
  return AppShim.wrapWithProxy(
    new AppShim({ vault: stub, workspace: stub, metadataCache: stub, pluginId }),
  );
}

describe('app.runOpeningBehavior', () => {
  afterEach(() => resetOpeningBehavior());

  it('has an empty default and does not count as an API gap', () => {
    installObsidianGlobals();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = makeApp('homepage');
    expect(typeof app.runOpeningBehavior).toBe('function');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('runs a handler a plugin installed on its own AppShim', async () => {
    const handler = vi.fn();
    makeApp('homepage').runOpeningBehavior = handler;
    await runVaultOpeningBehavior();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('lets the plugin keep the original and restore it', async () => {
    const app = makeApp('homepage');
    const original = app.runOpeningBehavior;
    app.runOpeningBehavior = vi.fn();
    app.runOpeningBehavior = original;
    await expect(runVaultOpeningBehavior()).resolves.toBeUndefined();
  });

  it('reads back properties a plugin assigned itself', () => {
    const app = makeApp('homepage');
    const saved = (): string => 'orig';
    (app as Record<string, unknown>)['nvOrig_showReleaseNotes'] = saved;
    expect((app as Record<string, unknown>)['nvOrig_showReleaseNotes']).toBe(saved);
  });

  it('logs a throwing handler instead of failing the vault load', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    makeApp('homepage').runOpeningBehavior = () => { throw new Error('boom'); };
    await expect(runVaultOpeningBehavior()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('drops the handler on reset', async () => {
    const handler = vi.fn();
    makeApp('homepage').runOpeningBehavior = handler;
    resetOpeningBehavior();
    await runVaultOpeningBehavior();
    expect(handler).not.toHaveBeenCalled();
  });
});
