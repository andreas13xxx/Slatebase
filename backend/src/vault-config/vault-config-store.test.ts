import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VaultConfigStore } from './vault-config-store.js'
import { NoteConfigService } from '../obsidian-config/index.js'

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as import('../logger/index.js').ILogger

describe('VaultConfigStore', () => {
  let vault: string
  let store: VaultConfigStore
  const seed = async (rel: string, content: unknown) => {
    await mkdir(join(vault, rel, '..'), { recursive: true })
    await writeFile(join(vault, rel), JSON.stringify(content))
  }
  const readJson = async (rel: string) => JSON.parse(await readFile(join(vault, rel), 'utf-8')) as Record<string, unknown>

  beforeEach(async () => {
    vault = await mkdtemp(join(tmpdir(), 'vault-config-'))
    store = new VaultConfigStore((id) => (id === 'v1' ? vault : null), 'Templates', logger, new NoteConfigService())
  })
  afterEach(async () => { await rm(vault, { recursive: true, force: true }) })

  it('gives the earlier defaults for a vault without any file', async () => {
    expect(await store.getConfig('v1')).toEqual({
      templatesDirectory: 'Templates',
      dailyNotesDirectory: '',
      dailyNoteTemplate: 'Templates/daily.md',
      dailyNoteFormat: null,
      uniqueNoteDirectory: '',
      activityRetentionDays: 90,
    })
  })

  it('reads the Obsidian files, adding .md to the template and trimming slashes', async () => {
    await seed('.obsidian/templates.json', { folder: '/template/' })
    await seed('.obsidian/daily-notes.json', { folder: '2024/', format: 'MM-DD', template: 'template/diary' })

    const config = await store.getConfig('v1')

    expect(config.templatesDirectory).toBe('template')
    expect(config.dailyNotesDirectory).toBe('2024')
    expect(config.dailyNoteTemplate).toBe('template/diary.md')
    expect(config.dailyNoteFormat).toBe('MM-DD')
  })

  it('follows a changed template folder for the default template', async () => {
    await seed('.obsidian/templates.json', { folder: 'Vorlagen' })
    expect((await store.getConfig('v1')).dailyNoteTemplate).toBe('Vorlagen/daily.md')
  })

  it('treats an explicit empty template as "no template"', async () => {
    await seed('.obsidian/daily-notes.json', { template: '' })
    expect((await store.getConfig('v1')).dailyNoteTemplate).toBe('')
  })

  it('writes template folder and daily settings into the Obsidian files, the rest into config.json', async () => {
    const saved = await store.saveConfig('v1', {
      templatesDirectory: 'Vorlagen',
      dailyNotesDirectory: 'Journal',
      dailyNoteTemplate: 'Vorlagen/tag.md',
      uniqueNoteDirectory: 'Zettel',
      activityRetentionDays: 30,
    })

    expect(await readJson('.obsidian/templates.json')).toEqual({ folder: 'Vorlagen' })
    expect(await readJson('.obsidian/daily-notes.json')).toEqual({ folder: 'Journal', template: 'Vorlagen/tag', format: 'YYYY-MM-DD' })
    expect(await readJson('.slatebase/config.json')).toEqual({ uniqueNoteDirectory: 'Zettel', activityRetentionDays: 30 })
    expect(saved).toMatchObject({ templatesDirectory: 'Vorlagen', dailyNotesDirectory: 'Journal', dailyNoteTemplate: 'Vorlagen/tag.md', uniqueNoteDirectory: 'Zettel', activityRetentionDays: 30 })
  })

  it('keeps the Slatebase-only values when another field is saved', async () => {
    await store.saveConfig('v1', { uniqueNoteDirectory: 'Zettel', activityRetentionDays: 30 })
    await store.saveConfig('v1', { dailyNotesDirectory: 'Journal' })
    expect(await store.getConfig('v1')).toMatchObject({ uniqueNoteDirectory: 'Zettel', activityRetentionDays: 30, dailyNotesDirectory: 'Journal' })
  })

  it('writes nothing when the save carries no values for the Obsidian files', async () => {
    await store.saveConfig('v1', { uniqueNoteDirectory: 'Z' })
    await expect(readFile(join(vault, '.obsidian', 'templates.json'), 'utf-8')).rejects.toThrow()
  })

  it('refuses the save and leaves the Slatebase-only file alone when an Obsidian file is invalid', async () => {
    await mkdir(join(vault, '.obsidian'), { recursive: true })
    await writeFile(join(vault, '.obsidian', 'daily-notes.json'), '{ broken')

    await expect(store.saveConfig('v1', { dailyNotesDirectory: 'J', uniqueNoteDirectory: 'Z' })).rejects.toThrow()

    await expect(readFile(join(vault, '.slatebase', 'config.json'), 'utf-8')).rejects.toThrow()
  })

  it('throws for an unknown vault', async () => {
    await expect(store.getConfig('nope')).rejects.toThrow(/Vault not found/)
  })

  it('exposes the two convenience getters', async () => {
    await seed('.obsidian/templates.json', { folder: 'T' })
    await seed('.obsidian/daily-notes.json', { folder: 'D' })
    expect(await store.getTemplatesDirectory('v1')).toBe('T')
    expect(await store.getDailyNotesDirectory('v1')).toBe('D')
  })
})
