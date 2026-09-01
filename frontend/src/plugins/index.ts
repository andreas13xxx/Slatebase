// Type exports
export type {
  WikilinkNode,
  EmbedNode,
  CalloutNode,
  TagNode,
  WikilinkInfo,
  CalloutTypeConfig,
} from './types'

export type { MathInlineNode, MathBlockNode } from './math/types'
export type { FootnoteEntry, NumberedFootnoteReference } from './footnote/plugin'

// Constants
export { IMAGE_EXTENSIONS } from './types'

// Remark plugins
export { remarkWikilink } from './wikilink/plugin'
export { remarkEmbed } from './embed/plugin'
export { remarkCallout } from './callout/plugin'
export { remarkTag } from './tag/plugin'
export { remarkBreaks } from './breaks/plugin'
export { remarkBlockRef } from './block-ref/plugin'
export { remarkPreserveTableCodeEscapes } from './preserve-table-code-escapes'
export { remarkMath } from './math/plugin'
export { remarkFootnotes, getFootnoteEntries } from './footnote/plugin'

// Utilities
export { extractWikilinks } from './wikilink/extract'
export { resolveWikilinkTarget } from './link-resolver'
export { generateHeadingAnchor, createAnchorTracker } from './heading-anchor'
