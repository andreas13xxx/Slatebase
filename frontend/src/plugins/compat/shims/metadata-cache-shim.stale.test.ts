import { describe, it, expect } from 'vitest'
import { MetadataCacheShim } from './metadata-cache-shim'
import type { CachedMetadata, TFile } from '../types'
import type { DirectoryTree } from '../../../types'

function makeTFile(path: string): TFile {
  const name = path.split('/').pop() ?? path
  const dot = name.lastIndexOf('.')
  return {
    path,
    name,
    basename: dot > 0 ? name.slice(0, dot) : name,
    extension: dot > 0 ? name.slice(dot + 1) : '',
    stat: { mtime: 1, ctime: 1, size: 1 },
    parent: null,
  }
}

function treeOf(...paths: string[]): DirectoryTree {
  return {
    name: 'vault',
    type: 'directory',
    path: '',
    children: paths.map(path => ({ name: path, type: 'file' as const, path, size: 1 })),
  }
}

describe('MetadataCacheShim stale data', () => {
  it('delete resolvedLinks[path] sticks instead of reappearing on the next read', () => {
    const shim = new MetadataCacheShim(treeOf('a.canvas'))
    shim.resolvedLinks['a.canvas'] = { 'b.md': 1 }
    expect(shim.resolvedLinks['a.canvas']).toEqual({ 'b.md': 1 })

    delete shim.resolvedLinks['a.canvas']
    expect(shim.resolvedLinks['a.canvas']).toBeUndefined()
  })

  it('drops links and stored metadata of files that left the tree', () => {
    const shim = new MetadataCacheShim(treeOf('a.canvas', 'keep.canvas'))
    shim.resolvedLinks['a.canvas'] = { 'b.md': 1 }
    shim.resolvedLinks['keep.canvas'] = { 'b.md': 1 }
    shim.fileCache['a.canvas'] = { mtime: 1, size: 1, hash: 'h1' }
    shim.metadataCache['h1'] = { tags: [] } as CachedMetadata

    shim.updateTree(treeOf('keep.canvas'))

    expect(shim.resolvedLinks['a.canvas']).toBeUndefined()
    expect(shim.resolvedLinks['keep.canvas']).toEqual({ 'b.md': 1 })
    expect(shim.fileCache['a.canvas']).toBeUndefined()
    expect(shim.metadataCache['h1']).toBeUndefined()
  })

  it('lets a fresh parse of a Markdown file outrank metadata a plugin stored earlier', () => {
    const shim = new MetadataCacheShim(treeOf('n.md'))
    const file = makeTFile('n.md')
    shim.fileCache['n.md'] = { mtime: 1, size: 1, hash: 'old' }
    shim.metadataCache['old'] = { tags: [{ tag: '#old', position: {} as never }] } as CachedMetadata

    shim.refreshFileCache(file, '#new\n')

    expect(shim.getFileCache(file)?.tags?.[0]?.tag).toBe('#new')
  })

  it('keeps metadata a plugin stored for a non-Markdown file across refreshes', () => {
    const shim = new MetadataCacheShim(treeOf('a.canvas'))
    const file = makeTFile('a.canvas')
    shim.fileCache['a.canvas'] = { mtime: 1, size: 1, hash: 'h' }
    shim.metadataCache['h'] = { tags: [{ tag: '#canvas', position: {} as never }] } as CachedMetadata

    shim.refreshFileCache(file, '{}')

    expect(shim.getFileCache(file)?.tags?.[0]?.tag).toBe('#canvas')
  })

  it('does not parse a non-Markdown file as Markdown in computeFileMetadataAsync', async () => {
    const shim = new MetadataCacheShim(treeOf('a.canvas'))
    let read = false
    shim.setVault({
      readBinary: async () => { read = true; return new TextEncoder().encode('#fake').buffer as ArrayBuffer },
      getAbstractFileByPath: () => null,
    })
    await shim.computeFileMetadataAsync(makeTFile('a.canvas'))
    expect(read).toBe(false)
  })

  it('swallows a failed read in computeFileMetadataAsync instead of rejecting', async () => {
    const shim = new MetadataCacheShim(treeOf('n.md'))
    shim.setVault({
      readBinary: async () => { throw new Error('locked') },
      getAbstractFileByPath: () => null,
    })
    await expect(shim.computeFileMetadataAsync(makeTFile('n.md'))).resolves.toBeUndefined()
  })

  it('uniqueFileLookup works detached and leaves no empty entries behind', () => {
    const shim = new MetadataCacheShim(null)
    const { add, remove, get } = shim.uniqueFileLookup
    const file = makeTFile('n.md')
    add('n.md', file)
    expect(get('n.md')).toEqual([file])
    remove('n.md', file)
    expect(get('n.md')).toEqual([])
    expect(shim.uniqueFileLookup.map.has('n.md')).toBe(false)
  })
})
