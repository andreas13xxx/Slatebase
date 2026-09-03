import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { LinkIndexService, extractFrontmatterTags } from './link-index-service.js'
import type { ILogger } from '../logger/index.js'

/** Creates a silent mock logger. */
function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => createMockLogger(),
  } as unknown as ILogger
}

describe('LinkIndexService (extended v2)', () => {
  let tempDir: string
  let service: LinkIndexService
  const logger = createMockLogger()

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'link-index-v2-'))
    service = new LinkIndexService(tempDir, 'test-vault', 'Test Vault', logger)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('rebuild extracts tags and properties', () => {
    it('extracts tags from markdown files during rebuild', async () => {
      await fs.writeFile(path.join(tempDir, 'notes.md'), '# Notes\n#tag1 #tag2\nContent')
      await service.rebuild()

      const meta = service.getGraphMeta()
      expect(meta.tags).toContainEqual({ name: 'tag1', count: 1 })
      expect(meta.tags).toContainEqual({ name: 'tag2', count: 1 })
    })

    it('extracts properties from markdown files during rebuild', async () => {
      await fs.writeFile(path.join(tempDir, 'note.md'), '---\nstatus: active\npriority: 1\n---\n# Title')
      await service.rebuild()

      const meta = service.getGraphMeta()
      expect(meta.propertyKeys).toContainEqual({ key: 'status', count: 1 })
      expect(meta.propertyKeys).toContainEqual({ key: 'priority', count: 1 })
    })
  })

  describe('updateFile updates tags and properties', () => {
    it('updates tags for a file', async () => {
      await fs.writeFile(path.join(tempDir, 'a.md'), '#old-tag')
      await service.rebuild()

      await service.updateFile('a.md', '#new-tag #another')

      const meta = service.getGraphMeta()
      const tagNames = meta.tags.map((t) => t.name)
      expect(tagNames).toContain('new-tag')
      expect(tagNames).toContain('another')
      expect(tagNames).not.toContain('old-tag')
    })

    it('updates properties for a file', async () => {
      await fs.writeFile(path.join(tempDir, 'a.md'), '---\nstatus: draft\n---\n')
      await service.rebuild()

      await service.updateFile('a.md', '---\nstatus: published\ncategory: blog\n---\n')

      const meta = service.getGraphMeta()
      expect(meta.propertyKeys).toContainEqual({ key: 'status', count: 1 })
      expect(meta.propertyKeys).toContainEqual({ key: 'category', count: 1 })
    })
  })

  describe('removeFile removes tags and properties', () => {
    it('removes tags when file is deleted', async () => {
      await fs.writeFile(path.join(tempDir, 'a.md'), '#tag1')
      await service.rebuild()

      await service.removeFile('a.md')

      const meta = service.getGraphMeta()
      expect(meta.tags).toHaveLength(0)
    })

    it('removes properties when file is deleted', async () => {
      await fs.writeFile(path.join(tempDir, 'a.md'), '---\nstatus: active\n---\n')
      await service.rebuild()

      await service.removeFile('a.md')

      const meta = service.getGraphMeta()
      expect(meta.propertyKeys).toHaveLength(0)
    })

    it('removes tags of every note inside a deleted folder', async () => {
      await fs.mkdir(path.join(tempDir, 'Projekte', 'Alpha'), { recursive: true })
      await fs.writeFile(path.join(tempDir, 'Projekte', 'Alpha', 'a.md'), '#alpha')
      await fs.writeFile(path.join(tempDir, 'Projekte', 'Alpha', 'b.md'), '---\nstatus: active\n---\n#alpha')
      await fs.writeFile(path.join(tempDir, 'keep.md'), '#keep')
      await service.rebuild()

      // The folder path carries no extension — it must not be normalized to
      // `Projekte/Alpha.md`, or nothing below it would ever be pruned.
      await service.removeFile('Projekte/Alpha')

      const meta = service.getGraphMeta()
      expect(meta.tags).toEqual([{ name: 'keep', count: 1 }])
      expect(meta.propertyKeys).toHaveLength(0)
    })

    it('leaves the index untouched when the deleted path is not indexed', async () => {
      await fs.writeFile(path.join(tempDir, 'a.md'), '#tag1')
      await service.rebuild()

      await service.removeFile('assets/diagram.png')

      const meta = service.getGraphMeta()
      expect(meta.tags).toEqual([{ name: 'tag1', count: 1 }])
    })
  })

  describe('renameDirectory re-homes a moved folder', () => {
    /** Moves `from` to `to` on disk, creating the destination's parent. */
    async function moveOnDisk(from: string, to: string): Promise<void> {
      await fs.mkdir(path.dirname(path.join(tempDir, to)), { recursive: true })
      await fs.rename(path.join(tempDir, from), path.join(tempDir, to))
    }

    it('files the moved notes tags and properties under their new paths', async () => {
      await fs.mkdir(path.join(tempDir, 'Projekte', 'Alpha'), { recursive: true })
      await fs.writeFile(path.join(tempDir, 'Projekte', 'Alpha', 'a.md'), '---\nstatus: active\n---\n#alpha')
      await fs.writeFile(path.join(tempDir, 'keep.md'), '#keep')
      await service.rebuild()

      await moveOnDisk('Projekte', 'Archiv/Projekte')
      await service.renameDirectory('Projekte', 'Archiv/Projekte')

      // The notes' content never changed, so the tag itself survives — only the
      // path it is filed under moves.
      expect(service.getGraphMeta().tags).toContainEqual({ name: 'alpha', count: 1 })
      expect(service.getGraphMeta().tags).toContainEqual({ name: 'keep', count: 1 })
      expect(service.getFilesByProperty('status')).toEqual(['Archiv/Projekte/Alpha/a.md'])
    })

    it('rebuilds backlinks against the new source paths', async () => {
      await fs.mkdir(path.join(tempDir, 'Projekte'), { recursive: true })
      await fs.writeFile(path.join(tempDir, 'Projekte', 'a.md'), '[[target]]')
      await fs.writeFile(path.join(tempDir, 'target.md'), 'content')
      await service.rebuild()
      expect(service.getBacklinks('target.md')).toEqual(['Projekte/a.md'])

      await moveOnDisk('Projekte', 'Archiv')
      await service.renameDirectory('Projekte', 'Archiv')

      expect(service.getBacklinks('target.md')).toEqual(['Archiv/a.md'])
      expect(service.getForwardLinks('Archiv/a.md')).toEqual(['target.md'])
      expect(service.getForwardLinks('Projekte/a.md')).toEqual([])
    })

    it('leaves a sibling folder that only shares a name prefix alone', async () => {
      await fs.mkdir(path.join(tempDir, 'Projekt'), { recursive: true })
      await fs.mkdir(path.join(tempDir, 'Projekte'), { recursive: true })
      await fs.writeFile(path.join(tempDir, 'Projekt', 'a.md'), '#eins')
      await fs.writeFile(path.join(tempDir, 'Projekte', 'b.md'), '#zwei')
      await service.rebuild()

      await moveOnDisk('Projekt', 'Archiv/Projekt')
      await service.renameDirectory('Projekt', 'Archiv/Projekt')

      // `Projekte/b.md` starts with the string `Projekt` but not with the
      // folder `Projekt/` — it must stay where it is.
      expect(service.getFilesByProperty('status')).toEqual([])
      expect(service.getGraph({ includeTags: true }).edges).toContainEqual(
        expect.objectContaining({ source: 'Projekte/b.md', target: 'tag:zwei' }),
      )
      expect(service.getGraph({ includeTags: true }).edges).toContainEqual(
        expect.objectContaining({ source: 'Archiv/Projekt/a.md', target: 'tag:eins' }),
      )
    })

    it('persists the new paths so a reload keeps them', async () => {
      await fs.mkdir(path.join(tempDir, 'Projekte'), { recursive: true })
      await fs.writeFile(path.join(tempDir, 'Projekte', 'a.md'), '#alpha')
      await service.rebuild()

      await moveOnDisk('Projekte', 'Archiv')
      await service.renameDirectory('Projekte', 'Archiv')

      const raw = await fs.readFile(path.join(tempDir, '.slatebase', 'link-index.json'), 'utf-8')
      expect(JSON.parse(raw).tags).toEqual({ 'Archiv/a.md': ['alpha'] })
    })
  })

  describe('loadFromDisk prunes entries for files that are gone', () => {
    it('drops tags and properties of notes deleted while the index was not running', async () => {
      await fs.writeFile(path.join(tempDir, 'gone.md'), '---\nstatus: active\n---\n#verschwunden')
      await fs.writeFile(path.join(tempDir, 'kept.md'), '#geblieben')
      await service.rebuild()

      // Deleted behind the index's back — no removeFile call, as happens when
      // the vault is edited outside the app.
      await fs.rm(path.join(tempDir, 'gone.md'))

      const reloaded = new LinkIndexService(tempDir, 'test-vault', 'Test Vault', logger)
      await reloaded.loadFromDisk()

      const meta = reloaded.getGraphMeta()
      expect(meta.tags).toEqual([{ name: 'geblieben', count: 1 }])
      expect(meta.propertyKeys).toHaveLength(0)
    })

    it('persists the pruned index so the next load starts clean', async () => {
      await fs.writeFile(path.join(tempDir, 'gone.md'), '#verschwunden')
      await fs.writeFile(path.join(tempDir, 'kept.md'), '#geblieben')
      await service.rebuild()
      await fs.rm(path.join(tempDir, 'gone.md'))

      await new LinkIndexService(tempDir, 'test-vault', 'Test Vault', logger).loadFromDisk()

      const raw = await fs.readFile(path.join(tempDir, '.slatebase', 'link-index.json'), 'utf-8')
      expect(JSON.parse(raw).tags).toEqual({ 'kept.md': ['geblieben'] })
    })

    it('keeps the index when the vault directory yields no files at all', async () => {
      await fs.writeFile(path.join(tempDir, 'a.md'), '#tag1')
      await service.rebuild()

      // Every note gone at once reads as an unreadable or unmounted vault
      // rather than a mass delete — wiping the index there would lose data
      // that comes back with the directory.
      await fs.rm(path.join(tempDir, 'a.md'))

      const reloaded = new LinkIndexService(tempDir, 'test-vault', 'Test Vault', logger)
      await reloaded.loadFromDisk()

      expect(reloaded.getGraphMeta().tags).toEqual([{ name: 'tag1', count: 1 }])
    })
  })

  describe('v2 persistence round-trip', () => {
    it('persists and loads tags and properties correctly', async () => {
      await fs.writeFile(path.join(tempDir, 'a.md'), '---\nstatus: active\n---\n#tag1 #tag2\n[[b]]')
      await fs.writeFile(path.join(tempDir, 'b.md'), '---\npriority: 1\n---\n#tag1\n')
      await service.rebuild()

      // Create a fresh service and load from disk
      const service2 = new LinkIndexService(tempDir, 'test-vault', 'Test Vault', logger)
      await service2.loadFromDisk()

      expect(service2.isReady()).toBe(true)

      const meta = service2.getGraphMeta()
      expect(meta.tags.find((t) => t.name === 'tag1')?.count).toBe(2)
      expect(meta.tags.find((t) => t.name === 'tag2')?.count).toBe(1)
      expect(meta.propertyKeys.find((k) => k.key === 'status')?.count).toBe(1)
      expect(meta.propertyKeys.find((k) => k.key === 'priority')?.count).toBe(1)
    })
  })

  describe('v1 → v2 migration', () => {
    it('triggers rebuild when loading v1 schema', async () => {
      // Write a v1 index file
      const v1Data = {
        version: 1,
        updatedAt: new Date().toISOString(),
        forwardLinks: { 'a.md': ['b.md'] },
      }
      await fs.mkdir(path.join(tempDir, '.slatebase'), { recursive: true })
      await fs.writeFile(path.join(tempDir, '.slatebase', 'link-index.json'), JSON.stringify(v1Data))
      await fs.writeFile(path.join(tempDir, 'a.md'), '---\nstatus: draft\n---\n#tag\n[[b]]')
      await fs.writeFile(path.join(tempDir, 'b.md'), 'content')

      await service.loadFromDisk()

      expect(service.isReady()).toBe(true)
      // After rebuild, tags and properties should be populated
      const meta = service.getGraphMeta()
      expect(meta.tags).toContainEqual({ name: 'tag', count: 1 })
      expect(meta.propertyKeys).toContainEqual({ key: 'status', count: 1 })
    })
  })

  describe('getGraph with includeTags', () => {
    it('returns tag nodes and tag edges when includeTags is true', async () => {
      await fs.writeFile(path.join(tempDir, 'a.md'), '#tag1 #tag2\n[[b]]')
      await fs.writeFile(path.join(tempDir, 'b.md'), '#tag1')
      await service.rebuild()

      const graph = service.getGraph({ includeTags: true })

      // Should have tag nodes
      const tagNodes = graph.nodes.filter((n) => n.type === 'tag')
      expect(tagNodes.length).toBe(2)
      expect(tagNodes.map((n) => n.id)).toContain('tag:tag1')
      expect(tagNodes.map((n) => n.id)).toContain('tag:tag2')

      // Tag nodes should have # prefix in label
      const tag1Node = tagNodes.find((n) => n.id === 'tag:tag1')
      expect(tag1Node?.label).toBe('#tag1')

      // Should have tag edges
      const tagEdges = graph.edges.filter((e) => e.type === 'tag')
      expect(tagEdges.length).toBe(3) // a→tag1, a→tag2, b→tag1
    })

    it('returns no tag nodes when includeTags is false/undefined', async () => {
      await fs.writeFile(path.join(tempDir, 'a.md'), '#tag1\n[[b]]')
      await fs.writeFile(path.join(tempDir, 'b.md'), 'content')
      await service.rebuild()

      const graph = service.getGraph()

      const tagNodes = graph.nodes.filter((n) => n.type === 'tag')
      expect(tagNodes).toHaveLength(0)
    })
  })

  describe('getGraph with includePropertyKeys', () => {
    it('returns property nodes and edges for requested keys', async () => {
      await fs.writeFile(path.join(tempDir, 'a.md'), '---\nstatus: active\npriority: 1\n---\n')
      await fs.writeFile(path.join(tempDir, 'b.md'), '---\nstatus: draft\n---\n')
      await service.rebuild()

      const graph = service.getGraph({ includePropertyKeys: ['status'] })

      const propNodes = graph.nodes.filter((n) => n.type === 'property')
      expect(propNodes.length).toBe(2) // prop:status:active, prop:status:draft
      expect(propNodes.map((n) => n.id)).toContain('prop:status:active')
      expect(propNodes.map((n) => n.id)).toContain('prop:status:draft')

      // Priority is NOT included
      const priorityNodes = propNodes.filter((n) => n.id.startsWith('prop:priority'))
      expect(priorityNodes).toHaveLength(0)

      // Property edges
      const propEdges = graph.edges.filter((e) => e.type === 'property')
      expect(propEdges.length).toBe(2)
    })

    it('returns no property nodes when includePropertyKeys is empty', async () => {
      await fs.writeFile(path.join(tempDir, 'a.md'), '---\nstatus: active\n---\n')
      await service.rebuild()

      const graph = service.getGraph({ includePropertyKeys: [] })

      const propNodes = graph.nodes.filter((n) => n.type === 'property')
      expect(propNodes).toHaveLength(0)
    })
  })

  describe('getGraphMeta aggregation', () => {
    it('aggregates tags sorted by count descending', async () => {
      await fs.writeFile(path.join(tempDir, 'a.md'), '#common #rare')
      await fs.writeFile(path.join(tempDir, 'b.md'), '#common')
      await fs.writeFile(path.join(tempDir, 'c.md'), '#common')
      await service.rebuild()

      const meta = service.getGraphMeta()
      expect(meta.tags[0]).toEqual({ name: 'common', count: 3 })
      expect(meta.tags[1]).toEqual({ name: 'rare', count: 1 })
    })

    it('aggregates property keys sorted by count descending', async () => {
      await fs.writeFile(path.join(tempDir, 'a.md'), '---\nstatus: a\ntitle: x\n---\n')
      await fs.writeFile(path.join(tempDir, 'b.md'), '---\nstatus: b\n---\n')
      await service.rebuild()

      const meta = service.getGraphMeta()
      expect(meta.propertyKeys[0]).toEqual({ key: 'status', count: 2 })
      expect(meta.propertyKeys[1]).toEqual({ key: 'title', count: 1 })
    })

    it('returns empty arrays for empty vault', async () => {
      await service.rebuild()
      const meta = service.getGraphMeta()
      expect(meta.tags).toEqual([])
      expect(meta.propertyKeys).toEqual([])
    })
  })

  describe('extractFrontmatterTags (helper)', () => {
    it('extracts tags from "tags" property (inline array)', () => {
      const properties = { tags: ['foo', 'bar', 'baz'] }
      const result = extractFrontmatterTags(properties)
      expect(result).toEqual(['foo', 'bar', 'baz'])
    })

    it('extracts tags from "tag" property (singular)', () => {
      const properties = { tag: ['single'] }
      const result = extractFrontmatterTags(properties)
      expect(result).toEqual(['single'])
    })

    it('prefers "tags" over "tag" when both present', () => {
      const properties = { tags: ['from-tags'], tag: ['from-tag'] }
      const result = extractFrontmatterTags(properties)
      expect(result).toEqual(['from-tags'])
    })

    it('strips leading # from tag values', () => {
      const properties = { tags: ['#foo', '#bar', 'baz'] }
      const result = extractFrontmatterTags(properties)
      expect(result).toEqual(['foo', 'bar', 'baz'])
    })

    it('handles nested tags with slashes', () => {
      const properties = { tags: ['project/alpha', '#category/sub'] }
      const result = extractFrontmatterTags(properties)
      expect(result).toEqual(['project/alpha', 'category/sub'])
    })

    it('returns empty array when no tags property exists', () => {
      const properties = { status: ['active'] }
      const result = extractFrontmatterTags(properties)
      expect(result).toEqual([])
    })

    it('filters out empty strings', () => {
      const properties = { tags: ['', 'valid', '#'] }
      const result = extractFrontmatterTags(properties)
      expect(result).toEqual(['valid'])
    })
  })

  describe('frontmatter tags integration', () => {
    it('rebuild merges frontmatter tags with inline tags', async () => {
      await fs.writeFile(
        path.join(tempDir, 'a.md'),
        '---\ntags: [fm-tag, shared]\n---\n#inline-tag #shared\n',
      )
      await service.rebuild()

      const meta = service.getGraphMeta()
      const tagNames = meta.tags.map((t) => t.name)
      expect(tagNames).toContain('fm-tag')
      expect(tagNames).toContain('inline-tag')
      expect(tagNames).toContain('shared')
      // "shared" should only appear once (deduplicated)
      expect(meta.tags.find((t) => t.name === 'shared')?.count).toBe(1)
    })

    it('rebuild handles frontmatter-only tags (no inline tags)', async () => {
      await fs.writeFile(
        path.join(tempDir, 'a.md'),
        '---\ntags:\n  - alpha\n  - beta\n---\nNo inline tags here.\n',
      )
      await service.rebuild()

      const meta = service.getGraphMeta()
      const tagNames = meta.tags.map((t) => t.name)
      expect(tagNames).toContain('alpha')
      expect(tagNames).toContain('beta')
    })

    it('updateFile merges frontmatter tags with inline tags', async () => {
      await fs.writeFile(path.join(tempDir, 'a.md'), '#old')
      await service.rebuild()

      await service.updateFile('a.md', '---\ntags: [new-fm]\n---\n#new-inline\n')

      const meta = service.getGraphMeta()
      const tagNames = meta.tags.map((t) => t.name)
      expect(tagNames).toContain('new-fm')
      expect(tagNames).toContain('new-inline')
      expect(tagNames).not.toContain('old')
    })

    it('renameFile merges frontmatter tags with inline tags', async () => {
      await fs.writeFile(path.join(tempDir, 'a.md'), '---\ntags: [fm]\n---\n#inline\n')
      await service.rebuild()

      await service.renameFile('a.md', 'b.md', '---\ntags: [fm]\n---\n#inline\n')

      const meta = service.getGraphMeta()
      const tagNames = meta.tags.map((t) => t.name)
      expect(tagNames).toContain('fm')
      expect(tagNames).toContain('inline')
    })

    it('frontmatter tags appear as tag nodes in graph', async () => {
      await fs.writeFile(
        path.join(tempDir, 'a.md'),
        '---\ntags: [fm-only]\n---\nContent without inline tags\n',
      )
      await service.rebuild()

      const graph = service.getGraph({ includeTags: true })
      const tagNodes = graph.nodes.filter((n) => n.type === 'tag')
      expect(tagNodes.map((n) => n.id)).toContain('tag:fm-only')
      expect(tagNodes.find((n) => n.id === 'tag:fm-only')?.label).toBe('#fm-only')

      const tagEdges = graph.edges.filter((e) => e.type === 'tag')
      expect(tagEdges).toContainEqual({ source: 'a.md', target: 'tag:fm-only', type: 'tag' })
    })

    it('handles "tag" singular property (Obsidian compat)', async () => {
      await fs.writeFile(
        path.join(tempDir, 'a.md'),
        '---\ntag: singular-tag\n---\n',
      )
      await service.rebuild()

      const meta = service.getGraphMeta()
      expect(meta.tags).toContainEqual({ name: 'singular-tag', count: 1 })
    })

    it('strips # prefix from frontmatter tags', async () => {
      await fs.writeFile(
        path.join(tempDir, 'a.md'),
        '---\ntags: ["#prefixed", "clean"]\n---\n',
      )
      await service.rebuild()

      const meta = service.getGraphMeta()
      const tagNames = meta.tags.map((t) => t.name)
      expect(tagNames).toContain('prefixed')
      expect(tagNames).toContain('clean')
      expect(tagNames).not.toContain('#prefixed')
    })
  })

  describe('getGraph with new node schema', () => {
    it('file nodes have id, type, path, label, and exists fields', async () => {
      await fs.writeFile(path.join(tempDir, 'a.md'), '[[b]]')
      await service.rebuild()

      const graph = service.getGraph()
      const fileNodes = graph.nodes.filter((n) => n.type === 'file')

      const aNode = fileNodes.find((n) => n.id === 'a.md')
      expect(aNode).toBeDefined()
      expect(aNode!.type).toBe('file')
      expect(aNode!.path).toBe('a.md')
      expect(aNode!.label).toBe('a')
      expect(aNode!.exists).toBe(true)

      // b.md doesn't exist on disk (unresolved)
      const bNode = fileNodes.find((n) => n.id === 'b.md')
      expect(bNode).toBeDefined()
      expect(bNode!.exists).toBe(false)
    })

    it('edges have type field', async () => {
      await fs.writeFile(path.join(tempDir, 'a.md'), '[[b]]')
      await service.rebuild()

      const graph = service.getGraph()
      expect(graph.edges[0]?.type).toBe('link')
    })
  })
})
