import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import crypto from 'node:crypto'
import { SetupUriParser } from './setup-uri-parser.js'

// ─── Test Helpers ────────────────────────────────────────────────────────────

/**
 * Encrypts a JSON payload into the obsidian-livesync Setup-URI format.
 * Mirrors the encryption logic used by obsidian-livesync to create valid URIs.
 */
function encryptSetupUri(payload: Record<string, unknown>, passphrase: string): string {
  const json = JSON.stringify(payload)
  const iv = crypto.randomBytes(12)
  const key = crypto.pbkdf2Sync(passphrase, iv, 100000, 32, 'sha256')
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  const combined = Buffer.concat([iv, encrypted, authTag])
  return combined.toString('base64')
}

// ─── Generators ──────────────────────────────────────────────────────────────

/**
 * Generates a valid non-empty trimmed string (no leading/trailing whitespace).
 * The parser trims field values, so we generate pre-trimmed strings to ensure
 * the round-trip comparison is valid.
 */
function nonEmptyTrimmedString(maxLength: number): fc.Arbitrary<string> {
  return fc
    .stringOf(
      fc.char().filter((c) => c.trim().length > 0 && c.charCodeAt(0) > 31),
      { minLength: 1, maxLength }
    )
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Generates a valid endpoint URL (http:// or https:// prefix).
 */
const endpointArb = fc
  .tuple(
    fc.constantFrom('http://', 'https://'),
    nonEmptyTrimmedString(100)
  )
  .map(([protocol, host]) => `${protocol}${host}`)

/**
 * Generates a valid CouchDB database name.
 */
const databaseArb = nonEmptyTrimmedString(50)

/**
 * Generates a valid username.
 */
const usernameArb = nonEmptyTrimmedString(50)

/**
 * Generates a valid password.
 */
const passwordArb = nonEmptyTrimmedString(50)

/**
 * Generates a valid E2E passphrase (8-256 characters).
 */
const e2ePassphraseArb = fc
  .stringOf(
    fc.char().filter((c) => c.charCodeAt(0) > 31),
    { minLength: 8, maxLength: 64 }
  )
  .filter((s) => s.trim().length >= 8)

/**
 * Generates a valid passphrase for URI encryption (non-empty string).
 */
const uriPassphraseArb = fc.string({ minLength: 1, maxLength: 32 })

/**
 * Generates valid SetupUriParams with optional E2E settings.
 */
const setupUriParamsArb = fc.record({
  endpoint: endpointArb,
  database: databaseArb,
  username: usernameArb,
  password: passwordArb,
  e2eEnabled: fc.boolean(),
  e2ePassphrase: fc.option(e2ePassphraseArb, { nil: undefined }),
}).map((params) => {
  // Ensure consistency: if e2eEnabled is true, passphrase must exist
  // If e2eEnabled is false, passphrase should be absent
  if (params.e2eEnabled && !params.e2ePassphrase) {
    return { ...params, e2ePassphrase: 'default-passphrase-12345' }
  }
  if (!params.e2eEnabled) {
    return { ...params, e2ePassphrase: undefined }
  }
  return params
})

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('SetupUriParser — Property-Based Tests', () => {
  const parser = new SetupUriParser()

  /**
   * **Validates: Requirements 1.1**
   *
   * Property 1: Setup-URI Parsing Round-Trip
   * For any valid connection parameters, encoding into Setup-URI format
   * and parsing back SHALL produce the same parameters.
   */
  it('round-trip: encode → parse produces identical parameters', () => {
    fc.assert(
      fc.property(
        setupUriParamsArb,
        uriPassphraseArb,
        (params, passphrase) => {
          // Build the obsidian-livesync payload from params
          const payload: Record<string, unknown> = {
            couchDB_URI: params.endpoint,
            couchDB_DBNAME: params.database,
            couchDB_USER: params.username,
            couchDB_PASSWORD: params.password,
          }

          if (params.e2eEnabled && params.e2ePassphrase) {
            payload['passphrase'] = params.e2ePassphrase
          }

          // Encode into Setup-URI format
          const uri = encryptSetupUri(payload, passphrase)

          // Parse back
          const result = parser.parse(uri, passphrase)

          // Verify round-trip equality
          expect(result.endpoint).toBe(params.endpoint)
          expect(result.database).toBe(params.database)
          expect(result.username).toBe(params.username)
          expect(result.password).toBe(params.password)
          expect(result.e2eEnabled).toBe(params.e2eEnabled)

          if (params.e2eEnabled) {
            expect(result.e2ePassphrase).toBe(params.e2ePassphrase)
          } else {
            expect(result.e2ePassphrase).toBeUndefined()
          }
        }
      ),
      { numRuns: 20 } // PBKDF2 is slow, limit runs
    )
  })
})
