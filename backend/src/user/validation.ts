import { z } from 'zod'

// --- Shared Validation Constants ---
//
// These are the single source of truth for user-field validation rules.
// Both the Zod schemas below (used at the API route layer) and UserService's
// internal guards (user/index.ts, used regardless of call path) are built
// from these constants so the two validation layers can't drift apart.

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 64
export const USERNAME_PATTERN = /^[a-zA-Z0-9\-_]+$/

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

export const DISPLAY_NAME_MIN_LENGTH = 1
export const DISPLAY_NAME_MAX_LENGTH = 50

export const EMAIL_MAX_LENGTH = 254
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const AVATAR_URL_MAX_LENGTH = 2048
export const AVATAR_URL_PATTERN = /^https?:\/\//

// --- Username Validation ---

/**
 * Username schema: 3–64 characters, alphanumeric plus hyphen and underscore.
 */
export const usernameSchema = z
  .string()
  .min(USERNAME_MIN_LENGTH, `Username must be at least ${USERNAME_MIN_LENGTH} characters`)
  .max(USERNAME_MAX_LENGTH, `Username must be at most ${USERNAME_MAX_LENGTH} characters`)
  .regex(
    USERNAME_PATTERN,
    'Username must contain only alphanumeric characters, hyphens, and underscores',
  )

// --- Password Validation ---

/**
 * Password schema: 8–128 characters.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)

// --- Email Validation ---

/**
 * Email schema: RFC 5322 format, max 254 characters.
 * Empty string is allowed (clears the email).
 */
export const emailSchema = z
  .string()
  .max(EMAIL_MAX_LENGTH, `Email must be at most ${EMAIL_MAX_LENGTH} characters`)
  .refine(
    (val) => val === '' || EMAIL_PATTERN.test(val),
    'Email must be a valid email address',
  )

// --- Display Name Validation ---

/**
 * Display name schema: 1–50 characters.
 */
export const displayNameSchema = z
  .string()
  .min(DISPLAY_NAME_MIN_LENGTH, `Display name must be at least ${DISPLAY_NAME_MIN_LENGTH} character`)
  .max(DISPLAY_NAME_MAX_LENGTH, `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters`)

// --- Avatar URL Validation ---

/**
 * Avatar URL schema: max 2048 characters, must start with http:// or https://.
 * Empty string is allowed (clears the avatar URL).
 */
export const avatarUrlSchema = z
  .string()
  .max(AVATAR_URL_MAX_LENGTH, `Avatar URL must be at most ${AVATAR_URL_MAX_LENGTH} characters`)
  .refine(
    (val) => val === '' || AVATAR_URL_PATTERN.test(val),
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
  preferredLanguage: preferredLanguageSchema.optional(),
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
