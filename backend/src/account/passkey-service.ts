// PasskeyService — WebAuthn registration and login (discoverable credentials).
//
// Each ceremony is bound to the browser-supplied `Origin`, which must be listed in
// allowedOrigins (see origin.ts). A passkey stores the rpId it was created for and
// is only accepted again for that rpId. Only public keys and counters are stored.

import { randomBytes, randomUUID } from 'node:crypto'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { verify } from 'argon2'
import type { IAuditService } from '../audit/index.js'
import type { IAuthService, LoginMeta, LoginResult } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import { KeyedMutex } from '../shared/async-mutex.js'
import { SlidingWindowRateLimiter } from '../shared/sliding-window-rate-limiter.js'
import type { IUserRepository, PasskeyRecord, UserRecord } from '../user/index.js'
import { AccountSuspendedError } from '../user/index.js'
import type { RelyingParty } from './origin.js'

export const MAX_PASSKEYS_PER_USER = 10
const CHALLENGE_TTL_MS = 2 * 60_000
const MAX_PENDING_CHALLENGES = 2000
const RP_NAME = 'Slatebase'

export type PasskeyErrorCode =
  | 'INVALID_PASSWORD'
  | 'PASSKEY_LIMIT'
  | 'CHALLENGE_INVALID'
  | 'REGISTRATION_FAILED'
  | 'DUPLICATE_CREDENTIAL'
  | 'NOT_FOUND'
  | 'LOGIN_FAILED'
  | 'RATE_LIMITED'
  | 'INVALID_NAME'

export class PasskeyError extends Error {
  constructor(
    public readonly code: PasskeyErrorCode,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message)
    this.name = 'PasskeyError'
  }
}

export interface PasskeyInfo {
  id: string
  name: string
  rpId: string
  createdAt: string
  lastUsedAt: string | null
  transports: string[]
}

export interface IPasskeyService {
  list(userId: string): Promise<PasskeyInfo[]>
  beginRegistration(userId: string, password: string, rp: RelyingParty): Promise<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }>
  finishRegistration(userId: string, challengeId: string, response: RegistrationResponseJSON, name: string, rp: RelyingParty, ipAddress: string): Promise<PasskeyInfo>
  rename(userId: string, passkeyId: string, name: string): Promise<PasskeyInfo>
  remove(userId: string, passkeyId: string, ipAddress: string): Promise<void>
  /** Admin action: drop every passkey of an account. */
  removeAll(userId: string, actorId: string, ipAddress: string): Promise<number>
  beginLogin(rp: RelyingParty): Promise<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }>
  finishLogin(challengeId: string, response: AuthenticationResponseJSON, rp: RelyingParty, meta: LoginMeta): Promise<LoginResult>
}

interface PendingChallenge {
  challenge: string
  purpose: 'register' | 'login'
  rpId: string
  origin: string
  userId?: string
  expiresAt: number
}

export interface PasskeyServiceDeps {
  userRepository: IUserRepository
  authService: Pick<IAuthService, 'loginVerifiedUser'>
  logger: ILogger
  auditService?: IAuditService
}

function toInfo(p: PasskeyRecord): PasskeyInfo {
  return {
    id: p.id,
    name: p.name,
    rpId: p.rpId,
    createdAt: p.createdAt,
    lastUsedAt: p.lastUsedAt ?? null,
    transports: p.transports ?? [],
  }
}

function cleanName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length < 1 || trimmed.length > 64) {
    throw new PasskeyError('INVALID_NAME', 'Name must be 1–64 characters')
  }
  return trimmed
}

export class PasskeyService implements IPasskeyService {
  private readonly challenges = new Map<string, PendingChallenge>()
  /** credentialId → userId, for logins without a username. Rebuilt from the user files at startup. */
  private readonly credentialIndex = new Map<string, string>()
  private readonly locks = new KeyedMutex()
  private readonly loginFailuresPerIp = new SlidingWindowRateLimiter(10, 15 * 60_000)
  private readonly registerPerUser = new SlidingWindowRateLimiter(10, 15 * 60_000)

  constructor(private readonly deps: PasskeyServiceDeps) {}

  destroy(): void {
    this.loginFailuresPerIp.destroy()
    this.registerPerUser.destroy()
  }

  /** Builds the credential index from all user records. Call once at startup. */
  async loadIndex(): Promise<void> {
    this.credentialIndex.clear()
    for (let page = 1; ; page++) {
      const result = await this.deps.userRepository.findAll({ page, pageSize: 100 })
      for (const user of result.items) {
        for (const p of user.passkeys ?? []) this.credentialIndex.set(p.credentialId, user.userId)
      }
      if (page >= result.totalPages) break
    }
    this.deps.logger.info('Passkey index loaded', { credentials: this.credentialIndex.size })
  }

  async list(userId: string): Promise<PasskeyInfo[]> {
    const user = await this.requireUser(userId)
    return (user.passkeys ?? []).map(toInfo)
  }

  async beginRegistration(userId: string, password: string, rp: RelyingParty) {
    const limit = this.registerPerUser.checkLimit(userId)
    if (!limit.allowed) throw new PasskeyError('RATE_LIMITED', 'Too many attempts', limit.retryAfter)
    const user = await this.requireUser(userId)
    let valid: boolean
    try {
      valid = await verify(user.passwordHash, password)
    } catch {
      valid = false
    }
    if (!valid) {
      this.registerPerUser.recordRequest(userId)
      throw new PasskeyError('INVALID_PASSWORD', 'Password is incorrect')
    }
    const existing = user.passkeys ?? []
    if (existing.length >= MAX_PASSKEYS_PER_USER) {
      throw new PasskeyError('PASSKEY_LIMIT', `At most ${String(MAX_PASSKEYS_PER_USER)} passkeys per account`)
    }

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: rp.rpId,
      userName: user.username,
      userDisplayName: user.displayName,
      userID: new TextEncoder().encode(user.userId),
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      excludeCredentials: existing
        .filter((p) => p.rpId === rp.rpId)
        .map((p) => ({ id: p.credentialId, ...(p.transports !== undefined ? { transports: p.transports } : {}) })),
    })
    const challengeId = this.storeChallenge({ challenge: options.challenge, purpose: 'register', rpId: rp.rpId, origin: rp.origin, userId })
    return { challengeId, options }
  }

  async finishRegistration(
    userId: string,
    challengeId: string,
    response: RegistrationResponseJSON,
    name: string,
    rp: RelyingParty,
    ipAddress: string,
  ): Promise<PasskeyInfo> {
    const label = cleanName(name)
    const pending = this.takeChallenge(challengeId, 'register', rp)
    if (pending.userId !== userId) throw new PasskeyError('CHALLENGE_INVALID', 'Challenge is invalid or expired')

    let verified
    try {
      verified = await verifyRegistrationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: pending.origin,
        expectedRPID: pending.rpId,
        requireUserVerification: false,
      })
    } catch (err) {
      this.deps.logger.info('Passkey registration rejected', { userId, error: err instanceof Error ? err.message : String(err) })
      throw new PasskeyError('REGISTRATION_FAILED', 'Passkey could not be verified')
    }
    if (!verified.verified) throw new PasskeyError('REGISTRATION_FAILED', 'Passkey could not be verified')

    const { credential } = verified.registrationInfo
    if (this.credentialIndex.has(credential.id)) {
      throw new PasskeyError('DUPLICATE_CREDENTIAL', 'This passkey is already registered')
    }

    const record: PasskeyRecord = {
      id: randomUUID(),
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      ...(response.response.transports !== undefined ? { transports: [...response.response.transports] } : {}),
      rpId: pending.rpId,
      name: label,
      createdAt: new Date().toISOString(),
    }

    await this.locks.runExclusive(userId, async () => {
      const user = await this.requireUser(userId)
      const existing = user.passkeys ?? []
      if (existing.length >= MAX_PASSKEYS_PER_USER) {
        throw new PasskeyError('PASSKEY_LIMIT', `At most ${String(MAX_PASSKEYS_PER_USER)} passkeys per account`)
      }
      await this.deps.userRepository.save({ ...user, passkeys: [...existing, record], updatedAt: new Date().toISOString() })
    })
    this.credentialIndex.set(record.credentialId, userId)
    await this.deps.auditService?.log({ userId, action: 'PASSKEY_REGISTERED', target: record.id, ipAddress, success: true, details: record.rpId })
    return toInfo(record)
  }

  async rename(userId: string, passkeyId: string, name: string): Promise<PasskeyInfo> {
    const label = cleanName(name)
    return this.locks.runExclusive(userId, async () => {
      const user = await this.requireUser(userId)
      const list = user.passkeys ?? []
      const target = list.find((p) => p.id === passkeyId)
      if (target === undefined) throw new PasskeyError('NOT_FOUND', 'Passkey not found')
      const updated = { ...target, name: label }
      await this.deps.userRepository.save({
        ...user,
        passkeys: list.map((p) => (p.id === passkeyId ? updated : p)),
        updatedAt: new Date().toISOString(),
      })
      return toInfo(updated)
    })
  }

  async remove(userId: string, passkeyId: string, ipAddress: string): Promise<void> {
    const removed = await this.locks.runExclusive(userId, async () => {
      const user = await this.requireUser(userId)
      const list = user.passkeys ?? []
      const target = list.find((p) => p.id === passkeyId)
      if (target === undefined) throw new PasskeyError('NOT_FOUND', 'Passkey not found')
      await this.deps.userRepository.save({
        ...user,
        passkeys: list.filter((p) => p.id !== passkeyId),
        updatedAt: new Date().toISOString(),
      })
      return target
    })
    this.credentialIndex.delete(removed.credentialId)
    await this.deps.auditService?.log({ userId, action: 'PASSKEY_REMOVED', target: removed.id, ipAddress, success: true })
  }

  async removeAll(userId: string, actorId: string, ipAddress: string): Promise<number> {
    const removed = await this.locks.runExclusive(userId, async () => {
      const user = await this.requireUser(userId)
      const list = user.passkeys ?? []
      if (list.length > 0) {
        const { passkeys: _dropped, ...rest } = user
        await this.deps.userRepository.save({ ...rest, updatedAt: new Date().toISOString() })
      }
      return list
    })
    for (const p of removed) this.credentialIndex.delete(p.credentialId)
    if (removed.length > 0) {
      await this.deps.auditService?.log({
        userId: actorId,
        action: 'PASSKEY_REMOVED',
        target: userId,
        ipAddress,
        success: true,
        details: `all (${String(removed.length)})`,
      })
    }
    return removed.length
  }

  async beginLogin(rp: RelyingParty) {
    const options = await generateAuthenticationOptions({ rpID: rp.rpId, userVerification: 'preferred' })
    const challengeId = this.storeChallenge({ challenge: options.challenge, purpose: 'login', rpId: rp.rpId, origin: rp.origin })
    return { challengeId, options }
  }

  async finishLogin(challengeId: string, response: AuthenticationResponseJSON, rp: RelyingParty, meta: LoginMeta): Promise<LoginResult> {
    const limit = this.loginFailuresPerIp.checkLimit(meta.ipAddress)
    if (!limit.allowed) throw new PasskeyError('RATE_LIMITED', 'Too many attempts', limit.retryAfter)

    try {
      const pending = this.takeChallenge(challengeId, 'login', rp)
      const userId = this.credentialIndex.get(response.id)
      const user = userId === undefined ? null : await this.deps.userRepository.findById(userId)
      const stored = user?.passkeys?.find((p) => p.credentialId === response.id)
      if (user === null || stored === undefined || stored.rpId !== pending.rpId) {
        throw new Error('unknown credential')
      }

      const verified = await verifyAuthenticationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: pending.origin,
        expectedRPID: pending.rpId,
        requireUserVerification: false,
        credential: {
          id: stored.credentialId,
          publicKey: new Uint8Array(Buffer.from(stored.publicKey, 'base64url')),
          counter: stored.counter,
          ...(stored.transports !== undefined ? { transports: stored.transports } : {}),
        },
      })
      if (!verified.verified) throw new Error('signature not verified')

      const updatedUser = await this.locks.runExclusive(user.userId, async () => {
        const fresh = await this.requireUser(user.userId)
        const next: UserRecord = {
          ...fresh,
          passkeys: (fresh.passkeys ?? []).map((p) =>
            p.id === stored.id ? { ...p, counter: verified.authenticationInfo.newCounter, lastUsedAt: new Date().toISOString() } : p,
          ),
        }
        await this.deps.userRepository.save(next)
        return next
      })
      return await this.deps.authService.loginVerifiedUser(updatedUser, meta)
    } catch (err) {
      if (err instanceof PasskeyError) {
        if (err.code === 'RATE_LIMITED') throw err
      } else if (err instanceof AccountSuspendedError) {
        throw err
      }
      this.loginFailuresPerIp.recordRequest(meta.ipAddress)
      this.deps.logger.info('Passkey login rejected', { error: err instanceof Error ? err.message : String(err) })
      await this.deps.auditService?.log({
        userId: null,
        action: 'PASSKEY_LOGIN_FAILED',
        target: 'passkey',
        ipAddress: meta.ipAddress,
        success: false,
      })
      throw new PasskeyError('LOGIN_FAILED', 'Sign-in failed')
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async requireUser(userId: string): Promise<UserRecord> {
    const user = await this.deps.userRepository.findById(userId)
    if (user === null) throw new PasskeyError('NOT_FOUND', 'User not found')
    return user
  }

  private storeChallenge(entry: Omit<PendingChallenge, 'expiresAt'>): string {
    const now = Date.now()
    if (this.challenges.size >= MAX_PENDING_CHALLENGES) {
      for (const [id, c] of this.challenges) if (c.expiresAt <= now) this.challenges.delete(id)
      if (this.challenges.size >= MAX_PENDING_CHALLENGES) {
        const oldest = this.challenges.keys().next()
        if (oldest.done !== true) this.challenges.delete(oldest.value)
      }
    }
    const id = randomBytes(24).toString('base64url')
    this.challenges.set(id, { ...entry, expiresAt: now + CHALLENGE_TTL_MS })
    return id
  }

  /** Returns and removes a challenge: single use, bound to purpose, origin and rpId. */
  private takeChallenge(id: string, purpose: PendingChallenge['purpose'], rp: RelyingParty): PendingChallenge {
    const entry = this.challenges.get(id)
    this.challenges.delete(id)
    if (entry === undefined || entry.expiresAt <= Date.now() || entry.purpose !== purpose || entry.origin !== rp.origin || entry.rpId !== rp.rpId) {
      throw new PasskeyError('CHALLENGE_INVALID', 'Challenge is invalid or expired')
    }
    return entry
  }
}
