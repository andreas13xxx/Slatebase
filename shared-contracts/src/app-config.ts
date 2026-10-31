// `<vault>/.obsidian/app.json` — one table of the keys Slatebase knows, shared by backend and
// frontend so schema, defaults and validation cannot drift apart.
//
// Obsidian does not document the file. Key names and the defaults of `alwaysUpdateLinks`,
// `readableLineLength` and `showLineNumber` come from real Obsidian files (Obsidian writes only
// values that differ from its default, so a key present in a file proves the opposite default).
// Everything marked `verified: false` is an assumption; `describeAppConfigDeviations` reports
// real files that contradict it. See docs/app-json.md.

export type AppConfigKeySpec =
  | { kind: 'boolean'; default: boolean }
  | { kind: 'number'; default: number; min: number; max: number }
  | { kind: 'string'; default: string; maxLength: number }
  | { kind: 'enum'; values: readonly string[]; default: string }
  | { kind: 'string[]'; default: readonly string[]; maxItems: number; maxLength: number }

export type AppConfigKeyMeta = AppConfigKeySpec & {
  /** `passthrough`: kept and readable by plugins, but without a function in Slatebase. */
  status: 'supported' | 'passthrough'
  /** True if the key name and default were seen in a real Obsidian file. */
  verified: boolean
}

const MAX_PATH_LENGTH = 1024

function bool(
  def: boolean,
  verified = false,
  status: 'supported' | 'passthrough' = 'supported',
): { kind: 'boolean'; default: boolean; status: 'supported' | 'passthrough'; verified: boolean } {
  return { kind: 'boolean', default: def, status, verified }
}

export const APP_CONFIG_KEYS = {
  // Files and links
  newFileLocation: { kind: 'enum', values: ['root', 'current', 'folder'], default: 'root', status: 'supported', verified: false },
  newFileFolderPath: { kind: 'string', default: '', maxLength: MAX_PATH_LENGTH, status: 'supported', verified: false },
  attachmentFolderPath: { kind: 'string', default: './', maxLength: MAX_PATH_LENGTH, status: 'supported', verified: true },
  useMarkdownLinks: bool(false),
  newLinkFormat: { kind: 'enum', values: ['shortest', 'relative', 'absolute'], default: 'shortest', status: 'supported', verified: false },
  alwaysUpdateLinks: bool(false, true),
  autoConvertHtml: bool(false),
  showUnsupportedFiles: bool(false, true),
  trashOption: { kind: 'enum', values: ['system', 'local', 'none'], default: 'system', status: 'supported', verified: false },
  promptDelete: bool(true, true),
  userIgnoreFilters: { kind: 'string[]', default: [], maxItems: 500, maxLength: MAX_PATH_LENGTH, status: 'supported', verified: true },
  // Editor
  readableLineLength: bool(true, true),
  defaultViewMode: { kind: 'enum', values: ['source', 'preview'], default: 'source', status: 'supported', verified: false },
  livePreview: bool(true),
  strictLineBreaks: bool(false),
  showFrontmatter: bool(false),
  propertiesInDocument: { kind: 'enum', values: ['visible', 'hidden', 'source'], default: 'visible', status: 'supported', verified: false },
  foldHeading: bool(true),
  foldIndent: bool(true),
  spellcheck: bool(true),
  spellcheckLanguages: { kind: 'string[]', default: [], maxItems: 50, maxLength: 32, status: 'supported', verified: false },
  showLineNumber: bool(false, true),
  tabSize: { kind: 'number', default: 4, min: 1, max: 16, status: 'supported', verified: false },
  useTab: bool(true),
  autoPairBrackets: bool(true),
  autoPairMarkdown: bool(true),
  smartIndentList: bool(true),
  showIndentGuide: bool(true),
  showInlineTitle: bool(true),
  rightToLeft: bool(false),
  // Kept for plugins and for Obsidian; no function in Slatebase
  mobilePullAction: { kind: 'string', default: '', maxLength: 256, status: 'passthrough', verified: true },
  vimMode: bool(false, false, 'passthrough'),
  nativeMenus: bool(false, false, 'passthrough'),
} as const satisfies Record<string, AppConfigKeyMeta>

export type AppConfigKey = keyof typeof APP_CONFIG_KEYS

type ValueOf<M extends AppConfigKeyMeta> = M extends { kind: 'boolean' }
  ? boolean
  : M extends { kind: 'number' }
    ? number
    : M extends { kind: 'string[]' }
      ? string[]
      : M extends { kind: 'enum'; values: infer V extends readonly string[] }
        ? V[number]
        : string

/** The TypeScript type of one key's value. */
export type AppConfigValue<K extends AppConfigKey> = ValueOf<(typeof APP_CONFIG_KEYS)[K]>

/** All keys with their value types. */
export type AppConfigValues = { [K in AppConfigKey]: AppConfigValue<K> }

export const APP_CONFIG_KEY_NAMES = Object.keys(APP_CONFIG_KEYS) as AppConfigKey[]

/** Slatebase's default per key — Obsidian's where known (see `verified`). */
export const APP_CONFIG_DEFAULTS: Readonly<AppConfigValues> = Object.freeze(
  // The one cast: each default is checked against its own spec by app-config.test.ts.
  Object.fromEntries(
    APP_CONFIG_KEY_NAMES.map((key) => {
      const value = APP_CONFIG_KEYS[key].default
      return [key, Array.isArray(value) ? Object.freeze([...value]) : value]
    }),
  ) as AppConfigValues,
)

/** Defaults Slatebase used before they were aligned with Obsidian. Used to keep existing vaults unchanged. */
export const LEGACY_APP_CONFIG_DEFAULTS: Partial<AppConfigValues> = {
  alwaysUpdateLinks: true,
}

export function isAppConfigKey(key: string): key is AppConfigKey {
  return Object.prototype.hasOwnProperty.call(APP_CONFIG_KEYS, key)
}

/** Why `value` does not fit `key`, or null if it does. */
export function appConfigValueProblem(key: AppConfigKey, value: unknown): string | null {
  const spec: AppConfigKeyMeta = APP_CONFIG_KEYS[key]
  switch (spec.kind) {
    case 'boolean':
      return typeof value === 'boolean' ? null : `expected a boolean, found ${describe(value)}`
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return `expected a number, found ${describe(value)}`
      return value >= spec.min && value <= spec.max ? null : `expected a number from ${spec.min} to ${spec.max}, found ${value}`
    case 'string':
      if (typeof value !== 'string') return `expected a string, found ${describe(value)}`
      return value.length <= spec.maxLength ? null : `string longer than ${spec.maxLength} characters`
    case 'enum':
      return typeof value === 'string' && spec.values.includes(value)
        ? null
        : `unexpected enum value ${describe(value)} (expected ${spec.values.join('|')})`
    case 'string[]':
      if (!Array.isArray(value)) return `expected a list of strings, found ${describe(value)}`
      if (value.length > spec.maxItems) return `list longer than ${spec.maxItems} entries`
      return value.every((entry) => typeof entry === 'string' && entry.length <= spec.maxLength)
        ? null
        : 'list contains an entry that is not a string or is too long'
  }
}

function describe(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value.length > 80 ? `${value.slice(0, 80)}…` : value)
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'a list'
  return typeof value === 'object' ? 'an object' : String(value)
}

export interface AppConfigDeviation {
  /** JSON key (top level). */
  key: string
  reason: string
}

/** Everything in `fields` that contradicts the table: unknown keys, wrong types, values outside an enum. */
export function describeAppConfigDeviations(fields: Record<string, unknown>): AppConfigDeviation[] {
  const deviations: AppConfigDeviation[] = []
  for (const [key, value] of Object.entries(fields)) {
    if (!isAppConfigKey(key)) {
      deviations.push({ key, reason: `unknown key (value ${describe(value)})` })
      continue
    }
    const problem = appConfigValueProblem(key, value)
    if (problem !== null) deviations.push({ key, reason: problem })
  }
  return deviations
}

/** The file's value if it fits the table, else the default; keys the table does not know pass through. */
export function mergeAppConfig(fields: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...fields }
  for (const key of APP_CONFIG_KEY_NAMES) {
    merged[key] = key in fields && appConfigValueProblem(key, fields[key]) === null ? fields[key] : APP_CONFIG_DEFAULTS[key]
  }
  return merged
}
