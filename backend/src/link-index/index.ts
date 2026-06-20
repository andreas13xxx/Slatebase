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
} from './types.js'

// Wikilink parser utility
export { extractWikilinks } from './wikilink-parser.js'

// Tag extraction utility
export { extractTags } from './tag-extractor.js'

// Property extraction utility
export { extractProperties } from './property-extractor.js'

// Canvas file-reference extraction utility
export { extractCanvasFileRefs } from './canvas-parser.js'

// Link index service implementation
export { LinkIndexService, normalizeLinkPath } from './link-index-service.js'
