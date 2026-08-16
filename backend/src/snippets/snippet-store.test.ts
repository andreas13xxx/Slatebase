import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { SnippetStore } from './snippet-store.js'
import { SnippetTooLargeError } from './errors.js'
import { MAX_SNIPPET_SIZE } from './validation.js'
import type { SnippetRegistryData } from './types.js'

let tmpDir: string
let store: SnippetStore

beforeAll(async () => {
  tmpDir = path.join(os.tmpdir(), `snippet-store-test-${crypto.randomBytes(8).toString('hex')}`)
  await fs.mkdir(tmpDir, { recursive: true })
  store = new SnippetStore(tmpDir)
})

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('SnippetStore', () => {
  describe('saveSnippet / loadSnippet', () => {
    it('saves and loads a snippet', async () => {
      await store.saveSnippet('vault-1', 'dark-accent', 'body { color: red; }')

      const content = await store.loadSnippet('vault-1', 'dark-accent')
      expect(content).toBe('body { color: red; }')
    })

    it('overwrites an existing snippet', async () => {
      await store.saveSnippet('vault-1', 'overwrite-me', 'a { color: red; }')
      await store.saveSnippet('vault-1', 'overwrite-me', 'a { color: blue; }')

      expect(await store.loadSnippet('vault-1', 'overwrite-me')).toBe('a { color: blue; }')
    })

    it('returns null for a snippet that does not exist', async () => {
      expect(await store.loadSnippet('vault-1', 'nonexistent')).toBeNull()
    })

    it('rejects snippets exceeding 512 KB', async () => {
      const large = 'x'.repeat(MAX_SNIPPET_SIZE + 1)
      await expect(store.saveSnippet('vault-1', 'too-large', large)).rejects.toThrow(SnippetTooLargeError)
    })

    it('rejects a snippet id that would path-traverse out of the vault directory', async () => {
      await expect(store.saveSnippet('vault-1', '../../etc/passwd', 'a {}')).rejects.toThrow()
    })
  })

  describe('deleteSnippet', () => {
    it('deletes a snippet', async () => {
      await store.saveSnippet('vault-1', 'to-delete', 'a {}')
      await store.deleteSnippet('vault-1', 'to-delete')

      expect(await store.loadSnippet('vault-1', 'to-delete')).toBeNull()
    })

    it('does nothing when the snippet does not exist', async () => {
      await expect(store.deleteSnippet('vault-1', 'never-existed')).resolves.toBeUndefined()
    })
  })

  describe('listSnippets', () => {
    it('lists metadata for all snippets in a vault', async () => {
      const vaultId = 'vault-list-test'
      await store.saveSnippet(vaultId, 'one', 'a {}')
      await store.saveSnippet(vaultId, 'two', 'b { color: red; }')

      const metas = await store.listSnippets(vaultId)
      const ids = metas.map(m => m.id).sort()
      expect(ids).toEqual(['one', 'two'])
      expect(metas.every(m => m.filename.endsWith('.css'))).toBe(true)
      expect(metas.every(m => m.size > 0)).toBe(true)
      expect(metas.every(m => typeof m.updatedAt === 'string')).toBe(true)
    })

    it('returns an empty array for a vault with no snippets', async () => {
      expect(await store.listSnippets('vault-never-used')).toEqual([])
    })

    it('ignores the registry file and non-css files', async () => {
      const vaultId = 'vault-ignore-test'
      await store.saveSnippet(vaultId, 'valid', 'a {}')
      await store.saveRegistry(vaultId, { version: 1, snippets: {} })

      const metas = await store.listSnippets(vaultId)
      expect(metas.map(m => m.id)).toEqual(['valid'])
    })
  })

  describe('saveRegistry / loadRegistry', () => {
    it('saves and loads the registry', async () => {
      const vaultId = 'vault-registry-test'
      const registry: SnippetRegistryData = {
        version: 1,
        snippets: { 'dark-accent': { enabled: true, updatedAt: '2026-01-01T00:00:00.000Z' } },
      }

      await store.saveRegistry(vaultId, registry)

      expect(await store.loadRegistry(vaultId)).toEqual(registry)
    })

    it('returns null when no registry exists', async () => {
      expect(await store.loadRegistry('vault-no-registry')).toBeNull()
    })
  })

  describe('deleteAllForVault', () => {
    it('removes all snippet files and the registry for a vault', async () => {
      const vaultId = 'vault-delete-all-test'
      await store.saveSnippet(vaultId, 'one', 'a {}')
      await store.saveRegistry(vaultId, { version: 1, snippets: {} })

      await store.deleteAllForVault(vaultId)

      expect(await store.listSnippets(vaultId)).toEqual([])
      expect(await store.loadRegistry(vaultId)).toBeNull()
    })

    it('does nothing when the vault has no snippet directory', async () => {
      await expect(store.deleteAllForVault('vault-never-had-snippets')).resolves.toBeUndefined()
    })
  })

  describe('vault isolation', () => {
    it('keeps snippets of the same id separate across vaults', async () => {
      await store.saveSnippet('vault-a', 'shared-name', 'a { color: red; }')
      await store.saveSnippet('vault-b', 'shared-name', 'a { color: blue; }')

      expect(await store.loadSnippet('vault-a', 'shared-name')).toBe('a { color: red; }')
      expect(await store.loadSnippet('vault-b', 'shared-name')).toBe('a { color: blue; }')
    })
  })
})
