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
    expect(await run([vault])).toMatchObject({ pinned: 1, skipped: 0, failed: 0 })
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
    expect(await run([vault])).toMatchObject({ pinned: 0, skipped: 1 })
    expect(await readFile(join(vault.storagePath, '.obsidian', 'app.json'), 'utf-8')).toBe(original)
  })

  it('never overwrites a value that is already in the file', async () => {
    const vault = await vaultAt('v-set', { '.obsidian/app.json': '{"alwaysUpdateLinks":false}' }, ['.slatebase'])
    await run([vault])
    expect(await appJson(vault.storagePath)).toEqual({ alwaysUpdateLinks: false })
  })

  it('is a single pass: vaults created later and later changes by the user are never touched', async () => {
    const first = await vaultAt('v-first')
    await run([first])
    await service.patch(first.storagePath, { alwaysUpdateLinks: null })
    const later = await vaultAt('v-later')

    expect(await run([first, later])).toMatchObject({ pinned: 0, skipped: 0, alreadyDone: true })
    expect(await appJson(first.storagePath)).toEqual({})
    await expect(readFile(join(later.storagePath, '.obsidian', 'app.json'), 'utf-8')).rejects.toThrow()
    await stat(join(dataDir, 'migrations', 'app-config-defaults.done'))
  })

  it('names a vault it cannot handle, leaves its file alone and does not retry it later', async () => {
    const broken = await vaultAt('v-broken', { '.obsidian/app.json': '<<<<<<< ours' }, ['.slatebase'])
    const gone = { id: 'v-gone', storagePath: join(root, 'not-mounted') }
    const fine = await vaultAt('v-fine')

    expect(await run([broken, gone, fine])).toMatchObject({ pinned: 1, failed: 2 })
    expect(await readFile(join(broken.storagePath, '.obsidian', 'app.json'), 'utf-8')).toBe('<<<<<<< ours')
    await expect(stat(gone.storagePath)).rejects.toThrow()
    expect(logger.warn).toHaveBeenCalledTimes(2)

    await writeFile(join(broken.storagePath, '.obsidian', 'app.json'), '{}')
    expect(await run([broken])).toMatchObject({ alreadyDone: true })
    expect(await appJson(broken.storagePath)).toEqual({})
  })
})
