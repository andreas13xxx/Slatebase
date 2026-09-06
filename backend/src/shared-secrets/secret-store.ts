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

import path from 'node:path'
import type { IModuleSecretKeyManager } from './secret-key-manager.js'
import { KeyedJsonFileStore } from '../shared/json-file-store.js'

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

/** Empty secrets file, returned as the default for a module with none set yet. */
function emptySecretsFile(): SecretsFile {
  return { secrets: {} }
}

function parseSecretsFile(raw: unknown): SecretsFile | null {
  if (raw === null || typeof raw !== 'object') return null
  const secrets = (raw as { secrets?: unknown }).secrets
  if (typeof secrets !== 'object' || secrets === null) return null
  return raw as SecretsFile
}

export class ModuleSecretStore implements IModuleSecretStore {
  private readonly baseDir: string
  private readonly store: KeyedJsonFileStore<SecretsFile>

  constructor(
    dataDir: string,
    private readonly keyManager: IModuleSecretKeyManager
  ) {
    this.baseDir = path.join(dataDir, 'module-secrets')
    this.store = new KeyedJsonFileStore<SecretsFile>(
      (key) => path.join(this.baseDir, key, SECRETS_FILENAME),
      emptySecretsFile(),
      parseSecretsFile,
      undefined,
      0o600, // owner read/write only — secrets carry git-sync/mail-import credentials
    )
  }

  async getSecret(vaultId: string, moduleId: string, entryId: string): Promise<string | null> {
    const data = await this.store.read(this.key(vaultId, moduleId))
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

    // Encrypt outside the critical section — it's pure CPU work, no need to hold the lock for it.
    const encrypted = this.keyManager.encrypt(value)

    await this.store.mutate(this.key(vaultId, moduleId), (data) => {
      data.secrets[entryId] = encrypted
      return data
    })
  }

  async deleteSecret(vaultId: string, moduleId: string, entryId: string): Promise<void> {
    await this.store.mutate(this.key(vaultId, moduleId), (data) => {
      delete data.secrets[entryId]
      return data
    })
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private key(vaultId: string, moduleId: string): string {
    return `${vaultId}/${moduleId}`
  }
}
