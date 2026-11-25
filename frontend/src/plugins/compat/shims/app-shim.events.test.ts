/**
 * `app.plugins` and `app.internalPlugins` are `Events` in Obsidian. TaskNotes' calendar view calls
 * `app.internalPlugins.on('change', …)` and `app.plugins.on('changed', …)` when it opens; without
 * `on` the view throws "t.on is not a function" and the Bases host falls back to the table.
 */
import { describe, it, expect, vi } from 'vitest';
import { AppShim } from './app-shim';
import { installObsidianGlobals } from '../install-globals';

function makeShim(): AppShim {
  const vault = { on: vi.fn(), off: vi.fn() } as never;
  const workspace = { on: vi.fn(), off: vi.fn() } as never;
  const metadataCache = { on: vi.fn(), off: vi.fn() } as never;
  return new AppShim({ vault, workspace, metadataCache, pluginId: 'test-plugin' });
}

describe('AppShim registries as Events', () => {
  it('lets a plugin subscribe to app.internalPlugins and app.plugins', () => {
    const app = makeShim();
    const internal = vi.fn();
    const plugins = vi.fn();

    const ref = app.internalPlugins.on('change', internal);
    app.plugins.on('changed', plugins);
    app.internalPlugins.trigger('change');
    app.plugins.trigger('changed');

    expect(internal).toHaveBeenCalledTimes(1);
    expect(plugins).toHaveBeenCalledTimes(1);

    app.internalPlugins.offref(ref);
    app.internalPlugins.trigger('change');
    expect(internal).toHaveBeenCalledTimes(1);
  });

  it('shares the global plugin registry emitter between plugins\' apps', () => {
    installObsidianGlobals();
    const first = makeShim();
    const second = makeShim();
    const heard = vi.fn();

    second.plugins.on('changed', heard);
    first.plugins.trigger('changed');

    expect(heard).toHaveBeenCalledTimes(1);
  });
});
