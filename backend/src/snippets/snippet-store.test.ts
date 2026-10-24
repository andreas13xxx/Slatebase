import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { SnippetStore } from './snippet-store.js'
import { SnippetTooLargeError } from './errors.js'
import { MAX_SNIPPET_SIZE, isValidSnippetFilename } from './validation.js'
import { AppearanceFileInvalidError } from '../shared/appearance-file.js'

let vault: string
let store: SnippetStore

const snippetsDir = (): string => path.join(vault, '.obsidian', 'snippets')
const appearancePath = (): string => path.join(vault, '.obsidian', 'appearance.json')

beforeEach(async () => {
  vault = path.join(os.tmpdir(), `snippet-store-test-${crypto.randomBytes(8).toString('hex')}`)
  await fs.mkdir(vault, { recursive: true })
  store = new SnippetStore()
})

afterEach(async () => {
  await fs.rm(vault, { recursive: true, force: true })
})

describe('SnippetStore', () => {
  describe('saveSnippet / loadSnippet', () => {
    it('stores a snippet at .obsidian/snippets/<id>.css in the vault', async () => {
      await store.saveSnippet(vault, 'dark-accent', 'body { color: red; }')

      expect(await fs.readFile(path.join(snippetsDir(), 'dark-accent.css'), 'utf-8')).toBe('body { color: red; }')
      expect(await store.loadSnippet(vault, 'dark-accent')).toBe('body { color: red; }')
    })

    it('overwrites an existing snippet', async () => {
      await store.saveSnippet(vault, 'overwrite-me', 'a { color: red; }')
      await store.saveSnippet(vault, 'overwrite-me', 'a { color: blue; }')

      expect(await store.loadSnippet(vault, 'overwrite-me')).toBe('a { color: blue; }')
    })

    it('returns null for a snippet that does not exist', async () => {
      expect(await store.loadSnippet(vault, 'nonexistent')).toBeNull()
    })

    it('rejects snippets exceeding 512 KB', async () => {
      const large = 'x'.repeat(MAX_SNIPPET_SIZE + 1)
      await expect(store.saveSnippet(vault, 'too-large', large)).rejects.toThrow(SnippetTooLargeError)
    })

    it('rejects ids that would path-traverse out of the snippets folder', async () => {
      await expect(store.saveSnippet(vault, '../../etc/passwd', 'a {}')).rejects.toThrow()
      await expect(store.saveSnippet(vault, '..%2f..%2fx', 'a {}')).rejects.toThrow()
    })

    it('supports Obsidian-style names with spaces and dots', async () => {
      await store.saveSnippet(vault, 'my snippet v2.0', 'a {}')

      expect(await store.loadSnippet(vault, 'my snippet v2.0')).toBe('a {}')
    })

    it('does not follow a symlinked snippet', async () => {
      const outside = path.join(vault, 'secret.txt')
      await fs.writeFile(outside, 'secret')
      await fs.mkdir(snippetsDir(), { recursive: true })
      try {
        await fs.symlink(outside, path.join(snippetsDir(), 'link.css'))
      } catch {
        return // symlinks unavailable (e.g. Windows without privileges)
      }

      expect(await store.loadSnippet(vault, 'link')).toBeNull()
      expect((await store.listSnippets(vault)).map((m) => m.id)).not.toContain('link')
    })
  })

  describe('listSnippets', () => {
    it('lists metadata for all snippets in a vault', async () => {
      await store.saveSnippet(vault, 'one', 'a {}')
      await store.saveSnippet(vault, 'two', 'b { color: red; }')

      const metas = await store.listSnippets(vault)
      expect(metas.map((m) => m.id).sort()).toEqual(['one', 'two'])
      expect(metas.every((m) => m.filename.endsWith('.css'))).toBe(true)
      expect(metas.every((m) => m.size > 0)).toBe(true)
      expect(metas.every((m) => typeof m.updatedAt === 'string')).toBe(true)
    })

    it('returns an empty array for a vault without a snippets folder', async () => {
      expect(await store.listSnippets(vault)).toEqual([])
    })

    it('picks up snippets that Obsidian created and ignores other files', async () => {
      await fs.mkdir(snippetsDir(), { recursive: true })
      await fs.writeFile(path.join(snippetsDir(), 'from obsidian.css'), 'a {}')
      await fs.writeFile(path.join(snippetsDir(), 'notes.txt'), 'x')
      await fs.writeFile(path.join(snippetsDir(), '.hidden.css'), 'x')

      expect((await store.listSnippets(vault)).map((m) => m.id)).toEqual(['from obsidian'])
    })
  })

  describe('enabled snippets (appearance.json)', () => {
    it('returns an empty list when appearance.json does not exist', async () => {
      expect(await store.loadEnabledIds(vault)).toEqual([])
    })

    it('reads enabledCssSnippets written by Obsidian', async () => {
      await fs.mkdir(path.dirname(appearancePath()), { recursive: true })
      await fs.writeFile(appearancePath(), JSON.stringify({ enabledCssSnippets: ['a', 'b c'], cssTheme: 'Minimal' }))

      expect(await store.loadEnabledIds(vault)).toEqual(['a', 'b c'])
    })

    it('saves enabledCssSnippets and keeps the other appearance fields', async () => {
      await fs.mkdir(path.dirname(appearancePath()), { recursive: true })
      await fs.writeFile(appearancePath(), JSON.stringify({ cssTheme: 'Minimal', baseFontSize: 18 }))

      await store.saveEnabledIds(vault, ['dark-accent'])

      expect(JSON.parse(await fs.readFile(appearancePath(), 'utf-8'))).toEqual({
        cssTheme: 'Minimal',
        baseFontSize: 18,
        enabledCssSnippets: ['dark-accent'],
      })
    })

    it('creates appearance.json when none exists', async () => {
      await store.saveEnabledIds(vault, ['x'])

      expect(JSON.parse(await fs.readFile(appearancePath(), 'utf-8'))).toEqual({ enabledCssSnippets: ['x'] })
    })

    it('never overwrites an appearance.json that is not valid JSON', async () => {
      await fs.mkdir(path.dirname(appearancePath()), { recursive: true })
      await fs.writeFile(appearancePath(), '{ broken')

      await expect(store.saveEnabledIds(vault, ['x'])).rejects.toThrow(AppearanceFileInvalidError)
      expect(await fs.readFile(appearancePath(), 'utf-8')).toBe('{ broken')
      expect(await store.loadEnabledIds(vault)).toEqual([])
    })

    it('does not lose either update when two saves race on different fields', async () => {
      await fs.mkdir(path.dirname(appearancePath()), { recursive: true })
      await fs.writeFile(appearancePath(), JSON.stringify({ cssTheme: 'Minimal' }))

      await Promise.all([store.saveEnabledIds(vault, ['a']), store.saveEnabledIds(vault, ['a', 'b'])])

      const parsed = JSON.parse(await fs.readFile(appearancePath(), 'utf-8')) as Record<string, unknown>
      expect(parsed['cssTheme']).toBe('Minimal')
      expect(Array.isArray(parsed['enabledCssSnippets'])).toBe(true)
    })
  })

  describe('deleteSnippet', () => {
    it('deletes the file and removes it from enabledCssSnippets', async () => {
      await store.saveSnippet(vault, 'to-delete', 'a {}')
      await store.saveSnippet(vault, 'keep', 'b {}')
      await store.saveEnabledIds(vault, ['to-delete', 'keep'])

      await store.deleteSnippet(vault, 'to-delete')

      expect(await store.loadSnippet(vault, 'to-delete')).toBeNull()
      expect(await store.loadEnabledIds(vault)).toEqual(['keep'])
    })

    it('does nothing when the snippet does not exist', async () => {
      await expect(store.deleteSnippet(vault, 'never-existed')).resolves.toBeUndefined()
    })

    it('still deletes the file when appearance.json is invalid, and leaves it untouched', async () => {
      await store.saveSnippet(vault, 'gone', 'a {}')
      await fs.writeFile(appearancePath(), '{ broken')

      await store.deleteSnippet(vault, 'gone')

      expect(await store.loadSnippet(vault, 'gone')).toBeNull()
      expect(await fs.readFile(appearancePath(), 'utf-8')).toBe('{ broken')
    })
  })

  describe('vault isolation', () => {
    it('keeps snippets of the same id separate across vaults', async () => {
      const other = path.join(os.tmpdir(), `snippet-store-test-${crypto.randomBytes(8).toString('hex')}`)
      await fs.mkdir(other, { recursive: true })
      try {
        await store.saveSnippet(vault, 'shared-name', 'a { color: red; }')
        await store.saveSnippet(other, 'shared-name', 'a { color: blue; }')

        expect(await store.loadSnippet(vault, 'shared-name')).toBe('a { color: red; }')
        expect(await store.loadSnippet(other, 'shared-name')).toBe('a { color: blue; }')
      } finally {
        await fs.rm(other, { recursive: true, force: true })
      }
    })
  })
})

describe('isValidSnippetFilename', () => {
  it.each(['dark.css', 'my snippet.css', 'Dark.v2.css', 'größe.css', 'a-b_c.css'])('accepts %s', (name) => {
    expect(isValidSnippetFilename(name)).toBe(true)
  })

  it.each(['.hidden.css', 'a/b.css', 'a\\b.css', '50%.css', 'a:b.css', 'x.txt', '.css', '../x.css', 'a\u0000.css'])('rejects %j', (name) => {
    expect(isValidSnippetFilename(name)).toBe(false)
  })
})
