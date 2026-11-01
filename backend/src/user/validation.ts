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

// --- Avatar (configurable) Validation ---

/**
 * Maximum length of an `avatarData` base64 data URL. 256 KB of raw bytes
 * becomes ~341 KB of base64 (overhead 4/3); 358_000 leaves headroom for the
 * `data:image/...;base64,` prefix.
 */
export const MAX_AVATAR_DATA_LENGTH = 358_000

/**
 * Avatar type enum: how the avatar is rendered.
 * - `initials`: coloured initials tile
 * - `url`: external image URL (legacy `avatarUrl`)
 * - `dicebear`: external DiceBear image URL
 * - `image`: uploaded/pasted image stored inline as a data URL
 */
export const avatarTypeSchema = z.enum(['initials', 'url', 'dicebear', 'image'])

/**
 * Avatar colour schema: empty string or a `#rrggbb` hex colour.
 */
export const avatarColorSchema = z
  .string()
  .refine(
    (val) => val === '' || /^#[0-9a-fA-F]{6}$/.test(val),
    'Avatar colour must be empty or a #rrggbb hex colour',
  )

/**
 * DiceBear avatar URL schema: empty string, or an https URL on
 * `api.dicebear.com` (max 2048 chars). No other host is allowed — DiceBear is
 * loaded via `<img src>`, so the server pins the host rather than relying on CSP.
 */
export const avatarDicebearSchema = z
  .string()
  .max(2048, 'DiceBear URL must be at most 2048 characters')
  .refine((val) => {
    if (val === '') return true
    try {
      const parsed = new URL(val)
      return parsed.protocol === 'https:' && parsed.hostname === 'api.dicebear.com'
    } catch {
      return false
    }
  }, 'DiceBear URL must be an https URL on api.dicebear.com')

/**
 * Inline image data URL schema: empty string, or a `data:image/...;base64,...`
 * URL (png/jpeg/webp/gif) no longer than MAX_AVATAR_DATA_LENGTH characters.
 */
export const avatarDataSchema = z
  .string()
  .max(MAX_AVATAR_DATA_LENGTH, 'Avatar image data is too large (max ~256 KB)')
  .refine(
    (val) => val === '' || /^data:image\/(png|jpeg|webp|gif);base64,/.test(val),
    'Avatar image must be a data:image/(png|jpeg|webp|gif);base64 URL',
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
  avatarType: avatarTypeSchema.optional(),
  avatarColor: avatarColorSchema.optional(),
  avatarData: avatarDataSchema.optional(),
  avatarDicebear: avatarDicebearSchema.optional(),
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
