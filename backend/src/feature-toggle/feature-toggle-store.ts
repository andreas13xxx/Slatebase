/**
 * Feature Toggle Store — Filesystem persistence for toggle states.
 *
 * Persists toggle overrides to `{dataDir}/features.json` using atomic writes.
 * On startup, saved states are loaded and applied after config defaults
 * but before env-var overrides (priority: env > persisted > config > default).
 */

import { join } from 'node:path'
import type { ILogger } from '../logger/index.js'
import { JsonFileStore } from '../shared/json-file-store.js'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Persisted state file format */
interface PersistedFeatureState {
  version: 1
  updatedAt: string
  toggles: Record<string, boolean>
}

/** Interface for the feature toggle store */
export interface IFeatureToggleStore {
  /** Loads persisted toggle states from disk. Returns empty record if file does not exist. */
  load(): Promise<Record<string, boolean>>
  /** Saves the current toggle overrides to disk atomically. */
  save(toggles: Record<string, boolean>): Promise<void>
}

// ─── Implementation ──────────────────────────────────────────────────────────

const FEATURES_FILE = 'features.json'

/**
 * Persists feature toggle overrides to a JSON file on disk.
 * Uses atomic writes (temp file → rename) to prevent corruption.
 */
const EMPTY_STATE: PersistedFeatureState = { version: 1, updatedAt: '', toggles: {} }

export class FeatureToggleStore implements IFeatureToggleStore {
  private readonly store: JsonFileStore<PersistedFeatureState>

  constructor(
    dataDir: string,
    private readonly logger: ILogger,
  ) {
    this.store = new JsonFileStore(join(dataDir, FEATURES_FILE), EMPTY_STATE, (raw) =>
      isValidPersistedState(raw) ? raw : null,
    )
  }

  /**
   * Loads persisted toggle states from disk.
   * Returns an empty record if the file does not exist or is invalid.
   */
  async load(): Promise<Record<string, boolean>> {
    const data = await this.store.read()
    const count = Object.keys(data.toggles).length
    if (count > 0) {
      this.logger.info('Feature toggle states loaded from disk', { count })
    }
    return data.toggles
  }

  /**
   * Saves toggle overrides to disk using atomic write (temp → rename).
   * Serialized per-file so concurrent saves can't land their renames out of
   * order and regress the persisted state to a stale snapshot.
   */
  async save(toggles: Record<string, boolean>): Promise<void> {
    await this.store.write({
      version: 1,
      updatedAt: new Date().toISOString(),
      toggles,
    })
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────


function isValidPersistedState(data: unknown): data is PersistedFeatureState {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  if (obj['version'] !== 1) return false
  if (typeof obj['toggles'] !== 'object' || obj['toggles'] === null) return false

  // Verify all values in toggles are booleans
  const toggles = obj['toggles'] as Record<string, unknown>
  for (const value of Object.values(toggles)) {
    if (typeof value !== 'boolean') return false
  }

  return true
}
