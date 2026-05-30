// ─── Link Index Module ───────────────────────────────────────────────────────
// Barrel export for the link-index module.

// Graph data models, wikilink parsing types, and the ILinkIndex interface
export type {
  ILinkIndex,
  GraphNode,
  GraphEdge,
  GraphData,
  BacklinksResponse,
  ParsedWikilink,
} from './types.js'

// Wikilink parser utility
export { extractWikilinks } from './wikilink-parser.js'

// Link index service implementation
export { LinkIndexService, normalizeLinkPath } from './link-index-service.js'
