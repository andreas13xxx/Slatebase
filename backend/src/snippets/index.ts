// ─── Snippets Module Barrel Export ─────────────────────────────────────────────

export { SnippetStore } from './snippet-store.js'
export { migrateLegacySnippets, LEGACY_MIGRATED_MARKER } from './legacy-migration.js'
export { AppearanceFileInvalidError } from '../shared/appearance-file.js'
export { SnippetNotFoundError, SnippetTooLargeError, InvalidSnippetFilenameError } from './errors.js'
export {
  SNIPPET_FILENAME_PATTERN,
  SNIPPET_ID_PATTERN,
  isValidSnippetFilename,
  snippetIdFromFilename,
  MAX_SNIPPET_SIZE,
  snippetFilenameSchema,
  snippetContentSchema,
  saveSnippetSchema,
  updateSnippetContentSchema,
  snippetRegistrySchema,
} from './validation.js'
export type { ISnippetStore, SnippetMeta, SnippetRegistryData } from './types.js'
export type { SaveSnippetInput, SnippetRegistryInput } from './validation.js'
