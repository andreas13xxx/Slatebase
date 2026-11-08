// Single-use mailed tokens (email verification, password reset).
//
// The raw token has 256 bits of randomness and is only ever sent by mail; the
// user record keeps a scrypt digest plus an expiry. The token is not guessable,
// so the cost factor is deliberately small (about 10 ms): it exists to keep the
// digest in the same class as other stored credentials, not to slow a brute force.

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import type { ScryptOptions } from 'node:crypto'
import { promisify } from 'node:util'
import type { MailTokenRecord } from '../user/index.js'

export const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000

/** Fixed domain label used as the scrypt salt; the token itself supplies the entropy. */
const TOKEN_DIGEST_SALT = 'slatebase:mail-token:v1'
const SCRYPT_OPTIONS: ScryptOptions = { N: 4096, r: 8, p: 1 }
const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number, options: ScryptOptions) => Promise<Buffer>

export async function hashMailToken(token: string): Promise<string> {
  return (await scryptAsync(token, TOKEN_DIGEST_SALT, 32, SCRYPT_OPTIONS)).toString('hex')
}

export async function createMailToken(
  purpose: MailTokenRecord['purpose'],
  ttlMs: number,
  email?: string,
): Promise<{ token: string; record: MailTokenRecord }> {
  const token = randomBytes(32).toString('base64url')
  const record: MailTokenRecord = {
    purpose,
    hash: await hashMailToken(token),
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
export async function findMailToken(
  tokens: readonly MailTokenRecord[] | undefined,
  purpose: MailTokenRecord['purpose'],
  rawToken: string,
): Promise<MailTokenRecord | null> {
  const wanted = Buffer.from(await hashMailToken(rawToken), 'hex')
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
