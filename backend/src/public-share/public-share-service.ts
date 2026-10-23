// ─── Public Share Links — Service ────────────────────────────────────────────

import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import { promisify } from 'node:util'
import { stripFrontmatter } from './embed-extraction.js'
import { resolveEmbeds, toPublicEmbeds } from './embed-resolver.js'
import {
  PublicShareConflictError,
  PublicShareNotFoundError,
  PublicSharePasswordRequiredError,
  PublicShareValidationError,
} from './errors.js'
import type { IPublicShareStore } from './public-share-store.js'
import type {
  CreatedPublicShare,
  CreatePublicShareInput,
  EmbedPreviewEntry,
  EmbedResolverLimits,
  IPublicShareVaultAccess,
  PublicAsset,
  PublicNoteView,
  PublicShare,
  PublicShareSummary,
  UpdatePublicShareInput,
} from './types.js'
import { DEFAULT_EMBED_LIMITS } from './types.js'

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>

const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 256
const SCRYPT_KEY_LENGTH = 64
/** `lastAccessAt` is rewritten at most this often, so reads do not become writes. */
const LAST_ACCESS_GRANULARITY_MS = 60_000

/** Credentials presented by a public reader for a password-protected link. */
export interface PublicShareCredentials {
  /** Plain password, checked against the stored hash. */
  password?: string
  /** True once the caller verified the password earlier (unlock cookie). */
  unlocked?: boolean
}

/** Business logic for public share links. */
export interface IPublicShareService {
  /** Creates a link for a note. The returned token is the only time it is available. */
  create(input: CreatePublicShareInput): Promise<CreatedPublicShare>
  /** Links of one vault, without secrets. */
  listForVault(vaultId: string): Promise<PublicShareSummary[]>
  /** Links created by one user across all vaults, without secrets. */
  listForUser(userId: string): Promise<PublicShareSummary[]>
  /** Returns one link by ID, or `null`. */
  get(id: string): Promise<PublicShareSummary | null>
  /** Changes expiry or password. Throws `PublicShareNotFoundError` for an unknown ID. */
  update(id: string, input: UpdatePublicShareInput): Promise<PublicShareSummary>
  /** Revokes a link. Returns `false` if the ID is unknown. */
  revoke(id: string): Promise<boolean>
  /** True if the token belongs to a live link that requires a password. */
  requiresPassword(token: string): Promise<boolean>
  /**
   * Opaque value that changes whenever the link's password changes, or `null` if the token is not
   * live or has no password. Callers bind an "unlocked" cookie to it so a new password invalidates it.
   */
  passwordBinding(token: string): Promise<string | null>
  /** Checks a password for a live link. Unknown/expired tokens yield `false`. */
  verifyPassword(token: string, password: string): Promise<boolean>
  /** Rendered view of the shared note with its embeds (live state, resolved per call). */
  getNote(token: string, credentials?: PublicShareCredentials): Promise<PublicNoteView>
  /** Bytes of an asset embedded (transitively) by the shared note. */
  getAsset(token: string, ref: string, credentials?: PublicShareCredentials): Promise<PublicAsset>
  /** What a link for this note would include, for the sharing dialog. */
  previewEmbeds(vaultId: string, filePath: string): Promise<EmbedPreviewEntry[]>
  /** Rewrites links after a rename or move of a file or folder. */
  onFileRenamed(vaultId: string, oldPath: string, newPath: string): Promise<void>
  /** Removes links for a deleted file or folder. */
  onFileDeleted(vaultId: string, filePath: string): Promise<void>
}

/** Dependencies of {@link createPublicShareService}. */
export interface PublicShareServiceDeps {
  store: IPublicShareStore
  vault: IPublicShareVaultAccess
  limits?: EmbedResolverLimits
  /** Clock, injectable for tests. */
  now?: () => Date
  /** Token generator, injectable for tests. */
  generateToken?: () => string
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH)
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(':')
  if (saltHex === undefined || keyHex === undefined) return false
  const expected = Buffer.from(keyHex, 'hex')
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/** Normalizes a vault path and rejects anything that is not a visible Markdown note. */
function normalizeNotePath(raw: string): string {
  const normalized = raw.replaceAll('\\', '/').replace(/^\/+/, '')
  const segments = normalized.split('/')
  if (
    normalized === '' ||
    normalized.includes('\0') ||
    segments.some((s) => s === '' || s === '..' || s.startsWith('.')) ||
    path.extname(normalized).toLowerCase() !== '.md'
  ) {
    throw new PublicShareValidationError('Nur sichtbare Markdown-Notizen können geteilt werden')
  }
  return normalized
}

function validatePassword(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new PublicShareValidationError(
      `Das Passwort muss zwischen ${PASSWORD_MIN_LENGTH} und ${PASSWORD_MAX_LENGTH} Zeichen lang sein`,
    )
  }
}

export function toPublicShareSummary(share: PublicShare): PublicShareSummary {
  const { tokenHash: _tokenHash, passwordHash, ...rest } = share
  return { ...rest, passwordProtected: passwordHash !== undefined }
}

function isExpired(share: PublicShare, now: Date): boolean {
  return share.expiresAt !== undefined && new Date(share.expiresAt).getTime() <= now.getTime()
}

/** Creates the public share service. */
export function createPublicShareService(deps: PublicShareServiceDeps): IPublicShareService {
  const { store, vault } = deps
  const limits = deps.limits ?? DEFAULT_EMBED_LIMITS
  const now = deps.now ?? (() => new Date())
  const generateToken = deps.generateToken ?? (() => randomBytes(24).toString('base64url'))

  function parseExpiry(expiresAt: string): string {
    const time = new Date(expiresAt).getTime()
    if (Number.isNaN(time) || time <= now().getTime()) {
      throw new PublicShareValidationError('Das Ablaufdatum muss in der Zukunft liegen')
    }
    return new Date(time).toISOString()
  }

  /** A live (existing, unexpired) share for a token, else `null`. */
  async function findLive(token: string): Promise<PublicShare | null> {
    const tokenHash = hashToken(token)
    const shares = await store.list()
    const share = shares.find((s) => s.tokenHash === tokenHash)
    if (share === undefined || isExpired(share, now())) return null
    return share
  }

  async function authorize(token: string, credentials: PublicShareCredentials | undefined): Promise<PublicShare> {
    const share = await findLive(token)
    if (share === null) throw new PublicShareNotFoundError()
    if (share.passwordHash !== undefined && credentials?.unlocked !== true) {
      if (credentials?.password === undefined || !(await checkPassword(credentials.password, share.passwordHash))) {
        throw new PublicSharePasswordRequiredError()
      }
    }
    return share
  }

  function touch(share: PublicShare): void {
    const last = share.lastAccessAt === undefined ? 0 : new Date(share.lastAccessAt).getTime()
    if (now().getTime() - last < LAST_ACCESS_GRANULARITY_MS) return
    const stamp = now().toISOString()
    // Best effort: a failed bookkeeping write must never fail a read.
    void store
      .mutate((all) => all.map((s) => (s.id === share.id ? { ...s, lastAccessAt: stamp } : s)))
      .catch(() => undefined)
  }

  /** Reads the shared note; a missing or unreadable file reads as "not found". */
  async function readSharedNote(share: PublicShare): Promise<string> {
    const text = await vault.readText(share.vaultId, share.filePath)
    if (text === null) throw new PublicShareNotFoundError()
    return stripFrontmatter(text)
  }

  return {
    async create(input) {
      const filePath = normalizeNotePath(input.filePath)
      const expiresAt = input.expiresAt === undefined ? undefined : parseExpiry(input.expiresAt)
      if (input.password !== undefined) validatePassword(input.password)

      if ((await vault.readText(input.vaultId, filePath)) === null) {
        throw new PublicShareValidationError('Die Notiz wurde nicht gefunden')
      }

      const token = generateToken()
      const passwordHash = input.password === undefined ? undefined : await hashPassword(input.password)
      const share: PublicShare = {
        id: randomUUID(),
        tokenHash: hashToken(token),
        tokenHint: token.slice(-4),
        vaultId: input.vaultId,
        filePath,
        createdBy: input.createdBy,
        createdAt: now().toISOString(),
        ...(expiresAt === undefined ? {} : { expiresAt }),
        ...(passwordHash === undefined ? {} : { passwordHash }),
      }

      let conflict = false
      await store.mutate((all) => {
        // Expired links do not block a new one; they are dropped here.
        const live = all.filter((s) => !isExpired(s, now()))
        if (live.some((s) => s.vaultId === share.vaultId && s.filePath === share.filePath)) {
          conflict = true
          return all
        }
        return [...live, share]
      })
      if (conflict) throw new PublicShareConflictError()

      return { share, token }
    },

    async listForVault(vaultId) {
      return (await store.list()).filter((s) => s.vaultId === vaultId).map(toPublicShareSummary)
    },

    async listForUser(userId) {
      return (await store.list()).filter((s) => s.createdBy === userId).map(toPublicShareSummary)
    },

    async get(id) {
      const share = (await store.list()).find((s) => s.id === id)
      return share === undefined ? null : toPublicShareSummary(share)
    },

    async update(id, input) {
      const expiresAt = typeof input.expiresAt === 'string' ? parseExpiry(input.expiresAt) : input.expiresAt
      if (typeof input.password === 'string') validatePassword(input.password)
      const passwordHash = typeof input.password === 'string' ? await hashPassword(input.password) : undefined

      let updated: PublicShare | undefined
      await store.mutate((all) =>
        all.map((s) => {
          if (s.id !== id) return s
          const { expiresAt: _e, passwordHash: _p, ...base } = s
          const nextExpiry = expiresAt === undefined ? s.expiresAt : (expiresAt ?? undefined)
          const nextPassword = input.password === undefined ? s.passwordHash : (passwordHash ?? undefined)
          updated = {
            ...base,
            ...(nextExpiry === undefined ? {} : { expiresAt: nextExpiry }),
            ...(nextPassword === undefined ? {} : { passwordHash: nextPassword }),
          }
          return updated
        }),
      )
      if (updated === undefined) throw new PublicShareNotFoundError()
      return toPublicShareSummary(updated)
    },

    async revoke(id) {
      let found = false
      await store.mutate((all) => {
        const next = all.filter((s) => s.id !== id)
        found = next.length !== all.length
        return next
      })
      return found
    },

    async requiresPassword(token) {
      const share = await findLive(token)
      return share?.passwordHash !== undefined
    },

    async passwordBinding(token) {
      const share = await findLive(token)
      return share?.passwordHash === undefined ? null : hashToken(`${share.id}:${share.passwordHash}`)
    },

    async verifyPassword(token, password) {
      const share = await findLive(token)
      if (share?.passwordHash === undefined) return false
      return checkPassword(password, share.passwordHash)
    },

    async getNote(token, credentials) {
      const share = await authorize(token, credentials)
      const markdown = await readSharedNote(share)
      const embeds = await resolveEmbeds(share.vaultId, share.filePath, markdown, vault, limits)
      touch(share)
      return {
        title: path.posix.basename(share.filePath, path.posix.extname(share.filePath)),
        markdown,
        embeds: toPublicEmbeds(embeds),
      }
    },

    async getAsset(token, ref, credentials) {
      const share = await authorize(token, credentials)
      const markdown = await readSharedNote(share)
      const embeds = await resolveEmbeds(share.vaultId, share.filePath, markdown, vault, limits)
      const embed = Object.hasOwn(embeds, ref) ? embeds[ref] : undefined
      if (embed?.kind !== 'asset') throw new PublicShareNotFoundError()
      const data = await vault.readBinary(share.vaultId, embed.path)
      if (data === null) throw new PublicShareNotFoundError()
      return { data, contentType: embed.contentType }
    },

    async previewEmbeds(vaultId, filePath) {
      const notePath = normalizeNotePath(filePath)
      const text = await vault.readText(vaultId, notePath)
      if (text === null) throw new PublicShareValidationError('Die Notiz wurde nicht gefunden')
      const embeds = await resolveEmbeds(vaultId, notePath, stripFrontmatter(text), vault, limits)
      return Object.entries(embeds).map(([ref, embed]) => ({ ref, kind: embed.kind }))
    },

    async onFileRenamed(vaultId, oldPath, newPath) {
      await store.mutate((all) =>
        all.map((s) => {
          if (s.vaultId !== vaultId) return s
          if (s.filePath === oldPath) return { ...s, filePath: newPath }
          if (s.filePath.startsWith(`${oldPath}/`)) {
            return { ...s, filePath: `${newPath}${s.filePath.slice(oldPath.length)}` }
          }
          return s
        }),
      )
    },

    async onFileDeleted(vaultId, filePath) {
      await store.mutate((all) =>
        all.filter((s) => !(s.vaultId === vaultId && (s.filePath === filePath || s.filePath.startsWith(`${filePath}/`)))),
      )
    },
  }
}
