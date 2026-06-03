import { describe, it, expect, vi } from 'vitest';
import { MetadataCacheShim } from './metadata-cache-shim';
import type { TFile, CachedMetadata } from '../types';
import type { DirectoryTree } from '../../../types';

/** Helper to create a TFile for testing */
function makeTFile(path: string): TFile {
  const name = path.split('/').pop() ?? path;
  const lastDot = name.lastIndexOf('.');
  const basename = lastDot > 0 ? name.slice(0, lastDot) : name;
  const extension = lastDot > 0 ? name.slice(lastDot + 1) : '';
  return {
    path,
    name,
    basename,
    extension,
    stat: { mtime: Date.now(), ctime: Date.now(), size: 100 },
    parent: null,
  };
}

/** Helper to create a directory tree */
function makeTree(): DirectoryTree {
  return {
    name: 'vault',
    type: 'directory',
    path: '',
    children: [
      { name: 'notes', type: 'directory', path: 'notes', children: [
        { name: 'hello.md', type: 'file', path: 'notes/hello.md', size: 50 },
        { name: 'world.md', type: 'file', path: 'notes/world.md', size: 100 },
      ]},
      { name: 'readme.md', type: 'file', path: 'readme.md', size: 200 },
      { name: 'image.png', type: 'file', path: 'image.png', size: 5000 },
    ],
  };
}

describe('MetadataCacheShim', () => {
  describe('getFileCache()', () => {
    it('returns null when file has not been cached', () => {
      const shim = new MetadataCacheShim(makeTree());
      const file = makeTFile('notes/hello.md');
      expect(shim.getFileCache(file)).toBeNull();
    });

    it('returns CachedMetadata after updateFileCache()', () => {
      const shim = new MetadataCacheShim(makeTree());
      const file = makeTFile('notes/hello.md');
      const metadata: CachedMetadata = {
        frontmatter: { title: 'Hello' },
        links: [{ link: 'world', position: { start: { line: 2, col: 0, offset: 10 }, end: { line: 2, col: 9, offset: 19 } }, original: '[[world]]' }],
        tags: [{ tag: '#test', position: { start: { line: 3, col: 0, offset: 20 }, end: { line: 3, col: 5, offset: 25 } } }],
        headings: [{ heading: 'Hello', level: 1, position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 7, offset: 7 } } }],
      };

      shim.updateFileCache(file, metadata);
      const result = shim.getFileCache(file);

      expect(result).not.toBeNull();
      expect(result?.frontmatter).toEqual({ title: 'Hello' });
      expect(result?.links).toHaveLength(1);
      expect(result?.tags).toHaveLength(1);
      expect(result?.headings).toHaveLength(1);
    });

    it('returns null for file not in cache even if tree has it', () => {
      const shim = new MetadataCacheShim(makeTree());
      const file = makeTFile('readme.md');
      expect(shim.getFileCache(file)).toBeNull();
    });
  });

  describe('getFirstLinkpathDest()', () => {
    it('resolves a simple link to a file', () => {
      const shim = new MetadataCacheShim(makeTree());
      const result = shim.getFirstLinkpathDest('hello', 'notes/world.md');

      expect(result).not.toBeNull();
      expect(result?.path).toBe('notes/hello.md');
    });

    it('resolves link with .md extension', () => {
      const shim = new MetadataCacheShim(makeTree());
      const result = shim.getFirstLinkpathDest('hello.md', 'notes/world.md');

      expect(result).not.toBeNull();
      expect(result?.path).toBe('notes/hello.md');
    });

    it('resolves case-insensitively', () => {
      const shim = new MetadataCacheShim(makeTree());
      const result = shim.getFirstLinkpathDest('Hello', 'readme.md');

      expect(result).not.toBeNull();
      expect(result?.path).toBe('notes/hello.md');
    });

    it('returns null for non-existent link', () => {
      const shim = new MetadataCacheShim(makeTree());
      const result = shim.getFirstLinkpathDest('nonexistent', 'readme.md');

      expect(result).toBeNull();
    });

    it('returns null for empty link path', () => {
      const shim = new MetadataCacheShim(makeTree());
      const result = shim.getFirstLinkpathDest('', 'readme.md');

      expect(result).toBeNull();
    });

    it('returns null when tree is null', () => {
      const shim = new MetadataCacheShim(null);
      const result = shim.getFirstLinkpathDest('hello', 'readme.md');

      expect(result).toBeNull();
    });

    it('strips heading references from link', () => {
      const shim = new MetadataCacheShim(makeTree());
      const result = shim.getFirstLinkpathDest('hello#section', 'notes/world.md');

      expect(result).not.toBeNull();
      expect(result?.path).toBe('notes/hello.md');
    });

    it('resolves path-based links', () => {
      const shim = new MetadataCacheShim(makeTree());
      const result = shim.getFirstLinkpathDest('notes/world', 'readme.md');

      expect(result).not.toBeNull();
      expect(result?.path).toBe('notes/world.md');
    });

    it('returns TFile with correct basename and extension', () => {
      const shim = new MetadataCacheShim(makeTree());
      const result = shim.getFirstLinkpathDest('readme', 'notes/hello.md');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('readme.md');
      expect(result?.basename).toBe('readme');
      expect(result?.extension).toBe('md');
    });
  });

  describe('resolvedLinks', () => {
    it('returns empty object when no cache entries', () => {
      const shim = new MetadataCacheShim(makeTree());
      expect(shim.resolvedLinks).toEqual({});
    });

    it('computes resolved links from cached metadata', () => {
      const shim = new MetadataCacheShim(makeTree());
      const file = makeTFile('notes/hello.md');
      const metadata: CachedMetadata = {
        links: [
          { link: 'world', position: { start: { line: 1, col: 0, offset: 5 }, end: { line: 1, col: 9, offset: 14 } }, original: '[[world]]' },
          { link: 'world', position: { start: { line: 3, col: 0, offset: 30 }, end: { line: 3, col: 9, offset: 39 } }, original: '[[world]]' },
          { link: 'readme', position: { start: { line: 5, col: 0, offset: 50 }, end: { line: 5, col: 10, offset: 60 } }, original: '[[readme]]' },
        ],
      };

      shim.updateFileCache(file, metadata);
      const links = shim.resolvedLinks;

      expect(links['notes/hello.md']).toBeDefined();
      expect(links['notes/hello.md']?.['notes/world.md']).toBe(2);
      expect(links['notes/hello.md']?.['readme.md']).toBe(1);
    });

    it('does not include unresolvable links', () => {
      const shim = new MetadataCacheShim(makeTree());
      const file = makeTFile('notes/hello.md');
      const metadata: CachedMetadata = {
        links: [
          { link: 'nonexistent', position: { start: { line: 1, col: 0, offset: 5 }, end: { line: 1, col: 15, offset: 20 } }, original: '[[nonexistent]]' },
        ],
      };

      shim.updateFileCache(file, metadata);
      const links = shim.resolvedLinks;

      expect(links['notes/hello.md']).toBeUndefined();
    });

    it('does not include entries for files without links', () => {
      const shim = new MetadataCacheShim(makeTree());
      const file = makeTFile('notes/hello.md');
      const metadata: CachedMetadata = {
        frontmatter: { title: 'Hello' },
        headings: [{ heading: 'Title', level: 1, position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 7, offset: 7 } } }],
      };

      shim.updateFileCache(file, metadata);
      const links = shim.resolvedLinks;

      expect(links['notes/hello.md']).toBeUndefined();
    });
  });

  describe('events', () => {
    it('emits changed event when updateFileCache() is called', () => {
      const shim = new MetadataCacheShim(makeTree());
      const file = makeTFile('notes/hello.md');
      const metadata: CachedMetadata = { frontmatter: { title: 'Test' } };
      const callback = vi.fn();

      shim.on('changed', callback);
      shim.updateFileCache(file, metadata);

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(file, metadata);
    });

    it('emits resolved event when buildInitialCache() is called', () => {
      const shim = new MetadataCacheShim(makeTree());
      const callback = vi.fn();

      shim.on('resolved', callback);
      const entries = new Map<string, CachedMetadata>();
      entries.set('notes/hello.md', { frontmatter: { title: 'Hello' } });
      shim.buildInitialCache(entries);

      expect(callback).toHaveBeenCalledOnce();
    });

    it('supports on/off for event listeners', () => {
      const shim = new MetadataCacheShim(makeTree());
      const callback = vi.fn();

      shim.on('changed', callback);
      shim.off('changed', callback);

      const file = makeTFile('notes/hello.md');
      shim.updateFileCache(file, { frontmatter: {} });

      expect(callback).not.toHaveBeenCalled();
    });

    it('returns EventRef from on() that can be used to unsubscribe', () => {
      const shim = new MetadataCacheShim(makeTree());
      const callback = vi.fn();

      const ref = shim.on('changed', callback);
      expect(ref).toHaveProperty('id');
      expect(ref).toHaveProperty('event', 'changed');
      expect(ref).toHaveProperty('callback', callback);
    });
  });

  describe('buildInitialCache()', () => {
    it('populates cache from provided entries', () => {
      const shim = new MetadataCacheShim(makeTree());
      const entries = new Map<string, CachedMetadata>();
      entries.set('notes/hello.md', { frontmatter: { title: 'Hello' } });
      entries.set('readme.md', { headings: [{ heading: 'README', level: 1, position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 8, offset: 8 } } }] });

      shim.buildInitialCache(entries);

      const helloFile = makeTFile('notes/hello.md');
      const readmeFile = makeTFile('readme.md');
      expect(shim.getFileCache(helloFile)).toEqual({ frontmatter: { title: 'Hello' } });
      expect(shim.getFileCache(readmeFile)).toEqual({ headings: [{ heading: 'README', level: 1, position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 8, offset: 8 } } }] });
    });
  });

  describe('updateTree()', () => {
    it('updates the tree used for link resolution', () => {
      const shim = new MetadataCacheShim(null);

      // With null tree, can't resolve
      expect(shim.getFirstLinkpathDest('hello', 'readme.md')).toBeNull();

      // After updating tree, resolution works
      shim.updateTree(makeTree());
      const result = shim.getFirstLinkpathDest('hello', 'readme.md');
      expect(result).not.toBeNull();
      expect(result?.path).toBe('notes/hello.md');
    });
  });
});
