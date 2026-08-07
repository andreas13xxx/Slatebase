import { describe, it, expect } from 'vitest';
import { withPluginContext, getCurrentPluginId, scopeForPlugin } from './plugin-execution-context';

describe('withPluginContext / getCurrentPluginId', () => {
  it('reports the plugin id while fn runs, and null outside of it', () => {
    expect(getCurrentPluginId()).toBeNull();
    withPluginContext('my-plugin', () => {
      expect(getCurrentPluginId()).toBe('my-plugin');
    });
    expect(getCurrentPluginId()).toBeNull();
  });

  it('restores the previous plugin id on nested calls (reentrant)', () => {
    withPluginContext('outer', () => {
      withPluginContext('inner', () => {
        expect(getCurrentPluginId()).toBe('inner');
      });
      expect(getCurrentPluginId()).toBe('outer');
    });
  });

  it('restores context even if fn throws', () => {
    expect(() =>
      withPluginContext('my-plugin', () => {
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(getCurrentPluginId()).toBeNull();
  });

  it('is a no-op passthrough when pluginId is null', () => {
    const result = withPluginContext(null, () => 42);
    expect(result).toBe(42);
  });

  it('does NOT survive an await inside fn — this is exactly why scopeForPlugin exists', async () => {
    let idDuringMicrotask: string | null = 'unset';
    await withPluginContext('my-plugin', async () => {
      await Promise.resolve();
      idDuringMicrotask = getCurrentPluginId();
    });
    // Documents the known limitation: ambient tracking unwinds via `finally`
    // as soon as the synchronous prefix returns a pending promise, so code
    // after the first `await` no longer sees the plugin id.
    expect(idDuringMicrotask).toBeNull();
  });
});

describe('scopeForPlugin', () => {
  function createTarget() {
    const listeners: Array<(...args: unknown[]) => void> = [];
    return {
      on(_event: string, callback: (...args: unknown[]) => void) {
        listeners.push(callback);
        return { unsubscribe: () => {} };
      },
      onLayoutReady(callback: () => void) {
        queueMicrotask(callback);
      },
      getActiveFile() {
        return 'passthrough-untouched';
      },
      fireAll(...args: unknown[]) {
        for (const l of listeners) l(...args);
      },
    };
  }

  it('wraps listed methods so their callback runs with the bound plugin id', () => {
    const target = createTarget();
    const scoped = scopeForPlugin(target, 'editing-toolbar', ['on']);

    let seenDuringCallback: string | null = null;
    scoped.on('active-leaf-change', () => {
      seenDuringCallback = getCurrentPluginId();
    });
    // The registration itself happens outside any plugin context — the id
    // must still be threaded through via the closure, not ambient tracking.
    expect(getCurrentPluginId()).toBeNull();

    target.fireAll();
    expect(seenDuringCallback).toBe('editing-toolbar');
    expect(getCurrentPluginId()).toBeNull();
  });

  it('survives an await before the wrapped method is even called (the bug this fixes)', async () => {
    const target = createTarget();
    const scoped = scopeForPlugin(target, 'editing-toolbar', ['on', 'onLayoutReady']);

    const seen: string[] = [];
    scoped.onLayoutReady(async () => {
      // Simulate real plugin behavior: async work before registering listeners.
      await Promise.resolve();
      await Promise.resolve();
      scoped.on('active-leaf-change', () => {
        seen.push(getCurrentPluginId() ?? 'null');
      });
      target.fireAll();
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(seen).toEqual(['editing-toolbar']);
  });

  it('leaves methods not in callbackWrappingMethods unwrapped (still delegates)', () => {
    const target = createTarget();
    const scoped = scopeForPlugin(target, 'editing-toolbar', ['on']);

    expect(scoped.getActiveFile()).toBe('passthrough-untouched');
  });

  it('passes non-function arguments through unchanged', () => {
    const target = createTarget();
    const scoped = scopeForPlugin(target, 'editing-toolbar', ['on']);

    scoped.on('some-event', () => {});
    // No throw, no crash — string first argument passed through untouched.
    expect(() => target.fireAll()).not.toThrow();
  });
});
