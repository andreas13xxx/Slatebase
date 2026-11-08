// Single-use mailed tokens (email verification, password reset).
//
// The raw token has 256 bits of randomness and is only ever sent by mail; the
// user record keeps SHA-256(token) plus an expiry. Nothing to brute-force, so a
// fast hash is appropriate (same reasoning as session tokens).

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { MailTokenRecord } from '../user/index.js'

export const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000

export function hashMailToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createMailToken(
  purpose: MailTokenRecord['purpose'],
  ttlMs: number,
  email?: string,
): { token: string; record: MailTokenRecord } {
  const token = randomBytes(32).toString('base64url')
  const record: MailTokenRecord = {
    purpose,
    hash: hashMailToken(token),
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    ...(email !== undefined ? { email } : {}),
  }
  return { token, record }
}

/** Removes expired tokens and any token of `purpose` (a new token replaces the old one). */
export function withoutStaleTokens(
  tokens: readonly MailTokenRecord[] | undefined,
  replacePurpose?: MailTokenRecord['purpose'],
): MailTokenRecord[] {
  const now = Date.now()
  return (tokens ?? []).filter(
    (t) => Date.parse(t.expiresAt) > now && (replacePurpose === undefined || t.purpose !== replacePurpose),
  )
}

/** Finds a valid, unexpired token of `purpose` matching the raw token (constant-time compare). */
export function findMailToken(
  tokens: readonly MailTokenRecord[] | undefined,
  purpose: MailTokenRecord['purpose'],
  rawToken: string,
): MailTokenRecord | null {
  const wanted = Buffer.from(hashMailToken(rawToken), 'hex')
  const now = Date.now()
  let match: MailTokenRecord | null = null
  for (const t of tokens ?? []) {
    if (t.purpose !== purpose || Date.parse(t.expiresAt) <= now) continue
    const have = Buffer.from(t.hash, 'hex')
    if (have.length === wanted.length && timingSafeEqual(have, wanted)) {
      match = t
    }
  }
  return match
}
