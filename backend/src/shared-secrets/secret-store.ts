/**
 * ModuleSecretStore — Encrypted at-rest storage for backend-module secrets
 * (git-sync remote credentials, mail-import mailbox passwords, ...).
 * Stores secrets in `data/module-secrets/<vaultId>/<moduleId>/secrets.json`.
 * Each secret value is encrypted individually with AES-256-GCM.
 *
 * Generalizes the PluginSecretStore pattern (see ../plugin/secret-store.ts)
 * from `(vaultId, pluginId, secretId)` to `(vaultId, moduleId, entryId)` so
 * multiple backend modules (git-sync, mail-import) can share one
 * implementation instead of each reinventing encrypted-at-rest storage.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { IModuleSecretKeyManager } from './secret-key-manager.js'
import { isNodeError } from '../shared/fs-utils.js'

// ─── Interface ───────────────────────────────────────────────────────────────

export interface IModuleSecretStore {
  /** Get a decrypted secret value. Returns null if not found. */
  getSecret(vaultId: string, moduleId: string, entryId: string): Promise<string | null>
  /** Set (create or update) an encrypted secret. */
  setSecret(vaultId: string, moduleId: string, entryId: string, value: string): Promise<void>
  /** Delete a single secret. */
  deleteSecret(vaultId: string, moduleId: string, entryId: string): Promise<void>
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
const MAX_SECRET_VALUE_BYTES = 10 * 1024 // 10 KB (a PAT, SSH private key, or IMAP password)

// ─── Errors ──────────────────────────────────────────────────────────────────

export class ModuleSecretTooLargeError extends Error {
  public readonly code = 'SECRET_TOO_LARGE'

  constructor(entryId: string) {
    super(`Secret "${entryId}" exceeds the maximum size of ${MAX_SECRET_VALUE_BYTES} bytes`)
    this.name = 'ModuleSecretTooLargeError'
  }
}

// ─── Implementation ──────────────────────────────────────────────────────────

export class ModuleSecretStore implements IModuleSecretStore {
  private readonly baseDir: string

  constructor(
    dataDir: string,
    private readonly keyManager: IModuleSecretKeyManager
  ) {
    this.baseDir = path.join(dataDir, 'module-secrets')
  }

  async getSecret(vaultId: string, moduleId: string, entryId: string): Promise<string | null> {
    const data = await this.readSecretsFile(vaultId, moduleId)
    if (!data) return null

    const entry = data.secrets[entryId]
    if (!entry) return null

    try {
      return this.keyManager.decrypt(entry.iv, entry.ciphertext)
    } catch {
      // If decryption fails (key rotated, corrupted data), treat as not found
      return null
    }
  }

  async setSecret(vaultId: string, moduleId: string, entryId: string, value: string): Promise<void> {
    const size = Buffer.byteLength(value, 'utf-8')
    if (size > MAX_SECRET_VALUE_BYTES) {
      throw new ModuleSecretTooLargeError(entryId)
    }

    const data = await this.readSecretsFile(vaultId, moduleId) ?? { secrets: {} }
    data.secrets[entryId] = this.keyManager.encrypt(value)
    await this.writeSecretsFile(vaultId, moduleId, data)
  }

  async deleteSecret(vaultId: string, moduleId: string, entryId: string): Promise<void> {
    const data = await this.readSecretsFile(vaultId, moduleId)
    if (!data || !(entryId in data.secrets)) return

    delete data.secrets[entryId]
    await this.writeSecretsFile(vaultId, moduleId, data)
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private getModuleDir(vaultId: string, moduleId: string): string {
    return path.join(this.baseDir, vaultId, moduleId)
  }

  private getSecretsFilePath(vaultId: string, moduleId: string): string {
    return path.join(this.getModuleDir(vaultId, moduleId), SECRETS_FILENAME)
  }

  private async readSecretsFile(vaultId: string, moduleId: string): Promise<SecretsFile | null> {
    const filePath = this.getSecretsFilePath(vaultId, moduleId)
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

  private async writeSecretsFile(vaultId: string, moduleId: string, data: SecretsFile): Promise<void> {
    const dir = this.getModuleDir(vaultId, moduleId)
    await fs.mkdir(dir, { recursive: true })

    const filePath = this.getSecretsFilePath(vaultId, moduleId)
    const tempPath = `${filePath}.${crypto.randomBytes(8).toString('hex')}.tmp`
    const content = JSON.stringify(data, null, 2)

    await fs.writeFile(tempPath, content, 'utf-8')
    await fs.rename(tempPath, filePath)
  }
}
