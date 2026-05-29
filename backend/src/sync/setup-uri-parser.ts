import crypto from 'node:crypto'
import { InvalidSetupUriError } from './errors.js'
import type { ISetupUriParser, SetupUriParams } from './types.js'

/** Maximum allowed length for a Setup-URI string (generous to accommodate URL-encoding overhead). */
const MAX_URI_LENGTH = 16384

/** Derived key length in bytes (AES-256). */
const KEY_LENGTH = 32

/**
 * Expected fields in the obsidian-livesync Setup-URI JSON payload.
 */
interface SetupUriPayload {
  couchDB_URI?: string
  couchDB_DBNAME?: string
  couchDB_USER?: string
  couchDB_PASSWORD?: string
  passphrase?: string
  useDynamicIterationCount?: boolean
}

/**
 * Parses obsidian-livesync Setup-URIs.
 *
 * The encrypted payload format (V2, prefix `%`):
 * - `%` prefix (1 char)
 * - IV as hex string (32 chars = 16 bytes)
 * - Salt as hex string (32 chars = 16 bytes)
 * - Encrypted data as Base64
 *
 * Key derivation:
 * 1. SHA-256 hash of passphrase
 * 2. PBKDF2 with salt, iterations based on passphrase length or fixed 100000, SHA-256
 * 3. AES-256-GCM decryption
 *
 * Based on: https://github.com/vrtmrz/octagonal-wheels/blob/main/src/encryption/encryption.ts
 */
export class SetupUriParser implements ISetupUriParser {
  /**
   * Parses an obsidian-livesync Setup-URI and extracts connection parameters.
   *
   * Accepts either:
   * - The full URI: `obsidian://setuplivesync?settings=<URL-encoded encrypted payload>`
   * - Just the encrypted payload (raw or URL-encoded)
   *
   * @param uri - Full obsidian URI or encrypted payload string
   * @param passphrase - Passphrase used to derive the decryption key
   * @returns Extracted connection parameters
   * @throws InvalidSetupUriError on any parse failure
   */
  parse(uri: string, passphrase: string): SetupUriParams {
    const trimmedUri = uri.trim()

    if (trimmedUri.length === 0) {
      throw new InvalidSetupUriError('Setup URI must not be empty')
    }

    if (trimmedUri.length > MAX_URI_LENGTH) {
      throw new InvalidSetupUriError(`Setup URI exceeds maximum length of ${MAX_URI_LENGTH} characters`)
    }

    // Step 0: Extract the encrypted payload from the full URI or use as-is
    const encryptedPayload = this.extractPayload(trimmedUri)

    // Step 1: Detect format and decrypt
    const decrypted = this.decryptPayload(encryptedPayload, passphrase)

    // Step 2: Parse JSON
    const payload = this.parseJson(decrypted)

    // Step 3: Extract and validate fields
    return this.extractParams(payload)
  }

  /**
   * Extracts the encrypted payload from a full obsidian-livesync URI or returns the input as-is.
   *
   * Handles:
   * - `obsidian://setuplivesync?settings=<URL-encoded payload>` → extracts and URL-decodes the settings value
   * - URL-encoded payload without obsidian:// prefix → URL-decodes
   * - `%$` prefix variant → binary format (Base64 of IV + Salt + encrypted data)
   * - `%` prefix + hex chars → V2 string format
   * - `[` prefix → V1 JSON array format
   */
  private extractPayload(input: string): string {
    let payload = input

    // Check if this is a full obsidian:// URI
    if (payload.startsWith('obsidian://')) {
      const settingsMatch = payload.match(/[?&]settings=([^&]+)/)
      if (!settingsMatch?.[1]) {
        throw new InvalidSetupUriError('Setup URI is missing the "settings" parameter')
      }
      payload = decodeURIComponent(settingsMatch[1])
    } else if (!payload.startsWith('%') && !payload.startsWith('[')) {
      // Doesn't start with an encryption marker — might be URL-encoded
      if (payload.includes('%')) {
        try {
          payload = decodeURIComponent(payload)
        } catch {
          // Not valid URL encoding — use as-is
        }
      }
    }

    return payload
  }

  /**
   * Decrypts the payload based on its format prefix.
   *
   * `%$` format (HKDF with ephemeral salt): Base64(PBKDF2_Salt[32] + IV[12] + HKDF_Salt[32] + encrypted data)
   * V2 format (prefix `%`): `%` + hex(IV, 16 bytes = 32 chars) + hex(Salt, 16 bytes = 32 chars) + base64(encrypted data)
   * V1 format (prefix `[`): JSON array `["base64data", "hexIV", "hexSalt"]`
   */
  private decryptPayload(payload: string, passphrase: string): string {
    if (payload.startsWith('%$')) {
      return this.decryptHkdfEphemeral(payload.substring(2), passphrase)
    }
    if (payload.startsWith('%~')) {
      throw new InvalidSetupUriError('Setup URI uses V3 encryption format which is not yet supported')
    }
    if (payload.startsWith('%')) {
      return this.decryptV2(payload, passphrase)
    }
    if (payload.startsWith('[')) {
      return this.decryptV1(payload, passphrase)
    }
    throw new InvalidSetupUriError('Setup URI has unrecognized encryption format (expected %$, % or [ prefix)')
  }

  /**
   * Decrypts HKDF ephemeral salt format (%$ prefix):
   * Base64(PBKDF2_Salt[32] + IV[12] + HKDF_Salt[32] + encrypted data with GCM auth tag)
   *
   * Key derivation:
   * 1. PBKDF2(passphrase, pbkdf2Salt, 310000, 32, SHA-256) → masterKey
   * 2. HKDF(masterKey, hkdfSalt, empty_info, SHA-256) → chunkKey (AES-256-GCM)
   */
  private decryptHkdfEphemeral(base64Payload: string, passphrase: string): string {
    const PBKDF2_SALT_LEN = 32
    const IV_LEN = 12
    const HKDF_SALT_LEN = 32
    const AUTH_TAG_LEN = 16
    const PBKDF2_ITER = 310_000

    const decoded = this.base64Decode(base64Payload)

    if (decoded.length < PBKDF2_SALT_LEN + IV_LEN + HKDF_SALT_LEN + AUTH_TAG_LEN + 1) {
      throw new InvalidSetupUriError('Setup URI payload is too short to contain valid encrypted data')
    }

    const pbkdf2Salt = decoded.subarray(0, PBKDF2_SALT_LEN)
    const iv = decoded.subarray(PBKDF2_SALT_LEN, PBKDF2_SALT_LEN + IV_LEN)
    const hkdfSalt = decoded.subarray(PBKDF2_SALT_LEN + IV_LEN, PBKDF2_SALT_LEN + IV_LEN + HKDF_SALT_LEN)
    const encryptedData = decoded.subarray(PBKDF2_SALT_LEN + IV_LEN + HKDF_SALT_LEN)

    try {
      // Step 1: PBKDF2 to derive master key
      const masterKey = crypto.pbkdf2Sync(
        Buffer.from(passphrase, 'utf8'),
        pbkdf2Salt,
        PBKDF2_ITER,
        KEY_LENGTH,
        'sha256'
      )

      // Step 2: HKDF to derive chunk key
      const chunkKey = Buffer.from(
        crypto.hkdfSync('sha256', masterKey, hkdfSalt, Buffer.alloc(0), KEY_LENGTH)
      )

      // Step 3: AES-256-GCM decrypt
      const authTag = encryptedData.subarray(encryptedData.length - AUTH_TAG_LEN)
      const ciphertext = encryptedData.subarray(0, encryptedData.length - AUTH_TAG_LEN)
      const decipher = crypto.createDecipheriv('aes-256-gcm', chunkKey, iv)
      decipher.setAuthTag(authTag)
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
      return decrypted.toString('utf8')
    } catch {
      throw new InvalidSetupUriError('Decryption failed — wrong passphrase or corrupted data')
    }
  }

  /**
   * Decrypts V2 format: `%` + hex(IV, 32 chars) + hex(Salt, 32 chars) + base64(encrypted data)
   */
  private decryptV2(payload: string, passphrase: string): string {
    // Minimum: % + 32 (IV) + 32 (Salt) + at least some data
    if (payload.length < 66) {
      throw new InvalidSetupUriError('Setup URI payload is too short to contain valid encrypted data')
    }

    const ivHex = payload.substring(1, 33)
    const saltHex = payload.substring(33, 65)
    const encryptedBase64 = payload.substring(65)

    const iv = this.hexToBuffer(ivHex, 'IV')
    const salt = this.hexToBuffer(saltHex, 'Salt')
    const encryptedData = this.base64Decode(encryptedBase64)

    // Key derivation: SHA-256(passphrase) → PBKDF2 with salt
    const key = this.deriveKeyV2(passphrase, salt)

    return this.decrypt(encryptedData, key, iv)
  }

  /**
   * Decrypts V1 format: JSON array `["base64data", "hexIV", "hexSalt"]`
   */
  private decryptV1(payload: string, passphrase: string): string {
    let parts: string[]
    try {
      const parsed: unknown = JSON.parse(payload)
      if (!Array.isArray(parsed) || parsed.length < 3) {
        throw new Error('Invalid V1 format')
      }
      parts = parsed as string[]
    } catch {
      throw new InvalidSetupUriError('Setup URI V1 format is not a valid JSON array')
    }

    const encryptedBase64 = parts[0]!
    const ivHex = parts[1]!
    const saltHex = parts[2]!

    const iv = this.hexToBuffer(ivHex, 'IV')
    const salt = this.hexToBuffer(saltHex, 'Salt')
    const encryptedData = Buffer.from(encryptedBase64, 'base64')

    // Key derivation: SHA-256(passphrase) → PBKDF2 with salt
    const key = this.deriveKeyV2(passphrase, salt)

    // V1 wraps the plaintext in JSON.stringify, so the result is a JSON string literal
    const decrypted = this.decrypt(encryptedData, key, iv)
    try {
      // V1 JSON.stringify's the input, so we need to JSON.parse the result
      const unwrapped: unknown = JSON.parse(decrypted)
      if (typeof unwrapped === 'string') {
        return unwrapped
      }
      return decrypted
    } catch {
      return decrypted
    }
  }

  /**
   * Converts a hex string to a Buffer.
   */
  private hexToBuffer(hex: string, fieldName: string): Buffer {
    if (!/^[0-9a-fA-F]+$/.test(hex)) {
      throw new InvalidSetupUriError(`Setup URI contains invalid hex encoding in ${fieldName}`)
    }
    return Buffer.from(hex, 'hex')
  }

  /**
   * Decodes a Base64 string to a Buffer.
   */
  private base64Decode(input: string): Buffer {
    try {
      const buffer = Buffer.from(input, 'base64')
      // Verify the input was valid Base64 by re-encoding and comparing
      const reEncoded = buffer.toString('base64')
      // Normalize: Base64 may have padding differences, compare without padding
      const normalizedInput = input.replace(/=+$/, '')
      const normalizedReEncoded = reEncoded.replace(/=+$/, '')
      if (normalizedInput !== normalizedReEncoded) {
        throw new InvalidSetupUriError('Setup URI contains invalid Base64 encoding')
      }
      return buffer
    } catch (err) {
      if (err instanceof InvalidSetupUriError) {
        throw err
      }
      throw new InvalidSetupUriError('Setup URI contains invalid Base64 encoding')
    }
  }

  /**
   * Derives an AES-256 key using the obsidian-livesync V2 method:
   * 1. SHA-256 hash of passphrase (to get raw key material)
   * 2. Import as PBKDF2 key material
   * 3. PBKDF2 with salt, iterations, SHA-256 → AES-256 key
   *
   * The iteration count depends on passphrase length when autoCalculateIterations is true.
   * For Setup-URIs, autoCalculateIterations is false → fixed 100000 iterations.
   */
  private deriveKeyV2(passphrase: string, salt: Buffer): Buffer {
    try {
      // Step 1: SHA-256 hash of passphrase (matches WebCrypto subtle.digest)
      const passphraseHash = crypto.createHash('sha256').update(passphrase, 'utf8').digest()

      // Step 2: PBKDF2 with the hash as password, salt, 100000 iterations
      // autoCalculateIterations=false in generate_setupuri.ts → fixed 100000
      const iterations = 100000
      return crypto.pbkdf2Sync(passphraseHash, salt, iterations, KEY_LENGTH, 'sha256')
    } catch {
      throw new InvalidSetupUriError('Failed to derive key from passphrase')
    }
  }

  /**
   * Decrypts data using AES-256-GCM.
   * The auth tag is appended to the ciphertext by WebCrypto (last 16 bytes).
   */
  private decrypt(encryptedData: Buffer, key: Buffer, iv: Buffer): string {
    try {
      const AUTH_TAG_LENGTH = 16
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
      // The auth tag is the last 16 bytes of the encrypted data
      const authTag = encryptedData.subarray(encryptedData.length - AUTH_TAG_LENGTH)
      const ciphertext = encryptedData.subarray(0, encryptedData.length - AUTH_TAG_LENGTH)
      decipher.setAuthTag(authTag)
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
      return decrypted.toString('utf8')
    } catch {
      throw new InvalidSetupUriError('Decryption failed — wrong passphrase or corrupted data')
    }
  }

  /**
   * Parses a JSON string into a SetupUriPayload.
   */
  private parseJson(json: string): SetupUriPayload {
    try {
      const parsed: unknown = JSON.parse(json)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new InvalidSetupUriError('Decrypted payload is not a valid JSON object')
      }
      return parsed as SetupUriPayload
    } catch (err) {
      if (err instanceof InvalidSetupUriError) {
        throw err
      }
      throw new InvalidSetupUriError('Decrypted payload is not valid JSON')
    }
  }

  /**
   * Extracts and validates SetupUriParams from the parsed payload.
   */
  private extractParams(payload: SetupUriPayload): SetupUriParams {
    const endpoint = payload.couchDB_URI
    const database = payload.couchDB_DBNAME
    const username = payload.couchDB_USER
    const password = payload.couchDB_PASSWORD

    if (typeof endpoint !== 'string' || endpoint.trim().length === 0) {
      throw new InvalidSetupUriError('Setup URI payload is missing required field: couchDB_URI')
    }

    if (typeof database !== 'string' || database.trim().length === 0) {
      throw new InvalidSetupUriError('Setup URI payload is missing required field: couchDB_DBNAME')
    }

    if (typeof username !== 'string' || username.trim().length === 0) {
      throw new InvalidSetupUriError('Setup URI payload is missing required field: couchDB_USER')
    }

    if (typeof password !== 'string' || password.trim().length === 0) {
      throw new InvalidSetupUriError('Setup URI payload is missing required field: couchDB_PASSWORD')
    }

    const e2ePassphrase = payload.passphrase
    const e2eEnabled = typeof e2ePassphrase === 'string' && e2ePassphrase.length > 0

    const result: SetupUriParams = {
      endpoint: endpoint.trim(),
      database: database.trim(),
      username: username.trim(),
      password: password.trim(),
      e2eEnabled,
    }

    if (e2eEnabled) {
      result.e2ePassphrase = e2ePassphrase
    }

    return result
  }
}
