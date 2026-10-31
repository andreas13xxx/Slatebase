// `<vault>/.obsidian/appearance.json` — look and feel of a vault. The theme (`cssTheme`) and the
// enabled CSS snippets (`enabledCssSnippets`) belong to the theme and snippet services and are not
// in this table. Names and values below are assumptions from knowledge of Obsidian's file, not from
// documentation (`verified: false`); a real file that contradicts them is reported to the console.

import {
  cfg,
  configDefaults,
  configValueProblem,
  describeConfigDeviations,
  isConfigKey,
  mergeConfig,
  type ConfigKeyMeta,
  type ConfigValue,
  type ConfigValues,
} from './config-table.js'

/** Keys of appearance.json that another service owns. */
export const APPEARANCE_OWNED_ELSEWHERE = ['cssTheme', 'enabledCssSnippets'] as const

/**
 * A CSS font list as the settings page writes it: names, commas, quotes, digits, spaces and a few
 * separators. No braces, semicolons, slashes or parentheses, so a value cannot leave its declaration.
 */
const FONT_LIST = /^[\p{L}\p{N} ,'"._-]*$/u

const font = () => cfg.string('', 256, false, 'supported', {
  pattern: FONT_LIST,
  patternHint: 'font names may only contain letters, digits, spaces and , \' " . _ -',
})

export const APPEARANCE_CONFIG_KEYS = {
  /** `obsidian` is Obsidian's dark base theme, `moonstone` its light one, `system` follows the operating system. */
  theme: cfg.enum(['obsidian', 'moonstone', 'system'], 'system'),
  /** `#rrggbb`, or empty for the default accent colour. */
  accentColor: cfg.string('', 7, false, 'supported', { pattern: /^(#[0-9a-fA-F]{6})?$/, patternHint: 'expected #rrggbb or empty' }),
  baseFontSize: cfg.number(16, 10, 30),
  interfaceFontFamily: font(),
  textFontFamily: font(),
  monospaceFontFamily: font(),
  translucency: cfg.bool(false, false, 'passthrough'),
  showViewHeader: cfg.bool(false, false, 'passthrough'),
} as const satisfies Record<string, ConfigKeyMeta>

export type AppearanceConfigKey = keyof typeof APPEARANCE_CONFIG_KEYS
export type AppearanceConfigValue<K extends AppearanceConfigKey> = ConfigValue<typeof APPEARANCE_CONFIG_KEYS, K>
export type AppearanceConfigValues = ConfigValues<typeof APPEARANCE_CONFIG_KEYS>

export const APPEARANCE_CONFIG_KEY_NAMES = Object.keys(APPEARANCE_CONFIG_KEYS) as AppearanceConfigKey[]
export const APPEARANCE_CONFIG_DEFAULTS: Readonly<AppearanceConfigValues> = configDefaults(APPEARANCE_CONFIG_KEYS)

export function isAppearanceConfigKey(key: string): key is AppearanceConfigKey {
  return isConfigKey(APPEARANCE_CONFIG_KEYS, key)
}

export function appearanceConfigValueProblem(key: AppearanceConfigKey, value: unknown): string | null {
  return configValueProblem(APPEARANCE_CONFIG_KEYS[key], value)
}

export function describeAppearanceDeviations(fields: Record<string, unknown>) {
  return describeConfigDeviations(APPEARANCE_CONFIG_KEYS, fields, APPEARANCE_OWNED_ELSEWHERE)
}

export function mergeAppearanceConfig(fields: Record<string, unknown>): Record<string, unknown> {
  return mergeConfig(APPEARANCE_CONFIG_KEYS, APPEARANCE_CONFIG_DEFAULTS, fields)
}

/**
 * The CSS variables Obsidian themes and snippets expect, for a merged appearance config:
 * `--font-interface`, `--font-text`, `--font-monospace`, `--font-text-size` and the accent colour as
 * `--accent-h/s/l` (hue in degrees, saturation and lightness in percent). An empty value gives no
 * entry, so the theme's own value stays.
 */
export function appearanceCssVariables(config: Pick<AppearanceConfigValues, 'accentColor' | 'baseFontSize' | 'interfaceFontFamily' | 'textFontFamily' | 'monospaceFontFamily'>): Record<string, string> {
  const variables: Record<string, string> = {}
  if (config.interfaceFontFamily.trim() !== '') variables['--font-interface-override'] = config.interfaceFontFamily.trim()
  if (config.textFontFamily.trim() !== '') variables['--font-text-override'] = config.textFontFamily.trim()
  if (config.monospaceFontFamily.trim() !== '') variables['--font-monospace-override'] = config.monospaceFontFamily.trim()
  if (config.baseFontSize !== APPEARANCE_CONFIG_DEFAULTS.baseFontSize) variables['--font-text-size'] = `${config.baseFontSize}px`
  const hsl = hexToHsl(config.accentColor)
  if (hsl !== null) {
    variables['--accent-h'] = String(hsl.h)
    variables['--accent-s'] = `${hsl.s}%`
    variables['--accent-l'] = `${hsl.l}%`
  }
  return variables
}

/** The colour scheme a vault's `theme` stands for: Obsidian's dark base theme is `obsidian`, its light one `moonstone`. */
export function vaultColorScheme(theme: AppearanceConfigValues['theme']): 'light' | 'dark' | 'system' {
  return theme === 'obsidian' ? 'dark' : theme === 'moonstone' ? 'light' : 'system'
}

/**
 * The colour scheme to show: what the user chose for themselves, and only if they left theirs on
 * `system`, the vault's (appearance.json `theme`). A user's own choice is never overridden by the
 * vault; the vault only decides for those who have not made one.
 */
export function resolveColorScheme(
  userScheme: 'light' | 'dark' | 'system', vaultTheme: AppearanceConfigValues['theme'],
): 'light' | 'dark' | 'system' {
  return userScheme !== 'system' ? userScheme : vaultColorScheme(vaultTheme)
}

/** `#rrggbb` as hue (0-359), saturation and lightness (0-100), or null if it is not a colour. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const match = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex)
  if (match === null) return null
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => Number.parseInt(part as string, 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const delta = max - min
  if (delta === 0) return { h: 0, s: 0, l: Math.round(l * 100) }
  const s = delta / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / delta) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4
  return { h: Math.round(((h * 60) + 360) % 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}
