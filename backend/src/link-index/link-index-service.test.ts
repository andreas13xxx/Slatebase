import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { LinkIndexService } from './link-index-service.js'
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
      await fs.writeFile(path.join(tempDir, '_link-index.json'), JSON.stringify(v1Data))
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
