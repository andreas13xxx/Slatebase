// Git-Sync Validation — Zod schemas and ID/branch validators

import { z } from 'zod'

/** Same shape as PLUGIN_ID_PATTERN — lowercase, digits, hyphens, starts alphanumeric. */
export const GIT_SYNC_REMOTE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

export function isValidGitSyncRemoteId(id: string): boolean {
  return GIT_SYNC_REMOTE_ID_PATTERN.test(id)
}

/**
 * A conservative, safe subset of valid git branch names: non-empty
 * `/`-separated segments of letters, digits, `.`, `_`, `-`, no leading dash,
 * no `..`, no trailing `.lock`, no empty segments. Rejects a superset of
 * what real git allows (e.g. no unicode) — good enough for an internal
 * sync branch name, and simple enough to reason about for shell/argv safety.
 */
export function isValidGitBranchName(branch: string): boolean {
  if (branch.length === 0 || branch.length > 255) return false
  if (branch.includes('..') || branch.endsWith('.lock')) return false
  const segments = branch.split('/')
  return segments.every((seg) => seg.length > 0 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(seg))
}

const remoteUrlSchema = z.string()
  .min(1, 'remoteUrl must not be empty')
  .max(2048, 'remoteUrl too long')
  .refine((val) => !val.includes('\0') && !val.includes('\n'), {
    message: 'remoteUrl contains invalid characters',
  })

const branchSchema = z.string().refine(isValidGitBranchName, {
  message: 'branch must be a valid git branch name',
})

/**
 * A pasted SSH private key that's missing its `-----BEGIN .../-----END ...`
 * framing (e.g. only the base64 body was selected/copied) fails to load
 * with an opaque, low-level error from `ssh` ("error in libcrypto:
 * unsupported") that gives no hint the framing is missing — catching it
 * here up front produces an actionable message instead.
 */
function looksLikeFramedPrivateKey(value: string): boolean {
  return /-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----/.test(value) && /-----END [A-Z0-9 ]+PRIVATE KEY-----/.test(value)
}

const SSH_KEY_FRAMING_MESSAGE = 'credential must be the full private key file contents, including the "-----BEGIN ... PRIVATE KEY-----" and "-----END ... PRIVATE KEY-----" lines'

export const createGitSyncRemoteSchema = z.object({
  name: z.string().min(1, 'name must not be empty').max(128, 'name too long'),
  remoteUrl: remoteUrlSchema,
  authMethod: z.enum(['https-token', 'ssh-key']),
  credential: z.string().min(1, 'credential must not be empty').max(10_000, 'credential too long'),
  intervalMinutes: z.number().int().min(1).max(1440),
  enabled: z.boolean().optional().default(true),
}).refine(
  (data) => data.authMethod !== 'ssh-key' || looksLikeFramedPrivateKey(data.credential),
  { message: SSH_KEY_FRAMING_MESSAGE, path: ['credential'] },
)
export type CreateGitSyncRemoteInput = z.infer<typeof createGitSyncRemoteSchema>

export const updateGitSyncRemoteSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  remoteUrl: remoteUrlSchema.optional(),
  authMethod: z.enum(['https-token', 'ssh-key']).optional(),
  credential: z.string().min(1).max(10_000).optional(),
  intervalMinutes: z.number().int().min(1).max(1440).optional(),
  enabled: z.boolean().optional(),
}).refine(
  (data) => data.authMethod !== 'ssh-key' || data.credential === undefined || looksLikeFramedPrivateKey(data.credential),
  { message: SSH_KEY_FRAMING_MESSAGE, path: ['credential'] },
)
export type UpdateGitSyncRemoteInput = z.infer<typeof updateGitSyncRemoteSchema>

export const updateGitSyncBranchSchema = z.object({
  branch: branchSchema,
})

export const gitSyncVaultIdParamSchema = z.object({
  vaultId: z.string().min(1, 'vaultId must not be empty'),
})

export const gitSyncRemoteIdParamSchema = z.object({
  vaultId: z.string().min(1, 'vaultId must not be empty'),
  remoteId: z.string().min(1, 'remoteId must not be empty'),
})
