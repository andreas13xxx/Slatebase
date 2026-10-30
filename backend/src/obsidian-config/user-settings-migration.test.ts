import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, readFile, writeFile, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppConfigService } from './app-config.js'
import { migrateUserVaultSettingsToAppConfig } from './user-settings-migration.js'
import type { IVaultRegistry } from '../vault/registry.js'

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as import('../logger/index.js').ILogger

describe('migrateUserVaultSettingsToAppConfig', () => {
  let root: string
  let vault: string
  const service = new AppConfigService()
  const run = () => migrateUserVaultSettingsToAppConfig({
    dataDir: root,
    vaultRegistry: { load: async () => [{ id: 'v1', name: 'v1', storagePath: vault }] } as unknown as Pick<IVaultRegistry, 'load'>,
    appConfigService: service,
    logger,
  })
  const prefFile = (user: string) => join(root, 'users', `${user}-preferences.json`)
  const writePrefs = async (user: string, vaultSettings: unknown, mtimeSeconds = 1_000_000) => {
    await mkdir(join(root, 'users'), { recursive: true })
    await writeFile(prefFile(user), JSON.stringify({ favorites: [], vaultSettings }))
    await utimes(prefFile(user), mtimeSeconds, mtimeSeconds)
  }
  const readJson = async (file: string) => JSON.parse(await readFile(file, 'utf-8')) as Record<string, unknown>

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'user-migration-'))
    vault = join(root, 'vault')
    await mkdir(vault)
  })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })

  it('moves the three values into app.json and removes them from the preference file', async () => {
    await writePrefs('u1', { v1: { lineNumbers: true, readableLineLength: false, spellcheck: false, zoom: 1.2 } })

    expect(await run()).toEqual({ vaults: 1, cleanedFiles: 1 })

    expect(await readJson(join(vault, '.obsidian', 'app.json'))).toEqual({ showLineNumber: true, readableLineLength: false, spellcheck: false })
    expect(await readJson(prefFile('u1'))).toEqual({ favorites: [], vaultSettings: { v1: { zoom: 1.2 } } })
  })

  it('lets the most recently changed preference file win', async () => {
    await writePrefs('old', { v1: { lineNumbers: false, spellcheck: false } }, 1_000_000)
    await writePrefs('new', { v1: { lineNumbers: true } }, 2_000_000)

    await run()

    expect(await readJson(join(vault, '.obsidian', 'app.json'))).toEqual({ showLineNumber: true, spellcheck: false })
  })

  it('never overwrites a value app.json already has, but still removes the old key', async () => {
    await mkdir(join(vault, '.obsidian'))
    await writeFile(join(vault, '.obsidian', 'app.json'), JSON.stringify({ showLineNumber: false, vimMode: true }))
    await writePrefs('u1', { v1: { lineNumbers: true, spellcheck: true } })

    await run()

    expect(await readJson(join(vault, '.obsidian', 'app.json'))).toEqual({ showLineNumber: false, vimMode: true, spellcheck: true })
    expect(await readJson(prefFile('u1'))).toEqual({ favorites: [], vaultSettings: { v1: {} } })
  })

  it('is idempotent and ignores other vaults and files without the keys', async () => {
    await writePrefs('u1', { v1: { zoom: 1 }, other: { lineNumbers: true } })

    expect(await run()).toEqual({ vaults: 0, cleanedFiles: 0 })
    await expect(readFile(join(vault, '.obsidian', 'app.json'), 'utf-8')).rejects.toThrow()
    expect((await readJson(prefFile('u1')))['vaultSettings']).toEqual({ v1: { zoom: 1 }, other: { lineNumbers: true } })
  })

  it('keeps the preference keys when app.json is invalid, and retries later', async () => {
    await mkdir(join(vault, '.obsidian'))
    await writeFile(join(vault, '.obsidian', 'app.json'), '[broken')
    await writePrefs('u1', { v1: { lineNumbers: true } })

    expect(await run()).toEqual({ vaults: 0, cleanedFiles: 0 })
    expect((await readJson(prefFile('u1')))['vaultSettings']).toEqual({ v1: { lineNumbers: true } })
  })

  it('does nothing without a users directory', async () => {
    expect(await run()).toEqual({ vaults: 0, cleanedFiles: 0 })
  })
})
