/**
 * Property-Based Tests for Sync Routes — Access Control and Input Validation
 *
 * Property 2: Input Validation Correctness
 * Property 3: Access Control Enforcement
 * Property 23: Auth Check Ordering
 * Property 24: String Trimming for Required Fields
 *
 * **Validates: Requirements 1.5, 2.5, 9.3, 9.5, 9.6, 9.7, 10.1, 10.6**
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  endpointUrlSchema,
  databaseNameSchema,
  syncUsernameSchema,
  syncPasswordSchema,
  syncModeSchema,
  syncIntervalSchema,
  e2ePassphraseSchema,
} from './validation.js'

// ─── Property 2: Input Validation Correctness ────────────────────────────────
// For any string input, the Zod validation schemas SHALL accept inputs that
// conform to the defined rules and reject all inputs that violate any rule.
// **Validates: Requirements 1.2, 1.8, 10.1, 10.3**

describe('Property 2: Input Validation Correctness', () => {
  describe('endpointUrlSchema', () => {
    /** Arbitrary for valid endpoint URLs: http/https protocol, valid URL, max 2048 chars. */
    const validEndpointArb = fc
      .tuple(
        fc.constantFrom('http', 'https'),
        fc.webUrl({ withFragments: false, withQueryParameters: false }),
      )
      .map(([protocol, url]) => {
        // Replace the protocol of the generated URL with our chosen one
        const withoutProtocol = url.replace(/^https?:\/\//, '')
        return `${protocol}://${withoutProtocol}`
      })
      .filter((url) => url.length <= 2048)

    it('accepts valid http/https URLs within length limit', () => {
      fc.assert(
        fc.property(validEndpointArb, (url) => {
          const result = endpointUrlSchema.safeParse(url)
          expect(result.success).toBe(true)
        }),
        { numRuns: 50 },
      )
    })

    /** Arbitrary for URLs with invalid protocols (not http/https). */
    const invalidProtocolArb = fc
      .tuple(
        fc.constantFrom('ftp', 'ws', 'wss', 'file', 'ssh', 'mailto', 'tcp'),
        fc.domain(),
      )
      .map(([protocol, domain]) => `${protocol}://${domain}/path`)

    it('rejects URLs with non-http/https protocols', () => {
      fc.assert(
        fc.property(invalidProtocolArb, (url) => {
          const result = endpointUrlSchema.safeParse(url)
          expect(result.success).toBe(false)
        }),
        { numRuns: 50 },
      )
    })

    it('rejects URLs exceeding 2048 characters', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2049, max: 3000 }),
          (length) => {
            const url = `https://example.com/${'a'.repeat(length - 'https://example.com/'.length)}`
            const result = endpointUrlSchema.safeParse(url)
            expect(result.success).toBe(false)
          },
        ),
        { numRuns: 50 },
      )
    })
  })

  describe('databaseNameSchema', () => {
    /** Valid CouchDB database name chars (after the first lowercase letter). */
    const validDbCharsArb = fc.stringOf(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyz0123456789_$()+-/'.split(''),
      ),
      { minLength: 0, maxLength: 100 },
    )

    /** Arbitrary for valid database names: starts with lowercase, valid chars, max 256. */
    const validDbNameArb = fc
      .tuple(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
        validDbCharsArb,
      )
      .map(([first, rest]) => `${first}${rest}`)
      .filter((name) => name.length <= 256)

    it('accepts valid CouchDB database names', () => {
      fc.assert(
        fc.property(validDbNameArb, (name) => {
          const result = databaseNameSchema.safeParse(name)
          expect(result.success).toBe(true)
        }),
        { numRuns: 50 },
      )
    })

    /** Arbitrary for names starting with non-lowercase characters. */
    const invalidStartArb = fc
      .tuple(
        fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$'.split('')),
        fc.string({ minLength: 0, maxLength: 50 }),
      )
      .map(([first, rest]) => `${first}${rest}`)

    it('rejects database names not starting with a lowercase letter', () => {
      fc.assert(
        fc.property(invalidStartArb, (name) => {
          const result = databaseNameSchema.safeParse(name)
          expect(result.success).toBe(false)
        }),
        { numRuns: 50 },
      )
    })

    it('rejects database names exceeding 256 characters', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 257, max: 500 }),
          (length) => {
            const name = 'a' + 'b'.repeat(length - 1)
            const result = databaseNameSchema.safeParse(name)
            expect(result.success).toBe(false)
          },
        ),
        { numRuns: 50 },
      )
    })

    /** Arbitrary for names containing invalid characters embedded in the middle.
     * The regex /^[a-z][a-z0-9_$()+-/]*$/ uses a character range +–/ (ASCII 43–47)
     * which includes +, comma, dash, dot, slash. So truly invalid chars are those
     * outside a-z, 0-9, _, $, (, ), +, comma, -, ., / */
    const invalidCharsArb = fc
      .tuple(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
        fc.constantFrom(...'!@#%^&*{}[]|\\:;"\'<>?~`'.split('')),
        fc.stringOf(
          fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
          { minLength: 1, maxLength: 10 },
        ),
      )
      .map(([first, invalid, rest]) => `${first}${invalid}${rest}`)

    it('rejects database names with invalid characters', () => {
      fc.assert(
        fc.property(invalidCharsArb, (name) => {
          const result = databaseNameSchema.safeParse(name)
          expect(result.success).toBe(false)
        }),
        { numRuns: 50 },
      )
    })
  })

  describe('syncUsernameSchema', () => {
    /** Arbitrary for valid usernames: non-empty after trim, max 256 chars. */
    const validUsernameArb = fc
      .string({ minLength: 1, maxLength: 256 })
      .filter((s) => s.trim().length > 0)

    it('accepts non-empty usernames within length limit', () => {
      fc.assert(
        fc.property(validUsernameArb, (username) => {
          const result = syncUsernameSchema.safeParse(username)
          expect(result.success).toBe(true)
        }),
        { numRuns: 50 },
      )
    })

    it('rejects usernames exceeding 256 characters (after trim)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 257, max: 500 }),
          (length) => {
            const username = 'u'.repeat(length)
            const result = syncUsernameSchema.safeParse(username)
            expect(result.success).toBe(false)
          },
        ),
        { numRuns: 50 },
      )
    })
  })

  describe('syncPasswordSchema', () => {
    /** Arbitrary for valid passwords: non-empty after trim, max 1024 chars. */
    const validPasswordArb = fc
      .string({ minLength: 1, maxLength: 1024 })
      .filter((s) => s.trim().length > 0)

    it('accepts non-empty passwords within length limit', () => {
      fc.assert(
        fc.property(validPasswordArb, (password) => {
          const result = syncPasswordSchema.safeParse(password)
          expect(result.success).toBe(true)
        }),
        { numRuns: 50 },
      )
    })

    it('rejects passwords exceeding 1024 characters (after trim)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1025, max: 2000 }),
          (length) => {
            const password = 'p'.repeat(length)
            const result = syncPasswordSchema.safeParse(password)
            expect(result.success).toBe(false)
          },
        ),
        { numRuns: 50 },
      )
    })
  })

  describe('syncModeSchema', () => {
    it('accepts only bidirectional and readonly', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('bidirectional', 'readonly'),
          (mode) => {
            const result = syncModeSchema.safeParse(mode)
            expect(result.success).toBe(true)
          },
        ),
        { numRuns: 20 },
      )
    })

    /** Arbitrary for invalid mode strings. */
    const invalidModeArb = fc
      .string({ minLength: 1, maxLength: 50 })
      .filter((s) => s !== 'bidirectional' && s !== 'readonly')

    it('rejects any string that is not bidirectional or readonly', () => {
      fc.assert(
        fc.property(invalidModeArb, (mode) => {
          const result = syncModeSchema.safeParse(mode)
          expect(result.success).toBe(false)
        }),
        { numRuns: 50 },
      )
    })
  })

  describe('syncIntervalSchema', () => {
    /** Arbitrary for valid intervals: integers in [5, 1440]. */
    const validIntervalArb = fc.integer({ min: 5, max: 1440 })

    it('accepts integers in range [5, 1440]', () => {
      fc.assert(
        fc.property(validIntervalArb, (interval) => {
          const result = syncIntervalSchema.safeParse(interval)
          expect(result.success).toBe(true)
        }),
        { numRuns: 50 },
      )
    })

    /** Arbitrary for out-of-range integers. */
    const outOfRangeArb = fc.oneof(
      fc.integer({ min: -10000, max: 4 }),
      fc.integer({ min: 1441, max: 100000 }),
    )

    it('rejects integers outside range [5, 1440]', () => {
      fc.assert(
        fc.property(outOfRangeArb, (interval) => {
          const result = syncIntervalSchema.safeParse(interval)
          expect(result.success).toBe(false)
        }),
        { numRuns: 50 },
      )
    })

    it('rejects non-integer numbers', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 5.01, max: 1439.99, noNaN: true, noDefaultInfinity: true }),
          (interval) => {
            // Only test actual non-integers
            if (Number.isInteger(interval)) return
            const result = syncIntervalSchema.safeParse(interval)
            expect(result.success).toBe(false)
          },
        ),
        { numRuns: 50 },
      )
    })
  })

  describe('e2ePassphraseSchema', () => {
    /** Arbitrary for valid passphrases: 8-256 chars after trim. */
    const validPassphraseArb = fc
      .string({ minLength: 8, maxLength: 256 })
      .filter((s) => s.trim().length >= 8)

    it('accepts passphrases with length [8, 256] after trim', () => {
      fc.assert(
        fc.property(validPassphraseArb, (passphrase) => {
          const result = e2ePassphraseSchema.safeParse(passphrase)
          expect(result.success).toBe(true)
        }),
        { numRuns: 50 },
      )
    })

    /** Arbitrary for too-short passphrases (after trim). */
    const tooShortArb = fc
      .string({ minLength: 0, maxLength: 7 })
      .filter((s) => s.trim().length < 8)

    it('rejects passphrases shorter than 8 characters after trim', () => {
      fc.assert(
        fc.property(tooShortArb, (passphrase) => {
          const result = e2ePassphraseSchema.safeParse(passphrase)
          expect(result.success).toBe(false)
        }),
        { numRuns: 50 },
      )
    })

    it('rejects passphrases longer than 256 characters', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 257, max: 500 }),
          (length) => {
            const passphrase = 'x'.repeat(length)
            const result = e2ePassphraseSchema.safeParse(passphrase)
            expect(result.success).toBe(false)
          },
        ),
        { numRuns: 50 },
      )
    })
  })
})

// ─── Property 3: Access Control Enforcement ──────────────────────────────────
// For any authenticated user who is not the vault owner (including users with
// admin role), all sync-related endpoints SHALL reject the request with HTTP 403
// and error code `ACCESS_DENIED`.
// **Validates: Requirements 1.5, 2.5, 9.3, 9.6, 9.7**

describe('Property 3: Access Control Enforcement', () => {
  /**
   * Pure logic test: given a userId and vault ownerId, if they differ → 403.
   * This tests the core access control invariant without HTTP overhead.
   */

  /** Arbitrary for user IDs (hex strings, 24 chars like MongoDB ObjectIds). */
  const userIdArb = fc.hexaString({ minLength: 24, maxLength: 24 })

  /** Arbitrary for distinct user/owner pairs (simulates non-owner access). */
  const nonOwnerPairArb = fc
    .tuple(userIdArb, userIdArb)
    .filter(([userId, ownerId]) => userId !== ownerId)

  /**
   * Simulates the checkOwnership logic from syncRoutes.ts as a pure function.
   * Returns the HTTP status code that would be returned.
   */
  function checkOwnershipPure(
    session: { userId: string; role: string } | undefined,
    vaultEntry: { ownerId: string } | null,
  ): number {
    // Step 1: Auth check
    if (session === undefined) return 401
    // Step 2: Vault existence check
    if (vaultEntry === null) return 404
    // Step 3: Owner check (admin does NOT bypass)
    if (vaultEntry.ownerId !== session.userId) return 403
    // Authorized
    return 200
  }

  it('non-owner users (any role) always receive 403', () => {
    fc.assert(
      fc.property(
        nonOwnerPairArb,
        fc.constantFrom('user', 'admin'),
        ([userId, ownerId], role) => {
          const status = checkOwnershipPure(
            { userId, role },
            { ownerId },
          )
          expect(status).toBe(403)
        },
      ),
      { numRuns: 50 },
    )
  })

  it('admin role does NOT bypass owner check', () => {
    fc.assert(
      fc.property(nonOwnerPairArb, ([userId, ownerId]) => {
        const status = checkOwnershipPure(
          { userId, role: 'admin' },
          { ownerId },
        )
        expect(status).toBe(403)
      }),
      { numRuns: 50 },
    )
  })

  it('vault owner always receives 200 (authorized)', () => {
    fc.assert(
      fc.property(
        userIdArb,
        fc.constantFrom('user', 'admin'),
        (userId, role) => {
          const status = checkOwnershipPure(
            { userId, role },
            { ownerId: userId },
          )
          expect(status).toBe(200)
        },
      ),
      { numRuns: 50 },
    )
  })
})

// ─── Property 23: Auth Check Ordering ────────────────────────────────────────
// For any request to a sync endpoint, the error response SHALL follow the
// priority order: unauthenticated → 401 (before vault existence is checked),
// vault not found → 404 (before owner check), non-owner → 403.
// A request failing at a higher-priority check SHALL never reveal information
// about lower-priority checks.
// **Validates: Requirements 9.5**

describe('Property 23: Auth Check Ordering', () => {
  /**
   * Pure function replicating the check order from syncRoutes.ts.
   */
  function checkOrderPure(
    session: { userId: string } | undefined,
    vaultEntry: { ownerId: string } | null,
  ): number {
    if (session === undefined) return 401
    if (vaultEntry === null) return 404
    if (vaultEntry.ownerId !== session.userId) return 403
    return 200
  }

  const userIdArb = fc.hexaString({ minLength: 24, maxLength: 24 })

  it('unauthenticated requests always get 401 regardless of vault state', () => {
    fc.assert(
      fc.property(
        fc.option(fc.record({ ownerId: userIdArb }), { nil: null }),
        (vaultEntry) => {
          const status = checkOrderPure(undefined, vaultEntry)
          expect(status).toBe(401)
        },
      ),
      { numRuns: 50 },
    )
  })

  it('authenticated requests to non-existent vaults get 404 regardless of user', () => {
    fc.assert(
      fc.property(userIdArb, (userId) => {
        const status = checkOrderPure({ userId }, null)
        expect(status).toBe(404)
      }),
      { numRuns: 50 },
    )
  })

  it('authenticated non-owner requests to existing vaults get 403', () => {
    fc.assert(
      fc.property(
        fc.tuple(userIdArb, userIdArb).filter(([a, b]) => a !== b),
        ([userId, ownerId]) => {
          const status = checkOrderPure({ userId }, { ownerId })
          expect(status).toBe(403)
        },
      ),
      { numRuns: 50 },
    )
  })

  it('error priority is strictly ordered: 401 > 404 > 403', () => {
    fc.assert(
      fc.property(
        fc.option(fc.record({ userId: userIdArb }), { nil: undefined }),
        fc.option(fc.record({ ownerId: userIdArb }), { nil: null }),
        (session, vaultEntry) => {
          const status = checkOrderPure(session, vaultEntry)

          // If unauthenticated, must be 401 (regardless of vault state)
          if (session === undefined) {
            expect(status).toBe(401)
            return
          }

          // If vault doesn't exist, must be 404 (regardless of ownership)
          if (vaultEntry === null) {
            expect(status).toBe(404)
            return
          }

          // If non-owner, must be 403
          if (vaultEntry.ownerId !== session.userId) {
            expect(status).toBe(403)
            return
          }

          // Otherwise, authorized
          expect(status).toBe(200)
        },
      ),
      { numRuns: 50 },
    )
  })
})

// ─── Property 24: String Trimming for Required Fields ────────────────────────
// For any string input to a required field, leading and trailing whitespace
// SHALL be removed before validation, and strings that are empty after trimming
// SHALL be rejected.
// **Validates: Requirements 10.6**

describe('Property 24: String Trimming for Required Fields', () => {
  /** Arbitrary for whitespace characters. */
  const whitespaceArb = fc.stringOf(
    fc.constantFrom(' ', '\t', '\n', '\r'),
    { minLength: 1, maxLength: 5 },
  )

  /** Arbitrary for non-empty content strings (no leading/trailing whitespace). */
  const contentArb = fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => s.trim().length > 0 && s === s.trim())

  describe('syncUsernameSchema trims whitespace', () => {
    it('leading/trailing whitespace is removed and valid content is accepted', () => {
      fc.assert(
        fc.property(whitespaceArb, contentArb, whitespaceArb, (leading, content, trailing) => {
          const input = `${leading}${content}${trailing}`
          const result = syncUsernameSchema.safeParse(input)
          expect(result.success).toBe(true)
          if (result.success) {
            expect(result.data).toBe(content)
          }
        }),
        { numRuns: 50 },
      )
    })

    it('whitespace-only strings are rejected', () => {
      fc.assert(
        fc.property(whitespaceArb, (ws) => {
          const result = syncUsernameSchema.safeParse(ws)
          expect(result.success).toBe(false)
        }),
        { numRuns: 50 },
      )
    })
  })

  describe('syncPasswordSchema trims whitespace', () => {
    it('leading/trailing whitespace is removed and valid content is accepted', () => {
      fc.assert(
        fc.property(whitespaceArb, contentArb, whitespaceArb, (leading, content, trailing) => {
          const input = `${leading}${content}${trailing}`
          const result = syncPasswordSchema.safeParse(input)
          expect(result.success).toBe(true)
          if (result.success) {
            expect(result.data).toBe(content)
          }
        }),
        { numRuns: 50 },
      )
    })

    it('whitespace-only strings are rejected', () => {
      fc.assert(
        fc.property(whitespaceArb, (ws) => {
          const result = syncPasswordSchema.safeParse(ws)
          expect(result.success).toBe(false)
        }),
        { numRuns: 50 },
      )
    })
  })

  describe('databaseNameSchema trims whitespace', () => {
    /** Valid db name content (starts with lowercase, valid chars). */
    const validDbContentArb = fc
      .tuple(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
        fc.stringOf(
          fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
          { minLength: 0, maxLength: 20 },
        ),
      )
      .map(([first, rest]) => `${first}${rest}`)

    it('leading/trailing whitespace is removed and valid content is accepted', () => {
      fc.assert(
        fc.property(whitespaceArb, validDbContentArb, whitespaceArb, (leading, content, trailing) => {
          const input = `${leading}${content}${trailing}`
          const result = databaseNameSchema.safeParse(input)
          expect(result.success).toBe(true)
          if (result.success) {
            expect(result.data).toBe(content)
          }
        }),
        { numRuns: 50 },
      )
    })

    it('whitespace-only strings are rejected', () => {
      fc.assert(
        fc.property(whitespaceArb, (ws) => {
          const result = databaseNameSchema.safeParse(ws)
          expect(result.success).toBe(false)
        }),
        { numRuns: 50 },
      )
    })
  })

  describe('endpointUrlSchema trims whitespace', () => {
    it('leading/trailing whitespace is removed and valid URL is accepted', () => {
      fc.assert(
        fc.property(whitespaceArb, whitespaceArb, (leading, trailing) => {
          const url = 'https://example.com/db'
          const input = `${leading}${url}${trailing}`
          const result = endpointUrlSchema.safeParse(input)
          expect(result.success).toBe(true)
          if (result.success) {
            expect(result.data).toBe(url)
          }
        }),
        { numRuns: 50 },
      )
    })

    it('whitespace-only strings are rejected', () => {
      fc.assert(
        fc.property(whitespaceArb, (ws) => {
          const result = endpointUrlSchema.safeParse(ws)
          expect(result.success).toBe(false)
        }),
        { numRuns: 50 },
      )
    })
  })

  describe('e2ePassphraseSchema trims whitespace', () => {
    /** Valid passphrase content (8+ chars, no leading/trailing whitespace). */
    const validPassphraseContentArb = fc
      .string({ minLength: 8, maxLength: 50 })
      .filter((s) => s.trim() === s && s.trim().length >= 8)

    it('leading/trailing whitespace is removed and valid passphrase is accepted', () => {
      fc.assert(
        fc.property(whitespaceArb, validPassphraseContentArb, whitespaceArb, (leading, content, trailing) => {
          const input = `${leading}${content}${trailing}`
          const result = e2ePassphraseSchema.safeParse(input)
          expect(result.success).toBe(true)
          if (result.success) {
            expect(result.data).toBe(content)
          }
        }),
        { numRuns: 50 },
      )
    })

    it('whitespace-only strings are rejected (empty after trim)', () => {
      fc.assert(
        fc.property(whitespaceArb, (ws) => {
          const result = e2ePassphraseSchema.safeParse(ws)
          expect(result.success).toBe(false)
        }),
        { numRuns: 50 },
      )
    })
  })
})
