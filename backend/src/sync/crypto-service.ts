import crypto from 'node:crypto'
import type { ICryptoService } from './types.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** AES-256-GCM algorithm identifier. */
const ALGORITHM = 'aes-256-gcm'

/** IV length in bytes (96 bits as recommended for GCM). */
const IV_LENGTH = 12

/** Auth tag length in bytes (128 bits). */
const AUTH_TAG_LENGTH = 16

/** PBKDF2 iterations for document encryption key derivation. */
const PBKDF2_ITERATIONS = 100_000

/** PBKDF2 salt length in bytes for document encryption. */
const PBKDF2_SALT_LENGTH = 16

/** Key length in bytes (256 bits for AES-256). */
const KEY_LENGTH = 32

// ─── CryptoService ───────────────────────────────────────────────────────────

/**
 * Encryption service for credentials and document content.
 * Uses AES-256-GCM for server-side credential encryption and
 * obsidian-livesync-compatible AES-GCM for E2E document encryption.
 */
export class CryptoService implements ICryptoService {
  private readonly serverKey: Buffer

  /**
   * Creates a new CryptoService instance.
   * @param serverSecret - The server-side secret from SLATEBASE_SYNC_SECRET env var.
   * @throws Error if the secret is empty or missing.
   */
  constructor(serverSecret: string) {
    if (!serverSecret || serverSecret.trim().length === 0) {
      throw new Error('SLATEBASE_SYNC_SECRET must be set and non-empty')
    }

    // Derive a 32-byte key from the server secret using SHA-256
    this.serverKey = crypto.createHash('sha256').update(serverSecret).digest()
  }

  /**
   * Encrypts a plaintext string with the server secret using AES-256-GCM.
   * Output format: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`
   * @param plaintext - The string to encrypt.
   * @returns The encrypted string in the format `iv:authTag:ciphertext`.
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, this.serverKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    })

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ])
    const authTag = cipher.getAuthTag()

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
  }

  /**
   * Decrypts a ciphertext string with the server secret using AES-256-GCM.
   * @param ciphertext - The encrypted string in the format `iv:authTag:ciphertext`.
   * @returns The decrypted plaintext string.
   * @throws Error if decryption fails (wrong key, tampered data, or invalid format).
   */
  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':')
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format: expected iv:authTag:ciphertext')
    }

    const [ivHex, authTagHex, encryptedHex] = parts as [string, string, string]

    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    const encrypted = Buffer.from(encryptedHex, 'hex')

    if (iv.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`)
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`)
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, this.serverKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    })
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ])

    return decrypted.toString('utf8')
  }

  /**
   * Encrypts document content with a passphrase using AES-GCM (obsidian-livesync-compatible).
   * Output format: `<salt><iv><authTag><ciphertext>` as a single Buffer.
   * @param content - The document content to encrypt.
   * @param passphrase - The E2E encryption passphrase.
   * @returns Buffer containing salt + iv + authTag + ciphertext.
   */
  encryptDocument(content: Buffer, passphrase: string): Buffer {
    const salt = crypto.randomBytes(PBKDF2_SALT_LENGTH)
    const key = crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256')
    const iv = crypto.randomBytes(IV_LENGTH)

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    })

    const encrypted = Buffer.concat([
      cipher.update(content),
      cipher.final(),
    ])
    const authTag = cipher.getAuthTag()

    // Output: salt (16) + iv (12) + authTag (16) + ciphertext (variable)
    return Buffer.concat([salt, iv, authTag, encrypted])
  }

  /**
   * Decrypts document content with a passphrase using AES-GCM (obsidian-livesync-compatible).
   * @param encrypted - Buffer containing salt + iv + authTag + ciphertext.
   * @param passphrase - The E2E encryption passphrase.
   * @returns The decrypted document content.
   * @throws Error if decryption fails (wrong passphrase or tampered data).
   */
  decryptDocument(encrypted: Buffer, passphrase: string): Buffer {
    const headerLength = PBKDF2_SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
    if (encrypted.length < headerLength) {
      throw new Error(`Invalid encrypted document: too short (minimum ${headerLength} bytes)`)
    }

    let offset = 0
    const salt = encrypted.subarray(offset, offset + PBKDF2_SALT_LENGTH)
    offset += PBKDF2_SALT_LENGTH

    const iv = encrypted.subarray(offset, offset + IV_LENGTH)
    offset += IV_LENGTH

    const authTag = encrypted.subarray(offset, offset + AUTH_TAG_LENGTH)
    offset += AUTH_TAG_LENGTH

    const ciphertext = encrypted.subarray(offset)

    const key = crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256')

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    })
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])

    return decrypted
  }
}
