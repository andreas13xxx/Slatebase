import { describe, expect, it } from 'vitest'
import {
  APPEARANCE_CONFIG_DEFAULTS,
  APPEARANCE_CONFIG_KEYS,
  APPEARANCE_CONFIG_KEY_NAMES,
  appearanceConfigValueProblem,
  appearanceCssVariables,
  describeAppearanceDeviations,
  hexToHsl,
  mergeAppearanceConfig,
  resolveColorScheme,
  vaultColorScheme,
} from './appearance-config.js'
import { configValueProblem } from './config-table.js'

describe('appearance table', () => {
  it('has a default that satisfies its own spec for every key', () => {
    for (const key of APPEARANCE_CONFIG_KEY_NAMES) {
      expect(configValueProblem(APPEARANCE_CONFIG_KEYS[key], APPEARANCE_CONFIG_DEFAULTS[key]), key).toBeNull()
    }
  })

  it('does not report what the theme and snippet services own, but reports the rest', () => {
    expect(describeAppearanceDeviations({ cssTheme: 'Minimal', enabledCssSnippets: ['a'], accentColor: '#ff0000' })).toEqual([])
    expect(describeAppearanceDeviations({ fancy: 1, theme: 'sepia' }).map((d) => d.key)).toEqual(['fancy', 'theme'])
  })

  it('accepts colours as #rrggbb or empty, and font lists without anything that could leave a CSS declaration', () => {
    expect(appearanceConfigValueProblem('accentColor', '#1a2B3c')).toBeNull()
    expect(appearanceConfigValueProblem('accentColor', '')).toBeNull()
    for (const bad of ['red', '#fff', '#12345g', 'rgb(1,2,3)']) expect(appearanceConfigValueProblem('accentColor', bad), bad).not.toBeNull()

    expect(appearanceConfigValueProblem('textFontFamily', 'Fira Code, "Noto Sans", Segoe UI')).toBeNull()
    expect(appearanceConfigValueProblem('textFontFamily', 'Inter')).toBeNull()
    for (const bad of ['x; background: url(//evil)', 'a}b', 'a{b', 'a\\b', 'a/b', 'url(x)']) {
      expect(appearanceConfigValueProblem('interfaceFontFamily', bad), bad).not.toBeNull()
    }
    expect(appearanceConfigValueProblem('monospaceFontFamily', 'x'.repeat(257))).toMatch(/longer/)
  })

  it('limits the font size', () => {
    expect(appearanceConfigValueProblem('baseFontSize', 9)).not.toBeNull()
    expect(appearanceConfigValueProblem('baseFontSize', 31)).not.toBeNull()
    expect(appearanceConfigValueProblem('baseFontSize', 18)).toBeNull()
  })

  it('falls back to the default for an invalid value and keeps unknown and foreign keys', () => {
    const merged = mergeAppearanceConfig({ theme: 'sepia', baseFontSize: 20, cssTheme: 'Minimal', other: 1 })
    expect(merged['theme']).toBe('system')
    expect(merged['baseFontSize']).toBe(20)
    expect(merged['cssTheme']).toBe('Minimal')
    expect(merged['other']).toBe(1)
  })
})

describe('colour scheme', () => {
  it('maps Obsidian\'s base themes', () => {
    expect(vaultColorScheme('obsidian')).toBe('dark')
    expect(vaultColorScheme('moonstone')).toBe('light')
    expect(vaultColorScheme('system')).toBe('system')
  })

  it('lets a user\'s own choice win and the vault decide only for those on system', () => {
    expect(resolveColorScheme('system', 'obsidian')).toBe('dark')
    expect(resolveColorScheme('system', 'moonstone')).toBe('light')
    expect(resolveColorScheme('system', 'system')).toBe('system')
    expect(resolveColorScheme('light', 'obsidian')).toBe('light')
    expect(resolveColorScheme('dark', 'moonstone')).toBe('dark')
  })
})

describe('hexToHsl', () => {
  it('converts the primary colours and grey', () => {
    expect(hexToHsl('#ff0000')).toEqual({ h: 0, s: 100, l: 50 })
    expect(hexToHsl('#00ff00')).toEqual({ h: 120, s: 100, l: 50 })
    expect(hexToHsl('#0000ff')).toEqual({ h: 240, s: 100, l: 50 })
    expect(hexToHsl('#808080')).toEqual({ h: 0, s: 0, l: 50 })
    expect(hexToHsl('#ffffff')).toEqual({ h: 0, s: 0, l: 100 })
  })

  it('gives Obsidian\'s default purple back as the hue Obsidian uses', () => {
    const hsl = hexToHsl('#7b6cd9')
    expect(hsl?.h).toBeGreaterThanOrEqual(245)
    expect(hsl?.h).toBeLessThanOrEqual(250)
  })

  it('is null for anything that is not #rrggbb', () => {
    expect(hexToHsl('')).toBeNull()
    expect(hexToHsl('#fff')).toBeNull()
    expect(hexToHsl('red')).toBeNull()
  })
})

describe('appearanceCssVariables', () => {
  const defaults = APPEARANCE_CONFIG_DEFAULTS

  it('sets nothing for the defaults, so the theme\'s own values stay', () => {
    expect(appearanceCssVariables(defaults)).toEqual({})
  })

  it('sets the variables Obsidian themes and snippets read', () => {
    expect(appearanceCssVariables({
      ...defaults, accentColor: '#ff0000', baseFontSize: 18,
      interfaceFontFamily: 'Inter', textFontFamily: ' Georgia ', monospaceFontFamily: 'Fira Code',
    })).toEqual({
      '--accent-h': '0', '--accent-s': '100%', '--accent-l': '50%',
      '--font-text-size': '18px',
      '--font-interface-override': 'Inter', '--font-text-override': 'Georgia', '--font-monospace-override': 'Fira Code',
    })
  })
})
