// TemplateService unit tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { TemplateService } from './template-service.js'
import { TemplateNotFoundError, TemplateConflictError } from './errors.js'
import type { ILogger } from '../logger/index.js'
import type { IVaultManager, Vault } from '../vault/index.js'

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}

function createMockVaultManager(vaultPath: string): IVaultManager {
  const vault: Vault = {
    info: {
      id: 'testvault123',
      name: 'TestVault',
      path: vaultPath,
      status: 'loaded',
    },
    tree: { name: 'TestVault', type: 'directory', path: '', children: [] },
  }

  return {
    loadVaults: async () => {},
    getVault: (id: string) => (id === 'testvault123' ? vault : null),
    getAllVaults: () => [vault],
    addVault: () => {},
    removeVault: () => {},
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TemplateService', () => {
  let tmpDir: string
  let vaultDir: string
  let templateDir: string
  let service: TemplateService
  let logger: ILogger

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slatebase-template-test-'))
    vaultDir = tmpDir
    templateDir = path.join(vaultDir, '_templates')
    await fs.mkdir(templateDir, { recursive: true })

    logger = createMockLogger()
    const vaultManager = createMockVaultManager(vaultDir)
    service = new TemplateService('_templates', vaultManager, logger)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // ─── listTemplates ───────────────────────────────────────────────────────

  describe('listTemplates', () => {
    it('should return empty list when template directory does not exist', async () => {
      await fs.rm(templateDir, { recursive: true })
      const result = await service.listTemplates('testvault123')
      expect(result).toEqual([])
    })

    it('should return empty list when template directory is empty', async () => {
      const result = await service.listTemplates('testvault123')
      expect(result).toEqual([])
    })

    it('should list .md files without _ prefix', async () => {
      await fs.writeFile(path.join(templateDir, 'meeting.md'), '# Meeting')
      await fs.writeFile(path.join(templateDir, 'daily.md'), '# Daily')
      await fs.writeFile(path.join(templateDir, '_internal.md'), '# Internal')
      await fs.writeFile(path.join(templateDir, 'notes.txt'), 'Plain text')

      const result = await service.listTemplates('testvault123')

      expect(result).toEqual([
        { name: 'daily', path: 'daily.md' },
        { name: 'meeting', path: 'meeting.md' },
      ])
    })

    it('should sort templates alphabetically', async () => {
      await fs.writeFile(path.join(templateDir, 'zebra.md'), '')
      await fs.writeFile(path.join(templateDir, 'alpha.md'), '')
      await fs.writeFile(path.join(templateDir, 'middle.md'), '')

      const result = await service.listTemplates('testvault123')

      expect(result.map(t => t.name)).toEqual(['alpha', 'middle', 'zebra'])
    })

    it('should cap at 100 entries', async () => {
      for (let i = 0; i < 110; i++) {
        await fs.writeFile(path.join(templateDir, `template-${String(i).padStart(3, '0')}.md`), '')
      }

      const result = await service.listTemplates('testvault123')

      expect(result).toHaveLength(100)
    })

    it('should exclude directories with .md suffix', async () => {
      await fs.mkdir(path.join(templateDir, 'folder.md'))
      await fs.writeFile(path.join(templateDir, 'real.md'), '# Real')

      const result = await service.listTemplates('testvault123')

      expect(result).toEqual([{ name: 'real', path: 'real.md' }])
    })

    it('should throw when vault is not found', async () => {
      await expect(service.listTemplates('nonexistent'))
        .rejects.toThrow('Vault not found: nonexistent')
    })
  })

  // ─── createFromTemplate ──────────────────────────────────────────────────

  describe('createFromTemplate', () => {
    it('should create a file from a template with placeholder replacement', async () => {
      await fs.writeFile(
        path.join(templateDir, 'meeting.md'),
        '# {{title}}\n\nDate: {{date}}\nTime: {{time}}\n',
      )

      const result = await service.createFromTemplate(
        'testvault123',
        'meeting',
        '',
        'my-meeting',
      )

      expect(result.path).toBe('my-meeting.md')
      expect(result.content).toContain('# my-meeting')
      expect(result.content).toMatch(/Date: \d{4}-\d{2}-\d{2}/)
      expect(result.content).toMatch(/Time: \d{2}:\d{2}/)

      // Verify file was actually written
      const filePath = path.join(vaultDir, 'my-meeting.md')
      const written = await fs.readFile(filePath, 'utf-8')
      expect(written).toBe(result.content)
    })

    it('should leave unrecognized placeholders as-is', async () => {
      await fs.writeFile(
        path.join(templateDir, 'test.md'),
        '{{unknown}} stays, {{date}} replaced',
      )

      const result = await service.createFromTemplate(
        'testvault123',
        'test',
        '',
        'output',
      )

      expect(result.content).toContain('{{unknown}} stays')
      expect(result.content).not.toContain('{{date}}')
    })

    it('should handle fileName that already has .md extension', async () => {
      await fs.writeFile(path.join(templateDir, 'basic.md'), '# {{title}}')

      const result = await service.createFromTemplate(
        'testvault123',
        'basic',
        '',
        'myfile.md',
      )

      expect(result.path).toBe('myfile.md')
      expect(result.content).toBe('# myfile')

      // Verify no double .md extension
      const exists = await fs.access(path.join(vaultDir, 'myfile.md')).then(() => true).catch(() => false)
      expect(exists).toBe(true)
    })

    it('should create file in specified target directory', async () => {
      await fs.writeFile(path.join(templateDir, 'note.md'), 'Content')
      await fs.mkdir(path.join(vaultDir, 'subdir'), { recursive: true })

      const result = await service.createFromTemplate(
        'testvault123',
        'note',
        'subdir',
        'new-note',
      )

      expect(result.path).toBe('subdir/new-note.md')

      const filePath = path.join(vaultDir, 'subdir', 'new-note.md')
      const written = await fs.readFile(filePath, 'utf-8')
      expect(written).toBe('Content')
    })

    it('should create target directory if it does not exist', async () => {
      await fs.writeFile(path.join(templateDir, 'note.md'), 'Content')

      const result = await service.createFromTemplate(
        'testvault123',
        'note',
        'new/nested/dir',
        'file',
      )

      expect(result.path).toBe('new/nested/dir/file.md')

      const filePath = path.join(vaultDir, 'new', 'nested', 'dir', 'file.md')
      const written = await fs.readFile(filePath, 'utf-8')
      expect(written).toBe('Content')
    })

    it('should throw TemplateNotFoundError when template does not exist', async () => {
      await expect(
        service.createFromTemplate('testvault123', 'nonexistent', '', 'output'),
      ).rejects.toThrow(TemplateNotFoundError)
    })

    it('should throw TemplateConflictError when target file already exists', async () => {
      await fs.writeFile(path.join(templateDir, 'note.md'), 'Template')
      await fs.writeFile(path.join(vaultDir, 'existing.md'), 'Existing content')

      await expect(
        service.createFromTemplate('testvault123', 'note', '', 'existing'),
      ).rejects.toThrow(TemplateConflictError)
    })

    it('should replace multiple occurrences of the same placeholder', async () => {
      await fs.writeFile(
        path.join(templateDir, 'multi.md'),
        '{{title}} - {{title}} on {{date}} at {{time}}',
      )

      const result = await service.createFromTemplate(
        'testvault123',
        'multi',
        '',
        'repeated',
      )

      expect(result.content).toContain('repeated - repeated on')
      expect(result.content).not.toContain('{{title}}')
    })

    it('should throw when vault is not found', async () => {
      await expect(
        service.createFromTemplate('nonexistent', 'any', '', 'file'),
      ).rejects.toThrow('Vault not found: nonexistent')
    })

    it('should use server local time for date and time placeholders', async () => {
      await fs.writeFile(path.join(templateDir, 'time.md'), '{{date}} {{time}}')

      const now = new Date()
      const result = await service.createFromTemplate(
        'testvault123',
        'time',
        '',
        'timetest',
      )

      const expectedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      expect(result.content).toContain(expectedDate)
    })
  })
})
