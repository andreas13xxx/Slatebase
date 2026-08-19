import { describe, it, expect, vi } from 'vitest'
import {
  LinkMigrationService,
  rewriteWikilinksInContent,
  computeAffectedFilePairs,
} from './link-migration-service.js'
import type { ILinkIndex } from './types.js'
import type { IVaultService, FileSaveResult } from '../business/index.js'
import type { ISearchService, SearchResponse } from '../search/types.js'
import type { ILogger } from '../logger/index.js'
import type { DirectoryTree, FileContent } from '../vault/index.js'

function createMockLogger(): ILogger {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, child: () => createMockLogger() } as unknown as ILogger
}

function file(name: string, path: string): DirectoryTree {
  return { name, type: 'file', path }
}

function dir(name: string, path: string, children: DirectoryTree[]): DirectoryTree {
  return { name, type: 'directory', path, children }
}

// ─── rewriteWikilinksInContent ────────────────────────────────────────────────

describe('rewriteWikilinksInContent', () => {
  const tree = dir('vault', '', [
    file('Hello.md', 'Hello.md'),
    file('Other.md', 'Other.md'),
    dir('folder', 'folder', [file('Hello.md', 'folder/Hello.md')]),
  ])

  it('rewrites a bare-name link resolving to the old path', () => {
    const result = rewriteWikilinksInContent('See [[Hello]] for details.', 'Source.md', 'Hello.md', 'Renamed', tree)
    expect(result).toEqual({ content: 'See [[Renamed]] for details.', count: 1 })
  })

  it('preserves an explicit alias and heading', () => {
    const result = rewriteWikilinksInContent('See [[Hello#Intro|the intro]] here.', 'Source.md', 'Hello.md', 'Renamed', tree)
    expect(result).toEqual({ content: 'See [[Renamed#Intro|the intro]] here.', count: 1 })
  })

  it('rewrites multiple occurrences across multiple lines', () => {
    const content = 'First [[Hello]] mention.\nSecond [[Hello]] mention.'
    const result = rewriteWikilinksInContent(content, 'Source.md', 'Hello.md', 'Renamed', tree)
    expect(result).toEqual({
      content: 'First [[Renamed]] mention.\nSecond [[Renamed]] mention.',
      count: 2,
    })
  })

  it('rewrites multiple occurrences on the same line', () => {
    const content = '[[Hello]] and again [[Hello]].'
    const result = rewriteWikilinksInContent(content, 'Source.md', 'Hello.md', 'Renamed', tree)
    expect(result).toEqual({ content: '[[Renamed]] and again [[Renamed]].', count: 2 })
  })

  it('leaves wikilinks to other files untouched', () => {
    const content = 'See [[Other]] and [[Hello]].'
    const result = rewriteWikilinksInContent(content, 'Source.md', 'Hello.md', 'Renamed', tree)
    expect(result).toEqual({ content: 'See [[Other]] and [[Renamed]].', count: 1 })
  })

  it('only rewrites the wikilink that actually resolves to oldPath under ambiguity', () => {
    // A bare `[[Hello]]` from a file inside `folder/` resolves to `folder/Hello.md`
    // (same-folder-first), not the root `Hello.md` — must not be touched by a
    // migration targeting the root file.
    const content = 'See [[Hello]].'
    const result = rewriteWikilinksInContent(content, 'folder/Source.md', 'Hello.md', 'Renamed', tree)
    expect(result).toBeNull()
  })

  it('returns null when no wikilink in the content targets oldPath', () => {
    const result = rewriteWikilinksInContent('Nothing to see here.', 'Source.md', 'Hello.md', 'Renamed', tree)
    expect(result).toBeNull()
  })

  it('rewrites embeds the same way as regular wikilinks', () => {
    const result = rewriteWikilinksInContent('![[Hello]]', 'Source.md', 'Hello.md', 'Renamed', tree)
    expect(result).toEqual({ content: '![[Renamed]]', count: 1 })
  })
})

// ─── computeAffectedFilePairs ─────────────────────────────────────────────────

describe('computeAffectedFilePairs', () => {
  const tree = dir('vault', '', [
    file('Note.md', 'Note.md'),
    dir('Folder', 'Folder', [
      file('A.md', 'Folder/A.md'),
      dir('Sub', 'Folder/Sub', [file('B.md', 'Folder/Sub/B.md')]),
    ]),
  ])

  it('returns a single pair for a file rename', () => {
    expect(computeAffectedFilePairs(tree, 'Note.md', 'Renamed.md')).toEqual([
      { oldPath: 'Note.md', newPath: 'Renamed.md' },
    ])
  })

  it('returns one pair per descendant file for a folder move', () => {
    const pairs = computeAffectedFilePairs(tree, 'Folder', 'Moved')
    expect(pairs).toEqual(
      expect.arrayContaining([
        { oldPath: 'Folder/A.md', newPath: 'Moved/A.md' },
        { oldPath: 'Folder/Sub/B.md', newPath: 'Moved/Sub/B.md' },
      ]),
    )
    expect(pairs).toHaveLength(2)
  })

  it('returns an empty array when the source path is not found in the tree', () => {
    expect(computeAffectedFilePairs(tree, 'DoesNotExist.md', 'X.md')).toEqual([])
  })
})

// ─── LinkMigrationService ──────────────────────────────────────────────────────

function createMockVaultService(files: Record<string, string>, overrides: Partial<IVaultService> = {}): IVaultService {
  const saveFile = vi.fn(async (_vaultId: string, filePath: string, content: string): Promise<FileSaveResult> => {
    files[filePath] = content
    return { path: filePath, name: filePath, size: content.length, etag: 'etag' }
  })
  const getFileContent = vi.fn(async (_vaultId: string, filePath: string): Promise<FileContent> => {
    const content = files[filePath]
    if (content === undefined) throw new Error(`not found: ${filePath}`)
    return { path: filePath, name: filePath, content, size: content.length, encoding: 'utf-8', isBinary: false, isTruncated: false, etag: 'etag' }
  })
  return { getFileContent, saveFile, ...overrides } as unknown as IVaultService
}

function createMockSearchService(response: Partial<SearchResponse>): ISearchService {
  return {
    search: vi.fn().mockResolvedValue({
      results: [],
      totalHits: 0,
      filesSearched: 0,
      truncated: false,
      skippedFiles: [],
      durationMs: 0,
      ...response,
    }),
    searchMultiVault: vi.fn(),
  }
}

function createMockLinkIndex(backlinks: string[]): ILinkIndex {
  return {
    rebuild: vi.fn(),
    updateFile: vi.fn().mockResolvedValue(undefined),
    removeFile: vi.fn(),
    renameFile: vi.fn(),
    getForwardLinks: vi.fn().mockReturnValue([]),
    getBacklinks: vi.fn().mockReturnValue(backlinks),
    getGraph: vi.fn(),
    getGraphMeta: vi.fn(),
    isReady: vi.fn().mockReturnValue(true),
  } as unknown as ILinkIndex
}

const tree = dir('vault', '', [
  file('Hello.md', 'Hello.md'),
  dir('other', 'other', [file('Referrer.md', 'other/Referrer.md')]),
  file('Search-only.md', 'Search-only.md'),
])

describe('LinkMigrationService', () => {
  it('rewrites and saves a file found via the index (exact-path) fast path', async () => {
    const files = { 'other/Referrer.md': 'See [[Hello]].' }
    const vaultService = createMockVaultService(files)
    const searchService = createMockSearchService({})
    const linkIndex = createMockLinkIndex(['other/Referrer.md'])
    const service = new LinkMigrationService(vaultService, searchService, () => linkIndex, createMockLogger())

    const result = await service.migrateLinks('vault-1', 'Hello.md', 'Renamed.md', tree)

    expect(result.migratedFiles).toEqual([{ path: 'other/Referrer.md', replacements: 1 }])
    expect(result.failedFiles).toEqual([])
    expect(files['other/Referrer.md']).toBe('See [[Renamed]].')
    expect(linkIndex.updateFile).toHaveBeenCalledWith('other/Referrer.md', 'See [[Renamed]].')
  })

  it('rewrites a file found only via the filename search fallback (bare-name link the index misses)', async () => {
    const files = { 'Search-only.md': 'Mentions [[Hello]] too.' }
    const vaultService = createMockVaultService(files)
    const searchService = createMockSearchService({
      results: [{ filePath: 'Search-only.md', fileName: 'Search-only.md', hitCount: 1, hits: [] }],
    })
    const linkIndex = createMockLinkIndex([]) // index doesn't know about this one
    const service = new LinkMigrationService(vaultService, searchService, () => linkIndex, createMockLogger())

    const result = await service.migrateLinks('vault-1', 'Hello.md', 'Renamed.md', tree)

    expect(result.migratedFiles).toEqual([{ path: 'Search-only.md', replacements: 1 }])
    expect(files['Search-only.md']).toBe('Mentions [[Renamed]] too.')
  })

  it('does not touch a candidate whose wikilinks do not actually resolve to oldPath', async () => {
    const files = { 'Search-only.md': 'Unrelated content mentioning Hello in passing, no link.' }
    const vaultService = createMockVaultService(files)
    const searchService = createMockSearchService({
      results: [{ filePath: 'Search-only.md', fileName: 'Search-only.md', hitCount: 1, hits: [] }],
    })
    const linkIndex = createMockLinkIndex([])
    const service = new LinkMigrationService(vaultService, searchService, () => linkIndex, createMockLogger())

    const result = await service.migrateLinks('vault-1', 'Hello.md', 'Renamed.md', tree)

    expect(result.migratedFiles).toEqual([])
    expect(vaultService.saveFile).not.toHaveBeenCalled()
  })

  it('excludes oldPath and newPath themselves from candidates', async () => {
    const files: Record<string, string> = {}
    const vaultService = createMockVaultService(files)
    const searchService = createMockSearchService({})
    const linkIndex = createMockLinkIndex(['Hello.md', 'Renamed.md'])
    const service = new LinkMigrationService(vaultService, searchService, () => linkIndex, createMockLogger())

    const result = await service.migrateLinks('vault-1', 'Hello.md', 'Renamed.md', tree)

    expect(result.migratedFiles).toEqual([])
    expect(vaultService.getFileContent).not.toHaveBeenCalled()
  })

  it('skips binary candidate files', async () => {
    const vaultService = createMockVaultService({}, {
      getFileContent: vi.fn().mockResolvedValue({
        path: 'other/Referrer.md', name: 'Referrer.md', content: '', size: 100,
        encoding: 'utf-8', isBinary: true, isTruncated: false, etag: 'x',
      } satisfies FileContent),
    })
    const searchService = createMockSearchService({})
    const linkIndex = createMockLinkIndex(['other/Referrer.md'])
    const service = new LinkMigrationService(vaultService, searchService, () => linkIndex, createMockLogger())

    const result = await service.migrateLinks('vault-1', 'Hello.md', 'Renamed.md', tree)

    expect(result.migratedFiles).toEqual([])
    expect(vaultService.saveFile).not.toHaveBeenCalled()
  })

  it('continues past a failed candidate and reports it in failedFiles', async () => {
    const files = { 'other/Referrer.md': 'See [[Hello]].' }
    const vaultService = createMockVaultService(files, {
      saveFile: vi.fn().mockRejectedValue(new Error('disk full')),
    })
    const searchService = createMockSearchService({})
    const linkIndex = createMockLinkIndex(['other/Referrer.md'])
    const service = new LinkMigrationService(vaultService, searchService, () => linkIndex, createMockLogger())

    const result = await service.migrateLinks('vault-1', 'Hello.md', 'Renamed.md', tree)

    expect(result.migratedFiles).toEqual([])
    expect(result.failedFiles).toEqual([{ path: 'other/Referrer.md', reason: 'disk full' }])
  })

  it('returns empty results when there is no link index for the vault and search finds nothing', async () => {
    const vaultService = createMockVaultService({})
    const searchService = createMockSearchService({})
    const service = new LinkMigrationService(vaultService, searchService, () => undefined, createMockLogger())

    const result = await service.migrateLinks('vault-1', 'Hello.md', 'Renamed.md', tree)

    expect(result).toEqual({ migratedFiles: [], failedFiles: [] })
  })
})
