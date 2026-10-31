import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ILogger } from '../logger/index.js'
import { PropertyTypeStore } from './property-type-store.js'
import { migratePropertyTypesToObsidian } from './migration.js'

const logger: ILogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

describe('PropertyTypeStore on .obsidian/types.json', () => {
  let root: string
  let vault: string
  let store: PropertyTypeStore
  const reported: Array<{ file: string, paths: string[] }> = []

  const typesFile = () => join(vault, '.obsidian', 'types.json')
  const readTypes = async () => JSON.parse(await readFile(typesFile(), 'utf-8')) as Record<string, unknown>
  const seedTypes = async (content: unknown) => {
    await mkdir(join(vault, '.obsidian'), { recursive: true })
    await writeFile(typesFile(), typeof content === 'string' ? content : JSON.stringify(content))
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'types-json-'))
    vault = join(root, 'vault')
    await mkdir(vault, { recursive: true })
    reported.length = 0
    store = new PropertyTypeStore(() => vault, logger, {
      report: (_vaultId, file, deviations) => { reported.push({ file, paths: deviations.map((d) => d.path) }) },
    })
    vi.clearAllMocks()
  })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })

  it('reads the types Obsidian wrote, with Obsidian\'s names mapped to Slatebase\'s', async () => {
    await seedTypes({ types: { aliases: 'multitext', cssclasses: 'multitext', tags: 'tags', capo: 'number', done: 'checkbox' } })

    expect((await store.getRegistry('v1')).entries).toEqual([
      { key: 'aliases', type: 'aliases' },
      { key: 'cssclasses', type: 'list' },
      { key: 'tags', type: 'tags' },
      { key: 'capo', type: 'number' },
      { key: 'done', type: 'checkbox' },
    ])
    expect(reported).toEqual([])
  })

  it('leaves a type it does not know out of the registry, reports it, and keeps it in the file when saving', async () => {
    await seedTypes({ types: { rating: 'stars', status: 'text' }, other: 1 })

    expect((await store.getRegistry('v1')).entries).toEqual([{ key: 'status', type: 'text' }])
    expect(reported).toEqual([{ file: 'types.json', paths: ['types.rating'] }])

    await store.saveRegistry('v1', { entries: [{ key: 'due', type: 'date' }] })
    expect(await readTypes()).toEqual({ types: { rating: 'stars', due: 'date' }, other: 1 })
  })

  it('writes list and aliases as multitext, creating the file', async () => {
    await store.saveRegistry('v1', { entries: [
      { key: 'related', type: 'list' }, { key: 'aliases', type: 'aliases' }, { key: 'tags', type: 'tags' }, { key: 'n', type: 'number' },
    ] })
    expect(await readTypes()).toEqual({ types: { related: 'multitext', aliases: 'multitext', tags: 'tags', n: 'number' } })
  })

  it('upsert changes one key and keeps the rest of the file', async () => {
    await seedTypes({ types: { a: 'text', b: 'number' }, extra: true })
    await store.upsertEntry('v1', { key: 'a', type: 'checkbox' })
    expect(await readTypes()).toEqual({ types: { a: 'checkbox', b: 'number' }, extra: true })
  })

  it('keeps options (allowed values, date format) in the Slatebase file and attaches them again', async () => {
    await store.upsertEntry('v1', { key: 'status', type: 'text', options: { allowedValues: ['open', 'done'] } })

    expect(await readTypes()).toEqual({ types: { status: 'text' } })
    expect(JSON.parse(await readFile(join(vault, '.slatebase', 'property-types.json'), 'utf-8'))).toMatchObject({ entries: [{ key: 'status', options: { allowedValues: ['open', 'done'] } }] })
    expect((await store.getRegistry('v1')).entries).toEqual([{ key: 'status', type: 'text', options: { allowedValues: ['open', 'done'] } }])

    await store.upsertEntry('v1', { key: 'status', type: 'text' })
    expect((await store.getRegistry('v1')).entries).toEqual([{ key: 'status', type: 'text' }])
  })

  it('does not take options for a key the file no longer has', async () => {
    await store.upsertEntry('v1', { key: 'status', type: 'text', options: { allowedValues: ['x'] } })
    await seedTypes({ types: {} })
    expect((await store.getRegistry('v1')).entries).toEqual([])
  })

  it('reports a types.json that is not usable, reads nothing from it, and never overwrites it', async () => {
    await seedTypes('<<<<<<< ours')
    expect((await store.getRegistry('v1')).entries).toEqual([])
    expect(reported).toEqual([{ file: 'types.json', paths: [''] }])
    await expect(store.upsertEntry('v1', { key: 'a', type: 'text' })).rejects.toThrow()
    expect(await readFile(typesFile(), 'utf-8')).toBe('<<<<<<< ours')

    await seedTypes({ types: ['a'] })
    expect((await store.getRegistry('v1')).entries).toEqual([])
    expect(reported.at(-1)).toEqual({ file: 'types.json', paths: ['types'] })
  })
})

describe('migratePropertyTypesToObsidian', () => {
  let root: string
  let dataDir: string

  const vaultAt = async (id: string, legacy?: unknown, types?: unknown) => {
    const storagePath = join(root, id)
    await mkdir(join(storagePath, '.slatebase'), { recursive: true })
    await mkdir(join(storagePath, '.obsidian'), { recursive: true })
    if (legacy !== undefined) await writeFile(join(storagePath, '.slatebase', 'property-types.json'), JSON.stringify(legacy))
    if (types !== undefined) await writeFile(join(storagePath, '.obsidian', 'types.json'), JSON.stringify(types))
    return { id, storagePath }
  }
  const storeFor = (vaults: Array<{ id: string, storagePath: string }>) =>
    new PropertyTypeStore((id) => vaults.find((v) => v.id === id)?.storagePath ?? null, logger)
  const run = (vaults: Array<{ id: string, storagePath: string }>) =>
    migratePropertyTypesToObsidian({ dataDir, vaultRegistry: { load: async () => vaults as never }, store: storeFor(vaults), logger })
  const types = async (storagePath: string) => (JSON.parse(await readFile(join(storagePath, '.obsidian', 'types.json'), 'utf-8')) as { types: Record<string, string> }).types

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'types-migration-'))
    dataDir = join(root, 'data')
    vi.clearAllMocks()
  })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })

  it('copies the old entries into types.json and keeps only the entries with options in the old file', async () => {
    const vault = await vaultAt('v1', { entries: [
      { key: 'status', type: 'text', options: { allowedValues: ['a'] } },
      { key: 'due', type: 'date' },
      { key: 'related', type: 'list' },
      { key: 'aliases', type: 'aliases' },
    ] })

    expect(await run([vault])).toMatchObject({ migrated: 1, entries: 4, failed: 0 })
    expect(await types(vault.storagePath)).toEqual({ status: 'text', due: 'date', related: 'multitext', aliases: 'multitext' })
    expect(JSON.parse(await readFile(join(vault.storagePath, '.slatebase', 'property-types.json'), 'utf-8'))).toEqual({
      entries: [{ key: 'status', type: 'text', options: { allowedValues: ['a'] } }],
    })
  })

  it('lets Obsidian\'s file win for a key both have', async () => {
    const vault = await vaultAt('v1', { entries: [{ key: 'due', type: 'text' }, { key: 'new', type: 'number' }] }, { types: { due: 'date' } })
    await run([vault])
    expect(await types(vault.storagePath)).toEqual({ due: 'date', new: 'number' })
  })

  it('runs once: a key removed from types.json later does not come back', async () => {
    const vault = await vaultAt('v1', { entries: [{ key: 'status', type: 'text', options: { allowedValues: ['a'] } }] })
    await run([vault])
    await writeFile(join(vault.storagePath, '.obsidian', 'types.json'), JSON.stringify({ types: {} }))

    expect(await run([vault])).toMatchObject({ alreadyDone: true })
    expect(await types(vault.storagePath)).toEqual({})
    await stat(join(dataDir, 'migrations', 'property-types-to-obsidian.done'))
  })

  it('names a vault it cannot handle, leaves its files and carries on with the others', async () => {
    const broken = await vaultAt('v-broken', { entries: [{ key: 'a', type: 'text' }] })
    await writeFile(join(broken.storagePath, '.obsidian', 'types.json'), '<<<<<<<')
    const fine = await vaultAt('v-fine', { entries: [{ key: 'b', type: 'text' }] })

    expect(await run([broken, fine])).toMatchObject({ migrated: 1, failed: 1 })
    expect(await readFile(join(broken.storagePath, '.obsidian', 'types.json'), 'utf-8')).toBe('<<<<<<<')
    expect(await types(fine.storagePath)).toEqual({ b: 'text' })
    expect(logger.warn).toHaveBeenCalled()
  })

  it('does nothing for a vault without an old file', async () => {
    const vault = await vaultAt('v-empty')
    expect(await run([vault])).toMatchObject({ migrated: 0, failed: 0 })
  })
})
