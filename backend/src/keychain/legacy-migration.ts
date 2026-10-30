// Moves the former per-plugin secrets (`data/plugins/<vaultId>/<pluginId>/secrets.json`) into the
// vault keychain.
//
// The keychain is shared by all plugins of a vault, so the (plugin, secret) pairs have to be
// flattened into one namespace:
//   - IDs are normalized to the keychain format (lowercase, digits, single hyphens).
//   - The same ID with the same value is taken over once (two plugins sharing a key).
//   - The same ID with a different value keeps the existing entry; the other one is stored as
//     `<pluginId>-<secretId>` (then `-2`, `-3`, ...).
//
// Idempotent: a value that is already in the keychain is recognized and not stored twice. The old
// file is only removed after every entry of it is in the keychain, so any failure leaves it in
// place and is retried on the next start. Entries that cannot be decrypted (key rotated, corrupt)
// were already unreadable for the plugins and are dropped with a warning.

import fs from 'node:fs/promises'
import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import type { IPluginSecretKeyManager } from '../plugin/secret-key-manager.js'
import { isNodeError } from '../shared/fs-utils.js'
import type { IKeychainService } from './keychain-service.js'
import { KEYCHAIN_SECRET_ID_MAX_LENGTH, isValidKeychainSecretId } from './keychain-service.js'

const SECRETS_FILENAME = 'secrets.json'
const MAX_COLLISION_SUFFIX = 9

export interface KeychainMigrationOptions {
  dataDir: string
  keychain: IKeychainService
  keyManager: Pick<IPluginSecretKeyManager, 'decrypt'>
  logger: ILogger
}

export interface KeychainMigrationResult {
  /** Secrets now in the keychain (including ones that were already there with the same value). */
  migrated: number
  /** Secrets stored under a different ID than before (normalized or because of a collision). */
  renamed: number
  /** Secrets that could not be decrypted and were dropped. */
  dropped: number
  /** Files left in place because something failed. */
  failedFiles: number
}

/** Normalizes an old secret ID (`[A-Za-z0-9_-]`) to the keychain format. */
export function normalizeSecretId(raw: string): string {
  const id = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, KEYCHAIN_SECRET_ID_MAX_LENGTH)
    .replace(/-+$/g, '')
  return id.length > 0 ? id : 'secret'
}

function isMissing(error: unknown): boolean {
  return isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}

async function readDirNames(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch (error: unknown) {
    if (isMissing(error)) return []
    throw error
  }
}

interface LegacyFile {
  secrets: Record<string, { iv: string; ciphertext: string }>
}

function parseLegacyFile(raw: string): LegacyFile | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return null
    const secrets = (parsed as { secrets?: unknown }).secrets
    if (typeof secrets !== 'object' || secrets === null) return null
    return parsed as LegacyFile
  } catch {
    return null
  }
}

/** Picks the keychain ID for a value: the same value wherever it already is, else the first free ID. */
async function placeSecret(
  keychain: IKeychainService,
  vaultId: string,
  pluginId: string,
  secretId: string,
  value: string,
): Promise<string> {
  const base = normalizeSecretId(secretId)
  const prefixed = normalizeSecretId(`${pluginId}-${secretId}`)
  const candidates = [base, prefixed]
  for (let n = 2; n <= MAX_COLLISION_SUFFIX; n++) {
    candidates.push(normalizeSecretId(`${prefixed.slice(0, KEYCHAIN_SECRET_ID_MAX_LENGTH - 3)}-${n}`))
  }

  for (const candidate of candidates) {
    if (!isValidKeychainSecretId(candidate)) continue
    const existing = await keychain.get(vaultId, candidate)
    if (existing === value) return candidate // already migrated (or shared by two plugins)
    if (existing === null) {
      await keychain.set(vaultId, candidate, value)
      return candidate
    }
  }
  throw new Error(`No free keychain ID for "${secretId}" of plugin "${pluginId}"`)
}

export async function migratePluginSecretsToKeychain(options: KeychainMigrationOptions): Promise<KeychainMigrationResult> {
  const { dataDir, keychain, keyManager, logger } = options
  const result: KeychainMigrationResult = { migrated: 0, renamed: 0, dropped: 0, failedFiles: 0 }
  const pluginsDir = path.join(dataDir, 'plugins')

  for (const vaultId of await readDirNames(pluginsDir)) {
    for (const pluginId of await readDirNames(path.join(pluginsDir, vaultId))) {
      const filePath = path.join(pluginsDir, vaultId, pluginId, SECRETS_FILENAME)
      let raw: string
      try {
        raw = await fs.readFile(filePath, 'utf-8')
      } catch (error: unknown) {
        if (isMissing(error)) continue
        logger.error('Keychain migration: could not read legacy secrets', { vaultId, pluginId, error: String(error) })
        result.failedFiles++
        continue
      }

      const legacy = parseLegacyFile(raw)
      if (legacy === null) {
        logger.warn('Keychain migration: legacy secrets file is not valid, leaving it in place', { vaultId, pluginId })
        result.failedFiles++
        continue
      }

      try {
        for (const [secretId, entry] of Object.entries(legacy.secrets)) {
          let value: string
          try {
            value = keyManager.decrypt(entry.iv, entry.ciphertext)
          } catch {
            logger.warn('Keychain migration: dropping a secret that cannot be decrypted', { vaultId, pluginId, secretId })
            result.dropped++
            continue
          }

          const placedAs = await placeSecret(keychain, vaultId, pluginId, secretId, value)
          result.migrated++
          if (placedAs !== secretId) {
            result.renamed++
            logger.info('Keychain migration: secret stored under a different ID', { vaultId, pluginId, secretId, placedAs })
          }
        }
        await fs.unlink(filePath)
      } catch (error: unknown) {
        logger.error('Keychain migration failed, legacy file kept for the next start', {
          vaultId, pluginId, error: error instanceof Error ? error.message : String(error),
        })
        result.failedFiles++
      }
    }
  }

  if (result.migrated > 0 || result.dropped > 0) {
    logger.info('Keychain migration finished', { ...result })
  }
  return result
}
