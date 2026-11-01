// A table of the keys of one Obsidian JSON config file (`app.json`, `appearance.json`, `graph.json`,
// ...): type, allowed values and default per key. Shared by backend and frontend so schema, defaults
// and validation of a file cannot drift apart. The per-file tables live next to this module.
//
// Obsidian documents none of these files. A key marked `verified: false` is an assumption; the
// functions here report real files that contradict it (`describeConfigDeviations`).

export type ConfigKeySpec =
  | { kind: 'boolean'; default: boolean }
  | { kind: 'number'; default: number; min: number; max: number }
  | { kind: 'string'; default: string; maxLength: number; pattern?: RegExp; patternHint?: string }
  | { kind: 'enum'; values: readonly string[]; default: string }
  | { kind: 'string[]'; default: readonly string[]; maxItems: number; maxLength: number }
  /** Any JSON value (an object, a list of objects, ...), kept as the file has it; only its size is limited. */
  | { kind: 'json'; default: unknown; maxBytes: number }

export type ConfigKeyMeta = ConfigKeySpec & {
  /** `passthrough`: kept and readable by plugins, but without a function in Slatebase. */
  status: 'supported' | 'passthrough'
  /** True if the key name and default were seen in a real Obsidian file. */
  verified: boolean
}

export type ConfigTable = Readonly<Record<string, ConfigKeyMeta>>

type ValueOf<M extends ConfigKeyMeta> = M extends { kind: 'boolean' }
  ? boolean
  : M extends { kind: 'number' }
    ? number
    : M extends { kind: 'string[]' }
      ? string[]
      : M extends { kind: 'enum'; values: infer V extends readonly string[] }
        ? V[number]
        : M extends { kind: 'json' }
          ? unknown
          : string

/** The TypeScript type of one key's value in a table. */
export type ConfigValue<T extends ConfigTable, K extends keyof T> = ValueOf<T[K]>

/** All keys of a table with their value types. */
export type ConfigValues<T extends ConfigTable> = { -readonly [K in keyof T]: ConfigValue<T, K> }

// Builders keep the literal types of a table (`as const` alone cannot, through a function).
export const cfg = {
  bool: (def: boolean, verified = false, status: 'supported' | 'passthrough' = 'supported') =>
    ({ kind: 'boolean', default: def, status, verified }) as const,
  number: (def: number, min: number, max: number, verified = false, status: 'supported' | 'passthrough' = 'supported') =>
    ({ kind: 'number', default: def, min, max, status, verified }) as const,
  string: (
    def: string, maxLength: number, verified = false, status: 'supported' | 'passthrough' = 'supported',
    extra: { pattern?: RegExp; patternHint?: string } = {},
  ) => ({ kind: 'string', default: def, maxLength, status, verified, ...extra }) as const,
  enum: <const V extends readonly string[]>(values: V, def: V[number], verified = false, status: 'supported' | 'passthrough' = 'supported') =>
    ({ kind: 'enum', values, default: def, status, verified }) as const,
  strings: (maxItems: number, maxLength: number, verified = false, status: 'supported' | 'passthrough' = 'supported') =>
    ({ kind: 'string[]', default: [] as readonly string[], maxItems, maxLength, status, verified }) as const,
  json: (def: unknown, maxBytes: number, verified = false, status: 'supported' | 'passthrough' = 'supported') =>
    ({ kind: 'json', default: def, maxBytes, status, verified }) as const,
}

/** A value for a log or error message: strings quoted, everything cut to 80 characters. */
export function describeValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value.length > 80 ? `${value.slice(0, 80)}…` : value)
  if (value === undefined) return 'undefined'
  if (typeof value !== 'object' || value === null) return String(value)
  const json = JSON.stringify(value)
  return json.length > 80 ? `${json.slice(0, 80)}…` : json
}

/** Why `value` does not fit `spec`, or null if it does. */
export function configValueProblem(spec: ConfigKeySpec, value: unknown): string | null {
  switch (spec.kind) {
    case 'boolean':
      return typeof value === 'boolean' ? null : `expected a boolean, found ${describeValue(value)}`
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return `expected a number, found ${describeValue(value)}`
      return value >= spec.min && value <= spec.max ? null : `expected a number from ${spec.min} to ${spec.max}, found ${value}`
    case 'string':
      if (typeof value !== 'string') return `expected a string, found ${describeValue(value)}`
      if (value.length > spec.maxLength) return `string longer than ${spec.maxLength} characters`
      return spec.pattern === undefined || spec.pattern.test(value) ? null : (spec.patternHint ?? `value ${describeValue(value)} not allowed`)
    case 'enum':
      return typeof value === 'string' && spec.values.includes(value)
        ? null
        : `unexpected enum value ${describeValue(value)} (expected ${spec.values.join('|')})`
    case 'string[]':
      if (!Array.isArray(value)) return `expected a list of strings, found ${describeValue(value)}`
      if (value.length > spec.maxItems) return `list longer than ${spec.maxItems} entries`
      return value.every((entry) => typeof entry === 'string' && entry.length <= spec.maxLength)
        ? null
        : 'list contains an entry that is not a string or is too long'
    case 'json': {
      if (value === undefined) return 'expected a value'
      const size = JSON.stringify(value)?.length ?? 0
      return size <= spec.maxBytes ? null : `value larger than ${spec.maxBytes} bytes`
    }
  }
}

export function isConfigKey<T extends ConfigTable>(table: T, key: string): key is Extract<keyof T, string> {
  return Object.prototype.hasOwnProperty.call(table, key)
}

export interface ConfigDeviation {
  /** JSON key (top level). */
  key: string
  reason: string
}

/**
 * Everything in `fields` that contradicts the table: unknown keys, wrong types, values outside an
 * enum. `ownedElsewhere` names keys of the file that another part of Slatebase reads and writes
 * (e.g. `cssTheme` in appearance.json); they are known, not deviations.
 */
export function describeConfigDeviations(
  table: ConfigTable, fields: Record<string, unknown>, ownedElsewhere: readonly string[] = [],
): ConfigDeviation[] {
  const deviations: ConfigDeviation[] = []
  for (const [key, value] of Object.entries(fields)) {
    if (ownedElsewhere.includes(key)) continue
    if (!isConfigKey(table, key)) {
      deviations.push({ key, reason: `unknown key (value ${describeValue(value)})` })
      continue
    }
    const problem = configValueProblem(table[key] as ConfigKeySpec, value)
    if (problem !== null) deviations.push({ key, reason: problem })
  }
  return deviations
}

/** The default of every key, as a frozen copy (lists and objects cannot be changed through it). */
export function configDefaults<T extends ConfigTable>(table: T): Readonly<ConfigValues<T>> {
  const entries = Object.entries(table).map(([key, meta]) => {
    const value = meta.default
    return [key, Array.isArray(value) ? Object.freeze([...value]) : value] as const
  })
  // The one cast: each default is checked against its own spec by the tests of every table.
  return Object.freeze(Object.fromEntries(entries)) as Readonly<ConfigValues<T>>
}

/** The file's value if it fits the table, else the default; keys the table does not know pass through. */
export function mergeConfig(table: ConfigTable, defaults: Readonly<Record<string, unknown>>, fields: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...fields }
  for (const key of Object.keys(table)) {
    merged[key] = Object.prototype.hasOwnProperty.call(fields, key) && configValueProblem(table[key] as ConfigKeySpec, fields[key]) === null
      ? fields[key]
      : defaults[key]
  }
  return merged
}
