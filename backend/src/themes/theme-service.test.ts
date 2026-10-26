import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppearanceFileInvalidError, InvalidThemeIdError, ThemeNotFoundError, ThemeTooLargeError } from './errors.js'
import { ThemeService } from './theme-service.js'
import {
  BUILTIN_OBSIDIAN_THEME_ID,
  MAX_THEME_CSS_SIZE,
  extractExternalHosts,
  hasStyleSettingsBlock,
  isBuiltinThemeId,
  isValidThemeId,
  normalizeManifest,
} from './validation.js'

let vault: string
let service: ThemeService

beforeEach(async () => {
  vault = await fs.mkdtemp(path.join(os.tmpdir(), 'slatebase-themes-'))
  service = new ThemeService()
})

afterEach(async () => {
  await fs.rm(vault, { recursive: true, force: true })
})

const appearancePath = (): string => path.join(vault, '.obsidian', 'appearance.json')

describe('ThemeService', () => {
  it('lists nothing when .obsidian/themes does not exist', async () => {
    expect(await service.listThemes(vault)).toEqual([])
  })

  it('saves a theme and lists/loads it with manifest data', async () => {
    const meta = await service.saveTheme(vault, 'Things', 'body { --x: 1 }', { name: 'Things', author: 'Colin' })
    expect(meta).toMatchObject({ id: 'Things', size: 15, manifest: { name: 'Things', author: 'Colin' } })

    const listed = await service.listThemes(vault)
    expect(listed.map((t) => t.id)).toEqual(['Things'])

    const loaded = await service.loadTheme(vault, 'Things')
    expect(loaded?.css).toBe('body { --x: 1 }')
  })

  it('shows a theme that was dropped in by Obsidian (no import step)', async () => {
    const dir = path.join(vault, '.obsidian', 'themes', 'Minimal')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'theme.css'), '.a{color:red}')
    await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ name: 'Minimal', version: '7.0.0', extra: 1 }))
    const [theme] = await service.listThemes(vault)
    expect(theme?.manifest).toEqual({ name: 'Minimal', version: '7.0.0' })
  })

  it('ignores folders without theme.css and tolerates an invalid manifest', async () => {
    await fs.mkdir(path.join(vault, '.obsidian', 'themes', 'Empty'), { recursive: true })
    const dir = path.join(vault, '.obsidian', 'themes', 'Broken')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'theme.css'), 'a{}')
    await fs.writeFile(path.join(dir, 'manifest.json'), '{ not json')
    const themes = await service.listThemes(vault)
    expect(themes.map((t) => [t.id, t.manifest.name])).toEqual([['Broken', 'Broken']])
  })

  it('returns null for a missing theme', async () => {
    expect(await service.loadTheme(vault, 'Nope')).toBeNull()
  })

  it('rejects unsafe ids before touching the filesystem', async () => {
    for (const id of ['..', '../x', 'a/b', 'a\\b', '.hidden', 'trailing.', '', 'CON', 'nul.txt', 'COM1', 'lpt9']) {
      await expect(service.saveTheme(vault, id, 'a{}')).rejects.toBeInstanceOf(InvalidThemeIdError)
      await expect(service.loadTheme(vault, id)).rejects.toBeInstanceOf(InvalidThemeIdError)
    }
  })

  it('accepts CSS of exactly 3 MB, the limit that admits the larger catalog themes', async () => {
    expect(MAX_THEME_CSS_SIZE).toBe(3 * 1024 * 1024)
    const meta = await service.saveTheme(vault, 'Exact', 'a'.repeat(MAX_THEME_CSS_SIZE))
    expect(meta.id).toBe('Exact')
  })

  it('rejects CSS above the size limit', async () => {
    await expect(service.saveTheme(vault, 'Big', 'a'.repeat(MAX_THEME_CSS_SIZE + 1))).rejects.toBeInstanceOf(
      ThemeTooLargeError,
    )
  })

  it('does not follow a symlinked theme.css out of the vault', async () => {
    const secret = path.join(os.tmpdir(), `slatebase-secret-${Date.now()}.css`)
    await fs.writeFile(secret, 'secret{}')
    const dir = path.join(vault, '.obsidian', 'themes', 'Link')
    await fs.mkdir(dir, { recursive: true })
    try {
      await fs.symlink(secret, path.join(dir, 'theme.css'))
      expect(await service.loadTheme(vault, 'Link')).toBeNull()
      expect(await service.listThemes(vault)).toEqual([])
    } finally {
      await fs.rm(secret, { force: true })
    }
  })

  describe('active theme', () => {
    it('is null by default and after clearing', async () => {
      expect(await service.getActiveThemeId(vault)).toBeNull()
      await service.setActiveThemeId(vault, null)
      expect(await service.getActiveThemeId(vault)).toBeNull()
    })

    it('writes cssTheme and keeps every other appearance.json field', async () => {
      await fs.mkdir(path.dirname(appearancePath()), { recursive: true })
      await fs.writeFile(appearancePath(), JSON.stringify({ theme: 'moonstone', baseFontSize: 17, enabledCssSnippets: ['a'] }))
      await service.saveTheme(vault, 'Things', 'a{}')
      await service.setActiveThemeId(vault, 'Things')
      const written = JSON.parse(await fs.readFile(appearancePath(), 'utf-8')) as Record<string, unknown>
      expect(written).toEqual({ theme: 'moonstone', baseFontSize: 17, enabledCssSnippets: ['a'], cssTheme: 'Things' })
      expect(await service.getActiveThemeId(vault)).toBe('Things')
    })

    it('refuses to activate a theme that does not exist', async () => {
      await expect(service.setActiveThemeId(vault, 'Ghost')).rejects.toBeInstanceOf(ThemeNotFoundError)
    })

    it('stores a built-in theme id without a theme folder and keeps the other appearance.json fields', async () => {
      await fs.mkdir(path.dirname(appearancePath()), { recursive: true })
      await fs.writeFile(appearancePath(), JSON.stringify({ theme: 'moonstone', enabledCssSnippets: ['a'] }))
      await service.setActiveThemeId(vault, BUILTIN_OBSIDIAN_THEME_ID)
      const written = JSON.parse(await fs.readFile(appearancePath(), 'utf-8')) as Record<string, unknown>
      expect(written).toEqual({ theme: 'moonstone', enabledCssSnippets: ['a'], cssTheme: 'builtin:obsidian' })
      expect(await service.getActiveThemeId(vault)).toBe('builtin:obsidian')
    })

    it('keeps a built-in selection when an installed theme is deleted', async () => {
      await service.saveTheme(vault, 'Things', 'a{}')
      await service.setActiveThemeId(vault, BUILTIN_OBSIDIAN_THEME_ID)
      await service.deleteTheme(vault, 'Things')
      expect(await service.getActiveThemeId(vault)).toBe('builtin:obsidian')
    })

    it('does not accept the built-in id as a theme folder name', () => {
      expect(isValidThemeId(BUILTIN_OBSIDIAN_THEME_ID)).toBe(false)
      expect(isBuiltinThemeId(BUILTIN_OBSIDIAN_THEME_ID)).toBe(true)
      expect(isBuiltinThemeId('Things')).toBe(false)
    })

    it('never overwrites an appearance.json that is not a JSON object', async () => {
      await fs.mkdir(path.dirname(appearancePath()), { recursive: true })
      await service.saveTheme(vault, 'Things', 'a{}')
      for (const content of ['{ broken', '[1,2]', '"text"']) {
        await fs.writeFile(appearancePath(), content)
        await expect(service.setActiveThemeId(vault, 'Things')).rejects.toBeInstanceOf(AppearanceFileInvalidError)
        expect(await fs.readFile(appearancePath(), 'utf-8')).toBe(content)
        expect(await service.getActiveThemeId(vault)).toBeNull()
      }
    })

    it('serialises concurrent selections without losing fields', async () => {
      await service.saveTheme(vault, 'A', 'a{}')
      await service.saveTheme(vault, 'B', 'b{}')
      await Promise.all([service.setActiveThemeId(vault, 'A'), service.setActiveThemeId(vault, 'B')])
      expect(['A', 'B']).toContain(await service.getActiveThemeId(vault))
    })

    it('deleting the active theme resets the selection and removes the folder', async () => {
      await service.saveTheme(vault, 'Things', 'a{}')
      await service.setActiveThemeId(vault, 'Things')
      await service.deleteTheme(vault, 'Things')
      expect(await service.getActiveThemeId(vault)).toBeNull()
      expect(await service.loadTheme(vault, 'Things')).toBeNull()
    })

    it('deleting a missing theme is a no-op', async () => {
      await expect(service.deleteTheme(vault, 'Ghost')).resolves.toBeUndefined()
    })
  })
})

describe('theme validation helpers', () => {
  it('accepts normal theme names and rejects path-like ones', () => {
    expect(['Things', 'AnuPpuccin', 'Blue Topaz', 'my-theme_2.0'].every(isValidThemeId)).toBe(true)
    expect(['', '.', '..', '.x', 'a/b', 'x ', 'x.'].some(isValidThemeId)).toBe(false)
  })

  it('normalizes manifests: drops unknown fields, falls back to the id', () => {
    expect(normalizeManifest({ name: '  ', version: '1.0.0', evil: true }, 'Id')).toEqual({ name: 'Id', version: '1.0.0' })
    expect(normalizeManifest('garbage', 'Id')).toEqual({ name: 'Id' })
  })

  it('extracts external hosts from @import and url() only', () => {
    const css = `
      @import url("https://fonts.googleapis.com/css2?family=Inter");
      @import '//cdn.example.com/x.css';
      .a { background: url(https://img.example.org/a.png) }
      .b { background: url(data:image/png;base64,AAAA); }
      .c { background: url(./local.png) }
      /* https://commented.example.net is not a load */
    `
    expect(extractExternalHosts(css)).toEqual(['cdn.example.com', 'fonts.googleapis.com', 'img.example.org'])
  })

  it('recognises Style Settings blocks the way the plugin does: a comment starting with @settings and a line break', () => {
    expect(hasStyleSettingsBlock('/* @settings\nname: x\n*/')).toBe(true)
    expect(hasStyleSettingsBlock('/*@settings\r\nname: x\r\n*/')).toBe(true)
    expect(hasStyleSettingsBlock('/*! @settings\nname: x\n*/')).toBe(true) // the plugin accepts the preserved-comment form
    expect(hasStyleSettingsBlock('a{}\n\n/*   @settings\nid: y\n*/\nb{}')).toBe(true)
    expect(hasStyleSettingsBlock('/* the @settings block is documented elsewhere */')).toBe(false)
    expect(hasStyleSettingsBlock('/* @settings */')).toBe(false) // no line break after the marker: the plugin ignores it
    expect(hasStyleSettingsBlock('/* @settingsX\n*/')).toBe(false)
    expect(hasStyleSettingsBlock('.settings { }')).toBe(false)
    expect(hasStyleSettingsBlock('')).toBe(false)
  })

  it('stays fast on pathological whitespace input', () => {
    const start = Date.now()
    hasStyleSettingsBlock(`/*${' '.repeat(200_000)}x`)
    extractExternalHosts(`@import${' '.repeat(200_000)}x`)
    extractExternalHosts(`url(${' '.repeat(200_000)}`)
    expect(Date.now() - start).toBeLessThan(1000)
  })
})

describe('ThemeService review fixes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('deleteTheme works for a theme over the size limit and themeExists does not read the CSS', async () => {
    const dir = path.join(vault, '.obsidian', 'themes', 'Huge')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'theme.css'), 'a'.repeat(MAX_THEME_CSS_SIZE + 1))

    expect(await service.themeExists(vault, 'Huge')).toBe(true)
    await expect(service.loadTheme(vault, 'Huge')).rejects.toBeInstanceOf(ThemeTooLargeError)
    await service.deleteTheme(vault, 'Huge')
    expect(await service.themeExists(vault, 'Huge')).toBe(false)
  })

  it('keeps the active selection when removing the folder fails', async () => {
    await service.saveTheme(vault, 'Things', 'a{}')
    await service.setActiveThemeId(vault, 'Things')
    vi.spyOn(fs, 'rm').mockRejectedValue(Object.assign(new Error('locked'), { code: 'EBUSY' }))

    await expect(service.deleteTheme(vault, 'Things')).rejects.toMatchObject({ code: 'EBUSY' })

    vi.restoreAllMocks()
    expect(await service.getActiveThemeId(vault)).toBe('Things')
    expect(await service.themeExists(vault, 'Things')).toBe(true)
  })

  it('does not touch an invalid appearance.json while deleting', async () => {
    await service.saveTheme(vault, 'Things', 'a{}')
    await fs.mkdir(path.dirname(appearancePath()), { recursive: true })
    await fs.writeFile(appearancePath(), '{ broken')

    await service.deleteTheme(vault, 'Things')

    expect(await fs.readFile(appearancePath(), 'utf-8')).toBe('{ broken')
  })

  it('a concurrent selection is not lost while another theme is deleted', async () => {
    await service.saveTheme(vault, 'A', 'a{}')
    await service.saveTheme(vault, 'B', 'b{}')
    await service.setActiveThemeId(vault, 'A')

    await Promise.all([service.deleteTheme(vault, 'A'), service.setActiveThemeId(vault, 'B')])

    // Either order is consistent: B is selected (set after the delete) or the selection was reset
    // to default — but never the deleted theme A.
    expect(await service.getActiveThemeId(vault)).not.toBe('A')
  })

  it('overwrites an existing theme whose folder name differs only in case', async () => {
    await service.saveTheme(vault, 'Minimal', 'a{}', { name: 'Minimal', version: '1' })
    const meta = await service.saveTheme(vault, 'minimal', 'b{}', { name: 'Minimal', version: '2' })

    expect(meta.id).toBe('Minimal')
    const folders = await fs.readdir(path.join(vault, '.obsidian', 'themes'))
    expect(folders).toEqual(['Minimal'])
    expect((await service.loadTheme(vault, 'Minimal'))?.css).toBe('b{}')
    expect(meta.manifest.version).toBe('2')
  })

  it('writes manifest and stylesheet together and leaves no temp files behind', async () => {
    await service.saveTheme(vault, 'Things', 'a{}', { name: 'Things', author: 'Colin' })
    const files = (await fs.readdir(path.join(vault, '.obsidian', 'themes', 'Things'))).sort()
    expect(files).toEqual(['manifest.json', 'theme.css'])
  })

  it('a failed save keeps the previous theme intact', async () => {
    await service.saveTheme(vault, 'Things', 'old{}', { name: 'Things', version: '1' })
    vi.spyOn(fs, 'rename').mockRejectedValue(Object.assign(new Error('nope'), { code: 'EIO' }))

    await expect(service.saveTheme(vault, 'Things', 'new{}', { name: 'Things', version: '2' })).rejects.toMatchObject({ code: 'EIO' })

    vi.restoreAllMocks()
    const loaded = await service.loadTheme(vault, 'Things')
    expect(loaded?.css).toBe('old{}')
    expect(loaded?.meta.manifest.version).toBe('1')
    expect((await fs.readdir(path.join(vault, '.obsidian', 'themes', 'Things'))).sort()).toEqual(['manifest.json', 'theme.css'])
  })

  it('does not re-read an unchanged stylesheet on every listing (hosts are cached by file version)', async () => {
    await service.saveTheme(vault, 'Fancy', '@import url("https://fonts.googleapis.com/x");')
    const readFile = vi.spyOn(fs, 'readFile')

    const first = await service.listThemes(vault)
    const readsFirst = readFile.mock.calls.filter(([p]) => String(p).endsWith('theme.css')).length
    const second = await service.listThemes(vault)
    const readsAfter = readFile.mock.calls.filter(([p]) => String(p).endsWith('theme.css')).length

    expect(first[0]?.externalHosts).toEqual(['fonts.googleapis.com'])
    expect(second).toEqual(first)
    expect(readsAfter).toBe(readsFirst)
  })

  it('reports whether a theme has a Style Settings block, in the listing and when loading', async () => {
    await service.saveTheme(vault, 'WithSettings', '/* @settings\nname: Mine\nid: mine\n*/\nbody { color: red }')
    await service.saveTheme(vault, 'Plain', 'body { color: red } /* a comment about settings */')

    const listed = await service.listThemes(vault)
    expect(listed.map((t) => [t.id, t.hasStyleSettings])).toEqual([['Plain', false], ['WithSettings', true]])
    expect((await service.loadTheme(vault, 'WithSettings'))?.meta.hasStyleSettings).toBe(true)
    expect((await service.loadTheme(vault, 'Plain'))?.meta.hasStyleSettings).toBe(false)
  })

  it('updates hasStyleSettings when the stylesheet changes', async () => {
    await service.saveTheme(vault, 'Changing', 'a{}')
    expect((await service.listThemes(vault))[0]?.hasStyleSettings).toBe(false)

    await service.saveTheme(vault, 'Changing', '/* @settings\nname: x\nid: x\n*/ a{}')
    expect((await service.listThemes(vault))[0]?.hasStyleSettings).toBe(true)
  })

  it('lists many themes (read in parallel) in a stable order', async () => {
    for (const id of ['Zeta', 'Alpha', 'Mid']) await service.saveTheme(vault, id, 'a{}')
    expect((await service.listThemes(vault)).map((t) => t.id)).toEqual(['Alpha', 'Mid', 'Zeta'])
  })
})
