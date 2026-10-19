import { describe, expect, it } from 'vitest'
import {
  MAX_THEME_CSS_BYTES,
  deriveThemeId,
  formatThemeSize,
  pickThemeFiles,
  readManifestFields,
  toThemeId,
} from './themeImport'

const file = (name: string, content = 'a{}'): File => new File([content], name)

describe('pickThemeFiles', () => {
  it('requires a stylesheet', () => {
    const result = pickThemeFiles([file('manifest.json', '{}')])
    expect(result.ok).toBe(false)
  })

  it('prefers theme.css and finds the manifest', () => {
    const result = pickThemeFiles([file('other.css'), file('theme.css'), file('manifest.json', '{}')])
    expect(result.ok && result.files.css.name).toBe('theme.css')
    expect(result.ok && result.files.manifest?.name).toBe('manifest.json')
  })

  it('accepts a lone stylesheet without a manifest', () => {
    const result = pickThemeFiles([file('Things.css')])
    expect(result.ok && result.files.manifest).toBeNull()
  })

  it('rejects a stylesheet above 2 MB', () => {
    const big = file('theme.css', 'a'.repeat(MAX_THEME_CSS_BYTES + 1))
    expect(pickThemeFiles([big]).ok).toBe(false)
  })
})

describe('toThemeId', () => {
  it('keeps normal names and strips characters the backend rejects', () => {
    expect(toThemeId('Things')).toBe('Things')
    expect(toThemeId('Blue Topaz')).toBe('Blue Topaz')
    expect(toThemeId('a/b\\c:d')).toBe('abcd')
  })

  it('removes leading punctuation and trailing dots/spaces', () => {
    expect(toThemeId('..hidden')).toBe('hidden')
    expect(toThemeId('theme. ')).toBe('theme')
  })

  it('returns null when nothing usable is left', () => {
    expect(toThemeId('///')).toBeNull()
    expect(toThemeId('')).toBeNull()
  })
})

describe('deriveThemeId', () => {
  it('uses the manifest name first', () => {
    expect(deriveThemeId('Minimal', 'theme.css')).toBe('Minimal')
  })

  it('falls back to the stylesheet name, but never to the generic "theme"', () => {
    expect(deriveThemeId(null, 'Things.css')).toBe('Things')
    expect(deriveThemeId(null, 'theme.css')).toBeNull()
    expect(deriveThemeId('///', 'Fallback.css')).toBe('Fallback')
  })
})

describe('readManifestFields', () => {
  it('reads known string fields and ignores everything else', async () => {
    const manifest = file('manifest.json', JSON.stringify({ name: 'Minimal', version: '7.0.0', author: 'kepano', extra: 1, minAppVersion: 3 }))
    expect(await readManifestFields(manifest)).toEqual({ name: 'Minimal', version: '7.0.0', author: 'kepano' })
  })

  it('tolerates a missing or invalid manifest', async () => {
    expect(await readManifestFields(null)).toEqual({})
    expect(await readManifestFields(file('manifest.json', '{ nope'))).toEqual({})
    expect(await readManifestFields(file('manifest.json', '[1]'))).toEqual({})
  })
})

describe('formatThemeSize', () => {
  it('formats bytes and kilobytes', () => {
    expect(formatThemeSize(512)).toBe('512 B')
    expect(formatThemeSize(2048)).toBe('2.0 KB')
  })
})
