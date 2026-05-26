import { z } from 'zod'

// --- Username Validation ---

/**
 * Username schema: 3–64 characters, alphanumeric plus hyphen and underscore.
 */
export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(64, 'Username must be at most 64 characters')
  .regex(
    /^[a-zA-Z0-9\-_]+$/,
    'Username must contain only alphanumeric characters, hyphens, and underscores',
  )

// --- Password Validation ---

/**
 * Password schema: 8–128 characters.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')

// --- Email Validation ---

/**
 * Email schema: RFC 5322 format, max 254 characters.
 * Empty string is allowed (clears the email).
 */
export const emailSchema = z
  .string()
  .max(254, 'Email must be at most 254 characters')
  .refine(
    (val) => val === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
    'Email must be a valid email address',
  )

// --- Display Name Validation ---

/**
 * Display name schema: 1–50 characters.
 */
export const displayNameSchema = z
  .string()
  .min(1, 'Display name must be at least 1 character')
  .max(50, 'Display name must be at most 50 characters')

// --- Avatar URL Validation ---

/**
 * Avatar URL schema: max 2048 characters, must start with http:// or https://.
 * Empty string is allowed (clears the avatar URL).
 */
export const avatarUrlSchema = z
  .string()
  .max(2048, 'Avatar URL must be at most 2048 characters')
  .refine(
    (val) => val === '' || /^https?:\/\//.test(val),
    'Avatar URL must start with http:// or https://',
  )

// --- Enum Schemas ---

/**
 * Preferred language enum: "de" or "en".
 */
export const preferredLanguageSchema = z.enum(['de', 'en'])

/**
 * Color scheme enum: "light", "dark", or "system".
 */
export const colorSchemeSchema = z.enum(['light', 'dark', 'system'])

/**
 * User role enum: "admin" or "user".
 */
export const roleSchema = z.enum(['admin', 'user'])

// --- Pagination Options ---

/**
 * Pagination options schema: page >= 1, pageSize 1–100.
 */
export const paginationOptionsSchema = z.object({
  page: z.number().int().min(1, 'Page must be at least 1'),
  pageSize: z.number().int().min(1, 'Page size must be at least 1').max(100, 'Page size must be at most 100'),
})

// --- Composite Schemas ---

/**
 * Schema for creating a new user (admin action).
 */
export const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: roleSchema,
  displayName: displayNameSchema.optional(),
})

/**
 * Schema for updating a user profile.
 */
export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  email: emailSchema.optional(),
  avatarUrl: avatarUrlSchema.optional(),
  preferredLanguage: preferredLanguageSchema.optional(),
  colorScheme: colorSchemeSchema.optional(),
})

/**
 * Schema for changing a password.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
})

// --- Inferred Types ---

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type PaginationOptionsInput = z.infer<typeof paginationOptionsSchema>
