/**
 * Block ids surfaced through the MetadataCache.
 *
 * `CachedMetadata.blocks` is the public API — it resolves `[[note#^id]]` links
 * and is how plugins locate a block. It was declared in the types but never
 * populated, so every block id looked unknown. `blockCache` is Obsidian's
 * internal counterpart over the same data.
 */
import { describe, it, expect } from 'vitest'
import { MetadataCacheShim } from './metadata-cache-shim'
import type { TFile } from '../types'
import type { DirectoryTree } from '../../../types'

function makeTFile(path: string): TFile {
  const name = path.split('/').pop() ?? path
  return {
    path,
    name,
    basename: name.replace(/\.md$/, ''),
    extension: 'md',
    stat: { mtime: 0, ctime: 0, size: 0 },
    parent: null,
  }
}

function makeTree(): DirectoryTree {
  return {
    name: 'vault',
    type: 'directory',
    path: '',
    children: [{ name: 'note.md', type: 'file', path: 'note.md', size: 100 }],
  }
}

const SOURCE = [
  '---',
  'title: Demo',
  '---',
  '',
  '# Heading ^h1',
  '',
  'A paragraph that',
  'spans two lines. ^para',
  '',
  '- list item ^li',
  '',
  '```js',
  'const notABlock = 1 // ^fake',
  '```',
].join('\n')

function shimWithSource(): { shim: MetadataCacheShim; file: TFile } {
  const shim = new MetadataCacheShim(makeTree())
  const file = makeTFile('note.md')
  shim.populateFromContent(file.path, SOURCE)
  return { shim, file }
}

describe('MetadataCache block ids', () => {
  describe('getFileCache().blocks', () => {
    it('exposes every block id in the note', () => {
      const { shim, file } = shimWithSource()

      const blocks = shim.getFileCache(file)?.blocks

      expect(Object.keys(blocks ?? {}).sort()).toEqual(['h1', 'li', 'para'])
    })

    it('does not pick up a marker inside a code block', () => {
      const { shim, file } = shimWithSource()

      expect(shim.getFileCache(file)?.blocks?.['fake']).toBeUndefined()
    })

    it('gives a range that slices back to the labelled block', () => {
      const { shim, file } = shimWithSource()

      const { position } = shim.getFileCache(file)!.blocks!['para']!
      const lines = SOURCE.split('\n').slice(position.start.line, position.end.line + 1)

      expect(lines).toEqual(['A paragraph that', 'spans two lines. ^para'])
    })

    it('omits blocks entirely for a note without markers', () => {
      const shim = new MetadataCacheShim(makeTree())
      const file = makeTFile('note.md')
      shim.populateFromContent(file.path, '# Just a heading\n\nAnd text.')

      expect(shim.getFileCache(file)?.blocks).toBeUndefined()
    })
  })

  describe('blockCache.getForFile()', () => {
    it('returns the same blocks as the public cache', () => {
      const { shim, file } = shimWithSource()

      const result = shim.blockCache.getForFile(file)

      expect(Object.keys(result?.blocks ?? {}).sort()).toEqual(['h1', 'li', 'para'])
    })

    it('accepts the (cancelContext, file) form Obsidian calls it with', () => {
      const { shim, file } = shimWithSource()

      const result = shim.blockCache.getForFile({ isCancelled: () => false }, file)

      expect(result?.blocks?.['para']).toBeDefined()
    })

    it('returns null for a file with no known content', () => {
      const shim = new MetadataCacheShim(makeTree())

      expect(shim.blockCache.getForFile(makeTFile('unknown.md'))).toBeNull()
    })

    it('returns null when called without a file', () => {
      const { shim } = shimWithSource()

      expect(shim.blockCache.getForFile()).toBeNull()
    })
  })
})
