import { z } from 'zod'

// --- Login Request Validation ---

/**
 * Login request schema: username 1–64 characters, password 1–128 characters.
 * Note: Login uses relaxed validation since the actual credential check
 * happens in the AuthService. We only reject obviously empty input here.
 */
export const loginRequestSchema = z.object({
  username: z
    .string()
    .min(1, 'Username is required')
    .max(64, 'Username must be at most 64 characters'),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password must be at most 128 characters'),
})

// --- Server Config Update Validation ---

/**
 * Log level enum for server configuration.
 */
export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error'])

/**
 * Trash configuration update schema.
 * retentionDays: 0–365 (0 = immediate permanent delete).
 */
export const trashConfigUpdateSchema = z.object({
  retentionDays: z
    .number()
    .int('Retention days must be an integer')
    .min(0, 'Retention days must be at least 0')
    .max(365, 'Retention days must be at most 365'),
})

/**
 * Versions configuration update schema.
 * maxPerFile: 0–100 (0 = no versioning).
 */
export const versionsConfigUpdateSchema = z.object({
  maxPerFile: z
    .number()
    .int('Max versions per file must be an integer')
    .min(0, 'Max versions per file must be at least 0')
    .max(100, 'Max versions per file must be at most 100'),
})

/**
 * Server configuration update schema.
 * Validates port (1–65535), host (non-empty), logLevel (enum),
 * maxFileSize (positive integer), allowedOrigins (string array),
 * and optional trash/versions sub-objects.
 */
export const serverConfigUpdateSchema = z.object({
  port: z
    .number()
    .int('Port must be an integer')
    .min(1, 'Port must be at least 1')
    .max(65535, 'Port must be at most 65535'),
  host: z
    .string()
    .min(1, 'Host must not be empty'),
  logLevel: logLevelSchema,
  maxFileSize: z
    .number()
    .int('Max file size must be an integer')
    .positive('Max file size must be greater than 0'),
  allowedOrigins: z.array(z.string()),
  trash: trashConfigUpdateSchema.optional(),
  versions: versionsConfigUpdateSchema.optional(),
})

// --- Inferred Types ---

export type LoginRequestInput = z.infer<typeof loginRequestSchema>
export type ServerConfigUpdateInput = z.infer<typeof serverConfigUpdateSchema>
