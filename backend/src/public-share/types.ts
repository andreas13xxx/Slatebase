// ─── Public Share Links — Types ──────────────────────────────────────────────

/** Persisted record of one public share link. The token itself is never stored. */
export interface PublicShare {
  /** Stable internal identifier used by the authenticated management routes. */
  id: string
  /** SHA-256 (hex) of the token; the plaintext token is shown exactly once. */
  tokenHash: string
  /** Last four characters of the token, for display in the management UI and audit log. */
  tokenHint: string
  vaultId: string
  /** Vault-relative path of the shared note; rewritten on rename/move. */
  filePath: string
  /** User ID of the creator. */
  createdBy: string
  createdAt: string
  /** ISO timestamp after which the link no longer resolves. */
  expiresAt?: string
  /** scrypt hash (`salt:hash`, hex) of the optional password. */
  passwordHash?: string
  /**
   * Random value renewed whenever the password is set, changed or removed. An "unlocked" cookie
   * is bound to it, so a password change invalidates earlier unlocks without hashing anything.
   * Records written before this field existed fall back to the link ID.
   */
  unlockVersion?: string
  lastAccessAt?: string
}

/** Input for creating a public share link. */
export interface CreatePublicShareInput {
  vaultId: string
  filePath: string
  createdBy: string
  expiresAt?: string
  password?: string
}

/** Input for updating a link. `null` removes the value, `undefined` leaves it unchanged. */
export interface UpdatePublicShareInput {
  expiresAt?: string | null
  password?: string | null
}

/** Result of creating a link: the record plus the plaintext token (only available here). */
export interface CreatedPublicShare {
  share: PublicShare
  token: string
}

/** A share record without secrets, as returned by the management routes. */
export type PublicShareSummary = Omit<PublicShare, 'tokenHash' | 'passwordHash' | 'unlockVersion'> & {
  passwordProtected: boolean
}

/** Why an embed could not be inlined. Never exposed to the public reader. */
export type EmbedUnavailableReason =
  | 'missing'
  | 'unreadable'
  | 'depth'
  | 'cycle'
  | 'too-large'
  | 'unsupported'
  | 'hidden'

/** One resolved embed, keyed by the reference exactly as written in the note. */
export type ResolvedEmbed =
  | {
      kind: 'note'
      /** Markdown of the embedded note (frontmatter stripped, heading/block excerpt applied). */
      markdown: string
    }
  | {
      kind: 'asset'
      /** Vault path, server-side only; the public reader addresses assets by `ref`. */
      path: string
      contentType: string
    }
  | {
      kind: 'unavailable'
      reason: EmbedUnavailableReason
    }

/** Resolved embeds of one shared note, keyed by the embed reference. */
export type ResolvedEmbeds = Record<string, ResolvedEmbed>

/** What the public reader receives for a shared note. */
export interface PublicNoteView {
  title: string
  /** Markdown without frontmatter. */
  markdown: string
  /** Embeds with the server-only `path` and `reason` fields removed. */
  embeds: Record<string, PublicEmbedView>
}

/** Public projection of {@link ResolvedEmbed}: no vault paths, no failure reasons. */
export type PublicEmbedView =
  | { kind: 'note'; markdown: string }
  | { kind: 'asset'; contentType: string }
  | { kind: 'unavailable' }

/** A binary asset read for the public asset route. */
export interface PublicAsset {
  data: Buffer
  contentType: string
}

/** One embed that a link would include, for the sharing dialog preview. */
export interface EmbedPreviewEntry {
  ref: string
  kind: ResolvedEmbed['kind']
}

/**
 * Narrow vault access the public share module needs. Implemented on top of
 * `VaultReader` + `validateFilePath()` at wiring time, so this module never
 * touches the filesystem itself.
 */
export interface IPublicShareVaultAccess {
  /** Directory tree of the vault, or `null` when the vault is unknown or unreadable. */
  getTree(vaultId: string): Promise<import('../vault/index.js').DirectoryTree | null>
  /** UTF-8 text of a file, or `null` if it is missing, binary, or cannot be read. */
  readText(vaultId: string, filePath: string): Promise<string | null>
  /** Raw bytes of a file, or `null` if it is missing or cannot be read. */
  readBinary(vaultId: string, filePath: string): Promise<Buffer | null>
}

/** Limits applied while resolving embeds. */
export interface EmbedResolverLimits {
  /** Maximum nesting of embedded notes (the shared note itself is depth 0). */
  maxDepth: number
  /** Maximum total characters of all embedded note markdown. */
  maxTotalChars: number
  /** Maximum number of distinct embeds in one resolution. */
  maxEmbeds: number
}

/** Default limits; depth matches the reading view's `MAX_EMBED_DEPTH`. */
export const DEFAULT_EMBED_LIMITS: EmbedResolverLimits = {
  maxDepth: 3,
  maxTotalChars: 500_000,
  maxEmbeds: 100,
}
