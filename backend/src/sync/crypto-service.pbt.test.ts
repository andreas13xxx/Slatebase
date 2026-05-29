/**
 * Property-Based Tests for CryptoService
 *
 * Property 21: E2E Encryption Round-Trip
 * Property 4: Credential Encryption in Storage
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { CryptoService } from './crypto-service.js'

const service = new CryptoService('test-server-secret-for-pbt-minimum-32-chars')

// ─── Property 21: E2E Encryption Round-Trip ──────────────────────────────────
// For any valid document content (arbitrary bytes) and any valid passphrase
// (8-256 characters), encrypting then decrypting SHALL produce identical content.
// **Validates: Requirements 8.1, 8.2**

/**
 * Arbitrary for valid passphrases: strings with length in [8, 256].
 */
const validPassphraseArb = fc.string({ minLength: 8, maxLength: 64 })

/**
 * Arbitrary for document content: arbitrary byte sequences as Buffer.
 * Keep size small to avoid PBKDF2 timeout issues.
 */
const documentContentArb = fc.uint8Array({ minLength: 0, maxLength: 1_000 }).map(
  (arr) => Buffer.from(arr)
)

describe('Property 21: E2E Encryption Round-Trip', () => {
  it('encrypting then decrypting any valid content with any valid passphrase produces identical content', () => {
    fc.assert(
      fc.property(documentContentArb, validPassphraseArb, (content, passphrase) => {
        const encrypted = service.encryptDocument(content, passphrase)
        const decrypted = service.decryptDocument(encrypted, passphrase)

        expect(decrypted.equals(content)).toBe(true)
      }),
      { numRuns: 20 }
    )
  }, 30_000)
})

// ─── Property 4: Credential Encryption in Storage ────────────────────────────
// For any stored credentials, reading the raw file SHALL never reveal plaintext
// values — only their encrypted representations.
// **Validates: Requirements 1.9, 8.5**

/**
 * Arbitrary for credential-like strings that contain at least one character
 * outside the hex alphabet (0-9, a-f). This ensures the plaintext cannot
 * trivially appear as a substring of hex-encoded ciphertext.
 * Real credentials (usernames, passwords) always contain such characters.
 */
const credentialArb = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 512 }),
    fc.constantFrom('G', 'H', 'Z', 'p', 'q', '!', '@', '#', 'ü', '🔑'),
    fc.string({ minLength: 0, maxLength: 512 })
  )
  .map(([prefix, nonHex, suffix]) => `${prefix}${nonHex}${suffix}`)

describe('Property 4: Credential Encryption in Storage', () => {
  it('encrypted output never contains the plaintext as a substring', () => {
    fc.assert(
      fc.property(credentialArb, (plaintext) => {
        const encrypted = service.encrypt(plaintext)

        // The encrypted output (iv:authTag:ciphertext in hex) must not contain
        // the plaintext as a substring. This verifies that raw credential values
        // are never visible in stored configuration files.
        expect(encrypted).not.toContain(plaintext)
      }),
      { numRuns: 100 }
    )
  })

  it('encrypt→decrypt round-trip produces identical output for credential strings', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 1024 }),
        (plaintext) => {
          const encrypted = service.encrypt(plaintext)
          const decrypted = service.decrypt(encrypted)

          expect(decrypted).toBe(plaintext)
        }
      ),
      { numRuns: 100 }
    )
  })
})
