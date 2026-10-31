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
  dailyNoteFormat: z
    .string()
    .min(1, 'Daily note format must not be empty')
    .max(128, 'Daily note format must be at most 128 characters')
    .refine(
      (val) => !val.includes('..') && !val.startsWith('/') && !val.includes('\\') && !val.includes('//'),
      'Daily note format must be a relative pattern without parent traversal, backslashes or empty folder names',
    )
    // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
    .refine((val) => !/[\u0000-\u001f]/.test(val), 'Daily note format must not contain control characters')
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
