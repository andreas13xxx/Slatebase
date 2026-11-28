import { describe, it, expect } from 'vitest';
import { MetadataCacheShim } from './metadata-cache-shim';

describe('shim proxies: constructor passthrough', () => {
  it('keeps `constructor.prototype` reachable on the metadataCache proxy (plugins patch the prototype)', () => {
    const proxy = MetadataCacheShim.wrapWithProxy(new MetadataCacheShim(null));
    const proto = (proxy as unknown as { constructor: { prototype: Record<string, unknown> } }).constructor.prototype;
    expect(proto).toBeDefined();
    expect(typeof proto['getCache']).toBe('function');
  });
});

describe('MetadataCacheShim: plugin-indexed file types (Advanced Canvas pattern)', () => {
  const file = { path: 'a.canvas', name: 'a.canvas', basename: 'a', extension: 'canvas', stat: { mtime: 1, ctime: 1, size: 2 }, parent: null };

  it('answers getFileCache/getCache from fileCache + metadataCache by hash', () => {
    const cache = new MetadataCacheShim(null);
    cache.saveFileCache('a.canvas', { mtime: 1, size: 2, hash: 'h1' });
    expect(cache.getCache('a.canvas')).toBeNull();
    cache.saveMetaCache('h1', { frontmatter: { x: 1 } });
    expect(cache.getFileCache(file)?.frontmatter).toEqual({ x: 1 });
    expect(cache.getCache('a.canvas')?.frontmatter).toEqual({ x: 1 });
  });

  it('keeps links a plugin assigns to resolvedLinks', () => {
    const cache = MetadataCacheShim.wrapWithProxy(new MetadataCacheShim(null));
    cache.resolvedLinks['a.canvas'] = { 'b.md': 1 };
    expect(cache.resolvedLinks['a.canvas']).toEqual({ 'b.md': 1 });
  });

  it('indexes a file through the vault and parses raw bytes', async () => {
    const cache = new MetadataCacheShim(null);
    const bytes = new TextEncoder().encode('---\na: 1\n---\n#t').buffer;
    cache.setVault({ readBinary: () => Promise.resolve(bytes), getAbstractFileByPath: () => null });
    expect((await cache.computeMetadataAsync(bytes)).frontmatter).toEqual({ a: 1 });
    await cache.computeFileMetadataAsync({ ...file, path: 'n.md', extension: 'md' });
    expect(cache.getCache('n.md')?.tags?.[0]?.tag).toBe('#t');
  });

  it('exposes the members the patcher overrides on its prototype', () => {
    const proto = Object.getPrototypeOf(new MetadataCacheShim(null)) as Record<string, unknown>;
    for (const m of ['getCache', 'computeFileMetadataAsync', 'resolveLinks']) expect(typeof proto[m]).toBe('function');
    expect(typeof new MetadataCacheShim(null).uniqueFileLookup.add).toBe('function');
  });
});
