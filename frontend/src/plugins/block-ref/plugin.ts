/**
 * Remark plugin wrapper for Obsidian block reference markers.
 *
 * Unlike the wikilink and embed plugins which use micromark syntax extensions,
 * the block-ref plugin uses an MDAST transformer (like the callout plugin).
 * It transforms existing paragraph/heading/listItem nodes by stripping
 * the trailing ` ^block-id` pattern and storing it as metadata.
 *
 * Also registers the toMarkdown extension for serialization.
 */
import type { Plugin } from 'unified'
import type { Root } from 'mdast'
import { transformBlockMarkers } from './marker-parser'
import { blockRefToMarkdown } from './marker-serializer'

/**
 * Remark plugin that adds Obsidian block reference marker support to the unified pipeline.
 *
 * Usage:
 * ```ts
 * unified()
 *   .use(remarkParse)
 *   .use(remarkBlockRef)
 *   .parse(markdown)
 * ```
 *
 * The plugin returns a transformer function that runs during the `run` phase,
 * detecting and stripping block markers from paragraph, heading, and listItem nodes.
 */
export const remarkBlockRef: Plugin<[], Root> = function () {
  const data = this.data()

  // Register toMarkdown extension for serialization
  const toMarkdownExtensions =
    data.toMarkdownExtensions ?? (data.toMarkdownExtensions = [])
  toMarkdownExtensions.push(blockRefToMarkdown())

  // Return a transformer function that runs during the `run` phase
  return (tree: Root) => {
    transformBlockMarkers(tree)
  }
}
