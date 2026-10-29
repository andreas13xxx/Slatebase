import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppConfigService } from './app-config.js'
import { migrateVaultConfigToObsidianFiles } from './legacy-migration.js'
import type { IVaultRegistry } from '../vault/registry.js'

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as import('../logger/index.js').ILogger

describe('migrateVaultConfigToObsidianFiles', () => {
  let root: string
  const service = new AppConfigService()
  const registry = (...paths: string[]) => ({
    load: async () => paths.map((storagePath, i) => ({ id: `v${i}`, name: `v${i}`, storagePath })),
  }) as unknown as Pick<IVaultRegistry, 'load'>
  const run = (...paths: string[]) => migrateVaultConfigToObsidianFiles({ vaultRegistry: registry(...paths), appConfigService: service, logger })
  const writeSlatebaseConfig = async (vault: string, content: unknown) => {
    await mkdir(join(vault, '.slatebase'), { recursive: true })
    await writeFile(join(vault, '.slatebase', 'config.json'), typeof content === 'string' ? content : JSON.stringify(content))
  }
  const readJson = async (file: string) => JSON.parse(await readFile(file, 'utf-8')) as Record<string, unknown>

  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'cfg-migration-')) })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })

  it('moves a folder to attachmentFolderPath and removes it from config.json', async () => {
    await writeSlatebaseConfig(root, { attachmentsDirectory: 'Attachments', dailyNotesDirectory: 'Journal' })

    expect(await run(root)).toEqual({ migrated: 1 })

    expect(await readJson(join(root, '.obsidian', 'app.json'))).toEqual({ attachmentFolderPath: 'Attachments' })
    expect(await readJson(join(root, '.slatebase', 'config.json'))).toEqual({ dailyNotesDirectory: 'Journal' })
  })

  it('turns "next to the note" (empty string) into "./"', async () => {
    await writeSlatebaseConfig(root, { attachmentsDirectory: '' })
    await run(root)
    expect(await readJson(join(root, '.obsidian', 'app.json'))).toEqual({ attachmentFolderPath: './' })
  })

  it('keeps a value Obsidian already has and still drops the old field', async () => {
    await mkdir(join(root, '.obsidian'))
    await writeFile(join(root, '.obsidian', 'app.json'), JSON.stringify({ attachmentFolderPath: './assets', vimMode: true }))
    await writeSlatebaseConfig(root, { attachmentsDirectory: 'Old' })

    await run(root)

    expect(await readJson(join(root, '.obsidian', 'app.json'))).toEqual({ attachmentFolderPath: './assets', vimMode: true })
    expect(await readJson(join(root, '.slatebase', 'config.json'))).toEqual({})
  })

  it('is idempotent and leaves vaults without the old field alone', async () => {
    await writeSlatebaseConfig(root, { attachmentsDirectory: 'A' })
    await run(root)
    expect(await run(root)).toEqual({ migrated: 0 })

    const other = join(root, 'other')
    await mkdir(other)
    expect(await run(other)).toEqual({ migrated: 0 })
  })

  it('keeps the old field when app.json cannot be written, and retries later', async () => {
    await mkdir(join(root, '.obsidian'))
    await writeFile(join(root, '.obsidian', 'app.json'), '{ broken')
    await writeSlatebaseConfig(root, { attachmentsDirectory: 'A' })

    expect(await run(root)).toEqual({ migrated: 0 })

    expect(await readJson(join(root, '.slatebase', 'config.json'))).toEqual({ attachmentsDirectory: 'A' })
    expect(await readFile(join(root, '.obsidian', 'app.json'), 'utf-8')).toBe('{ broken')
  })

  it('does not touch a config.json that is not valid JSON', async () => {
    await writeSlatebaseConfig(root, 'not json')
    expect(await run(root)).toEqual({ migrated: 0 })
    expect(await readFile(join(root, '.slatebase', 'config.json'), 'utf-8')).toBe('not json')
  })

  it('migrates every vault independently', async () => {
    const a = join(root, 'a')
    const b = join(root, 'b')
    await writeSlatebaseConfig(a, { attachmentsDirectory: 'A' })
    await writeSlatebaseConfig(b, { attachmentsDirectory: '' })

    expect(await run(a, b)).toEqual({ migrated: 2 })

    expect((await readJson(join(a, '.obsidian', 'app.json')))['attachmentFolderPath']).toBe('A')
    expect((await readJson(join(b, '.obsidian', 'app.json')))['attachmentFolderPath']).toBe('./')
  })
})
