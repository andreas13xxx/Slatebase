import { z } from 'zod'

// ─── Chat Validation Schemas ─────────────────────────────────────────────────

/**
 * Schema for validating 24-character hexadecimal IDs (conversation IDs, message IDs).
 */
export const hexId24Schema = z.string().regex(/^[0-9a-f]{24}$/, 'Must be a 24-character hexadecimal string')

/**
 * Schema for validating the send message request body.
 * Content must be 1–4000 characters and contain at least one non-whitespace character.
 */
export const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message content must not be empty').max(4000, 'Message content must not exceed 4000 characters').refine(
    (s) => s.trim().length > 0,
    { message: 'Message content must not be empty or whitespace-only' }
  ),
})

/**
 * Schema for validating the create conversation request body.
 * Participants array must contain 1–49 user ID strings (creator is added automatically).
 */
export const createConversationSchema = z.object({
  participants: z.array(z.string()).min(1, 'At least one participant is required').max(49, 'At most 49 participants allowed'),
})

/**
 * Schema for validating pagination query parameters.
 * Page defaults to 1, pageSize defaults to 50 (max 50).
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(50),
})

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type SendMessageInput = z.infer<typeof sendMessageSchema>
export type CreateConversationInput = z.infer<typeof createConversationSchema>
export type PaginationInput = z.infer<typeof paginationSchema>
