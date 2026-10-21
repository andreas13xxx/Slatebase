// Unit tests for the graph routes tag extraction logic
// (Tests validate the refactored tag-extractor which is now used by graphRoutes)

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { extractTags } from '../link-index/tag-extractor.js'
import type { ILinkIndex } from '../link-index/types.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { ILogger } from '../logger/index.js'
import { createGraphRoutes } from './graphRoutes.js'

describe('extractTags (used by graphRoutes)', () => {
  it('extracts simple tags', () => {
    const result = extractTags('#hello world #test')
    expect(new Set(result)).toEqual(new Set(['hello', 'test']))
  })

  it('extracts tags with digits, underscores, hyphens, and slashes', () => {
    const result = extractTags('#project/alpha #tag_name #my-tag #tag123')
    expect(new Set(result)).toEqual(new Set(['project/alpha', 'tag_name', 'my-tag', 'tag123']))
  })

  it('excludes tags inside fenced code blocks', () => {
    const content = 'before\n```\n#notag\n```\nafter #valid'
    const result = extractTags(content)
    expect(new Set(result)).toEqual(new Set(['valid']))
  })

  it('excludes tags inside inline code', () => {
    const content = 'text `#notag` more #valid'
    const result = extractTags(content)
    expect(new Set(result)).toEqual(new Set(['valid']))
  })

  it('does not match C# as a tag (preceded by word character)', () => {
    const result = extractTags('C# is great')
    expect(result).toHaveLength(0)
  })

  it('returns empty array for content with no tags', () => {
    const result = extractTags('just plain text without any tags')
    expect(result).toHaveLength(0)
  })

  it('handles tags at the start of a line', () => {
    const result = extractTags('#first\n#second')
    expect(new Set(result)).toEqual(new Set(['first', 'second']))
  })

  it('handles tags with unicode letters', () => {
    const result = extractTags('#über #café')
    expect(new Set(result)).toEqual(new Set(['über', 'café']))
  })

  it('does not match # followed by a digit as first character', () => {
    const result = extractTags('#123 is not a tag')
    expect(result).toHaveLength(0)
  })

  it('handles multiple fenced code blocks', () => {
    const content = '```js\n#code1\n```\n#valid\n```python\n#code2\n```'
    const result = extractTags(content)
    expect(new Set(result)).toEqual(new Set(['valid']))
  })

  it('deduplicates tags appearing in multiple places', () => {
    const content = '#tag1 some text #tag1 more text #tag1'
    const result = extractTags(content)
    expect(result).toEqual(['tag1'])
  })
})

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
}

function createMockAccessControl(): IVaultAccessControl {
  return {
    checkReadAccess: async () => {},
    checkWriteAccess: async () => {},
    checkOwnerAccess: async () => {},
    createShare: async () => {},
    revokeShare: async () => {},
    updateSharePermission: async () => {},
    getUsersWithAccess: async () => [],
  }
}

function createMockLinkIndex(overrides: Partial<ILinkIndex> = {}): ILinkIndex {
  return {
    rebuild: async () => {},
    updateFile: async () => {},
    removeFile: async () => {},
    renameFile: async () => {},
    renameDirectory: async () => {},
    getForwardLinks: () => [],
    getBacklinks: () => [],
    getGraph: () => ({ nodes: [], edges: [] }),
    getGraphMeta: () => ({ tags: [], propertyKeys: [] }),
    isReady: () => true,
    getFilesByProperty: () => [],
    getPropertyKeys: () => [],
    getPropertyValues: () => [],
    queryByProperties: () => [],
    queryForBase: async () => ({ rows: [], total: 0 }),
    ...overrides,
  }
}

function createAliasTestApp(linkIndex: ILinkIndex | undefined): Hono {
  const routes = createGraphRoutes({
    getLinkIndex: () => linkIndex,
    accessControl: createMockAccessControl(),
    vaultRegistry: {} as IVaultRegistry,
    logger: createMockLogger(),
  })
  const app = new Hono()
  routes.register(app)
  return app
}

describe('GET /vaults/:vaultId/aliases', () => {
  it('returns an empty list when the vault has no link index', async () => {
    const app = createAliasTestApp(undefined)
    const res = await app.request('/vaults/v1/aliases')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ aliases: [] })
  })

  it('returns an empty list when there are no aliases', async () => {
    const app = createAliasTestApp(createMockLinkIndex({ getPropertyValues: () => [] }))
    const res = await app.request('/vaults/v1/aliases')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ aliases: [] })
  })

  it('maps one alias to its declaring file', async () => {
    const app = createAliasTestApp(createMockLinkIndex({
      getPropertyValues: (key) => (key === 'aliases' ? [{ value: 'Mein Alias', count: 1 }] : []),
      getFilesByProperty: (key, value) =>
        key === 'aliases' && value === 'Mein Alias' ? ['notes/ziel.md'] : [],
    }))
    const res = await app.request('/vaults/v1/aliases')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ aliases: [{ alias: 'Mein Alias', path: 'notes/ziel.md' }] })
  })

  it('yields one entry per file when several files share an alias', async () => {
    const app = createAliasTestApp(createMockLinkIndex({
      getPropertyValues: () => [{ value: 'shared', count: 2 }],
      getFilesByProperty: (key, value) =>
        key === 'aliases' && value === 'shared' ? ['a/one.md', 'b/two.md'] : [],
    }))
    const res = await app.request('/vaults/v1/aliases')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      aliases: [
        { alias: 'shared', path: 'a/one.md' },
        { alias: 'shared', path: 'b/two.md' },
      ],
    })
  })
})
