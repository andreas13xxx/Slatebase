/**
 * PluginSecretStore — Encrypted at-rest storage for plugin secrets.
 * Stores per-plugin secrets in `data/plugins/<vaultId>/<pluginId>/secrets.json`.
 * Each secret value is encrypted individually with AES-256-GCM.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { IPluginSecretKeyManager } from './secret-key-manager.js'
import { isNodeError } from '../shared/fs-utils.js'

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

export class PluginSecretStore implements IPluginSecretStore {
  private readonly pluginsDir: string

  constructor(
    dataDir: string,
    private readonly keyManager: IPluginSecretKeyManager
  ) {
    this.pluginsDir = path.join(dataDir, 'plugins')
  }

  async getSecret(vaultId: string, pluginId: string, secretId: string): Promise<string | null> {
    const data = await this.readSecretsFile(vaultId, pluginId)
    if (!data) return null

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

    const data = await this.readSecretsFile(vaultId, pluginId) ?? { secrets: {} }

    // Check limit (only if adding a NEW secret)
    if (!(secretId in data.secrets)) {
      const currentCount = Object.keys(data.secrets).length
      if (currentCount >= MAX_SECRETS_PER_PLUGIN) {
        throw new SecretLimitExceededError(pluginId)
      }
    }

    // Encrypt and store
    const encrypted = this.keyManager.encrypt(value)
    data.secrets[secretId] = encrypted

    await this.writeSecretsFile(vaultId, pluginId, data)
  }

  async deleteSecret(vaultId: string, pluginId: string, secretId: string): Promise<void> {
    const data = await this.readSecretsFile(vaultId, pluginId)
    if (!data || !(secretId in data.secrets)) return

    delete data.secrets[secretId]
    await this.writeSecretsFile(vaultId, pluginId, data)
  }

  async listSecrets(vaultId: string, pluginId: string): Promise<string[]> {
    const data = await this.readSecretsFile(vaultId, pluginId)
    if (!data) return []
    return Object.keys(data.secrets)
  }

  async deleteAllForPlugin(vaultId: string, pluginId: string): Promise<void> {
    const filePath = this.getSecretsFilePath(vaultId, pluginId)
    try {
      await fs.unlink(filePath)
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') return
      throw err
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private getPluginDir(vaultId: string, pluginId: string): string {
    return path.join(this.pluginsDir, vaultId, pluginId)
  }

  private getSecretsFilePath(vaultId: string, pluginId: string): string {
    return path.join(this.getPluginDir(vaultId, pluginId), SECRETS_FILENAME)
  }

  private async readSecretsFile(vaultId: string, pluginId: string): Promise<SecretsFile | null> {
    const filePath = this.getSecretsFilePath(vaultId, pluginId)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(content) as SecretsFile
      if (!parsed || typeof parsed.secrets !== 'object') return null
      return parsed
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') return null
      throw err
    }
  }

  private async writeSecretsFile(vaultId: string, pluginId: string, data: SecretsFile): Promise<void> {
    const dir = this.getPluginDir(vaultId, pluginId)
    await fs.mkdir(dir, { recursive: true })

    const filePath = this.getSecretsFilePath(vaultId, pluginId)
    const tempPath = `${filePath}.${crypto.randomBytes(8).toString('hex')}.tmp`
    const content = JSON.stringify(data, null, 2)

    await fs.writeFile(tempPath, content, 'utf-8')
    await fs.rename(tempPath, filePath)
  }
}
