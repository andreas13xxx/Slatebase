import { describe, it, expect, afterEach } from 'vitest';
import { loadMermaid, registerObsidianApiExtensions } from './obsidian-api-extensions';

type W = { mermaid?: unknown; pele?: unknown };

afterEach(() => {
  delete (window as unknown as W).mermaid;
  delete (window as unknown as W).pele;
});

describe('loadMermaid (Obsidian 1.15 surface)', () => {
  it('exposes the rendering API plugins rely on', async () => {
    const mermaid = (await loadMermaid()) as Record<string, unknown> & {
      mermaidAPI: Record<string, unknown>;
    };
    expect(typeof mermaid.initialize).toBe('function');
    expect(typeof mermaid.render).toBe('function');
    expect(typeof mermaid.parse).toBe('function');
    expect(typeof mermaid.mermaidAPI.getConfig).toBe('function');
    expect(typeof mermaid.mermaidAPI.setConfig).toBe('function');
  }, 60000);

  it('sets window.mermaid and window.pele to the same object', async () => {
    const mermaid = await loadMermaid();
    const w = window as unknown as W;
    expect(w.mermaid).toBe(mermaid);
    expect(w.pele).toBe(mermaid);
  }, 60000);
});

describe('loadPixi (Obsidian 1.15)', () => {
  it('is registered and resolves to null while PIXI is not bundled', async () => {
    const w = window as unknown as { obsidian?: Record<string, unknown> };
    const previous = w.obsidian;
    w.obsidian = {};
    try {
      registerObsidianApiExtensions();
      const loadPixi = w.obsidian['loadPixi'] as () => Promise<unknown>;
      expect(typeof loadPixi).toBe('function');
      await expect(loadPixi()).resolves.toBeNull();
    } finally {
      w.obsidian = previous;
    }
  });
});
