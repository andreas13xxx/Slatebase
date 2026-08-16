import { describe, it, expect, vi } from 'vitest'
import { listForVault, create, loadContent, saveContent, setEnabled, remove, snippetStore } from './snippetStore'
import type { IApiClient, SnippetMeta, SnippetRegistryData } from '../api'

function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    listSnippets: vi.fn().mockResolvedValue({ snippets: [] }),
    createSnippet: vi.fn(),
    loadSnippetContent: vi.fn(),
    saveSnippetContent: vi.fn(),
    deleteSnippet: vi.fn(),
    loadSnippetRegistry: vi.fn().mockResolvedValue({ version: 1, snippets: {} }),
    saveSnippetRegistry: vi.fn(),
    ...overrides,
  } as unknown as IApiClient
}

const metaA: SnippetMeta = { id: 'a', filename: 'a.css', size: 10, updatedAt: '2026-01-01T00:00:00.000Z' }
const metaB: SnippetMeta = { id: 'b', filename: 'b.css', size: 20, updatedAt: '2026-01-01T00:00:00.000Z' }

describe('snippetStore', () => {
  describe('listForVault', () => {
    it('merges snippet metadata with registry enabled state', async () => {
      const apiClient = createMockApiClient({
        listSnippets: vi.fn().mockResolvedValue({ snippets: [metaA, metaB] }),
        loadSnippetRegistry: vi.fn().mockResolvedValue({
          version: 1,
          snippets: { a: { enabled: true, updatedAt: '2026-01-01T00:00:00.000Z' } },
        } satisfies SnippetRegistryData),
      })

      const result = await listForVault(apiClient, 'vault1')

      expect(result).toEqual([
        { id: 'a', filename: 'a.css', size: 10, updatedAt: '2026-01-01T00:00:00.000Z', enabled: true },
        { id: 'b', filename: 'b.css', size: 20, updatedAt: '2026-01-01T00:00:00.000Z', enabled: false },
      ])
    })

    it('defaults enabled to false for snippets absent from the registry', async () => {
      const apiClient = createMockApiClient({
        listSnippets: vi.fn().mockResolvedValue({ snippets: [metaA] }),
        loadSnippetRegistry: vi.fn().mockResolvedValue({ version: 1, snippets: {} }),
      })

      const result = await listForVault(apiClient, 'vault1')
      expect(result[0]!.enabled).toBe(false)
    })
  })

  describe('create', () => {
    it('creates a snippet via the API client and returns it disabled', async () => {
      const apiClient = createMockApiClient({ createSnippet: vi.fn().mockResolvedValue(metaA) })

      const result = await create(apiClient, 'vault1', 'a.css', 'body {}')

      expect(apiClient.createSnippet).toHaveBeenCalledWith('vault1', 'a.css', 'body {}')
      expect(result.enabled).toBe(false)
      expect(result.id).toBe('a')
    })
  })

  describe('loadContent / saveContent', () => {
    it('delegates to the API client', async () => {
      const apiClient = createMockApiClient({ loadSnippetContent: vi.fn().mockResolvedValue('body {}') })
      expect(await loadContent(apiClient, 'vault1', 'a')).toBe('body {}')

      const apiClient2 = createMockApiClient()
      await saveContent(apiClient2, 'vault1', 'a', 'body { color: red; }')
      expect(apiClient2.saveSnippetContent).toHaveBeenCalledWith('vault1', 'a', 'body { color: red; }')
    })
  })

  describe('setEnabled', () => {
    it('merges the change into the existing registry and saves it', async () => {
      let saved: SnippetRegistryData | undefined
      const apiClient = createMockApiClient({
        loadSnippetRegistry: vi.fn().mockResolvedValue({
          version: 1,
          snippets: { other: { enabled: true, updatedAt: '2026-01-01T00:00:00.000Z' } },
        }),
        saveSnippetRegistry: vi.fn().mockImplementation(async (_v: string, r: SnippetRegistryData) => { saved = r }),
      })

      await setEnabled(apiClient, 'vault1', 'a', true)

      expect(saved?.snippets['other']).toEqual({ enabled: true, updatedAt: '2026-01-01T00:00:00.000Z' })
      expect(saved?.snippets['a']?.enabled).toBe(true)
    })
  })

  describe('remove', () => {
    it('delegates to the API client', async () => {
      const apiClient = createMockApiClient()
      await remove(apiClient, 'vault1', 'a')
      expect(apiClient.deleteSnippet).toHaveBeenCalledWith('vault1', 'a')
    })
  })

  describe('snippetStore object', () => {
    it('exposes all ISnippetStore methods', () => {
      expect(typeof snippetStore.listForVault).toBe('function')
      expect(typeof snippetStore.create).toBe('function')
      expect(typeof snippetStore.loadContent).toBe('function')
      expect(typeof snippetStore.saveContent).toBe('function')
      expect(typeof snippetStore.setEnabled).toBe('function')
      expect(typeof snippetStore.remove).toBe('function')
    })
  })
})
