/**
 * Pure helpers for Slatebase deep links: `/open?vault=<id>&file=<path>`.
 *
 * A deep link is an address, never a credential — opening one requires a session and access to
 * the vault like any other navigation. This module only builds and validates the link text; it
 * touches neither the DOM nor the network.
 *
 * The `file` value may carry an anchor in wikilink style: `Note.md#Heading` or `Note.md#^block-id`.
 * The anchor is split off at the first `#` that directly follows a `.md` — a `#` anywhere else is
 * part of the file name (`C#.md`), so such notes stay addressable.
 *
 * @module deep-link/deepLink
 */

/** Anchor inside a note: a heading by its text, or a block by its id (without the `^`). */
export type DeepLinkAnchor =
  | { kind: 'heading'; text: string }
  | { kind: 'block'; id: string }

/** What a deep link points at. `path === null` means "just open the vault". */
export interface DeepLinkTarget {
  /** Vault id, or an exact vault name (resolved with {@link resolveVaultRef}). */
  vault: string
  /** Vault-relative file path, or `null` when the link names only the vault. */
  path: string | null
  /** Heading/block inside the note; always `null` when `path` is `null`. */
  anchor: DeepLinkAnchor | null
}

/** Route of the landing path. */
export const DEEP_LINK_PATH = '/open'

const MAX_VAULT_REF_LENGTH = 128
const MAX_PATH_LENGTH = 4096
const MAX_ANCHOR_LENGTH = 512
const BLOCK_ID_RE = /^[A-Za-z0-9-]+$/
const NOTE_ANCHOR_RE = /^(.*?\.md)#([\s\S]*)$/i

/**
 * Whether a vault-relative path may be handed to the open-file machinery.
 * Rejects empty, absolute, backslash, NUL, `.`/`..`/empty segments and oversized paths. The
 * backend's `validateFilePath()` stays the authority; this keeps nonsense out before it gets there.
 */
export function isSafeVaultPath(path: string): boolean {
  if (path.length === 0 || path.length > MAX_PATH_LENGTH) return false
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

function parseAnchor(raw: string): DeepLinkAnchor | null {
  if (raw.length === 0 || raw.length > MAX_ANCHOR_LENGTH || raw.includes('\0')) return null
  if (raw.startsWith('^')) {
    const id = raw.slice(1)
    return BLOCK_ID_RE.test(id) ? { kind: 'block', id } : null
  }
  return { kind: 'heading', text: raw }
}

function anchorToString(anchor: DeepLinkAnchor): string {
  return anchor.kind === 'block' ? `^${anchor.id}` : anchor.text
}

/**
 * Parses the query string of a `/open` URL.
 *
 * @param search - `window.location.search` (with or without the leading `?`).
 * @returns The target, or `null` when the link is unusable (no/oversized `vault`, unsafe `file`,
 *   or an anchor that is not a valid heading/block). Unknown parameters are ignored.
 */
export function parseDeepLink(search: string): DeepLinkTarget | null {
  const params = new URLSearchParams(search)
  const vault = params.get('vault')
  if (vault === null || vault.trim().length === 0 || vault.length > MAX_VAULT_REF_LENGTH) return null

  const file = params.get('file')
  if (file === null || file.length === 0) return { vault, path: null, anchor: null }

  const split = NOTE_ANCHOR_RE.exec(file)
  const rawPath = split ? split[1] ?? '' : file
  if (!isSafeVaultPath(rawPath)) return null

  if (!split) return { vault, path: rawPath, anchor: null }
  const anchor = parseAnchor(split[2] ?? '')
  // An anchor was asked for but is not usable: refuse the whole link rather than silently
  // opening the note at the top.
  if (anchor === null) return null
  return { vault, path: rawPath, anchor }
}

/**
 * Builds the shareable link.
 *
 * @param origin - Usually `window.location.origin`; a trailing slash is ignored.
 * @param vaultId - Vault id (stable across renames).
 * @param path - Vault-relative file path; omit for a link to the vault alone.
 * @param anchor - Heading/block inside the note; only honoured for `.md` paths.
 * @throws {Error} When `path` is not a safe vault path (a link that could never be opened).
 */
export function buildDeepLink(origin: string, vaultId: string, path?: string, anchor?: DeepLinkAnchor): string {
  const base = `${origin.replace(/\/+$/, '')}${DEEP_LINK_PATH}?vault=${encodeURIComponent(vaultId)}`
  if (path === undefined || path === '') return base
  if (!isSafeVaultPath(path)) throw new Error(`Cannot build a deep link for unsafe path: ${path}`)
  const withAnchor = anchor && /\.md$/i.test(path) ? `${path}#${anchorToString(anchor)}` : path
  return `${base}&file=${encodeURIComponent(withAnchor)}`
}

/**
 * Resolves the `vault` value of a link to a vault id: an exact id wins, otherwise an exact name
 * that belongs to exactly one vault (Obsidian links use names). Ambiguity resolves to `null` — never
 * a guess.
 */
export function resolveVaultRef(ref: string, vaults: ReadonlyArray<{ id: string; name: string }>): string | null {
  const byId = vaults.find((v) => v.id === ref)
  if (byId) return byId.id
  const byName = vaults.filter((v) => v.name === ref)
  return byName.length === 1 ? byName[0]?.id ?? null : null
}
