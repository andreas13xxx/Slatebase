import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { SetupUriParser } from './setup-uri-parser.js'
import { InvalidSetupUriError } from './errors.js'

// ─── Test Helpers ────────────────────────────────────────────────────────────

/**
 * Encrypts a JSON payload into the obsidian-livesync V2 Setup-URI format.
 * Format: `%` + hex(IV, 16 bytes) + hex(Salt, 16 bytes) + base64(encrypted data)
 *
 * Key derivation matches octagonal-wheels:
 * 1. SHA-256(passphrase) → digest
 * 2. PBKDF2(digest, salt, 100000, 32, SHA-256) → AES-256-GCM key
 */
function encryptSetupUriV2(payload: Record<string, unknown>, passphrase: string): string {
  const json = JSON.stringify(payload)
  const iv = crypto.randomBytes(16)
  const salt = crypto.randomBytes(16)

  // Key derivation: SHA-256(passphrase) → PBKDF2
  const passphraseHash = crypto.createHash('sha256').update(passphrase, 'utf8').digest()
  const key = crypto.pbkdf2Sync(passphraseHash, salt, 100000, 32, 'sha256')

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  const encryptedWithTag = Buffer.concat([encrypted, authTag])

  // V2 format: % + hex(iv) + hex(salt) + base64(encrypted+authTag)
  return `%${iv.toString('hex')}${salt.toString('hex')}${encryptedWithTag.toString('base64')}`
}

/**
 * Encrypts a raw string (not JSON-wrapped) into V2 format for testing decryption of non-JSON content.
 */
function encryptRawStringV2(content: string, passphrase: string): string {
  const iv = crypto.randomBytes(16)
  const salt = crypto.randomBytes(16)

  const passphraseHash = crypto.createHash('sha256').update(passphrase, 'utf8').digest()
  const key = crypto.pbkdf2Sync(passphraseHash, salt, 100000, 32, 'sha256')

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(content, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  const encryptedWithTag = Buffer.concat([encrypted, authTag])

  return `%${iv.toString('hex')}${salt.toString('hex')}${encryptedWithTag.toString('base64')}`
}

const validPayload = {
  couchDB_URI: 'https://couch.example.com',
  couchDB_DBNAME: 'mydb',
  couchDB_USER: 'admin',
  couchDB_PASSWORD: 'secret123',
  passphrase: 'e2e-passphrase',
  useDynamicIterationCount: false,
}

const passphrase = 'test-passphrase'

// ─── SetupUriParser ──────────────────────────────────────────────────────────

describe('SetupUriParser', () => {
  const parser = new SetupUriParser()

  describe('successful parsing', () => {
    it('parses a valid V2 URI with all fields', () => {
      const uri = encryptSetupUriV2(validPayload, passphrase)
      const result = parser.parse(uri, passphrase)

      expect(result.endpoint).toBe('https://couch.example.com')
      expect(result.database).toBe('mydb')
      expect(result.username).toBe('admin')
      expect(result.password).toBe('secret123')
      expect(result.e2eEnabled).toBe(true)
      expect(result.e2ePassphrase).toBe('e2e-passphrase')
    })

    it('parses a valid URI without E2E passphrase', () => {
      const payload = {
        couchDB_URI: 'http://localhost:5984',
        couchDB_DBNAME: 'testdb',
        couchDB_USER: 'user',
        couchDB_PASSWORD: 'pass',
      }
      const uri = encryptSetupUriV2(payload, passphrase)
      const result = parser.parse(uri, passphrase)

      expect(result.endpoint).toBe('http://localhost:5984')
      expect(result.database).toBe('testdb')
      expect(result.username).toBe('user')
      expect(result.password).toBe('pass')
      expect(result.e2eEnabled).toBe(false)
      expect(result.e2ePassphrase).toBeUndefined()
    })

    it('trims whitespace from the URI before parsing', () => {
      const uri = encryptSetupUriV2(validPayload, passphrase)
      const result = parser.parse(`  ${uri}  `, passphrase)

      expect(result.endpoint).toBe('https://couch.example.com')
    })

    it('trims whitespace from extracted field values', () => {
      const payload = {
        couchDB_URI: '  https://couch.example.com  ',
        couchDB_DBNAME: '  mydb  ',
        couchDB_USER: '  admin  ',
        couchDB_PASSWORD: '  secret  ',
      }
      const uri = encryptSetupUriV2(payload, passphrase)
      const result = parser.parse(uri, passphrase)

      expect(result.endpoint).toBe('https://couch.example.com')
      expect(result.database).toBe('mydb')
      expect(result.username).toBe('admin')
      expect(result.password).toBe('secret')
    })

    it('parses a full obsidian:// URI with URL-encoded V2 payload', () => {
      const encrypted = encryptSetupUriV2(validPayload, passphrase)
      const fullUri = `obsidian://setuplivesync?settings=${encodeURIComponent(encrypted)}`
      const result = parser.parse(fullUri, passphrase)

      expect(result.endpoint).toBe('https://couch.example.com')
      expect(result.database).toBe('mydb')
    })

    it('handles %$ prefix variant (HKDF ephemeral salt format)', () => {
      // %$ format: Base64(PBKDF2_Salt[32] + IV[12] + HKDF_Salt[32] + encrypted data)
      const pbkdf2Salt = crypto.randomBytes(32)
      const iv = crypto.randomBytes(12)
      const hkdfSalt = crypto.randomBytes(32)

      // Key derivation: PBKDF2 → HKDF
      const masterKey = crypto.pbkdf2Sync(Buffer.from(passphrase, 'utf8'), pbkdf2Salt, 310000, 32, 'sha256')
      const chunkKey = Buffer.from(crypto.hkdfSync('sha256', masterKey, hkdfSalt, Buffer.alloc(0), 32))

      const json = JSON.stringify(validPayload)
      const cipher = crypto.createCipheriv('aes-256-gcm', chunkKey, iv)
      const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
      const authTag = cipher.getAuthTag()
      const combined = Buffer.concat([pbkdf2Salt, iv, hkdfSalt, encrypted, authTag])
      const binaryPayload = '%$' + combined.toString('base64')
      const fullUri = `obsidian://setuplivesync?settings=${encodeURIComponent(binaryPayload)}`
      const result = parser.parse(fullUri, passphrase)

      expect(result.endpoint).toBe('https://couch.example.com')
      expect(result.database).toBe('mydb')
    })
  })

  describe('URI length validation', () => {
    it('rejects URI exceeding 16384 characters', () => {
      const longUri = '%' + 'a'.repeat(16384)
      expect(() => parser.parse(longUri, passphrase)).toThrow(InvalidSetupUriError)
      expect(() => parser.parse(longUri, passphrase)).toThrow(/exceeds maximum length/)
    })

    it('rejects empty URI', () => {
      expect(() => parser.parse('', passphrase)).toThrow(InvalidSetupUriError)
      expect(() => parser.parse('', passphrase)).toThrow(/must not be empty/)
    })

    it('rejects whitespace-only URI', () => {
      expect(() => parser.parse('   ', passphrase)).toThrow(InvalidSetupUriError)
      expect(() => parser.parse('   ', passphrase)).toThrow(/must not be empty/)
    })
  })

  describe('format validation', () => {
    it('rejects unrecognized format (no %$, % or [ prefix)', () => {
      expect(() => parser.parse('abcdef1234567890', passphrase)).toThrow(InvalidSetupUriError)
      expect(() => parser.parse('abcdef1234567890', passphrase)).toThrow(/unrecognized encryption format/)
    })

    it('rejects too-short V2 payload', () => {
      expect(() => parser.parse('%abcd', passphrase)).toThrow(InvalidSetupUriError)
      expect(() => parser.parse('%abcd', passphrase)).toThrow(/too short/)
    })
  })

  describe('decryption failure', () => {
    it('rejects wrong passphrase', () => {
      const uri = encryptSetupUriV2(validPayload, passphrase)
      expect(() => parser.parse(uri, 'wrong-passphrase')).toThrow(InvalidSetupUriError)
      expect(() => parser.parse(uri, 'wrong-passphrase')).toThrow(/Decryption failed/)
    })
  })

  describe('invalid JSON after decryption', () => {
    it('rejects non-JSON decrypted content', () => {
      const uri = encryptRawStringV2('this is not json', passphrase)
      expect(() => parser.parse(uri, passphrase)).toThrow(InvalidSetupUriError)
      expect(() => parser.parse(uri, passphrase)).toThrow(/not valid JSON/)
    })

    it('rejects JSON array after decryption', () => {
      const uri = encryptRawStringV2('[1, 2, 3]', passphrase)
      expect(() => parser.parse(uri, passphrase)).toThrow(InvalidSetupUriError)
      expect(() => parser.parse(uri, passphrase)).toThrow(/not a valid JSON object/)
    })
  })

  describe('missing required fields', () => {
    it('rejects payload missing couchDB_URI', () => {
      const payload = {
        couchDB_DBNAME: 'mydb',
        couchDB_USER: 'admin',
        couchDB_PASSWORD: 'secret',
      }
      const uri = encryptSetupUriV2(payload, passphrase)
      expect(() => parser.parse(uri, passphrase)).toThrow(InvalidSetupUriError)
      expect(() => parser.parse(uri, passphrase)).toThrow(/couchDB_URI/)
    })

    it('rejects payload missing couchDB_DBNAME', () => {
      const payload = {
        couchDB_URI: 'https://example.com',
        couchDB_USER: 'admin',
        couchDB_PASSWORD: 'secret',
      }
      const uri = encryptSetupUriV2(payload, passphrase)
      expect(() => parser.parse(uri, passphrase)).toThrow(InvalidSetupUriError)
      expect(() => parser.parse(uri, passphrase)).toThrow(/couchDB_DBNAME/)
    })

    it('rejects payload missing couchDB_USER', () => {
      const payload = {
        couchDB_URI: 'https://example.com',
        couchDB_DBNAME: 'mydb',
        couchDB_PASSWORD: 'secret',
      }
      const uri = encryptSetupUriV2(payload, passphrase)
      expect(() => parser.parse(uri, passphrase)).toThrow(InvalidSetupUriError)
      expect(() => parser.parse(uri, passphrase)).toThrow(/couchDB_USER/)
    })

    it('rejects payload missing couchDB_PASSWORD', () => {
      const payload = {
        couchDB_URI: 'https://example.com',
        couchDB_DBNAME: 'mydb',
        couchDB_USER: 'admin',
      }
      const uri = encryptSetupUriV2(payload, passphrase)
      expect(() => parser.parse(uri, passphrase)).toThrow(InvalidSetupUriError)
      expect(() => parser.parse(uri, passphrase)).toThrow(/couchDB_PASSWORD/)
    })

    it('rejects payload with empty couchDB_URI', () => {
      const payload = {
        couchDB_URI: '   ',
        couchDB_DBNAME: 'mydb',
        couchDB_USER: 'admin',
        couchDB_PASSWORD: 'secret',
      }
      const uri = encryptSetupUriV2(payload, passphrase)
      expect(() => parser.parse(uri, passphrase)).toThrow(InvalidSetupUriError)
      expect(() => parser.parse(uri, passphrase)).toThrow(/couchDB_URI/)
    })
  })
})
