import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type { IVaultRegistry, VaultRegistryEntry } from '../vault/registry.js'
import { LEGACY_MIGRATED_MARKER, migrateLegacySnippets } from './legacy-migration.js'
import { SnippetStore } from './snippet-store.js'

let root: string
let dataDir: string
let vaultPath: string
const store = new SnippetStore()

const logger: ILogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }

function registryOf(entries: VaultRegistryEntry[]): IVaultRegistry {
  return {
    load: async () => entries,
    save: async () => {},
    addEntry: async () => {},
    removeEntry: async () => {},
    findById: () => null,
    findByName: () => null,
    updateEntries: async (mutator) => mutator([]),
  }
}

const entry = (): VaultRegistryEntry => ({
  id: 'v1',
  name: 'Vault',
  storagePath: vaultPath,
  createdAt: '2026-01-01T00:00:00.000Z',
  ownerId: 'u1',
})

const legacyDir = (): string => path.join(dataDir, 'snippets', 'v1')
const run = (): Promise<void> => migrateLegacySnippets({ dataDir, vaultRegistry: registryOf([entry()]), snippetStore: store, logger })

async function writeLegacy(files: Record<string, string>, enabled: string[] = []): Promise<void> {
  await fs.mkdir(legacyDir(), { recursive: true })
  for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(legacyDir(), name), content)
  const snippets = Object.fromEntries(enabled.map((id) => [id, { enabled: true, updatedAt: '2026-01-01T00:00:00.000Z' }]))
  await fs.writeFile(path.join(legacyDir(), '_registry.json'), JSON.stringify({ version: 1, snippets }))
}

beforeEach(async () => {
  root = path.join(os.tmpdir(), `snippet-migration-${crypto.randomBytes(8).toString('hex')}`)
  dataDir = path.join(root, 'data')
  vaultPath = path.join(root, 'vault')
  await fs.mkdir(dataDir, { recursive: true })
  await fs.mkdir(vaultPath, { recursive: true })
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('migrateLegacySnippets', () => {
  it('copies snippets and enabled flags into the vault and leaves the originals in place', async () => {
    await writeLegacy({ 'a.css': 'a {}', 'b.css': 'b {}' }, ['a'])

    await run()

    expect(await store.loadSnippet(vaultPath, 'a')).toBe('a {}')
    expect(await store.loadSnippet(vaultPath, 'b')).toBe('b {}')
    expect(await store.loadEnabledIds(vaultPath)).toEqual(['a'])
    expect(await fs.readFile(path.join(legacyDir(), 'a.css'), 'utf-8')).toBe('a {}')
    await expect(fs.access(path.join(legacyDir(), LEGACY_MIGRATED_MARKER))).resolves.toBeUndefined()
  })

  it('keeps the vault version when a snippet exists in both places', async () => {
    await store.saveSnippet(vaultPath, 'a', 'vault version')
    await writeLegacy({ 'a.css': 'old version' })

    await run()

    expect(await store.loadSnippet(vaultPath, 'a')).toBe('vault version')
  })

  it('merges enabled snippets with the ones already enabled in the vault', async () => {
    await store.saveEnabledIds(vaultPath, ['existing'])
    await writeLegacy({ 'a.css': 'a {}' }, ['a'])

    await run()

    expect((await store.loadEnabledIds(vaultPath)).sort()).toEqual(['a', 'existing'])
  })

  it('preserves other appearance.json fields', async () => {
    await fs.mkdir(path.join(vaultPath, '.obsidian'), { recursive: true })
    await fs.writeFile(path.join(vaultPath, '.obsidian', 'appearance.json'), JSON.stringify({ cssTheme: 'Minimal' }))
    await writeLegacy({ 'a.css': 'a {}' }, ['a'])

    await run()

    const appearance = JSON.parse(await fs.readFile(path.join(vaultPath, '.obsidian', 'appearance.json'), 'utf-8')) as Record<string, unknown>
    expect(appearance).toEqual({ cssTheme: 'Minimal', enabledCssSnippets: ['a'] })
  })

  it('runs only once', async () => {
    await writeLegacy({ 'a.css': 'a {}' })
    await run()
    await store.deleteSnippet(vaultPath, 'a')

    await run()

    expect(await store.loadSnippet(vaultPath, 'a')).toBeNull()
  })

  it('postpones an unreachable vault: no phantom directory, no marker, migrated once it is back', async () => {
    await fs.rm(vaultPath, { recursive: true, force: true })
    await writeLegacy({ 'a.css': 'a {}' }, ['a'])

    await run()

    await expect(fs.access(vaultPath)).rejects.toThrow()
    await expect(fs.access(path.join(legacyDir(), LEGACY_MIGRATED_MARKER))).rejects.toThrow()

    await fs.mkdir(vaultPath, { recursive: true })
    await run()

    expect(await store.loadSnippet(vaultPath, 'a')).toBe('a {}')
    expect(await store.loadEnabledIds(vaultPath)).toEqual(['a'])
  })

  it('does nothing for a vault without legacy snippets', async () => {
    await run()

    expect(await store.listSnippets(vaultPath)).toEqual([])
    await expect(fs.access(path.join(vaultPath, '.obsidian'))).rejects.toThrow()
  })

  it('postpones when appearance.json is invalid: no marker, file untouched, snippets retried next start', async () => {
    await fs.mkdir(path.join(vaultPath, '.obsidian'), { recursive: true })
    await fs.writeFile(path.join(vaultPath, '.obsidian', 'appearance.json'), '{ broken')
    await writeLegacy({ 'a.css': 'a {}' }, ['a'])

    await run()

    expect(await fs.readFile(path.join(vaultPath, '.obsidian', 'appearance.json'), 'utf-8')).toBe('{ broken')
    await expect(fs.access(path.join(legacyDir(), LEGACY_MIGRATED_MARKER))).rejects.toThrow()

    await fs.writeFile(path.join(vaultPath, '.obsidian', 'appearance.json'), '{}')
    await run()

    expect(await store.loadEnabledIds(vaultPath)).toEqual(['a'])
    await expect(fs.access(path.join(legacyDir(), LEGACY_MIGRATED_MARKER))).resolves.toBeUndefined()
  })
})
