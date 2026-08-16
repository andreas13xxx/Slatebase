import { z } from 'zod'

// ─── Snippet Filename Validation ──────────────────────────────────────────────

/**
 * Strict pattern for snippet filenames (Requirement 10.6):
 * - Only letters, digits, underscore, hyphen in the basename
 * - Must end in `.css`
 * - No path separators or `..` sequences
 */
export const SNIPPET_FILENAME_PATTERN = /^[a-zA-Z0-9_-]+\.css$/

/**
 * Validates a snippet filename string against the safe pattern.
 * Use this for route parameter validation where Zod is not available.
 *
 * @returns true if the filename is safe to use in filesystem paths
 */
export function isValidSnippetFilename(filename: string): boolean {
  return SNIPPET_FILENAME_PATTERN.test(filename)
}

/** Derives the snippet id (filename without `.css`) from a validated filename. */
export function snippetIdFromFilename(filename: string): string {
  return filename.slice(0, -'.css'.length)
}

// ─── Snippet Validation Schemas ───────────────────────────────────────────────

/** Maximum snippet CSS size: 512 KB (Requirement 8.7 / 10.3). */
export const MAX_SNIPPET_SIZE = 512 * 1024

/** Schema for validating a snippet filename (route params / upload body). */
export const snippetFilenameSchema = z.string()
  .min(5, 'Filename must not be empty') // shortest valid: "a.css"
  .max(128, 'Filename must not exceed 128 characters')
  .regex(SNIPPET_FILENAME_PATTERN, 'Filename must match [a-zA-Z0-9_-]+.css')

/** Schema for validating snippet CSS content. Must not exceed 512 KB. */
export const snippetContentSchema = z.string().max(MAX_SNIPPET_SIZE, 'Snippet must not exceed 512 KB')

/** Schema for the upload/create request body. */
export const saveSnippetSchema = z.object({
  filename: snippetFilenameSchema,
  content: snippetContentSchema,
})

/** Schema for the content-update request body (PUT). */
export const updateSnippetContentSchema = z.object({
  content: snippetContentSchema,
})

/** Schema for the registry (activation status) request body. */
export const snippetRegistrySchema = z.object({
  version: z.literal(1),
  snippets: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      updatedAt: z.string(),
    }),
  ),
})

export type SaveSnippetInput = z.infer<typeof saveSnippetSchema>
export type SnippetRegistryInput = z.infer<typeof snippetRegistrySchema>
