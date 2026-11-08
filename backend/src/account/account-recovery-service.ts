// AccountRecoveryService — mail-address confirmation and password reset by mail.
//
// Security properties (see .kiro/specs/passkeys/requirements.md §4–5):
//  - mail goes only to addresses the user has confirmed;
//  - tokens are single-use, hashed at rest, and expire (24 h verify / 30 min reset);
//  - link base comes from configuration (allowedOrigins), never from the request;
//  - the reset request answers identically whether or not an account matches;
//  - a successful reset ends every session of the account; passkeys stay.

import { hash, verify } from 'argon2'
import type { IAuditService } from '../audit/index.js'
import type { IAuthService } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import { KeyedMutex } from '../shared/async-mutex.js'
import { SlidingWindowRateLimiter } from '../shared/sliding-window-rate-limiter.js'
import type { IUserRepository, UserRecord } from '../user/index.js'
import { ARGON2_OPTIONS, assertValidPassword } from '../user/index.js'
import { isPlainEmailAddress } from './email-address.js'
import type { IMailService } from './mail-service.js'
import {
  PASSWORD_RESET_TTL_MS,
  VERIFY_EMAIL_TTL_MS,
  createMailToken,
  findMailToken,
  withoutStaleTokens,
} from './mail-tokens.js'
import { resolveMailBaseUrl } from './origin.js'
import type { IAccountSettingsStore } from './settings-store.js'

export type AccountFlowErrorCode =
  | 'MAIL_NOT_CONFIGURED'
  | 'INVALID_PASSWORD'
  | 'EMAIL_INVALID'
  | 'INVALID_TOKEN'
  | 'EMAIL_IN_USE'
  | 'RATE_LIMITED'

export class AccountFlowError extends Error {
  constructor(
    public readonly code: AccountFlowErrorCode,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message)
    this.name = 'AccountFlowError'
  }
}

export interface SecurityState {
  email: string
  emailVerified: boolean
  pendingEmail: string | null
}

export interface IAccountRecoveryService {
  /** True if the "forgot password" flow can work right now (toggle on, SMTP set, link base known). */
  isResetAvailable(): Promise<boolean>
  getSecurityState(userId: string): Promise<SecurityState>
  requestEmailChange(userId: string, password: string, newEmail: string): Promise<void>
  verifyEmail(rawToken: string, ipAddress: string): Promise<void>
  requestPasswordReset(identifier: string, ipAddress: string): Promise<void>
  confirmPasswordReset(rawToken: string, newPassword: string, ipAddress: string): Promise<void>
}

export interface AccountRecoveryDeps {
  userRepository: IUserRepository
  mailService: IMailService
  settings: IAccountSettingsStore
  authService: Pick<IAuthService, 'invalidateAllSessions'>
  getAllowedOrigins: () => readonly string[]
  /** Reflects the `mail-recovery` feature toggle. */
  isEnabled: () => boolean
  logger: ILogger
  auditService?: IAuditService
}

const EMAIL_UNIQUENESS_LOCK = '\0email-uniqueness'

/** Raw tokens travel as `<userId>.<secret>` so the account is found without scanning all users. */
function composeToken(userId: string, secret: string): string {
  return `${userId}.${secret}`
}

function splitToken(raw: string): { userId: string; secret: string } | null {
  const dot = raw.indexOf('.')
  if (dot <= 0 || dot === raw.length - 1) return null
  return { userId: raw.slice(0, dot), secret: raw.slice(dot + 1) }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export class AccountRecoveryService implements IAccountRecoveryService {
  private readonly locks = new KeyedMutex()
  /** 3 reset mails per account per hour. */
  private readonly resetPerUser = new SlidingWindowRateLimiter(3, 60 * 60_000)
  /** 5 reset requests per client IP per 15 minutes (also caps mailbox flooding by enumeration). */
  private readonly resetPerIp = new SlidingWindowRateLimiter(5, 15 * 60_000)
  /** Token redemption attempts per IP, to stop token guessing. */
  private readonly redeemPerIp = new SlidingWindowRateLimiter(20, 15 * 60_000)
  /** Verification mails per account per hour. */
  private readonly verifyPerUser = new SlidingWindowRateLimiter(5, 60 * 60_000)

  constructor(private readonly deps: AccountRecoveryDeps) {}

  destroy(): void {
    this.resetPerUser.destroy()
    this.resetPerIp.destroy()
    this.redeemPerIp.destroy()
    this.verifyPerUser.destroy()
  }

  async isResetAvailable(): Promise<boolean> {
    if (!this.deps.isEnabled()) return false
    if (!(await this.deps.mailService.isConfigured())) return false
    return (await this.linkBase()) !== null
  }

  async getSecurityState(userId: string): Promise<SecurityState> {
    const user = await this.deps.userRepository.findById(userId)
    if (user === null) throw new AccountFlowError('INVALID_TOKEN', 'User not found')
    return {
      email: user.email,
      emailVerified: user.email !== '' && user.emailVerifiedAt !== undefined,
      pendingEmail: user.pendingEmail ?? null,
    }
  }

  async requestEmailChange(userId: string, password: string, newEmail: string): Promise<void> {
    const email = newEmail.trim()
    if (!isPlainEmailAddress(email)) {
      throw new AccountFlowError('EMAIL_INVALID', 'Email must be a valid email address')
    }
    if (!(await this.deps.mailService.isConfigured()) || (await this.linkBase()) === null) {
      throw new AccountFlowError('MAIL_NOT_CONFIGURED', 'Mail delivery is not configured')
    }
    const limit = this.verifyPerUser.checkLimit(userId)
    if (!limit.allowed) throw new AccountFlowError('RATE_LIMITED', 'Too many requests', limit.retryAfter)

    await this.locks.runExclusive(userId, async () => {
      const user = await this.deps.userRepository.findById(userId)
      if (user === null) throw new AccountFlowError('INVALID_PASSWORD', 'Password is incorrect')
      let valid: boolean
      try {
        valid = await verify(user.passwordHash, password)
      } catch {
        valid = false
      }
      if (!valid) throw new AccountFlowError('INVALID_PASSWORD', 'Password is incorrect')

      this.verifyPerUser.recordRequest(userId)
      const { token, record } = createMailToken('verify-email', VERIFY_EMAIL_TTL_MS, email)
      await this.deps.userRepository.save({
        ...user,
        pendingEmail: email,
        mailTokens: [...withoutStaleTokens(user.mailTokens, 'verify-email'), record],
        updatedAt: new Date().toISOString(),
      })
      await this.sendVerificationMail(user, email, composeToken(userId, token))
    })
  }

  async verifyEmail(rawToken: string, ipAddress: string): Promise<void> {
    this.enforceRedeemLimit(ipAddress)
    const parts = splitToken(rawToken)
    if (parts === null) throw new AccountFlowError('INVALID_TOKEN', 'Invalid or expired link')

    // One address may be confirmed by one account only: the uniqueness check and the save must not
    // interleave with another account confirming the same address, hence the global lock.
    await this.locks.runExclusive(EMAIL_UNIQUENESS_LOCK, () => this.locks.runExclusive(parts.userId, async () => {
      const user = await this.deps.userRepository.findById(parts.userId)
      const token = user === null ? null : findMailToken(user.mailTokens, 'verify-email', parts.secret)
      if (user === null || token === null || token.email === undefined) {
        this.redeemPerIp.recordRequest(ipAddress)
        throw new AccountFlowError('INVALID_TOKEN', 'Invalid or expired link')
      }
      const address = token.email
      if (await this.isVerifiedElsewhere(address, user.userId)) {
        throw new AccountFlowError('EMAIL_IN_USE', 'This address cannot be used')
      }
      const { pendingEmail: _pending, ...rest } = user
      await this.deps.userRepository.save({
        ...rest,
        email: address,
        emailVerifiedAt: new Date().toISOString(),
        mailTokens: withoutStaleTokens(user.mailTokens).filter((t) => t.hash !== token.hash),
        updatedAt: new Date().toISOString(),
      })
      await this.deps.auditService?.log({
        userId: user.userId,
        action: 'EMAIL_VERIFIED',
        target: user.userId,
        ipAddress,
        success: true,
      })
    }))
  }

  async requestPasswordReset(identifier: string, ipAddress: string): Promise<void> {
    if (!(await this.isResetAvailable())) {
      throw new AccountFlowError('MAIL_NOT_CONFIGURED', 'Password reset by mail is not available')
    }
    const ipLimit = this.resetPerIp.checkLimit(ipAddress)
    if (!ipLimit.allowed) throw new AccountFlowError('RATE_LIMITED', 'Too many requests', ipLimit.retryAfter)
    this.resetPerIp.recordRequest(ipAddress)

    // Everything past this point runs after the response: lookup, token write and
    // delivery would otherwise make "account exists" measurably slower than "unknown".
    void this.processResetRequest(identifier).catch((err: unknown) => {
      this.deps.logger.error('Password reset processing failed', { error: errorMessage(err) })
    })
  }

  /** Looks up the account and mails a reset link. Exposed for tests; called in the background. */
  async processResetRequest(identifier: string): Promise<void> {
    const wanted = identifier.trim()
    if (wanted === '') return

    const user = await this.findResettable(wanted)
    if (user === null) return

    const userLimit = this.resetPerUser.checkLimit(user.userId)
    if (!userLimit.allowed) return
    this.resetPerUser.recordRequest(user.userId)

    const { token, record } = createMailToken('password-reset', PASSWORD_RESET_TTL_MS)
    await this.locks.runExclusive(user.userId, async () => {
      const fresh = await this.deps.userRepository.findById(user.userId)
      if (fresh === null) return
      await this.deps.userRepository.save({
        ...fresh,
        mailTokens: [...withoutStaleTokens(fresh.mailTokens, 'password-reset'), record],
        updatedAt: new Date().toISOString(),
      })
    })
    await this.sendResetMail(user, composeToken(user.userId, token))
  }

  async confirmPasswordReset(rawToken: string, newPassword: string, ipAddress: string): Promise<void> {
    this.enforceRedeemLimit(ipAddress)
    const parts = splitToken(rawToken)
    if (parts === null) throw new AccountFlowError('INVALID_TOKEN', 'Invalid or expired link')
    assertValidPassword(newPassword)

    const user = await this.locks.runExclusive(parts.userId, async () => {
      const found = await this.deps.userRepository.findById(parts.userId)
      const token = found === null ? null : findMailToken(found.mailTokens, 'password-reset', parts.secret)
      if (found === null || token === null || found.suspended) {
        this.redeemPerIp.recordRequest(ipAddress)
        throw new AccountFlowError('INVALID_TOKEN', 'Invalid or expired link')
      }
      const passwordHash = await hash(newPassword, ARGON2_OPTIONS)
      const updated: UserRecord = {
        ...found,
        passwordHash,
        mustChangePassword: false,
        mailTokens: withoutStaleTokens(found.mailTokens).filter((t) => t.purpose !== 'password-reset'),
        updatedAt: new Date().toISOString(),
      }
      await this.deps.userRepository.save(updated)
      return updated
    })

    await this.deps.authService.invalidateAllSessions(user.userId)
    await this.deps.auditService?.log({
      userId: user.userId,
      action: 'PASSWORD_RESET_BY_MAIL',
      target: user.userId,
      ipAddress,
      success: true,
    })
    void this.sendChangedMail(user)
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private enforceRedeemLimit(ipAddress: string): void {
    const limit = this.redeemPerIp.checkLimit(ipAddress)
    if (!limit.allowed) throw new AccountFlowError('RATE_LIMITED', 'Too many requests', limit.retryAfter)
  }

  private async linkBase(): Promise<string | null> {
    const { mailBaseUrl } = await this.deps.settings.get()
    return resolveMailBaseUrl(mailBaseUrl, this.deps.getAllowedOrigins())
  }

  /** Accounts that may receive a reset: matched by username, or by a *confirmed* address. */
  private async findResettable(identifier: string): Promise<UserRecord | null> {
    const byName = await this.deps.userRepository.findByUsername(identifier)
    if (byName !== null) return this.isResettable(byName) ? byName : null
    const wanted = normalizeEmail(identifier)
    if (!wanted.includes('@')) return null
    for await (const user of this.allUsers()) {
      if (this.isResettable(user) && normalizeEmail(user.email) === wanted) return user
    }
    return null
  }

  private isResettable(user: UserRecord): boolean {
    return !user.suspended && user.email !== '' && user.emailVerifiedAt !== undefined
  }

  private async isVerifiedElsewhere(email: string, exceptUserId: string): Promise<boolean> {
    const wanted = normalizeEmail(email)
    for await (const user of this.allUsers()) {
      if (user.userId !== exceptUserId && user.emailVerifiedAt !== undefined && normalizeEmail(user.email) === wanted) {
        return true
      }
    }
    return false
  }

  private async *allUsers(): AsyncGenerator<UserRecord> {
    const pageSize = 100
    for (let page = 1; ; page++) {
      const result = await this.deps.userRepository.findAll({ page, pageSize })
      for (const user of result.items) yield user
      if (page >= result.totalPages) return
    }
  }

  private async sendVerificationMail(user: UserRecord, to: string, token: string): Promise<void> {
    const base = await this.linkBase()
    if (base === null) throw new AccountFlowError('MAIL_NOT_CONFIGURED', 'Mail delivery is not configured')
    const link = `${base}/verify-email#token=${encodeURIComponent(token)}`
    const de = user.preferredLanguage === 'de'
    try {
      await this.deps.mailService.send({
        to,
        subject: de ? 'Slatebase: E-Mail-Adresse bestätigen' : 'Slatebase: confirm your email address',
        text: de
          ? `Hallo ${user.displayName},\n\nbitte bestätige diese Adresse (24 Stunden gültig):\n${link}\n\nWar das nicht deine Anfrage, ignoriere diese Mail.`
          : `Hello ${user.displayName},\n\nplease confirm this address (valid for 24 hours):\n${link}\n\nIf this was not you, ignore this mail.`,
      })
    } catch (err) {
      this.deps.logger.error('Verification mail failed', { userId: user.userId, error: errorMessage(err) })
      throw new AccountFlowError('MAIL_NOT_CONFIGURED', 'Mail could not be delivered')
    }
  }

  private async sendResetMail(user: UserRecord, token: string): Promise<void> {
    try {
      const base = await this.linkBase()
      if (base === null) return
      const link = `${base}/reset-password#token=${encodeURIComponent(token)}`
      const de = user.preferredLanguage === 'de'
      await this.deps.mailService.send({
        to: user.email,
        subject: de ? 'Slatebase: Passwort zurücksetzen' : 'Slatebase: reset your password',
        text: de
          ? `Hallo ${user.displayName},\n\nzum Zurücksetzen deines Passworts (30 Minuten gültig, einmal nutzbar):\n${link}\n\nWar das nicht deine Anfrage, ignoriere diese Mail; dein Passwort bleibt unverändert.`
          : `Hello ${user.displayName},\n\nto reset your password (valid for 30 minutes, single use):\n${link}\n\nIf this was not you, ignore this mail; your password stays unchanged.`,
      })
    } catch (err) {
      this.deps.logger.error('Reset mail failed', { userId: user.userId, error: errorMessage(err) })
    }
  }

  private async sendChangedMail(user: UserRecord): Promise<void> {
    try {
      const de = user.preferredLanguage === 'de'
      await this.deps.mailService.send({
        to: user.email,
        subject: de ? 'Slatebase: Dein Passwort wurde geändert' : 'Slatebase: your password was changed',
        text: de
          ? `Hallo ${user.displayName},\n\ndein Passwort wurde soeben per Mail-Link geändert und alle Sitzungen wurden beendet.\nWar das nicht deine Aktion, wende dich an den Administrator.`
          : `Hello ${user.displayName},\n\nyour password was just changed via a mailed link and all sessions were ended.\nIf this was not you, contact your administrator.`,
      })
    } catch (err) {
      this.deps.logger.error('Password-changed mail failed', { userId: user.userId, error: errorMessage(err) })
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
