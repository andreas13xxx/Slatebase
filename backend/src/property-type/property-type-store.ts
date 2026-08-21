/**
 * PropertyTypeStore — filesystem persistence for per-vault property type definitions.
 * Each vault's registry is stored as `.slatebase/property-types.json` inside the vault's data directory.
 * Uses atomic writes (temp → rename) via KeyedJsonFileStore for crash safety.
 */

import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import type { IPropertyTypeService, PropertyTypeEntry, PropertyTypeRegistry } from './types.js'
import { DEFAULT_PROPERTY_TYPE_REGISTRY, RESERVED_PROPERTY_KEYS } from './types.js'
import { KeyedJsonFileStore } from '../shared/json-file-store.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Registry file path relative to vault root. */
const REGISTRY_PATH = path.join('.slatebase', 'property-types.json')

/** Maximum entries allowed per vault. */
const MAX_ENTRIES = 200

// ─── Types ───────────────────────────────────────────────────────────────────

/** Resolves a vault ID to its storage path, or null if not found. */
export type VaultPathResolver = (vaultId: string) => string | null

// ─── Sanitizer ───────────────────────────────────────────────────────────────

/**
 * Validates and sanitizes raw JSON into a PropertyTypeRegistry.
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

  return { entries: entries.slice(0, MAX_ENTRIES) }
}

// ─── Implementation ──────────────────────────────────────────────────────────

export class PropertyTypeStore implements IPropertyTypeService {
  private readonly store: KeyedJsonFileStore<PropertyTypeRegistry>

  constructor(
    private readonly resolveVaultPath: VaultPathResolver,
    private readonly logger: ILogger,
  ) {
    this.store = new KeyedJsonFileStore<PropertyTypeRegistry>(
      (vaultId) => this.getFilePath(vaultId),
      DEFAULT_PROPERTY_TYPE_REGISTRY,
      sanitizeRegistry,
      (error) => this.logger.error('Failed to load property type registry', { error: String(error) }),
    )
  }

  async getRegistry(vaultId: string): Promise<PropertyTypeRegistry> {
    return this.store.read(vaultId)
  }

  async saveRegistry(vaultId: string, registry: PropertyTypeRegistry): Promise<PropertyTypeRegistry> {
    // Enforce reserved key constraints
    const validated = this.enforceReservedKeys(registry.entries)
    const capped: PropertyTypeRegistry = { entries: validated.slice(0, MAX_ENTRIES) }

    await this.store.write(vaultId, capped)
    return capped
  }

  async upsertEntry(vaultId: string, entry: PropertyTypeEntry): Promise<PropertyTypeRegistry> {
    // Check reserved key constraint
    const reservedType = RESERVED_PROPERTY_KEYS[entry.key]
    if (reservedType !== undefined && entry.type !== reservedType) {
      throw new PropertyTypeReservedKeyError(entry.key, reservedType)
    }

    return this.store.mutate(vaultId, (current) => {
      const entries = [...current.entries]
      const existingIndex = entries.findIndex((e) => e.key === entry.key)

      if (existingIndex >= 0) {
        entries[existingIndex] = entry
      } else {
        if (entries.length >= MAX_ENTRIES) {
          throw new PropertyTypeMaxEntriesError(MAX_ENTRIES)
        }
        entries.push(entry)
      }

      return { entries }
    })
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private getFilePath(vaultId: string): string {
    const vaultPath = this.resolveVaultPath(vaultId)
    if (!vaultPath) {
      throw new Error(`Vault not found: ${vaultId}`)
    }
    return path.join(vaultPath, REGISTRY_PATH)
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
