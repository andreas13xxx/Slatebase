/**
 * PropertyTypeStore — per-vault property type definitions.
 *
 * The type of each property lives where Obsidian keeps it: `<vault>/.obsidian/types.json`
 * (`{ "types": { "<key>": "<obsidian type>" } }`), so a vault opened in Obsidian and in Slatebase
 * agrees on it. Slatebase's `list` is Obsidian's `multitext`; every other type name is the same.
 * Keys whose type this app does not know (a future Obsidian type) are kept untouched.
 *
 * Obsidian has no place for the Slatebase-only `options` (allowed values, date format), so those
 * stay in `.slatebase/property-types.json`, matched to the key. Types that file held before they
 * moved are carried over once by `migratePropertyTypesToObsidianFile`.
 */

import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import type { IPropertyTypeService, PropertyType, PropertyTypeEntry, PropertyTypeRegistry } from './types.js'
import { RESERVED_PROPERTY_KEYS } from './types.js'
import { KeyedJsonFileStore } from '../shared/json-file-store.js'
import {
  ObsidianConfigFileInvalidError,
  readObsidianConfig,
  updateObsidianConfig,
} from '../shared/obsidian-config-file.js'
import type { IVaultRegistry } from '../vault/registry.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Options file path relative to vault root. */
const OPTIONS_PATH = path.join('.slatebase', 'property-types.json')

/** Maximum entries allowed per vault. */
const MAX_ENTRIES = 200

/** Obsidian's type name → Slatebase type. */
const FROM_OBSIDIAN: Record<string, PropertyType> = {
  text: 'text',
  multitext: 'list',
  number: 'number',
  checkbox: 'checkbox',
  date: 'date',
  datetime: 'datetime',
  tags: 'tags',
  aliases: 'aliases',
}

/** Slatebase type → Obsidian's type name. */
const TO_OBSIDIAN: Record<PropertyType, string> = {
  text: 'text',
  list: 'multitext',
  number: 'number',
  checkbox: 'checkbox',
  date: 'date',
  datetime: 'datetime',
  tags: 'tags',
  aliases: 'aliases',
}

// ─── Types ───────────────────────────────────────────────────────────────────

/** Resolves a vault ID to its storage path, or null if not found. */
export type VaultPathResolver = (vaultId: string) => string | null

/** Content of `.slatebase/property-types.json`. Only `options` count; `type` is a leftover hint. */
export interface PropertyTypeOptionsFile {
  entries: PropertyTypeEntry[]
  /** Set once the types of `entries` were moved into `.obsidian/types.json`. */
  typesInObsidianFile?: boolean | undefined
}

const EMPTY_OPTIONS_FILE: PropertyTypeOptionsFile = { entries: [] }

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Keys that would hit the prototype when used on a plain object. */
export function isUnsafePropertyKey(key: string): boolean {
  return key === '__proto__' || key === 'constructor' || key === 'prototype'
}

/** The `types` map of a parsed types.json; entries that are not strings are dropped. */
function readTypeMap(fields: Record<string, unknown> | null): Record<string, string> {
  const raw = fields?.types
  // No prototype: a key such as `toString` must not look present through `in`.
  const result: Record<string, string> = Object.create(null) as Record<string, string>
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return result
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && !isUnsafePropertyKey(key)) result[key] = value
  }
  return result
}

/**
 * Validates and sanitizes raw JSON into the options file.
 * Returns null (= fall back to default) for unrecognizable data.
 */
function sanitizeOptionsFile(raw: unknown): PropertyTypeOptionsFile | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.entries)) return null

  const validTypes = new Set<string>(Object.values(FROM_OBSIDIAN))

  const entries: PropertyTypeEntry[] = []
  for (const item of obj.entries) {
    if (typeof item !== 'object' || item === null) continue
    const entry = item as Record<string, unknown>
    if (typeof entry.key !== 'string' || entry.key.length === 0 || isUnsafePropertyKey(entry.key)) continue
    if (typeof entry.type !== 'string' || !validTypes.has(entry.type)) continue

    const result: PropertyTypeEntry = {
      key: entry.key,
      type: entry.type as PropertyType,
    }

    if (typeof entry.options === 'object' && entry.options !== null) {
      const opts = entry.options as Record<string, unknown>
      const options: PropertyTypeEntry['options'] = {}
      if (Array.isArray(opts.allowedValues)) {
        options.allowedValues = opts.allowedValues
          .filter((v): v is string => typeof v === 'string')
          .slice(0, 50)
      }
      if (typeof opts.dateFormat === 'string') {
        options.dateFormat = opts.dateFormat.slice(0, 50)
      }
      if (options.allowedValues !== undefined || options.dateFormat !== undefined) {
        result.options = options
      }
    }

    entries.push(result)
  }

  return { entries, typesInObsidianFile: obj.typesInObsidianFile === true }
}

/** The fixed type of a reserved key; own properties only, so `toString` is not "reserved". */
function reservedTypeOf(key: string): PropertyType | undefined {
  return Object.hasOwn(RESERVED_PROPERTY_KEYS, key) ? RESERVED_PROPERTY_KEYS[key] : undefined
}

/** Whether Obsidian's type name is one this app can represent. */
function isKnownObsidianType(type: string | undefined): boolean {
  return type !== undefined && Object.hasOwn(FROM_OBSIDIAN, type)
}

// ─── Implementation ──────────────────────────────────────────────────────────

export class PropertyTypeStore implements IPropertyTypeService {
  private readonly optionsStore: KeyedJsonFileStore<PropertyTypeOptionsFile>

  constructor(
    private readonly resolveVaultPath: VaultPathResolver,
    private readonly logger: ILogger,
  ) {
    this.optionsStore = new KeyedJsonFileStore<PropertyTypeOptionsFile>(
      (vaultId) => path.join(this.requireVaultPath(vaultId), OPTIONS_PATH),
      EMPTY_OPTIONS_FILE,
      sanitizeOptionsFile,
      (error) => this.logger.error('Failed to load property type options', { error: String(error) }),
    )
  }

  async getRegistry(vaultId: string): Promise<PropertyTypeRegistry> {
    const vaultPath = this.requireVaultPath(vaultId)
    const types = await this.readTypes(vaultPath)
    const options = await this.optionsStore.read(vaultId)
    return { entries: mergeEntries(types, options.entries) }
  }

  async saveRegistry(vaultId: string, registry: PropertyTypeRegistry): Promise<PropertyTypeRegistry> {
    const vaultPath = this.requireVaultPath(vaultId)
    const entries = this.enforceReservedKeys(registry.entries)
      .filter((e) => !isUnsafePropertyKey(e.key))
      .slice(0, MAX_ENTRIES)
    const keep = new Set(entries.map((e) => e.key))

    await updateObsidianConfig(vaultPath, 'types.json', (current) => {
      const types = readTypeMap(current)
      // A key the registry no longer lists goes away, unless its type is one this app cannot represent.
      for (const key of Object.keys(types)) {
        if (isKnownObsidianType(types[key]) && !keep.has(key)) delete types[key]
      }
      for (const entry of entries) types[entry.key] = TO_OBSIDIAN[entry.type]
      return { ...current, types: { ...types } }
    })
    await this.optionsStore.write(vaultId, {
      entries: entries.filter((e) => e.options !== undefined),
      typesInObsidianFile: true,
    })
    return this.getRegistry(vaultId)
  }

  async upsertEntry(vaultId: string, entry: PropertyTypeEntry): Promise<PropertyTypeRegistry> {
    const vaultPath = this.requireVaultPath(vaultId)
    if (isUnsafePropertyKey(entry.key)) throw new Error(`Invalid property key "${entry.key}"`)
    const reservedType = reservedTypeOf(entry.key)
    if (reservedType !== undefined && entry.type !== reservedType) {
      throw new PropertyTypeReservedKeyError(entry.key, reservedType)
    }

    await updateObsidianConfig(vaultPath, 'types.json', (current) => {
      const types = readTypeMap(current)
      const known = Object.keys(types).filter((key) => isKnownObsidianType(types[key]))
      if (!(entry.key in types) && known.length >= MAX_ENTRIES) {
        throw new PropertyTypeMaxEntriesError(MAX_ENTRIES)
      }
      types[entry.key] = TO_OBSIDIAN[entry.type]
      return { ...current, types }
    })
    await this.optionsStore.mutate(vaultId, (current) => {
      const entries = current.entries.filter((e) => e.key !== entry.key)
      if (entry.options !== undefined) entries.push(entry)
      return { entries, typesInObsidianFile: true }
    })
    return this.getRegistry(vaultId)
  }

  /**
   * Moves the types of the old registry into the vault's `types.json` (a type Obsidian's file
   * already has wins), then marks the options file. No-op once marked.
   * @returns Whether anything was moved.
   */
  async migrateLegacyTypes(vaultId: string): Promise<boolean> {
    const vaultPath = this.requireVaultPath(vaultId)
    const legacy = await this.optionsStore.read(vaultId)
    if (legacy.typesInObsidianFile === true) return false

    if (legacy.entries.length > 0) {
      await updateObsidianConfig(vaultPath, 'types.json', (current) => {
        const types = readTypeMap(current)
        let changed = false
        for (const entry of legacy.entries) {
          if (entry.key in types) continue
          types[entry.key] = TO_OBSIDIAN[entry.type]
          changed = true
        }
        return changed ? { ...current, types } : null
      })
    }
    await this.optionsStore.mutate(vaultId, (current) => ({ ...current, typesInObsidianFile: true }))
    return legacy.entries.length > 0
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private requireVaultPath(vaultId: string): string {
    const vaultPath = this.resolveVaultPath(vaultId)
    if (!vaultPath) {
      throw new Error(`Vault not found: ${vaultId}`)
    }
    return vaultPath
  }

  /**
   * The vault's `types.json` map. A file that is not a JSON object reads as empty (it may be
   * mid-sync); writing refuses to replace it.
   */
  private async readTypes(vaultPath: string): Promise<Record<string, string>> {
    try {
      return readTypeMap(await readObsidianConfig(vaultPath, 'types.json'))
    } catch (error: unknown) {
      if (error instanceof ObsidianConfigFileInvalidError) {
        this.logger.warn('.obsidian/types.json is not a valid JSON object; property types unavailable')
        return {}
      }
      throw error
    }
  }

  /**
   * Enforces reserved key type assignments.
   * If a reserved key appears with a different type, silently correct it.
   */
  private enforceReservedKeys(entries: PropertyTypeEntry[]): PropertyTypeEntry[] {
    return entries.map((entry) => {
      const reservedType = reservedTypeOf(entry.key)
      if (reservedType !== undefined && entry.type !== reservedType) {
        return { ...entry, type: reservedType }
      }
      return entry
    })
  }
}

/** Types from types.json (known ones only), each with the options kept for its key. */
function mergeEntries(types: Record<string, string>, optionEntries: PropertyTypeEntry[]): PropertyTypeEntry[] {
  const optionsByKey = new Map(optionEntries.map((e) => [e.key, e.options]))
  const entries: PropertyTypeEntry[] = []
  for (const [key, obsidianType] of Object.entries(types)) {
    if (!isKnownObsidianType(obsidianType)) continue
    const type = FROM_OBSIDIAN[obsidianType]
    if (type === undefined) continue
    const options = optionsByKey.get(key)
    entries.push(options !== undefined ? { key, type, options } : { key, type })
  }
  return entries
}

/**
 * Startup step: moves every vault's old registry types into `.obsidian/types.json`.
 * Never throws; a failing vault is logged and retried on the next start.
 */
export async function migratePropertyTypesToObsidianFile(deps: {
  vaultRegistry: Pick<IVaultRegistry, 'load'>
  store: PropertyTypeStore
  logger: ILogger
}): Promise<{ migrated: number }> {
  const { vaultRegistry, store, logger } = deps
  let migrated = 0
  for (const vault of await vaultRegistry.load()) {
    try {
      if (await store.migrateLegacyTypes(vault.id)) {
        migrated++
        logger.info('Moved property types into .obsidian/types.json', { vaultId: vault.id })
      }
    } catch (error: unknown) {
      if (error instanceof ObsidianConfigFileInvalidError) {
        logger.warn('Property type migration postponed: .obsidian/types.json is not valid JSON', { vaultId: vault.id })
      } else {
        logger.error('Property type migration failed, will retry on next start', {
          vaultId: vault.id, error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
  return { migrated }
}

// ─── Error Classes ───────────────────────────────────────────────────────────

/** Thrown when attempting to change a reserved key's type. */
export class PropertyTypeReservedKeyError extends Error {
  constructor(key: string, requiredType: string) {
    super(`Property key "${key}" is reserved and must have type "${requiredType}"`)
    this.name = 'PropertyTypeReservedKeyError'
  }
}

/** Thrown when the maximum number of entries is exceeded. */
export class PropertyTypeMaxEntriesError extends Error {
  constructor(max: number) {
    super(`Maximum number of property type entries (${max}) exceeded`)
    this.name = 'PropertyTypeMaxEntriesError'
  }
}
