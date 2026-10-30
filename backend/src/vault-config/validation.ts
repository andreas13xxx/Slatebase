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
  dailyNoteTemplate: z
    .string()
    .max(255, 'Daily note template must be at most 255 characters')
    .refine(
      (val) => !val.includes('..') && !val.startsWith('/') && !val.startsWith('\\'),
      'Daily note template must be a relative vault path without parent traversal',
    )
    .optional(),
  uniqueNoteDirectory: z
    .string()
    .max(255, 'Unique note directory must be at most 255 characters')
    .refine(
      (val) => !val.includes('..') && !val.startsWith('/') && !val.startsWith('\\'),
      'Unique note directory must be a relative path without parent traversal',
    )
    .optional(),
  activityRetentionDays: z
    .number()
    .int('Activity retention must be a whole number of days')
    .min(0, 'Activity retention must be 0 or more days')
    .max(3650, 'Activity retention must be at most 3650 days')
    .optional(),
})

export type UpdateVaultConfigInput = z.infer<typeof updateVaultConfigSchema>
