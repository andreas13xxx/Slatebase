// ─── Link Index Module ───────────────────────────────────────────────────────
// Barrel export for the link-index module.

// Graph data models, wikilink parsing types, and the ILinkIndex interface
export type {
  ILinkIndex,
  GraphNode,
  GraphEdge,
  GraphData,
  GraphNodeType,
  GraphEdgeType,
  GraphQueryOptions,
  GraphMeta,
  BacklinksResponse,
  ParsedWikilink,
  PropertyFilter,
  PropertyFilterOperator,
} from './types.js'

// Link migration types
export type {
  ILinkMigrationService,
  LinkMigrationResult,
  LinkMigrationFileResult,
  LinkMigrationFailure,
} from './link-migration-service.js'

// Wikilink parser utility
export { extractWikilinks } from './wikilink-parser.js'

// Tag extraction utility
export { extractTags } from './tag-extractor.js'

// Property extraction utility
export { extractProperties } from './property-extractor.js'

// Canvas file-reference extraction utility
export { extractCanvasFileRefs } from './canvas-parser.js'

// Link index service implementation
export { LinkIndexService, normalizeLinkPath, extractFrontmatterTags } from './link-index-service.js'

// Link match resolution (used by link migration to resolve bare-name wikilinks)
export { resolveWikilinkTargetOnTree } from './link-match-resolver.js'

// Link migration service implementation
export { LinkMigrationService, computeAffectedFilePairs, rewriteWikilinksInContent } from './link-migration-service.js'
