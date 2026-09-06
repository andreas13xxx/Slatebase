/**
 * PluginSecretStore — Encrypted at-rest storage for plugin secrets.
 * Stores per-plugin secrets in `data/plugins/<vaultId>/<pluginId>/secrets.json`.
 * Each secret value is encrypted individually with AES-256-GCM.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import type { IPluginSecretKeyManager } from './secret-key-manager.js'
import { isNodeError } from '../shared/fs-utils.js'
import { KeyedJsonFileStore } from '../shared/json-file-store.js'

// ─── Interface ───────────────────────────────────────────────────────────────

export interface IPluginSecretStore {
  /** Get a decrypted secret value. Returns null if not found. */
  getSecret(vaultId: string, pluginId: string, secretId: string): Promise<string | null>
  /** Set (create or update) an encrypted secret. */
  setSecret(vaultId: string, pluginId: string, secretId: string, value: string): Promise<void>
  /** Delete a single secret. */
  deleteSecret(vaultId: string, pluginId: string, secretId: string): Promise<void>
  /** List all secret IDs for a plugin (NOT the values). */
  listSecrets(vaultId: string, pluginId: string): Promise<string[]>
  /** Delete all secrets for a plugin (used on plugin uninstall). */
  deleteAllForPlugin(vaultId: string, pluginId: string): Promise<void>
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface EncryptedEntry {
  iv: string
  ciphertext: string
}

interface SecretsFile {
  secrets: Record<string, EncryptedEntry>
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SECRETS_FILENAME = 'secrets.json'
const MAX_SECRETS_PER_PLUGIN = 50
const MAX_SECRET_VALUE_BYTES = 10 * 1024 // 10 KB

// ─── Errors ──────────────────────────────────────────────────────────────────

export class SecretLimitExceededError extends Error {
  constructor(pluginId: string) {
    super(`Plugin "${pluginId}" has reached the maximum of ${MAX_SECRETS_PER_PLUGIN} secrets`)
    this.name = 'SecretLimitExceededError'
  }
}

export class SecretTooLargeError extends Error {
  constructor(secretId: string) {
    super(`Secret "${secretId}" exceeds the maximum size of ${MAX_SECRET_VALUE_BYTES} bytes`)
    this.name = 'SecretTooLargeError'
  }
}

// ─── Implementation ──────────────────────────────────────────────────────────

/** Empty secrets file, returned as the default for a plugin with none set yet. */
function emptySecretsFile(): SecretsFile {
  return { secrets: {} }
}

function parseSecretsFile(raw: unknown): SecretsFile | null {
  if (raw === null || typeof raw !== 'object') return null
  const secrets = (raw as { secrets?: unknown }).secrets
  if (typeof secrets !== 'object' || secrets === null) return null
  return raw as SecretsFile
}

export class PluginSecretStore implements IPluginSecretStore {
  private readonly pluginsDir: string
  private readonly store: KeyedJsonFileStore<SecretsFile>

  constructor(
    dataDir: string,
    private readonly keyManager: IPluginSecretKeyManager
  ) {
    this.pluginsDir = path.join(dataDir, 'plugins')
    this.store = new KeyedJsonFileStore<SecretsFile>(
      (key) => path.join(this.pluginsDir, key, SECRETS_FILENAME),
      emptySecretsFile(),
      parseSecretsFile,
      undefined,
      0o600, // owner read/write only — secrets carry the plugin's raw values, AES-GCM-encrypted at rest
    )
  }

  async getSecret(vaultId: string, pluginId: string, secretId: string): Promise<string | null> {
    const data = await this.store.read(this.key(vaultId, pluginId))
    const entry = data.secrets[secretId]
    if (!entry) return null

    try {
      return this.keyManager.decrypt(entry.iv, entry.ciphertext)
    } catch {
      // If decryption fails (key rotated, corrupted data), treat as not found
      return null
    }
  }

  async setSecret(vaultId: string, pluginId: string, secretId: string, value: string): Promise<void> {
    // Validate size
    const size = Buffer.byteLength(value, 'utf-8')
    if (size > MAX_SECRET_VALUE_BYTES) {
      throw new SecretTooLargeError(secretId)
    }

    // Encrypt outside the critical section — it's pure CPU work, no need to hold the lock for it.
    const encrypted = this.keyManager.encrypt(value)

    await this.store.mutate(this.key(vaultId, pluginId), (data) => {
      // Check limit (only if adding a NEW secret)
      if (!(secretId in data.secrets)) {
        const currentCount = Object.keys(data.secrets).length
        if (currentCount >= MAX_SECRETS_PER_PLUGIN) {
          throw new SecretLimitExceededError(pluginId)
        }
      }

      data.secrets[secretId] = encrypted
      return data
    })
  }

  async deleteSecret(vaultId: string, pluginId: string, secretId: string): Promise<void> {
    await this.store.mutate(this.key(vaultId, pluginId), (data) => {
      delete data.secrets[secretId]
      return data
    })
  }

  async listSecrets(vaultId: string, pluginId: string): Promise<string[]> {
    const data = await this.store.read(this.key(vaultId, pluginId))
    return Object.keys(data.secrets)
  }

  async deleteAllForPlugin(vaultId: string, pluginId: string): Promise<void> {
    const filePath = path.join(this.pluginsDir, this.key(vaultId, pluginId), SECRETS_FILENAME)
    try {
      await fs.unlink(filePath)
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') return
      throw err
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private key(vaultId: string, pluginId: string): string {
    return `${vaultId}/${pluginId}`
  }
}
