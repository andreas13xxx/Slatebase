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
        this.logger.warn('SLATEBASE_PLUGIN_SECRET_KEY is set but invalid (expected 64 hex chars), generating new')
      } else {
        this.logger.info('Plugin secret key loaded from environment variable')
        return envSecret
      }
    }

    // 2. Try reading from file
    try {
      const fileContent = await readFile(this.secretPath, 'utf-8')
      const secret = fileContent.trim()
      if (this.isValidSecret(secret)) {
        this.logger.info('Plugin secret key loaded from file')
        return secret
      }
      this.logger.warn('Plugin secret key file is corrupted, regenerating')
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        this.logger.info('Plugin secret key file not found, generating new key')
      } else {
        this.logger.warn('Failed to read plugin secret key file, regenerating')
      }
    }

    // 3. Generate new secret and persist atomically
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

  private async persistSecret(secret: string): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
    const tempPath = `${this.secretPath}.${randomBytes(8).toString('hex')}.tmp`
    await writeFile(tempPath, secret, 'utf-8')
    await rename(tempPath, this.secretPath)
  }
}
