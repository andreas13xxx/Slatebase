/**
 * Feature Toggle Store — Filesystem persistence for toggle states.
 *
 * Persists toggle overrides to `{dataDir}/features.json` using atomic writes.
 * On startup, saved states are loaded and applied after config defaults
 * but before env-var overrides (priority: env > persisted > config > default).
 */

import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { ILogger } from '../logger/index.js'

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
export class FeatureToggleStore implements IFeatureToggleStore {
  private readonly filePath: string

  constructor(
    private readonly dataDir: string,
    private readonly logger: ILogger,
  ) {
    this.filePath = join(this.dataDir, FEATURES_FILE)
  }

  /**
   * Loads persisted toggle states from disk.
   * Returns an empty record if the file does not exist or is invalid.
   */
  async load(): Promise<Record<string, boolean>> {
    try {
      const raw = await readFile(this.filePath, 'utf-8')
      const data: unknown = JSON.parse(raw)

      if (!isValidPersistedState(data)) {
        this.logger.warn('Feature toggle state file has invalid format, ignoring')
        return {}
      }

      this.logger.info('Feature toggle states loaded from disk', {
        count: Object.keys(data.toggles).length,
      })
      return data.toggles
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        // File does not exist — normal on first run
        return {}
      }
      this.logger.warn('Failed to read feature toggle state file, ignoring', {
        error: err instanceof Error ? err.message : String(err),
      })
      return {}
    }
  }

  /**
   * Saves toggle overrides to disk using atomic write (temp → rename).
   */
  async save(toggles: Record<string, boolean>): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })

    const data: PersistedFeatureState = {
      version: 1,
      updatedAt: new Date().toISOString(),
      toggles,
    }

    const content = JSON.stringify(data, null, 2)
    const tempPath = `${this.filePath}.${randomBytes(8).toString('hex')}.tmp`

    await writeFile(tempPath, content, 'utf-8')

    try {
      await rename(tempPath, this.filePath)
    } catch (renameError) {
      // Clean up temp file on rename failure
      try {
        await unlink(tempPath)
      } catch {
        // Ignore cleanup errors
      }
      throw renameError
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}

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
