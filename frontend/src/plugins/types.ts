import type { Literal, Node, PhrasingContent, RootContent } from 'mdast'

/**
 * Wikilink node: [[target]], [[target|display]], [[target#heading]]
 */
export interface WikilinkNode extends Literal {
  type: 'wikilink'
  target: string
  display: string
  heading: string | null
}

/**
 * Embed node: ![[target]], ![[target#heading]], ![[target|display]]
 *
 * For image embeds, the display field can contain sizing/formatting info:
 * - `![[image.jpg|300]]` → width=300
 * - `![[image.jpg|300x200]]` → width=300, height=200
 * - `![[image.jpg|100%]]` → width=100%
 * - `![[image.jpg|alt text]]` → alt text (non-numeric)
 */
export interface EmbedNode extends Literal {
  type: 'embed'
  target: string
  heading: string | null
  display: string | null
  embedType: 'image' | 'note'
}

/**
 * Callout node: > [!type] Title
 */
export interface CalloutNode extends Node {
  type: 'callout'
  calloutType: string
  title: string
  foldable: boolean
  defaultOpen: boolean
  children: PhrasingContent[]
  body: RootContent[]
}

/**
 * Tag node: #tagname, #nested/tag
 */
export interface TagNode extends Literal {
  type: 'tag'
  tag: string
}

/**
 * Result of extractWikilinks() utility function.
 */
export interface WikilinkInfo {
  target: string
  display: string
  heading: string | null
  position: { line: number; column: number }
}

/**
 * Callout type configuration for rendering.
 */
export interface CalloutTypeConfig {
  icon: string
  colorToken: string
}

/**
 * Supported image extensions for embed type detection.
 */
export const IMAGE_EXTENSIONS: readonly string[] = [
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.bmp'
]

declare module 'mdast' {
  interface PhrasingContentMap {
    wikilink: WikilinkNode
    tag: TagNode
  }

  interface BlockContentMap {
    embed: EmbedNode
    callout: CalloutNode
  }

  interface RootContentMap {
    wikilink: WikilinkNode
    tag: TagNode
    embed: EmbedNode
    callout: CalloutNode
  }
}
