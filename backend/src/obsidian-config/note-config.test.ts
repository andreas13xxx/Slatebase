import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NoteConfigService } from './note-config.js'
import { ObsidianConfigFileInvalidError } from '../shared/obsidian-config-file.js'

describe('NoteConfigService', () => {
  let vault: string
  const service = new NoteConfigService()
  const file = (name: string) => join(vault, '.obsidian', name)
  const readJson = async (name: string) => JSON.parse(await readFile(file(name), 'utf-8')) as Record<string, unknown>
  const seed = async (name: string, content: unknown) => {
    await mkdir(join(vault, '.obsidian'), { recursive: true })
    await writeFile(file(name), typeof content === 'string' ? content : JSON.stringify(content))
  }

  beforeEach(async () => { vault = await mkdtemp(join(tmpdir(), 'note-config-')) })
  afterEach(async () => { await rm(vault, { recursive: true, force: true }) })

  it('reads nothing from a vault without the files', async () => {
    expect(await service.get(vault)).toEqual({ templatesFolder: null, dailyFolder: null, dailyTemplate: null, dailyFormat: null })
  })

  it('reads the values of real Obsidian files', async () => {
    await seed('templates.json', { folder: 'template' })
    await seed('daily-notes.json', { folder: '2024', format: 'MM月/MM-DD ddd', template: 'template/diary', autorun: false })

    expect(await service.get(vault)).toEqual({
      templatesFolder: 'template',
      dailyFolder: '2024',
      dailyTemplate: 'template/diary',
      dailyFormat: 'MM月/MM-DD ddd',
    })
  })

  it('ignores values of the wrong type and treats an invalid file as absent when reading', async () => {
    await seed('templates.json', { folder: 5 })
    await seed('daily-notes.json', '{ broken')
    expect(await service.get(vault)).toEqual({ templatesFolder: null, dailyFolder: null, dailyTemplate: null, dailyFormat: null })
  })

  it('writes the template folder and keeps other keys', async () => {
    await seed('templates.json', { folder: 'alt', dateFormat: 'YYYY' })
    await service.patch(vault, { templatesFolder: 'neu' })
    expect(await readJson('templates.json')).toEqual({ folder: 'neu', dateFormat: 'YYYY' })
  })

  it('creates daily-notes.json with the supported format and the template without .md', async () => {
    await service.patch(vault, { dailyFolder: 'Journal', dailyTemplate: 'Templates/tag.md' })
    expect(await readJson('daily-notes.json')).toEqual({ folder: 'Journal', template: 'Templates/tag', format: 'YYYY-MM-DD' })
  })

  it('never overwrites an existing format and keeps unknown keys', async () => {
    await seed('daily-notes.json', { folder: 'a', format: 'MM-DD', autorun: true })
    await service.patch(vault, { dailyFolder: 'b' })
    expect(await readJson('daily-notes.json')).toEqual({ folder: 'b', format: 'MM-DD', autorun: true })
  })

  it('does not touch a file when the value is unchanged', async () => {
    const original = '{"folder":"a",   "format":"X"}'
    await seed('daily-notes.json', original)
    await service.patch(vault, { dailyFolder: 'a' })
    expect(await readFile(file('daily-notes.json'), 'utf-8')).toBe(original)
  })

  it('refuses to write over an invalid file', async () => {
    await seed('daily-notes.json', '[1]')
    await expect(service.patch(vault, { dailyFolder: 'x' })).rejects.toBeInstanceOf(ObsidianConfigFileInvalidError)
    expect(await readFile(file('daily-notes.json'), 'utf-8')).toBe('[1]')
  })
})
