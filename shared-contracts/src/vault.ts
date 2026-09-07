/**
 * AP10 feasibility proof: the wire contract for the vault routes shared
 * between backend and frontend — `GET /vaults`, `GET /vaults/:id/tree`,
 * `GET /vaults/:id/files`, `PUT /vaults/:id/files`.
 *
 * The backend validates the PUT /files request body against
 * `putFileBodySchema`. Both sides derive their TypeScript types from these
 * schemas via `z.infer<>` instead of hand-maintaining parallel interfaces —
 * see AGENTS.md / the AP10 PR description for what rolling this out further
 * would look like.
 */
import { z } from 'zod'

/**
 * Vault metadata as exposed by `GET /vaults` (the internal `path` field is
 * stripped by the controller before this shape ever reaches the wire).
 */
export const vaultInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Present when the vault failed to load; absent for a normally loaded vault. */
  status: z.enum(['loaded', 'error']).optional(),
  errorMessage: z.string().optional(),
  ownerId: z.string().optional(),
  /** Resolved server-side from ownerId; absent if the owner lookup failed. */
  ownerName: z.string().optional(),
  permission: z.enum(['owner', 'read', 'write']).optional(),
  /** Only populated for vaults where permission === 'owner'. */
  shareCount: z.number().optional(),
})
export type VaultInfo = z.infer<typeof vaultInfoSchema>

export const vaultListResponseSchema = z.array(vaultInfoSchema)

/**
 * Recursive directory/file tree, returned by `GET /vaults/:id/tree`.
 * `z.lazy` is required here — Zod can't infer a self-referential object
 * schema without it.
 */
export const directoryTreeSchema: z.ZodType<DirectoryTree> = z.lazy(() =>
  z.object({
    name: z.string(),
    type: z.enum(['directory', 'file']),
    /** Relative path from vault root. */
    path: z.string(),
    children: z.array(directoryTreeSchema).optional(),
    /** Only present for type === 'file'. */
    size: z.number().optional(),
    /** Only present for type === 'directory'. */
    itemCount: z.number().optional(),
    /** Only present for type === 'file'; unix ms. */
    mtime: z.number().optional(),
    /** Only present for type === 'file'; unix ms. */
    ctime: z.number().optional(),
  }),
)
export interface DirectoryTree {
  name: string
  type: 'directory' | 'file'
  path: string
  children?: DirectoryTree[]
  size?: number
  itemCount?: number
  mtime?: number
  ctime?: number
}

/** Content and metadata of a single file, returned by `GET /vaults/:id/files`. */
export const fileContentSchema = z.object({
  /** Relative path from vault root. */
  path: z.string(),
  name: z.string(),
  /** UTF-8 decoded text (empty when isBinary === true). */
  content: z.string(),
  /** Original file size in bytes. */
  size: z.number(),
  encoding: z.literal('utf-8'),
  isBinary: z.boolean(),
  isTruncated: z.boolean(),
  /**
   * SHA-256-derived ETag of the file content, for If-Match conflict
   * detection on save. The backend always sends this; it's typed optional
   * here only because a number of existing frontend test fixtures construct
   * FileContent literals without it and this is meant to be a small first
   * step, not a drive-by fix of ~15 unrelated test files.
   */
  etag: z.string().optional(),
})
export type FileContent = z.infer<typeof fileContentSchema>

/** Request body for `PUT /vaults/:id/files`. */
export const putFileBodySchema = z.object({
  path: z.string({ error: 'Missing required field: path' }).min(1, 'Missing required field: path'),
  content: z.string({ error: 'Missing required field: content' }),
})
export type PutFileBody = z.infer<typeof putFileBodySchema>

/** Result of a successful file save, returned by `PUT /vaults/:id/files`. */
export const fileSaveResultSchema = z.object({
  /** Relative path from vault root. */
  path: z.string(),
  name: z.string(),
  /** Written file size in bytes. */
  size: z.number(),
  /** See fileContentSchema.etag re: why this stays optional for now. */
  etag: z.string().optional(),
})
export type FileSaveResult = z.infer<typeof fileSaveResultSchema>
