// JsonFileStore — shared atomic-write JSON persistence with per-path serialization.
//
// Consolidates the read/parse/validate → mutate → atomic-write (temp + rename)
// pattern duplicated across the per-module stores (feature toggles, preferences,
// vault config, MCP tokens, unread counts). Every read-modify-write cycle for a
// given path runs inside an AsyncMutex, so two near-simultaneous callers can no
// longer race a stale read against each other's write (lost updates) or land
// their renames out of order (stale data winning on disk).

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { AsyncMutex, KeyedMutex } from './async-mutex.js'
import { isNodeError } from './fs-utils.js'

/**
 * Parses and validates the raw JSON value read from disk.
 * Return `null` to signal "invalid/unreadable — fall back to the default value".
 */
export type JsonFileParser<T> = (raw: unknown) => T | null

/**
 * Writes a value to `filePath` atomically: write to a random temp file in the
 * same directory, then rename over the target. On Windows, a lingering lock on
 * the target can make `rename` fail with EPERM/EACCES; in that case the target
 * is unlinked first and the rename retried, falling back to a direct write as
 * a last resort so the operation never silently loses data.
 */
export async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })

  const content = JSON.stringify(value, null, 2)
  const tempPath = `${filePath}.${randomBytes(8).toString('hex')}.tmp`
  await writeFile(tempPath, content, 'utf-8')

  let renamed = false
  try {
    try {
      await rename(tempPath, filePath)
      renamed = true
    } catch (err: unknown) {
      const code = isNodeError(err) ? err.code : undefined
      if (code !== 'EPERM' && code !== 'EACCES') throw err
      try { await unlink(filePath) } catch { /* may not exist */ }
      try {
        await rename(tempPath, filePath)
        renamed = true
      } catch {
        // Last resort. This can throw too if the lock outlives every attempt —
        // the `finally` below still removes the temp file in that case.
        await writeFile(filePath, content, 'utf-8')
      }
    }
  } finally {
    // Only a successful rename consumes the temp file. Every other path leaves
    // it behind, including the direct-write fallback throwing — which is how a
    // sustained lock (OneDrive, antivirus) used to orphan one temp copy of the
    // full payload per write attempt.
    if (!renamed) {
      try { await unlink(tempPath) } catch { /* already gone */ }
    }
  }
}

/**
 * Reads and parses `filePath`, returning a fresh clone of `defaultValue` if
 * the file does not exist, fails to parse, or fails validation via `parse`.
 *
 * Cloning matters: `mutate()` callbacks are allowed to mutate the value they
 * receive in place (matching the imperative style used by callers migrated
 * from bespoke read-modify-write code). If the same `defaultValue` reference
 * were handed back on every miss, an in-place mutation would permanently
 * corrupt it for every other key/call sharing that store instance.
 */
export async function readJsonFile<T>(
  filePath: string,
  defaultValue: T,
  parse?: JsonFileParser<T>,
  onError?: (error: unknown) => void,
): Promise<T> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (!parse) return parsed as T
    const value = parse(parsed)
    return value === null ? structuredClone(defaultValue) : value
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') return structuredClone(defaultValue)
    onError?.(err)
    return structuredClone(defaultValue)
  }
}

/**
 * JSON-file-backed store for a single fixed path (e.g. one config file per
 * process). Serializes all writes/mutations for that path through an
 * `AsyncMutex` so concurrent callers can't interleave their read-modify-write
 * cycles.
 */
export class JsonFileStore<T> {
  private readonly mutex = new AsyncMutex()

  constructor(
    private readonly filePath: string,
    private readonly defaultValue: T,
    private readonly parse?: JsonFileParser<T>,
    private readonly onError?: (error: unknown) => void,
  ) {}

  /** Reads the current value. Not serialized against writes — renames are atomic. */
  async read(): Promise<T> {
    return readJsonFile(this.filePath, this.defaultValue, this.parse, this.onError)
  }

  /** Overwrites the value, serialized against other writes/mutations to this path. */
  async write(value: T): Promise<void> {
    await this.mutex.runExclusive(() => writeJsonFileAtomic(this.filePath, value))
  }

  /**
   * Reads the current value, applies `fn`, and writes the result back — all
   * inside the mutex, so the read reflects the latest committed state rather
   * than a snapshot taken before waiting in the queue.
   */
  async mutate(fn: (current: T) => T | Promise<T>): Promise<T> {
    return this.mutex.runExclusive(async () => {
      const current = await readJsonFile(this.filePath, this.defaultValue, this.parse, this.onError)
      const next = await fn(current)
      await writeJsonFileAtomic(this.filePath, next)
      return next
    })
  }
}

/**
 * JSON-file-backed store for many keyed paths (e.g. one file per user or per
 * vault). Each key gets its own `AsyncMutex`, cached for the lifetime of the
 * store instance, so read-modify-write cycles are serialized per key without
 * blocking unrelated keys.
 */
export class KeyedJsonFileStore<T> {
  private readonly locks = new KeyedMutex()

  constructor(
    private readonly keyToPath: (key: string) => string,
    private readonly defaultValue: T,
    private readonly parse?: JsonFileParser<T>,
    private readonly onError?: (error: unknown) => void,
  ) {}

  /** Reads the current value for `key`. Not serialized against writes — renames are atomic. */
  async read(key: string): Promise<T> {
    return readJsonFile(this.keyToPath(key), this.defaultValue, this.parse, this.onError)
  }

  /** Overwrites the value for `key`, serialized against other writes/mutations to that key. */
  async write(key: string, value: T): Promise<void> {
    await this.locks.runExclusive(key, () => writeJsonFileAtomic(this.keyToPath(key), value))
  }

  /**
   * Reads the current value for `key`, applies `fn`, and writes the result
   * back — all inside that key's mutex, so the read reflects the latest
   * committed state rather than a snapshot taken before waiting in the queue.
   */
  async mutate(key: string, fn: (current: T) => T | Promise<T>): Promise<T> {
    const filePath = this.keyToPath(key)
    return this.locks.runExclusive(key, async () => {
      const current = await readJsonFile(filePath, this.defaultValue, this.parse, this.onError)
      const next = await fn(current)
      await writeJsonFileAtomic(filePath, next)
      return next
    })
  }
}
