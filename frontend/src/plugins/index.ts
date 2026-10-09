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
export type { HighlightNode } from './highlight/plugin'

// Constants
export { IMAGE_EXTENSIONS } from './types'
export type { HighlightColor, HighlightColorName } from './highlight-colors'
export { HIGHLIGHT_COLORS, matchHighlightColor } from './highlight-colors'

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
export { remarkHighlight } from './highlight/plugin'

// Utilities
export { extractWikilinks } from './wikilink/extract'
export { resolveWikilinkTarget } from './link-resolver'
export { generateHeadingAnchor, createAnchorTracker } from './heading-anchor'
