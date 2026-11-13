import { describe, it, expect } from 'vitest'
import { buildDeepLink, isSafeVaultPath, parseDeepLink, resolveVaultRef } from './deepLink'

describe('isSafeVaultPath', () => {
  it.each(['', '/abs.md', '../x.md', 'a/../b.md', 'a/./b.md', 'a//b.md', 'a\\b.md', 'a\0b.md', 'a/'])(
    'rejects %j',
    (p) => expect(isSafeVaultPath(p)).toBe(false),
  )

  it('rejects oversized paths', () => {
    expect(isSafeVaultPath('a'.repeat(4097))).toBe(false)
  })

  it.each(['note.md', 'Ordner/Notiz.md', 'Café/Übung 1.md', 'a..b/c.md', '.hidden/x.md'])('accepts %j', (p) =>
    expect(isSafeVaultPath(p)).toBe(true),
  )
})

describe('parseDeepLink', () => {
  it('parses vault and file', () => {
    expect(parseDeepLink('?vault=abc123&file=Ordner%2FNotiz.md')).toEqual({ vault: 'abc123', path: 'Ordner/Notiz.md', anchor: null })
  })

  it('opens just the vault when file is missing or empty', () => {
    expect(parseDeepLink('vault=abc')).toEqual({ vault: 'abc', path: null, anchor: null })
    expect(parseDeepLink('?vault=abc&file=')).toEqual({ vault: 'abc', path: null, anchor: null })
  })

  it('rejects links without a usable vault', () => {
    expect(parseDeepLink('')).toBeNull()
    expect(parseDeepLink('?file=a.md')).toBeNull()
    expect(parseDeepLink('?vault=%20&file=a.md')).toBeNull()
    expect(parseDeepLink(`?vault=${'x'.repeat(129)}`)).toBeNull()
  })

  it('rejects traversal and other unsafe paths', () => {
    expect(parseDeepLink('?vault=a&file=..%2Fsecret.md')).toBeNull()
    expect(parseDeepLink('?vault=a&file=%2Fetc%2Fpasswd')).toBeNull()
    expect(parseDeepLink('?vault=a&file=a%00b.md')).toBeNull()
    expect(parseDeepLink('?vault=a&file=a%5Cb.md')).toBeNull()
  })

  it('splits a heading anchor off a note path', () => {
    expect(parseDeepLink('?vault=a&file=Note.md%23Mein%20Titel')).toEqual({
      vault: 'a', path: 'Note.md', anchor: { kind: 'heading', text: 'Mein Titel' },
    })
  })

  it('splits a block anchor and validates its id', () => {
    expect(parseDeepLink('?vault=a&file=Note.md%23%5Eabc-12')).toEqual({
      vault: 'a', path: 'Note.md', anchor: { kind: 'block', id: 'abc-12' },
    })
    expect(parseDeepLink('?vault=a&file=Note.md%23%5Ea%20b')).toBeNull()
    expect(parseDeepLink('?vault=a&file=Note.md%23%5E')).toBeNull()
  })

  it('refuses an empty anchor instead of opening the note at the top', () => {
    expect(parseDeepLink('?vault=a&file=Note.md%23')).toBeNull()
  })

  it('treats a # that does not follow .md as part of the file name', () => {
    expect(parseDeepLink('?vault=a&file=C%23.md')).toEqual({ vault: 'a', path: 'C#.md', anchor: null })
  })

  it('checks the path part of an anchored link too', () => {
    expect(parseDeepLink('?vault=a&file=..%2Fx.md%23H')).toBeNull()
  })

  it('ignores unknown parameters', () => {
    expect(parseDeepLink('?vault=a&file=n.md&utm=1&future=x')).toEqual({ vault: 'a', path: 'n.md', anchor: null })
  })
})

describe('buildDeepLink', () => {
  const origin = 'https://notes.example.org'

  it('builds a vault-only link', () => {
    expect(buildDeepLink(origin, 'abc')).toBe('https://notes.example.org/open?vault=abc')
    expect(buildDeepLink(`${origin}/`, 'abc')).toBe('https://notes.example.org/open?vault=abc')
  })

  it.each([
    'Notiz.md',
    'Ordner/Übung & Test 100%.md',
    'C#/Notiz #1.md',
    'Emoji 🎉/Party.md',
    'a+b=c?.md',
  ])('round-trips %j', (path) => {
    const link = buildDeepLink(origin, 'v1', path)
    expect(parseDeepLink(new URL(link).search)).toEqual({ vault: 'v1', path, anchor: null })
  })

  it('round-trips heading and block anchors', () => {
    const heading = buildDeepLink(origin, 'v1', 'N.md', { kind: 'heading', text: 'A & B #2' })
    expect(parseDeepLink(new URL(heading).search)).toEqual({
      vault: 'v1', path: 'N.md', anchor: { kind: 'heading', text: 'A & B #2' },
    })
    const block = buildDeepLink(origin, 'v1', 'N.md', { kind: 'block', id: 'x-1' })
    expect(parseDeepLink(new URL(block).search)?.anchor).toEqual({ kind: 'block', id: 'x-1' })
  })

  it('drops an anchor for non-markdown files', () => {
    const link = buildDeepLink(origin, 'v1', 'board.canvas', { kind: 'heading', text: 'x' })
    expect(parseDeepLink(new URL(link).search)).toEqual({ vault: 'v1', path: 'board.canvas', anchor: null })
  })

  it('refuses to build a link for an unsafe path', () => {
    expect(() => buildDeepLink(origin, 'v1', '../x.md')).toThrow()
  })
})

describe('resolveVaultRef', () => {
  const vaults = [
    { id: 'aaa', name: 'Privat' },
    { id: 'bbb', name: 'Arbeit' },
    { id: 'ccc', name: 'Arbeit' },
  ]

  it('prefers an exact id', () => {
    expect(resolveVaultRef('aaa', vaults)).toBe('aaa')
  })

  it('accepts a unique name', () => {
    expect(resolveVaultRef('Privat', vaults)).toBe('aaa')
  })

  it('refuses an ambiguous or unknown name', () => {
    expect(resolveVaultRef('Arbeit', vaults)).toBeNull()
    expect(resolveVaultRef('nope', vaults)).toBeNull()
    expect(resolveVaultRef('privat', vaults)).toBeNull()
  })

  it('lets an id win over a vault that is named like it', () => {
    expect(resolveVaultRef('bbb', [...vaults, { id: 'ddd', name: 'bbb' }])).toBe('bbb')
  })
})
