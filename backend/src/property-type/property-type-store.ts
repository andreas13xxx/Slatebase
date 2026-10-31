/**
 * PropertyTypeStore — per-vault property type definitions.
 *
 * The types live where Obsidian keeps them, in `<vault>/.obsidian/types.json` (key → type name, see
 * obsidian-types.ts), so both programs see the same types. What Obsidian has no place for — the
 * allowed values and date format hint of an entry — stays in `.slatebase/property-types.json`, keyed
 * by property name and attached to the entry when the registry is read. Entries are kept in the
 * order of types.json; names of types Slatebase does not know stay in the file and are left out of
 * the registry.
 *
 * Both files are written atomically (temp → rename); types.json under the shared per-file lock.
 */

import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import type { IPropertyTypeService, PropertyTypeEntry, PropertyTypeRegistry } from './types.js'
import { DEFAULT_PROPERTY_TYPE_REGISTRY, MAX_PROPERTY_TYPE_ENTRIES, RESERVED_PROPERTY_KEYS } from './types.js'
import { KeyedJsonFileStore } from '../shared/json-file-store.js'
import { ObsidianConfigFileInvalidError, readObsidianConfig, updateObsidianConfig } from '../shared/obsidian-config-file.js'
import { noopDeviationReporter, type IDeviationReporter } from '../obsidian-config/deviation-reporter.js'
import { fromObsidianType, toObsidianType } from './obsidian-types.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Options file path relative to vault root (Slatebase's part of the registry). */
const OPTIONS_PATH = path.join('.slatebase', 'property-types.json')

// ─── Types ───────────────────────────────────────────────────────────────────

/** Resolves a vault ID to its storage path, or null if not found. */
export type VaultPathResolver = (vaultId: string) => string | null

// ─── Sanitizer ───────────────────────────────────────────────────────────────

/**
 * Validates and sanitizes raw JSON of `.slatebase/property-types.json` into a PropertyTypeRegistry.
 * Returns null (= fall back to default) for unrecognizable data.
 */
function sanitizeRegistry(raw: unknown): PropertyTypeRegistry | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.entries)) return null

  const validTypes = new Set([
    'text', 'number', 'date', 'datetime', 'checkbox', 'list', 'tags', 'aliases',
  ])

  const entries: PropertyTypeEntry[] = []
  for (const item of obj.entries) {
    if (typeof item !== 'object' || item === null) continue
    const entry = item as Record<string, unknown>
    if (typeof entry.key !== 'string' || entry.key.length === 0) continue
    if (typeof entry.type !== 'string' || !validTypes.has(entry.type)) continue

    const result: PropertyTypeEntry = {
      key: entry.key,
      type: entry.type as PropertyTypeEntry['type'],
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

  return { entries: entries.slice(0, MAX_PROPERTY_TYPE_ENTRIES) }
}

// ─── Implementation ──────────────────────────────────────────────────────────

export class PropertyTypeStore implements IPropertyTypeService {
  /** Slatebase's own part: the entries that have options (the type is repeated there for validation only). */
  private readonly optionsStore: KeyedJsonFileStore<PropertyTypeRegistry>

  constructor(
    private readonly resolveVaultPath: VaultPathResolver,
    private readonly logger: ILogger,
    private readonly reporter: IDeviationReporter = noopDeviationReporter,
  ) {
    this.optionsStore = new KeyedJsonFileStore<PropertyTypeRegistry>(
      (vaultId) => this.getOptionsPath(vaultId),
      DEFAULT_PROPERTY_TYPE_REGISTRY,
      sanitizeRegistry,
      (error) => this.logger.error('Failed to load property type options', { error: String(error) }),
    )
  }

  async getRegistry(vaultId: string): Promise<PropertyTypeRegistry> {
    const vaultPath = this.getVaultPath(vaultId)
    const types = await this.readTypes(vaultPath, vaultId)
    const { entries: withOptions } = await this.optionsStore.read(vaultId)
    const optionsByKey = new Map(withOptions.map((entry) => [entry.key, entry.options]))

    const entries: PropertyTypeEntry[] = []
    for (const [key, name] of Object.entries(types)) {
      // tags and aliases have a fixed type; whatever the file says for them is not a choice.
      const type = RESERVED_PROPERTY_KEYS[key] ?? fromObsidianType(key, name)
      if (type === null) {
        this.reporter.report(vaultId, 'types.json', [{ path: `types.${key}`, reason: `unknown property type ${JSON.stringify(name)?.slice(0, 80)}` }])
        continue
      }
      const options = optionsByKey.get(key)
      entries.push({ key, type, ...(options !== undefined ? { options } : {}) })
    }
    return { entries: entries.slice(0, MAX_PROPERTY_TYPE_ENTRIES) }
  }

  async saveRegistry(vaultId: string, registry: PropertyTypeRegistry): Promise<PropertyTypeRegistry> {
    const vaultPath = this.getVaultPath(vaultId)
    // Enforce reserved key constraints
    const capped = this.enforceReservedKeys(registry.entries).slice(0, MAX_PROPERTY_TYPE_ENTRIES)

    const wanted = new Map(capped.filter((entry) => entry.key !== '__proto__').map((entry) => [entry.key, toObsidianType(entry.type)]))
    await updateObsidianConfig(vaultPath, 'types.json', (current) => {
      const previous = typesOf(current)
      // The file keeps its order. Types Slatebase does not know stay where they are; the others are
      // replaced by the registry or, if it no longer has them, removed. New keys follow.
      // No prototype, so a key called __proto__ in the file stays an ordinary key.
      const next = Object.create(null) as Record<string, unknown>
      for (const [key, name] of Object.entries(previous)) {
        if (RESERVED_PROPERTY_KEYS[key] === undefined && fromObsidianType(key, name) === null) next[key] = name
        else if (wanted.has(key)) next[key] = wanted.get(key)
      }
      for (const [key, name] of wanted) if (!Object.hasOwn(next, key)) next[key] = name
      current['types'] = next
      return current
    })
    await this.optionsStore.write(vaultId, { entries: capped.filter((entry) => entry.options !== undefined) })
    return { entries: capped }
  }

  async upsertEntry(vaultId: string, entry: PropertyTypeEntry): Promise<PropertyTypeRegistry> {
    const vaultPath = this.getVaultPath(vaultId)
    // Check reserved key constraint
    const reservedType = RESERVED_PROPERTY_KEYS[entry.key]
    if (reservedType !== undefined && entry.type !== reservedType) {
      throw new PropertyTypeReservedKeyError(entry.key, reservedType)
    }

    if (entry.key === '__proto__') throw new Error('"__proto__" is not a usable property name')
    await updateObsidianConfig(vaultPath, 'types.json', (current) => {
      const types = typesOf(current)
      if (!Object.hasOwn(types, entry.key) && Object.keys(types).length >= MAX_PROPERTY_TYPE_ENTRIES) {
        throw new PropertyTypeMaxEntriesError(MAX_PROPERTY_TYPE_ENTRIES)
      }
      types[entry.key] = toObsidianType(entry.type)
      current['types'] = types
      return current
    })
    await this.optionsStore.mutate(vaultId, (stored) => ({
      entries: [
        ...stored.entries.filter((other) => other.key !== entry.key),
        ...(entry.options !== undefined ? [entry] : []),
      ],
    }))
    return this.getRegistry(vaultId)
  }

  /**
   * Copies the entries of the old `.slatebase/property-types.json` that `types.json` lacks into
   * `types.json`, and leaves only the entries with options in the old file. A key `types.json`
   * already has keeps its type. Returns the number of entries added. Used by the startup migration.
   */
  async adoptLegacyEntries(vaultId: string): Promise<number> {
    const vaultPath = this.getVaultPath(vaultId)
    const { entries: legacy } = await this.optionsStore.read(vaultId)
    if (legacy.length === 0) return 0

    let added = 0
    await updateObsidianConfig(vaultPath, 'types.json', (current) => {
      const types = typesOf(current)
      for (const entry of legacy) {
        if (entry.key === '__proto__' || Object.hasOwn(types, entry.key)) continue
        if (Object.keys(types).length >= MAX_PROPERTY_TYPE_ENTRIES) break
        types[entry.key] = toObsidianType(this.enforceReservedKeys([entry])[0]?.type ?? entry.type)
        added++
      }
      if (added === 0) return null
      current['types'] = types
      return current
    })
    await this.optionsStore.write(vaultId, { entries: legacy.filter((entry) => entry.options !== undefined) })
    return added
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  /** The `types` map of types.json; empty if the file is absent or unusable (reported, not overwritten). */
  private async readTypes(vaultPath: string, vaultId: string): Promise<Record<string, unknown>> {
    try {
      const file = await readObsidianConfig(vaultPath, 'types.json')
      if (file === null) return {}
      const types = file['types']
      if (types === undefined) return {}
      if (!isRecord(types)) {
        this.reporter.report(vaultId, 'types.json', [{ path: 'types', reason: 'expected an object of property names to types' }])
        return {}
      }
      return types
    } catch (error) {
      if (error instanceof ObsidianConfigFileInvalidError) {
        this.reporter.report(vaultId, 'types.json', [{ path: '', reason: 'not a JSON object' }])
        return {}
      }
      throw error
    }
  }

  private getVaultPath(vaultId: string): string {
    const vaultPath = this.resolveVaultPath(vaultId)
    if (!vaultPath) {
      throw new Error(`Vault not found: ${vaultId}`)
    }
    return vaultPath
  }

  private getOptionsPath(vaultId: string): string {
    return path.join(this.getVaultPath(vaultId), OPTIONS_PATH)
  }

  /**
   * Enforces reserved key type assignments.
   * If a reserved key appears with a different type, silently correct it.
   */
  private enforceReservedKeys(entries: PropertyTypeEntry[]): PropertyTypeEntry[] {
    return entries.map((entry) => {
      const reservedType = RESERVED_PROPERTY_KEYS[entry.key]
      if (reservedType !== undefined && entry.type !== reservedType) {
        return { ...entry, type: reservedType }
      }
      return entry
    })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A copy of the `types` map of types.json (empty if the key is absent). A `types` that is not an
 * object is refused instead of replaced: the file may be mid-sync or hand-edited, as for any other
 * Obsidian file Slatebase writes.
 */
function typesOf(file: Record<string, unknown>): Record<string, unknown> {
  const types = file['types']
  if (types === undefined) return {}
  if (!isRecord(types)) throw new ObsidianConfigFileInvalidError('types.json')
  return { ...types }
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
