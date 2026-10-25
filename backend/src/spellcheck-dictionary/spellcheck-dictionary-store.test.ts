// Unit tests for SpellcheckDictionaryStore

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import {
  SpellcheckDictionaryStore,
  SpellcheckDictionaryFullError,
  SpellcheckDictionaryUnreadableError,
} from './spellcheck-dictionary-store.js'
import { MAX_SPELLCHECK_WORDS } from './types.js'
import { addSpellcheckWordsSchema } from './validation.js'
import type { ILogger } from '../logger/index.js'

const VAULT_ID = 'vault-test-1'

function createMockLogger(): ILogger {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
}

let tmpDir: string
let filePath: string
let store: SpellcheckDictionaryStore

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `spellcheck-dictionary-test-${crypto.randomBytes(8).toString('hex')}`)
  await fs.mkdir(path.join(tmpDir, '.slatebase'), { recursive: true })
  filePath = path.join(tmpDir, '.slatebase', 'spellcheck-words.json')
  store = new SpellcheckDictionaryStore((id) => (id === VAULT_ID ? tmpDir : null), createMockLogger())
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('SpellcheckDictionaryStore', () => {
  it('returns an empty list when no file exists', async () => {
    expect(await store.getWords(VAULT_ID)).toEqual({ words: [] })
  })

  it('adds words, sorted and without duplicates', async () => {
    await store.addWords(VAULT_ID, ['Zettelkasten', 'Slatebase', 'Slatebase'])
    const result = await store.addWords(VAULT_ID, ['Obsidian', 'Slatebase'])
    expect(result.words).toEqual(['Obsidian', 'Slatebase', 'Zettelkasten'])
    expect(await store.getWords(VAULT_ID)).toEqual(result)
  })

  it('writes one word per line so Git merges line by line', async () => {
    await store.addWords(VAULT_ID, ['b', 'a'])
    const lines = (await fs.readFile(filePath, 'utf-8')).split('\n')
    expect(lines).toContain('    "a",')
    expect(lines).toContain('    "b"')
  })

  it('removes a word and tolerates one that is not there', async () => {
    await store.addWords(VAULT_ID, ['Slatebase', 'Obsidian'])
    expect((await store.removeWord(VAULT_ID, 'Slatebase')).words).toEqual(['Obsidian'])
    expect((await store.removeWord(VAULT_ID, 'Unbekannt')).words).toEqual(['Obsidian'])
  })

  it('keeps concurrent additions', async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.addWords(VAULT_ID, [`wort${i}`])))
    expect((await store.getWords(VAULT_ID)).words).toHaveLength(20)
  })

  it('rejects additions beyond the cap and leaves the list untouched', async () => {
    const full = Array.from({ length: MAX_SPELLCHECK_WORDS }, (_, i) => `w${i}`)
    await store.addWords(VAULT_ID, full)
    await expect(store.addWords(VAULT_ID, ['one-too-many'])).rejects.toBeInstanceOf(SpellcheckDictionaryFullError)
    expect((await store.getWords(VAULT_ID)).words).toHaveLength(MAX_SPELLCHECK_WORDS)
  })

  it('drops non-string entries when reading a hand-edited file', async () => {
    await fs.writeFile(filePath, JSON.stringify({ words: ['gut', 42, '', null, 'auch'] }), 'utf-8')
    expect((await store.getWords(VAULT_ID)).words).toEqual(['auch', 'gut'])
  })

  it('does not cut a list that a Git merge pushed over the cap', async () => {
    const words = Array.from({ length: MAX_SPELLCHECK_WORDS + 10 }, (_, i) => `w${String(i).padStart(5, '0')}`)
    await fs.writeFile(filePath, JSON.stringify({ words }), 'utf-8')
    expect((await store.getWords(VAULT_ID)).words).toHaveLength(MAX_SPELLCHECK_WORDS + 10)
    // Removing still works and keeps the rest.
    expect((await store.removeWord(VAULT_ID, 'w00000')).words).toHaveLength(MAX_SPELLCHECK_WORDS + 9)
    // Adding something new is refused, re-adding something known is not.
    await expect(store.addWords(VAULT_ID, ['neu'])).rejects.toBeInstanceOf(SpellcheckDictionaryFullError)
  })

  it('drops entries the API would not accept when reading', async () => {
    await fs.writeFile(filePath, JSON.stringify({ words: ['gut', 'zwei Wörter', 'x'.repeat(101), 'a\nb'] }), 'utf-8')
    expect((await store.getWords(VAULT_ID)).words).toEqual(['gut'])
  })

  it('does not write when nothing changes', async () => {
    await expect(store.removeWord(VAULT_ID, 'fehlt')).resolves.toEqual({ words: [] })
    await expect(fs.access(filePath)).rejects.toThrow()

    await store.addWords(VAULT_ID, ['Slatebase'])
    const before = await fs.stat(filePath)
    await new Promise((resolve) => setTimeout(resolve, 20))
    await store.addWords(VAULT_ID, ['Slatebase'])
    await store.removeWord(VAULT_ID, 'fehlt')
    expect((await fs.stat(filePath)).mtimeMs).toBe(before.mtimeMs)
  })

  it.each([
    ['an empty object', '{}'],
    ['an array', '["a","b"]'],
    ['words of the wrong type', '{"words":"a"}'],
  ])('refuses to overwrite valid JSON of the wrong shape (%s)', async (_label, content) => {
    await fs.writeFile(filePath, content, 'utf-8')
    await expect(store.addWords(VAULT_ID, ['neu'])).rejects.toBeInstanceOf(SpellcheckDictionaryUnreadableError)
    expect(await fs.readFile(filePath, 'utf-8')).toBe(content)
  })

  it('refuses to overwrite a file that is not valid JSON', async () => {
    const conflicted = '<<<<<<< HEAD\n{"words":["a"]}\n=======\n{"words":["b"]}\n>>>>>>> origin\n'
    await fs.writeFile(filePath, conflicted, 'utf-8')
    await expect(store.addWords(VAULT_ID, ['neu'])).rejects.toBeInstanceOf(SpellcheckDictionaryUnreadableError)
    // Nothing readable to remove from: no write either way.
    await store.removeWord(VAULT_ID, 'a')
    expect(await fs.readFile(filePath, 'utf-8')).toBe(conflicted)
  })
})

describe('addSpellcheckWordsSchema', () => {
  it('trims words', () => {
    expect(addSpellcheckWordsSchema.parse({ words: ['  Slatebase '] }).words).toEqual(['Slatebase'])
  })

  it.each([
    ['empty list', { words: [] }],
    ['blank word', { words: ['   '] }],
    ['inner whitespace', { words: ['zwei Wörter'] }],
    ['control character', { words: ['a\u0000b'] }],
    ['overlong word', { words: ['x'.repeat(101)] }],
    ['not an array', { words: 'Slatebase' }],
  ])('rejects %s', (_label, body) => {
    expect(addSpellcheckWordsSchema.safeParse(body).success).toBe(false)
  })
})
