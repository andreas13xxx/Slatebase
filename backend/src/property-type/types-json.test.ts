import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ILogger } from '../logger/index.js'
import { PropertyTypeStore } from './property-type-store.js'

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

  it('keeps the order of the file when saving, and puts new keys at the end', async () => {
    await seedTypes({ types: { rating: 'stars', b: 'number', a: 'text', gone: 'text' } })
    await store.saveRegistry('v1', { entries: [{ key: 'new', type: 'date' }, { key: 'a', type: 'checkbox' }, { key: 'b', type: 'number' }] })
    expect(Object.keys((await readTypes() as { types: Record<string, string> }).types)).toEqual(['rating', 'b', 'a', 'new'])
    expect(await readTypes()).toEqual({ types: { rating: 'stars', b: 'number', a: 'checkbox', new: 'date' } })
  })

  it('forces the fixed type of tags and aliases when reading, whatever the file says', async () => {
    await seedTypes({ types: { tags: 'text', aliases: 'number' } })
    expect((await store.getRegistry('v1')).entries).toEqual([{ key: 'tags', type: 'tags' }, { key: 'aliases', type: 'aliases' }])
  })

  it('refuses to write over a types value that is not an object, and the route-level error says so', async () => {
    await seedTypes({ types: ['a'], keep: 1 })
    await expect(store.upsertEntry('v1', { key: 'a', type: 'text' })).rejects.toThrow(/not a valid JSON object/)
    await expect(store.saveRegistry('v1', { entries: [] })).rejects.toThrow(/not a valid JSON object/)
    expect(await readTypes()).toEqual({ types: ['a'], keep: 1 })
  })

  it('does not accept __proto__ as a property name', async () => {
    await expect(store.upsertEntry('v1', { key: '__proto__', type: 'text' })).rejects.toThrow(/__proto__/)
    await store.saveRegistry('v1', { entries: [{ key: '__proto__', type: 'text' }, { key: 'ok', type: 'text' }] })
    expect(await readTypes()).toEqual({ types: { ok: 'text' } })
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
