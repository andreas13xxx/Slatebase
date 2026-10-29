/**
 * KeychainService — vault-scoped, named secrets shared by every plugin of a vault
 * (Obsidian's `app.secretStorage`). Values are encrypted at rest by the shared
 * module secret store under `data/module-secrets/<vaultId>/keychain/`, never
 * inside the vault itself.
 */

import type { IListableModuleSecretStore } from '../shared-secrets/index.js'

// ─── Constants ───────────────────────────────────────────────────────────────

export const KEYCHAIN_MODULE_ID = 'keychain'

/** Lowercase letters and digits, groups separated by single hyphens (Obsidian's secret ID format). */
export const KEYCHAIN_SECRET_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const KEYCHAIN_SECRET_ID_MAX_LENGTH = 128
export const MAX_KEYCHAIN_ENTRIES = 200

// ─── Errors ──────────────────────────────────────────────────────────────────

export class KeychainInvalidIdError extends Error {
  public readonly code = 'INVALID_SECRET_ID'

  constructor(secretId: string) {
    super(
      `Invalid secret ID "${secretId.slice(0, 40)}": use lowercase letters, digits and single hyphens (max ${KEYCHAIN_SECRET_ID_MAX_LENGTH} characters)`,
    )
    this.name = 'KeychainInvalidIdError'
  }
}

export class KeychainLimitExceededError extends Error {
  public readonly code = 'SECRET_LIMIT_EXCEEDED'

  constructor() {
    super(`The keychain of this vault has reached the maximum of ${MAX_KEYCHAIN_ENTRIES} entries`)
    this.name = 'KeychainLimitExceededError'
  }
}

// ─── Interface ───────────────────────────────────────────────────────────────

export interface IKeychainService {
  /** Entry IDs of a vault, sorted. Never values. */
  list(vaultId: string): Promise<string[]>
  /** Decrypted value, or null if the entry does not exist. */
  get(vaultId: string, secretId: string): Promise<string | null>
  /** Create or replace an entry. */
  set(vaultId: string, secretId: string, value: string): Promise<void>
  /** Delete an entry (no error if it does not exist). */
  delete(vaultId: string, secretId: string): Promise<void>
  /** Delete every entry of a vault. */
  deleteAllForVault(vaultId: string): Promise<void>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isValidKeychainSecretId(secretId: string): boolean {
  return secretId.length > 0
    && secretId.length <= KEYCHAIN_SECRET_ID_MAX_LENGTH
    && KEYCHAIN_SECRET_ID_PATTERN.test(secretId)
}

// ─── Implementation ──────────────────────────────────────────────────────────

export class KeychainService implements IKeychainService {
  constructor(private readonly store: IListableModuleSecretStore) {}

  async list(vaultId: string): Promise<string[]> {
    return (await this.store.listSecrets(vaultId, KEYCHAIN_MODULE_ID)).sort()
  }

  async get(vaultId: string, secretId: string): Promise<string | null> {
    this.assertValidId(secretId)
    return this.store.getSecret(vaultId, KEYCHAIN_MODULE_ID, secretId)
  }

  async set(vaultId: string, secretId: string, value: string): Promise<void> {
    this.assertValidId(secretId)
    const ids = await this.store.listSecrets(vaultId, KEYCHAIN_MODULE_ID)
    if (!ids.includes(secretId) && ids.length >= MAX_KEYCHAIN_ENTRIES) {
      throw new KeychainLimitExceededError()
    }
    await this.store.setSecret(vaultId, KEYCHAIN_MODULE_ID, secretId, value)
  }

  async delete(vaultId: string, secretId: string): Promise<void> {
    this.assertValidId(secretId)
    await this.store.deleteSecret(vaultId, KEYCHAIN_MODULE_ID, secretId)
  }

  async deleteAllForVault(vaultId: string): Promise<void> {
    await this.store.deleteAll(vaultId, KEYCHAIN_MODULE_ID)
  }

  private assertValidId(secretId: string): void {
    if (!isValidKeychainSecretId(secretId)) throw new KeychainInvalidIdError(secretId)
  }
}
