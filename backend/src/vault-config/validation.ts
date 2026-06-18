/**
 * Zod validation schemas for vault configuration API input.
 */

import { z } from 'zod'

/**
 * Schema for updating vault configuration.
 * All fields are optional — only provided fields are updated.
 */
export const updateVaultConfigSchema = z.object({
  templatesDirectory: z
    .string()
    .max(255, 'Templates directory must be at most 255 characters')
    .refine(
      (val) => !val.includes('..') && !val.startsWith('/') && !val.startsWith('\\'),
      'Templates directory must be a relative path without parent traversal',
    )
    .optional(),
  dailyNotesDirectory: z
    .string()
    .max(255, 'Daily notes directory must be at most 255 characters')
    .refine(
      (val) => !val.includes('..') && !val.startsWith('/') && !val.startsWith('\\'),
      'Daily notes directory must be a relative path without parent traversal',
    )
    .optional(),
})

export type UpdateVaultConfigInput = z.infer<typeof updateVaultConfigSchema>
