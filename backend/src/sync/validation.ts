import { z } from 'zod'

// ─── Sync Validation Schemas ─────────────────────────────────────────────────

// ─── Reusable Field Schemas ──────────────────────────────────────────────────

/**
 * Vault-ID schema: hexadecimal string, exactly 12 characters, only chars a-f and 0-9.
 */
export const vaultIdSchema = z
  .string()
  .regex(/^[a-f0-9]{12}$/, 'Vault-ID must be a 12-character hexadecimal string (a-f, 0-9)')

/**
 * Endpoint-URL schema: valid URL format, http:// or https:// protocol only, max 2048 chars.
 * Trims whitespace before validation.
 */
export const endpointUrlSchema = z
  .string()
  .trim()
  .min(1, 'Endpoint URL must not be empty')
  .max(2048, 'Endpoint URL must be at most 2048 characters')
  .refine(
    (val) => /^https?:\/\//i.test(val),
    { message: 'Endpoint URL must use http:// or https:// protocol' },
  )
  .refine(
    (val) => {
      try {
        new URL(val)
        return true
      } catch {
        return false
      }
    },
    { message: 'Endpoint URL must be a valid URL' },
  )

/**
 * Database name schema: non-empty, max 256 chars, must start with a lowercase letter,
 * only chars a-z, 0-9, _, $, (, ), +, -, / allowed (CouchDB naming rules).
 * Trims whitespace before validation.
 */
export const databaseNameSchema = z
  .string()
  .trim()
  .min(1, 'Database name must not be empty')
  .max(256, 'Database name must be at most 256 characters')
  .regex(
    /^[a-z][a-z0-9_$()+-/]*$/,
    'Database name must start with a lowercase letter and contain only a-z, 0-9, _, $, (, ), +, -, /',
  )

/**
 * Username schema for sync credentials: non-empty, max 256 chars.
 * Trims whitespace before validation.
 */
export const syncUsernameSchema = z
  .string()
  .trim()
  .min(1, 'Username must not be empty')
  .max(256, 'Username must be at most 256 characters')

/**
 * Password schema for sync credentials: non-empty, max 1024 chars.
 * Trims whitespace before validation.
 */
export const syncPasswordSchema = z
  .string()
  .trim()
  .min(1, 'Password must not be empty')
  .max(1024, 'Password must be at most 1024 characters')

/**
 * Sync mode schema: only 'bidirectional' or 'readonly'.
 */
export const syncModeSchema = z.enum(['bidirectional', 'readonly'])

/**
 * Sync trigger schema: only 'manual' or 'interval'.
 */
export const syncTriggerSchema = z.enum(['manual', 'interval'])

/**
 * Sync interval schema: integer in minutes, min 5, max 1440.
 */
export const syncIntervalSchema = z
  .number()
  .int('Sync interval must be an integer')
  .min(5, 'Sync interval must be at least 5 minutes')
  .max(1440, 'Sync interval must be at most 1440 minutes')

/**
 * E2E passphrase schema: 8-256 characters.
 * Trims whitespace before validation.
 */
export const e2ePassphraseSchema = z
  .string()
  .trim()
  .min(8, 'Passphrase must be at least 8 characters')
  .max(256, 'Passphrase must be at most 256 characters')

/**
 * Setup-URI schema: max 4096 chars, valid Base64/URI format.
 * Trims whitespace before validation.
 */
export const setupUriSchema = z
  .string()
  .trim()
  .min(1, 'Setup-URI must not be empty')
  .max(16384, 'Setup-URI must be at most 16384 characters')

// ─── Composite Schemas ───────────────────────────────────────────────────────

/**
 * Schema for creating a sync configuration.
 * Supports EITHER setupUri (with optional setupUriPassphrase) OR manual config
 * (endpoint, database, username, password). Both paths can include optional:
 * mode, trigger, intervalMinutes, e2eEnabled, e2ePassphrase.
 */
export const createSyncConfigSchema = z
  .object({
    setupUri: setupUriSchema.optional(),
    setupUriPassphrase: z.string().trim().optional(),
    endpoint: endpointUrlSchema.optional(),
    database: databaseNameSchema.optional(),
    username: syncUsernameSchema.optional(),
    password: syncPasswordSchema.optional(),
    mode: syncModeSchema.optional(),
    trigger: syncTriggerSchema.optional(),
    intervalMinutes: syncIntervalSchema.optional(),
    e2eEnabled: z.boolean().optional(),
    e2ePassphrase: e2ePassphraseSchema.optional(),
  })
  .refine(
    (data) => {
      const hasSetupUri = data.setupUri !== undefined
      const hasManualConfig =
        data.endpoint !== undefined ||
        data.database !== undefined ||
        data.username !== undefined ||
        data.password !== undefined
      return hasSetupUri || hasManualConfig
    },
    { message: 'Either setupUri or manual config (endpoint, database, username, password) must be provided' },
  )
  .refine(
    (data) => {
      const hasSetupUri = data.setupUri !== undefined
      const hasManualConfig =
        data.endpoint !== undefined ||
        data.database !== undefined ||
        data.username !== undefined ||
        data.password !== undefined
      return !(hasSetupUri && hasManualConfig)
    },
    { message: 'Cannot provide both setupUri and manual config (endpoint, database, username, password)' },
  )
  .refine(
    (data) => {
      if (data.setupUri !== undefined) return true
      return (
        data.endpoint !== undefined &&
        data.database !== undefined &&
        data.username !== undefined &&
        data.password !== undefined
      )
    },
    { message: 'Manual config requires all fields: endpoint, database, username, password' },
  )

/**
 * Schema for updating an existing sync configuration.
 * All fields are optional (partial update).
 */
export const updateSyncConfigSchema = z.object({
  endpoint: endpointUrlSchema.optional(),
  database: databaseNameSchema.optional(),
  username: syncUsernameSchema.optional(),
  password: syncPasswordSchema.optional(),
  mode: syncModeSchema.optional(),
  trigger: syncTriggerSchema.optional(),
  intervalMinutes: syncIntervalSchema.optional(),
  e2eEnabled: z.boolean().optional(),
  e2ePassphrase: e2ePassphraseSchema.optional(),
})

/**
 * Schema for triggering a manual sync.
 * Can be empty or have optional fields.
 */
export const triggerSyncSchema = z.object({}).passthrough()

/**
 * Schema for resolving a sync conflict.
 * Requires documentPath (non-empty string) and resolution strategy.
 */
export const resolveConflictSchema = z.object({
  documentPath: z
    .string()
    .trim()
    .min(1, 'Document path must not be empty'),
  resolution: z.enum(['use_remote', 'use_local', 'skip']),
})

/**
 * Schema for querying the sync log with pagination.
 * Page defaults to 1, pageSize defaults to 50 (max 100).
 */
export const syncLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  pageSize: z.coerce.number().int().min(1, 'Page size must be at least 1').max(100, 'Page size must be at most 100').default(50),
})

// ─── Conflict Resolution Schemas ─────────────────────────────────────────────

/**
 * Schema for a single conflict resolution action (discriminated union on `type`).
 * Supports: use_remote, use_local, skip, manual_merge (with content).
 */
export const conflictResolutionActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('use_remote') }),
  z.object({ type: z.literal('use_local') }),
  z.object({ type: z.literal('skip') }),
  z.object({ type: z.literal('manual_merge'), content: z.string() }),
])

/**
 * Schema for batch conflict resolution.
 * Array of objects with documentPath and resolution action.
 * Min 1, max 100 items.
 */
export const resolveBatchSchema = z
  .array(
    z.object({
      documentPath: z.string().min(1, 'Document path must not be empty'),
      resolution: conflictResolutionActionSchema,
    }),
  )
  .min(1, 'Batch must contain at least 1 resolution')
  .max(100, 'Batch must contain at most 100 resolutions')

/**
 * Schema for manual merge resolution (resolve with custom content).
 * Validates documentPath (non-empty) and content (max 10MB).
 */
export const resolveMergeSchema = z.object({
  documentPath: z.string().min(1, 'Document path must not be empty'),
  content: z.string().max(10_485_760, 'Content must be at most 10MB'),
})

/**
 * Re-export of auto-resolution config schema from auto-resolution-config-store.
 * Validates the AutoResolutionConfig shape (enabled + strategies).
 */
export { autoResolutionConfigSchema } from './auto-resolution-config-store.js'

/**
 * Schema for querying file content for diff view.
 * Requires path (non-empty) and source (local or remote).
 */
export const fileContentQuerySchema = z.object({
  path: z.string().min(1, 'Path must not be empty'),
  source: z.enum(['local', 'remote']),
})

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type CreateSyncConfigInput = z.infer<typeof createSyncConfigSchema>
export type UpdateSyncConfigInput = z.infer<typeof updateSyncConfigSchema>
export type TriggerSyncInput = z.infer<typeof triggerSyncSchema>
export type ResolveConflictInput = z.infer<typeof resolveConflictSchema>
export type SyncLogQueryInput = z.infer<typeof syncLogQuerySchema>
export type ConflictResolutionActionInput = z.infer<typeof conflictResolutionActionSchema>
export type ResolveBatchInput = z.infer<typeof resolveBatchSchema>
export type ResolveMergeInput = z.infer<typeof resolveMergeSchema>
export type FileContentQueryInput = z.infer<typeof fileContentQuerySchema>
