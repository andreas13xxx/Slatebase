import crypto from 'node:crypto'
import { InvalidSetupUriError } from './errors.js'
import type { ISetupUriParser, SetupUriParams } from './types.js'

/** Maximum allowed length for a Setup-URI string. */
const MAX_URI_LENGTH = 4096

/** PBKDF2 iteration count for key derivation. */
const PBKDF2_ITERATIONS = 100000

/** AES-GCM IV length in bytes. */
const IV_LENGTH = 12

/** Derived key length in bytes (AES-256). */
const KEY_LENGTH = 32

/** AES-GCM auth tag length in bytes. */
const AUTH_TAG_LENGTH = 16

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
 * The URI format:
 * 1. Base64-encoded string
 * 2. Decoded bytes: IV (12 bytes) + encrypted data (AES-256-GCM)
 * 3. Key derived from passphrase via PBKDF2 (SHA-256, 100000 iterations, 32 bytes)
 * 4. Decrypted payload is a JSON string with connection parameters
 */
export class SetupUriParser implements ISetupUriParser {
  /**
   * Parses an obsidian-livesync Setup-URI and extracts connection parameters.
   *
   * @param uri - Base64-encoded, AES-GCM-encrypted JSON string
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

    // Step 1: Base64-decode the URI
    const decoded = this.base64Decode(trimmedUri)

    // Step 2: Extract IV and encrypted data
    if (decoded.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new InvalidSetupUriError('Setup URI payload is too short to contain valid encrypted data')
    }

    const iv = decoded.subarray(0, IV_LENGTH)
    const encryptedData = decoded.subarray(IV_LENGTH)

    // Step 3: Derive key from passphrase using PBKDF2
    const key = this.deriveKey(passphrase, iv)

    // Step 4: Decrypt using AES-256-GCM
    const decrypted = this.decrypt(encryptedData, key, iv)

    // Step 5: Parse JSON
    const payload = this.parseJson(decrypted)

    // Step 6: Extract and validate fields
    return this.extractParams(payload)
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
   * Derives an AES-256 key from a passphrase using PBKDF2.
   */
  private deriveKey(passphrase: string, salt: Buffer): Buffer {
    try {
      return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256')
    } catch {
      throw new InvalidSetupUriError('Failed to derive key from passphrase')
    }
  }

  /**
   * Decrypts data using AES-256-GCM.
   */
  private decrypt(encryptedData: Buffer, key: Buffer, iv: Buffer): string {
    try {
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
