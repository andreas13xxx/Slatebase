import { describe, expect, it } from 'vitest'
import {
  communityThemeEntrySchema,
  isNewerVersion,
  isValidRepo,
  normalizeScreenshotPath,
  parseVersion,
  sniffImageType,
} from './validation.js'

describe('isValidRepo', () => {
  it.each(['kepano/obsidian-minimal', 'a/b', 'My_Org/some.repo-1', 'owner/.github'])('accepts %s', (repo) => {
    expect(isValidRepo(repo)).toBe(true)
  })

  it.each(['', 'noslash', 'a/b/c', '/b', 'a/', '../x', 'x/..', './x', 'a b/c', 'a/b?x=1', 'a/b#h', 'a%2fb/c', 'a/b\\c'])(
    'rejects %j',
    (repo) => {
      expect(isValidRepo(repo)).toBe(false)
    },
  )
})

describe('communityThemeEntrySchema', () => {
  it('accepts a real entry and keeps only known modes', () => {
    const entry = communityThemeEntrySchema.parse({
      name: 'Things', author: 'colineckert', repo: 'colineckert/obsidian-things', screenshot: 'screenshot.png', modes: ['dark', 'light', 'sepia'],
    })
    expect(entry.modes).toEqual(['dark', 'light'])
    expect(entry.legacy).toBe(false)
  })

  it('fills defaults for optional fields', () => {
    const entry = communityThemeEntrySchema.parse({ name: 'X', repo: 'a/b' })
    expect(entry).toMatchObject({ author: '', screenshot: '', modes: [], legacy: false })
  })

  it('rejects an empty name or an invalid repo', () => {
    expect(communityThemeEntrySchema.safeParse({ name: '  ', repo: 'a/b' }).success).toBe(false)
    expect(communityThemeEntrySchema.safeParse({ name: 'X', repo: '../b' }).success).toBe(false)
    expect(communityThemeEntrySchema.safeParse({ name: 'X' }).success).toBe(false)
  })
})

describe('normalizeScreenshotPath', () => {
  it.each([
    ['screenshot.png', 'screenshot.png'],
    ['./docs/dark.png', 'docs/dark.png'],
    ['/images/sandover-plain.png', 'images/sandover-plain.png'],
    ['1 Purple Aurora screenshot.png', '1%20Purple%20Aurora%20screenshot.png'],
    ['img/a b/c.png', 'img/a%20b/c.png'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeScreenshotPath(input)).toBe(expected)
  })

  it.each(['', '   ', './', '/', '../secret.png', 'a/../b.png', 'a//b.png', 'a/./b.png'])('rejects %j', (input) => {
    expect(normalizeScreenshotPath(input)).toBeNull()
  })

  it('encodes characters that would change the URL', () => {
    expect(normalizeScreenshotPath('a?x=1#frag.png')).toBe('a%3Fx%3D1%23frag.png')
  })
})

describe('sniffImageType', () => {
  it('recognises PNG, JPEG, GIF and WebP by their leading bytes', () => {
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png')
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffImageType(Buffer.from('GIF89a....'))).toBe('image/gif')
    expect(sniffImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]))).toBe('image/webp')
  })

  it('rejects SVG, HTML, empty and truncated data', () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(sniffImageType(Buffer.from('<html><script>alert(1)</script>'))).toBeNull()
    expect(sniffImageType(Buffer.alloc(0))).toBeNull()
    expect(sniffImageType(Buffer.from([0x89, 0x50]))).toBeNull()
  })
})

describe('versions', () => {
  it('parses the numeric core and ignores a v prefix and pre-release suffix', () => {
    expect(parseVersion('1.2.3')).toBe('1.2.3')
    expect(parseVersion('v2.0')).toBe('2.0')
    expect(parseVersion('1.2.3-beta.1')).toBe('1.2.3')
    expect(parseVersion('1.2.3+build5')).toBe('1.2.3')
  })

  it.each(['', 'latest', 'x.y.z', '1..2', undefined, null, 5])('cannot parse %j', (value) => {
    expect(parseVersion(value)).toBeNull()
  })

  it('detects a newer remote version numerically', () => {
    expect(isNewerVersion('1.9.0', '1.10.0')).toBe(true)
    expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false)
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(false)
    expect(isNewerVersion('v1.0', '1.0.1')).toBe(true)
  })

  it('returns null — unknown, not "no update" — when either side is not parseable', () => {
    expect(isNewerVersion('1.0.0', 'latest')).toBeNull()
    expect(isNewerVersion(undefined, '1.0.0')).toBeNull()
  })
})
