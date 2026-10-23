/**
 * PluginSecretKeyManager — Manages the encryption key for plugin secrets at rest.
 * Same pattern as CsrfSecretManager: env → file → generate.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes, createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import { isNodeError } from '../shared/fs-utils.js'

// ─── Interface ───────────────────────────────────────────────────────────────

/**
 * Thrown when the encryption key cannot be loaded for a reason that must NOT be
 * silently recovered by generating a new key — a corrupt file, an unreadable
 * file, or an explicitly-set-but-invalid env var. Regenerating in any of these
 * cases would orphan every plugin secret the existing key encrypted, so the
 * process refuses to start instead.
 */
export class PluginSecretKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PluginSecretKeyError'
  }
}

export interface IPluginSecretKeyManager {
  /** Load or generate the encryption key. Must be called before encrypt/decrypt. */
  loadOrCreate(): Promise<void>
  /** Encrypt a plaintext string. Returns IV + ciphertext (hex-encoded). */
  encrypt(plaintext: string): { iv: string; ciphertext: string }
  /** Decrypt a ciphertext back to plaintext. Throws on invalid/tampered data. */
  decrypt(iv: string, ciphertext: string): string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SECRET_KEY_FILE = '.plugin-secret-key'
const SECRET_KEY_ENV_VAR = 'SLATEBASE_PLUGIN_SECRET_KEY'
const SECRET_LENGTH_BYTES = 32
const IV_LENGTH_BYTES = 12
const AUTH_TAG_LENGTH_BYTES = 16
const HKDF_INFO = 'plugin-secrets'

// ─── Implementation ──────────────────────────────────────────────────────────

export class PluginSecretKeyManager implements IPluginSecretKeyManager {
  private readonly secretPath: string
  private derivedKey: Buffer | null = null

  constructor(
    private readonly dataDir: string,
    private readonly logger: ILogger
  ) {
    this.secretPath = join(this.dataDir, SECRET_KEY_FILE)
  }

  async loadOrCreate(): Promise<void> {
    const rawSecret = await this.loadRawSecret()
    // Derive AES-256 key via HKDF
    this.derivedKey = Buffer.from(
      hkdfSync('sha256', Buffer.from(rawSecret, 'hex'), Buffer.alloc(0), HKDF_INFO, 32)
    )
  }

  encrypt(plaintext: string): { iv: string; ciphertext: string } {
    if (!this.derivedKey) {
      throw new Error('PluginSecretKeyManager not initialized — call loadOrCreate() first')
    }

    const iv = randomBytes(IV_LENGTH_BYTES)
    const cipher = createCipheriv('aes-256-gcm', this.derivedKey, iv)
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ])
    const authTag = cipher.getAuthTag()

    // Store ciphertext + authTag together (standard GCM pattern)
    const combined = Buffer.concat([encrypted, authTag])

    return {
      iv: iv.toString('hex'),
      ciphertext: combined.toString('hex'),
    }
  }

  decrypt(iv: string, ciphertext: string): string {
    if (!this.derivedKey) {
      throw new Error('PluginSecretKeyManager not initialized — call loadOrCreate() first')
    }

    const ivBuf = Buffer.from(iv, 'hex')
    const combined = Buffer.from(ciphertext, 'hex')

    // Split ciphertext and auth tag
    const encryptedData = combined.subarray(0, combined.length - AUTH_TAG_LENGTH_BYTES)
    const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH_BYTES)

    const decipher = createDecipheriv('aes-256-gcm', this.derivedKey, ivBuf)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ])

    return decrypted.toString('utf-8')
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async loadRawSecret(): Promise<string> {
    // 1. Check environment variable
    const envSecret = process.env[SECRET_KEY_ENV_VAR]
    if (envSecret && envSecret.length > 0) {
      if (!this.isValidSecret(envSecret)) {
        // An explicitly-set-but-malformed env var is an operator mistake, not a
        // reason to silently fall through to a different key source.
        throw new PluginSecretKeyError(
          `${SECRET_KEY_ENV_VAR} is set but invalid (expected 64 hex chars). ` +
          `Fix or unset it — refusing to start rather than fall back to a different key.`,
        )
      }
      this.logger.info('Plugin secret key loaded from environment variable')
      return envSecret
    }

    // 2. Try reading from file
    let fileContent: string
    try {
      fileContent = await readFile(this.secretPath, 'utf-8')
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        // Genuine first run: no key file yet, nothing encrypted to orphan.
        this.logger.info('Plugin secret key file not found, generating new key')
        return this.generateAndPersist()
      }
      // A read that fails for any OTHER reason (EPERM/EBUSY from antivirus or a
      // synced folder on Windows, a torn read) does NOT prove the key is gone.
      // Regenerating would orphan every plugin secret the existing key
      // encrypted. Refuse to start and let the operator retry instead.
      throw new PluginSecretKeyError(
        `Failed to read the plugin secret key at ${this.secretPath} ` +
        `(${isNodeError(err) ? err.code : String(err)}). Refusing to start: regenerating the key ` +
        `would make every stored plugin secret undecryptable. ` +
        `Retry once the file is readable, or set ${SECRET_KEY_ENV_VAR}.`,
      )
    }

    const secret = fileContent.trim()
    if (this.isValidSecret(secret)) {
      this.logger.info('Plugin secret key loaded from file')
      return secret
    }
    // The file exists and was read, but its contents are not a valid key.
    throw new PluginSecretKeyError(
      `The plugin secret key file at ${this.secretPath} is corrupt (not 64 hex chars). ` +
      `Refusing to start: regenerating would make every stored plugin secret undecryptable. ` +
      `Restore the correct key, or set ${SECRET_KEY_ENV_VAR}; if the secrets are already lost, ` +
      `delete the file to start fresh and re-enter them.`,
    )
  }

  /** Generates a fresh key and persists it atomically. Only for a genuine first run. */
  private async generateAndPersist(): Promise<string> {
    const newSecret = randomBytes(SECRET_LENGTH_BYTES).toString('hex')
    await this.persistSecret(newSecret)
    this.logger.warn(
      'New plugin secret key generated. Set SLATEBASE_PLUGIN_SECRET_KEY env var ' +
      'or mount a persistent volume for the data directory to prevent secret loss on restart.'
    )
    return newSecret
  }

  private isValidSecret(secret: string): boolean {
    return /^[0-9a-f]{64}$/i.test(secret)
  }

  /**
   * The temp file is created with mode 0o600 (owner read/write only) — `rename()`
   * preserves the temp file's mode, not the target's, so the mode must be set
   * here rather than after the rename. On Windows this POSIX mode is largely a
   * no-op (ACL-based permissions apply instead) — that's expected, not a bug.
   */
  private async persistSecret(secret: string): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
    const tempPath = `${this.secretPath}.${randomBytes(8).toString('hex')}.tmp`
    await writeFile(tempPath, secret, { encoding: 'utf-8', mode: 0o600 })
    await rename(tempPath, this.secretPath)
  }
}
