/**
 * Property-Based Tests for SyncService utilities and validation schemas
 *
 * Property 5: Password Masking in API Responses
 * Property 6: Sync Interval Validation
 * Property 22: E2E Passphrase Validation
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { maskPassword } from './sync-service.js'
import { syncIntervalSchema, e2ePassphraseSchema } from './validation.js'

// ─── Property 5: Password Masking in API Responses ───────────────────────────
// Masking replaces all chars with `*` except last 4 (or fully masks if length < 4),
// preserving length.
// **Validates: Requirements 2.1**

describe('Property 5: Password Masking in API Responses', () => {
  it('masked string always has the same length as the original', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 1024 }), (password) => {
        const masked = maskPassword(password)
        expect(masked.length).toBe(password.length)
      }),
      { numRuns: 50 }
    )
  })

  it('passwords with length <= 4 are fully masked (all asterisks)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 4 }), (password) => {
        const masked = maskPassword(password)
        expect(masked).toBe('*'.repeat(password.length))
      }),
      { numRuns: 50 }
    )
  })

  it('passwords with length > 4 have last 4 chars visible and rest masked', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 5, maxLength: 1024 }), (password) => {
        const masked = maskPassword(password)

        // Last 4 characters should match the original
        const lastFour = masked.slice(-4)
        expect(lastFour).toBe(password.slice(-4))

        // All characters before the last 4 should be asterisks
        const maskedPart = masked.slice(0, -4)
        expect(maskedPart).toBe('*'.repeat(password.length - 4))
      }),
      { numRuns: 50 }
    )
  })
})

// ─── Property 6: Sync Interval Validation ────────────────────────────────────
// Accept values in [5, 1440], reject all others.
// **Validates: Requirements 3.2, 3.5, 10.5**

describe('Property 6: Sync Interval Validation', () => {
  it('accepts integer values in [5, 1440]', () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 1440 }), (interval) => {
        const result = syncIntervalSchema.safeParse(interval)
        expect(result.success).toBe(true)
      }),
      { numRuns: 50 }
    )
  })

  it('rejects integer values less than 5', () => {
    fc.assert(
      fc.property(fc.integer({ min: -10000, max: 4 }), (interval) => {
        const result = syncIntervalSchema.safeParse(interval)
        expect(result.success).toBe(false)
      }),
      { numRuns: 50 }
    )
  })

  it('rejects integer values greater than 1440', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1441, max: 100000 }), (interval) => {
        const result = syncIntervalSchema.safeParse(interval)
        expect(result.success).toBe(false)
      }),
      { numRuns: 50 }
    )
  })

  it('rejects non-integer numbers', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 5, max: 1440, noNaN: true, noDefaultInfinity: true })
          .filter((n) => !Number.isInteger(n)),
        (interval) => {
          const result = syncIntervalSchema.safeParse(interval)
          expect(result.success).toBe(false)
        }
      ),
      { numRuns: 50 }
    )
  })
})

// ─── Property 22: E2E Passphrase Validation ──────────────────────────────────
// Accept strings with length [8, 256], reject shorter or longer.
// Note: The schema trims whitespace before length validation, so we test
// with strings that have sufficient non-whitespace content after trimming.
// **Validates: Requirements 8.6, 10.5**

/**
 * Arbitrary for valid passphrases: strings that after trimming have length in [8, 256].
 * We generate a non-whitespace core of 8-256 chars, optionally padded with whitespace.
 */
const validPassphraseArb = fc
  .tuple(
    fc.string({ minLength: 8, maxLength: 256 }),
    fc.string({ minLength: 0, maxLength: 10 }),
    fc.string({ minLength: 0, maxLength: 10 }),
  )
  .map(([core, leadingPad, trailingPad]) => {
    // Ensure the core itself has at least 8 chars after trimming
    const trimmed = core.trim()
    if (trimmed.length < 8) {
      // Pad with non-whitespace to ensure min length
      return 'a'.repeat(8 - trimmed.length) + core
    }
    if (trimmed.length > 256) {
      return trimmed.slice(0, 256)
    }
    return leadingPad + core + trailingPad
  })
  .filter((s) => {
    const trimmed = s.trim()
    return trimmed.length >= 8 && trimmed.length <= 256
  })

describe('Property 22: E2E Passphrase Validation', () => {
  it('accepts strings that after trimming have length in [8, 256]', () => {
    fc.assert(
      fc.property(validPassphraseArb, (passphrase) => {
        const result = e2ePassphraseSchema.safeParse(passphrase)
        expect(result.success).toBe(true)
      }),
      { numRuns: 50 }
    )
  })

  it('rejects strings that after trimming are shorter than 8 characters', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 7 }), (passphrase) => {
        const result = e2ePassphraseSchema.safeParse(passphrase)
        expect(result.success).toBe(false)
      }),
      { numRuns: 50 }
    )
  })

  it('rejects strings longer than 256 characters (even without whitespace)', () => {
    // Generate strings of printable non-whitespace chars longer than 256
    fc.assert(
      fc.property(
        fc.stringOf(fc.char().filter((c) => c.trim().length > 0), { minLength: 257, maxLength: 500 }),
        (passphrase) => {
          const result = e2ePassphraseSchema.safeParse(passphrase)
          expect(result.success).toBe(false)
        }
      ),
      { numRuns: 50 }
    )
  })
})
