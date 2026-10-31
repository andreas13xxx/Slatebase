import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ILogger } from '../logger/index.js'
import { AppConfigService } from './app-config.js'
import { migrateAppConfigDefaults } from './defaults-migration.js'

describe('migrateAppConfigDefaults', () => {
  let root: string
  let dataDir: string
  const logger: ILogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const service = new AppConfigService()

  const vaultAt = async (name: string, files: Record<string, string> = {}, dirs: string[] = []) => {
    const storagePath = join(root, name)
    await mkdir(join(storagePath, '.obsidian'), { recursive: true })
    for (const dir of dirs) await mkdir(join(storagePath, dir), { recursive: true })
    for (const [file, content] of Object.entries(files)) await writeFile(join(storagePath, file), content)
    return { id: name, storagePath }
  }
  const run = (vaults: Array<{ id: string, storagePath: string }>) =>
    migrateAppConfigDefaults({ dataDir, vaultRegistry: { load: async () => vaults as never }, appConfigService: service, logger })
  const appJson = async (storagePath: string) => JSON.parse(await readFile(join(storagePath, '.obsidian', 'app.json'), 'utf-8')) as Record<string, unknown>

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'defaults-migration-'))
    dataDir = join(root, 'data')
    vi.clearAllMocks()
  })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })

  it('keeps the old alwaysUpdateLinks default in a vault without app.json', async () => {
    const vault = await vaultAt('v-new')
    expect(await run([vault])).toEqual({ pinned: 1, skipped: 0 })
    expect(await appJson(vault.storagePath)).toEqual({ alwaysUpdateLinks: true })
  })

  it('keeps it in a vault Slatebase has worked in, and keeps the other keys', async () => {
    const vault = await vaultAt('v-old', { '.obsidian/app.json': '{"showLineNumber":true}' }, ['.slatebase'])
    await run([vault])
    expect(await appJson(vault.storagePath)).toEqual({ showLineNumber: true, alwaysUpdateLinks: true })
  })

  it('does not touch a vault whose app.json was written by Obsidian', async () => {
    const original = '{"showLineNumber": true}'
    const vault = await vaultAt('v-obsidian', { '.obsidian/app.json': original })
    expect(await run([vault])).toEqual({ pinned: 0, skipped: 1 })
    expect(await readFile(join(vault.storagePath, '.obsidian', 'app.json'), 'utf-8')).toBe(original)
  })

  it('never overwrites a value that is already in the file', async () => {
    const vault = await vaultAt('v-set', { '.obsidian/app.json': '{"alwaysUpdateLinks":false}' }, ['.slatebase'])
    await run([vault])
    expect(await appJson(vault.storagePath)).toEqual({ alwaysUpdateLinks: false })
  })

  it('runs once per vault: a later change by the user stays', async () => {
    const vault = await vaultAt('v-once')
    await run([vault])
    await service.patch(vault.storagePath, { alwaysUpdateLinks: null })
    expect(await run([vault])).toEqual({ pinned: 0, skipped: 0 })
    expect(await appJson(vault.storagePath)).toEqual({})
    await stat(join(dataDir, 'migrations', 'app-config-defaults', 'v-once'))
  })

  it('retries a vault whose app.json is not a JSON object, and leaves the file', async () => {
    const vault = await vaultAt('v-broken', { '.obsidian/app.json': '<<<<<<< ours' }, ['.slatebase'])
    expect(await run([vault])).toEqual({ pinned: 0, skipped: 0 })
    expect(await readFile(join(vault.storagePath, '.obsidian', 'app.json'), 'utf-8')).toBe('<<<<<<< ours')
    await expect(stat(join(dataDir, 'migrations', 'app-config-defaults', 'v-broken'))).rejects.toThrow()
    expect(logger.warn).toHaveBeenCalled()
  })

  it('skips vault ids that are not safe file names', async () => {
    const vault = await vaultAt('safe')
    expect(await run([{ ...vault, id: '../escape' }])).toEqual({ pinned: 0, skipped: 0 })
  })
})
