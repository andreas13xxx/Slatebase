/**
 * Zod validation schemas for property-type API input.
 */

import { z } from 'zod'

// ─── Schemas ─────────────────────────────────────────────────────────────────

/** Valid property type values. */
export const propertyTypeSchema = z.enum([
  'text',
  'number',
  'date',
  'datetime',
  'checkbox',
  'list',
  'tags',
  'aliases',
])

/** Type-specific options. */
export const propertyTypeOptionsSchema = z.object({
  allowedValues: z
    .array(z.string().max(200, 'Allowed value must be at most 200 characters'))
    .max(50, 'Maximum 50 allowed values')
    .optional(),
  dateFormat: z.string().max(50, 'Date format must be at most 50 characters').optional(),
}).strict().optional()

/** A single property-key entry. */
export const propertyTypeEntrySchema = z.object({
  key: z
    .string()
    .min(1, 'Property key must be at least 1 character')
    .max(100, 'Property key must be at most 100 characters')
    // Obsidian allows any name here (spaces, umlauts, ...), so a vault's types.json can hold them.
    .regex(/^[^\u0000-\u001f\u007f]+$/, 'Property key must not contain control characters')
    .refine((key) => key.trim() === key, 'Property key must not start or end with whitespace')
    .refine((key) => !['__proto__', 'constructor', 'prototype'].includes(key), 'Property key is reserved'),
  type: propertyTypeSchema,
  options: propertyTypeOptionsSchema,
})

/** The full registry document (for PUT /property-types). */
export const propertyTypeRegistrySchema = z.object({
  entries: z
    .array(propertyTypeEntrySchema)
    .max(200, 'Maximum 200 property type entries per vault'),
})

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type PropertyTypeInput = z.infer<typeof propertyTypeSchema>
export type PropertyTypeEntryInput = z.infer<typeof propertyTypeEntrySchema>
export type PropertyTypeRegistryInput = z.infer<typeof propertyTypeRegistrySchema>
