// Type exports
export type {
  WikilinkNode,
  EmbedNode,
  CalloutNode,
  TagNode,
  WikilinkInfo,
  CalloutTypeConfig,
} from './types'

// Constants
export { IMAGE_EXTENSIONS } from './types'

// Remark plugins
export { remarkWikilink } from './wikilink/plugin'
export { remarkEmbed } from './embed/plugin'
export { remarkCallout } from './callout/plugin'
export { remarkTag } from './tag/plugin'
export { remarkBreaks } from './breaks/plugin'

// Utilities
export { extractWikilinks } from './wikilink/extract'
export { resolveWikilinkTarget } from './link-resolver'
export { generateHeadingAnchor, createAnchorTracker } from './heading-anchor'
