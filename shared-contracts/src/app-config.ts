// `<vault>/.obsidian/app.json` — one table of the keys Slatebase knows, shared by backend and
// frontend so schema, defaults and validation cannot drift apart.
//
// Obsidian does not document the file. Key names and the defaults of `alwaysUpdateLinks`,
// `readableLineLength` and `showLineNumber` come from real Obsidian files (Obsidian writes only
// values that differ from its default, so a key present in a file proves the opposite default).
// Everything marked `verified: false` is an assumption; `describeAppConfigDeviations` reports
// real files that contradict it. See docs/app-json.md.

import {
  cfg,
  configDefaults,
  configValueProblem,
  describeConfigDeviations,
  isConfigKey,
  mergeConfig,
  type ConfigDeviation,
  type ConfigKeyMeta,
  type ConfigKeySpec,
  type ConfigValue,
  type ConfigValues,
} from './config-table.js'

export { describeValue } from './config-table.js'

export type AppConfigKeySpec = ConfigKeySpec
export type AppConfigKeyMeta = ConfigKeyMeta
export type AppConfigDeviation = ConfigDeviation

const MAX_PATH_LENGTH = 1024

export const APP_CONFIG_KEYS = {
  // Files and links
  newFileLocation: cfg.enum(['root', 'current', 'folder'], 'root'),
  newFileFolderPath: cfg.string('', MAX_PATH_LENGTH),
  attachmentFolderPath: cfg.string('./', MAX_PATH_LENGTH, true),
  useMarkdownLinks: cfg.bool(false),
  newLinkFormat: cfg.enum(['shortest', 'relative', 'absolute'], 'shortest'),
  alwaysUpdateLinks: cfg.bool(false, true),
  autoConvertHtml: cfg.bool(false),
  showUnsupportedFiles: cfg.bool(false, true),
  trashOption: cfg.enum(['system', 'local', 'none'], 'system'),
  promptDelete: cfg.bool(true, true),
  userIgnoreFilters: cfg.strings(500, MAX_PATH_LENGTH, true),
  // Editor
  readableLineLength: cfg.bool(true, true),
  defaultViewMode: cfg.enum(['source', 'preview'], 'source'),
  livePreview: cfg.bool(true),
  strictLineBreaks: cfg.bool(false),
  showFrontmatter: cfg.bool(false),
  propertiesInDocument: cfg.enum(['visible', 'hidden', 'source'], 'visible'),
  foldHeading: cfg.bool(true),
  foldIndent: cfg.bool(true),
  spellcheck: cfg.bool(true),
  spellcheckLanguages: cfg.strings(50, 32),
  showLineNumber: cfg.bool(false, true),
  tabSize: cfg.number(4, 1, 16),
  useTab: cfg.bool(true),
  autoPairBrackets: cfg.bool(true),
  autoPairMarkdown: cfg.bool(true),
  smartIndentList: cfg.bool(true),
  showIndentGuide: cfg.bool(true),
  showInlineTitle: cfg.bool(true),
  rightToLeft: cfg.bool(false),
  // Kept for plugins and for Obsidian; no function in Slatebase
  mobilePullAction: cfg.string('', 256, true, 'passthrough'),
  vimMode: cfg.bool(false, false, 'passthrough'),
  nativeMenus: cfg.bool(false, false, 'passthrough'),
} as const satisfies Record<string, ConfigKeyMeta>

export type AppConfigKey = keyof typeof APP_CONFIG_KEYS

/** The TypeScript type of one key's value. */
export type AppConfigValue<K extends AppConfigKey> = ConfigValue<typeof APP_CONFIG_KEYS, K>

/** All keys with their value types. */
export type AppConfigValues = ConfigValues<typeof APP_CONFIG_KEYS>

export const APP_CONFIG_KEY_NAMES = Object.keys(APP_CONFIG_KEYS) as AppConfigKey[]

/** Slatebase's default per key — Obsidian's where known (see `verified`). */
export const APP_CONFIG_DEFAULTS: Readonly<AppConfigValues> = configDefaults(APP_CONFIG_KEYS)

/** Defaults Slatebase used before they were aligned with Obsidian. Used to keep existing vaults unchanged. */
export const LEGACY_APP_CONFIG_DEFAULTS: Partial<AppConfigValues> = {
  alwaysUpdateLinks: true,
}

export function isAppConfigKey(key: string): key is AppConfigKey {
  return isConfigKey(APP_CONFIG_KEYS, key)
}

/** Why `value` does not fit `key`, or null if it does. */
export function appConfigValueProblem(key: AppConfigKey, value: unknown): string | null {
  return configValueProblem(APP_CONFIG_KEYS[key], value)
}

/** Everything in `fields` that contradicts the table: unknown keys, wrong types, values outside an enum. */
export function describeAppConfigDeviations(fields: Record<string, unknown>): AppConfigDeviation[] {
  return describeConfigDeviations(APP_CONFIG_KEYS, fields)
}

/** The file's value if it fits the table, else the default; keys the table does not know pass through. */
export function mergeAppConfig(fields: Record<string, unknown>): Record<string, unknown> {
  return mergeConfig(APP_CONFIG_KEYS, APP_CONFIG_DEFAULTS, fields)
}
