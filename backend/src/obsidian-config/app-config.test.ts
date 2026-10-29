import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppConfigService, appConfigRequestSchema } from './index.js'
import { ObsidianConfigFileInvalidError } from '../shared/obsidian-config-file.js'

describe('AppConfigService', () => {
  let vaultPath: string
  const service = new AppConfigService()
  const file = () => join(vaultPath, '.obsidian', 'app.json')
  const onDisk = async () => JSON.parse(await readFile(file(), 'utf-8')) as Record<string, unknown>

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'app-config-'))
  })

  afterEach(async () => {
    await rm(vaultPath, { recursive: true, force: true })
  })

  it('returns an empty object when the file does not exist', async () => {
    expect(await service.get(vaultPath)).toEqual({})
  })

  it('creates the file (and .obsidian) on the first patch', async () => {
    const result = await service.patch(vaultPath, { useMarkdownLinks: true })
    expect(result).toEqual({ useMarkdownLinks: true })
    expect(await onDisk()).toEqual({ useMarkdownLinks: true })
  })

  it('keeps keys it does not know', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), JSON.stringify({ vimMode: true, pdfExportSettings: { pageSize: 'A4' }, tabSize: 2 }))

    await service.patch(vaultPath, { newLinkFormat: 'relative' })

    expect(await onDisk()).toEqual({ vimMode: true, pdfExportSettings: { pageSize: 'A4' }, tabSize: 2, newLinkFormat: 'relative' })
  })

  it('removes a key when the patch value is null', async () => {
    await service.patch(vaultPath, { defaultViewMode: 'preview', spellcheck: true })
    await service.patch(vaultPath, { defaultViewMode: null })
    expect(await onDisk()).toEqual({ spellcheck: true })
  })

  it('does not rewrite the file when nothing changes', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    const original = '{"spellcheck":true,   "x": 1}'
    await writeFile(file(), original)

    await service.patch(vaultPath, { spellcheck: true, newFileFolderPath: null })

    expect(await readFile(file(), 'utf-8')).toBe(original)
  })

  it('never overwrites a file that is not a JSON object', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    for (const content of ['not json', '[1,2]', 'null', '"text"']) {
      await writeFile(file(), content)
      await expect(service.get(vaultPath)).rejects.toBeInstanceOf(ObsidianConfigFileInvalidError)
      await expect(service.patch(vaultPath, { spellcheck: true })).rejects.toBeInstanceOf(ObsidianConfigFileInvalidError)
      expect(await readFile(file(), 'utf-8')).toBe(content)
    }
  })

  it('does not lose concurrent patches of different keys', async () => {
    await Promise.all([
      service.patch(vaultPath, { spellcheck: true }),
      service.patch(vaultPath, { foldHeading: false }),
      service.patch(vaultPath, { newFileLocation: 'folder' }),
      service.patch(vaultPath, { newFileFolderPath: 'Inbox' }),
    ])
    expect(await onDisk()).toEqual({ spellcheck: true, foldHeading: false, newFileLocation: 'folder', newFileFolderPath: 'Inbox' })
  })
})

describe('appConfigRequestSchema', () => {
  it('accepts known keys and null', () => {
    expect(appConfigRequestSchema.safeParse({ newFileLocation: 'current', attachmentFolderPath: './attachments', readableLineLength: null }).success).toBe(true)
    expect(appConfigRequestSchema.safeParse({}).success).toBe(true)
  })

  it('rejects unknown keys, wrong types and values outside the enums', () => {
    expect(appConfigRequestSchema.safeParse({ vimMode: true }).success).toBe(false)
    expect(appConfigRequestSchema.safeParse({ useMarkdownLinks: 'yes' }).success).toBe(false)
    expect(appConfigRequestSchema.safeParse({ newLinkFormat: 'whatever' }).success).toBe(false)
    expect(appConfigRequestSchema.safeParse({ attachmentFolderPath: 'x'.repeat(1025) }).success).toBe(false)
  })
})
