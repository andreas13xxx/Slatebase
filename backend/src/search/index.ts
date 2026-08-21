// ─── Search Module ───────────────────────────────────────────────────────────
// Barrel export for the search-and-discovery module.

// Types and interfaces
export type {
  ISearchOptions,
  SearchResponse,
  SearchFileResult,
  SearchHit,
  SkippedFile,
  MultiVaultSearchResponse,
  VaultSearchResult,
  FailedVault,
  ISearchService,
  IReplaceOptions,
  ReplaceResponse,
  ReplaceFileResult,
  ReplaceFailure,
  IReplaceService,
} from './types.js'

// Error classes
export {
  SearchQueryValidationError,
  RegexValidationError,
  RegexTooLongError,
  ReplaceValidationError,
} from './errors.js'

// Validation schemas and inferred types
export {
  searchQuerySchema,
  multiVaultSearchSchema,
  replaceBodySchema,
} from './validation.js'

export type {
  SearchQueryInput,
  MultiVaultSearchInput,
  ReplaceBodyInput,
} from './validation.js'

// Service implementations
export { SearchService } from './search-service.js'
export { ReplaceService } from './replace-service.js'

// Query parser
export { parseSearchQuery } from './query-parser.js'
export type { ParsedQuery, ParsedOperator, OperatorType } from './query-parser.js'

// Glob matching utility
export { globMatch } from './glob-match.js'
