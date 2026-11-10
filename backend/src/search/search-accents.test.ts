import { describe, it, expect } from 'vitest'
import { SearchService } from './search-service.js'
import { parseSearchQuery } from './query-parser.js'
import { matchTextOperators } from './scoped-match.js'
import type { IVaultService, IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { DirectoryTree, FileContent } from '../vault/index.js'
import type { ISearchOptions } from './types.js'

// Accent-insensitive search (Obsidian 1.15): "cafe" finds "café", "strasse" finds "Straße".

const logger: ILogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

/** Only the two methods the search reads are real; every other method resolves to nothing. */
function vaultWith(files: Record<string, string>): IVaultService {
  const tree: DirectoryTree = {
    name: 'root',
    path: '',
    type: 'directory',
    children: Object.keys(files).map((p) => ({ name: p.split('/').pop() ?? p, path: p, type: 'file' as const, children: [] })),
  }
  const real = {
    getVaultTree: async () => tree,
    getFileContent: async (_v: string, p: string): Promise<FileContent> => ({
      content: files[p] ?? '',
      path: p,
      name: p.split('/').pop() ?? p,
      size: (files[p] ?? '').length,
      isBinary: false,
      isTruncated: false,
      encoding: 'utf-8',
      etag: 'e',
    }),
  }
  return new Proxy(real, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : async () => undefined) }) as unknown as IVaultService
}

const access = new Proxy({}, { get: () => async () => undefined }) as unknown as IVaultAccessControl

const options = (o: Partial<ISearchOptions>): ISearchOptions => ({
  query: 'x', caseSensitive: false, regex: false, contextLines: 0, maxResults: 100, ...o,
})

describe('SearchService plain-text search — accent-insensitive', () => {
  const service = new SearchService(vaultWith({ 'a.md': 'Ein Café am Fluss\nStraße 5' }), access, logger)

  it('finds "café" with "cafe" and reports the original text and range', async () => {
    const result = await service.search('v', options({ query: 'cafe' }))
    expect(result.totalHits).toBe(1)
    const hit = result.results[0]!.hits[0]!
    expect(hit.matchText).toBe('Café')
    expect(hit.matchLine).toBe('Ein Café am Fluss')
  })

  it('maps the range through ß → ss', async () => {
    const result = await service.search('v', options({ query: 'strasse' }))
    expect(result.results[0]!.hits[0]!.matchText).toBe('Straße')
  })

  it('stays exact when the search is case-sensitive', async () => {
    const result = await service.search('v', options({ query: 'cafe', caseSensitive: true }))
    expect(result.totalHits).toBe(0)
  })

  it('does not match umlauts as "ae/oe/ue"', async () => {
    const umlaut = new SearchService(vaultWith({ 'u.md': 'Äpfel' }), access, logger)
    expect((await umlaut.search('v', options({ query: 'apfel' }))).totalHits).toBe(1)
    expect((await umlaut.search('v', options({ query: 'aepfel' }))).totalHits).toBe(0)
  })

  it('matches file names with the file: operator', async () => {
    const files = new SearchService(vaultWith({ 'Café Notizen.md': 'x', 'other.md': 'y' }), access, logger)
    const result = await files.search('v', options({ query: 'file:cafe' }))
    expect(result.results.map((r) => r.filePath)).toEqual(['Café Notizen.md'])
  })
})

describe('scoped text operators — accent-insensitive', () => {
  const doc = ['# Küche', 'Crème Brûlée backen', 'nichts'].join('\n')
  const run = (q: string, caseSensitive = false) =>
    matchTextOperators(doc, parseSearchQuery(q).operators, caseSensitive)

  it('finds accented lines and slices the original match text', () => {
    const hits = run('line:(creme)')
    expect(hits?.map((h) => h.lineIndex)).toEqual([1])
    expect(hits?.[0]?.matchText).toBe('Crème')
  })

  it('is exact with match-case', () => {
    expect(run('match-case:(creme)', true)).toBeNull()
  })
})
