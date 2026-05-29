/**
 * Remark plugin wrapper for Obsidian callout syntax.
 *
 * Unlike the wikilink and embed plugins which use micromark syntax extensions,
 * the callout plugin uses an MDAST transformer. It transforms existing blockquote
 * nodes into CalloutNodes during the `run` phase of the unified pipeline.
 *
 * Also registers the toMarkdown extension for serialization.
 */
import type { Plugin } from 'unified'
import type { Root } from 'mdast'
import { transformCallouts } from './transform'
import { calloutToMarkdown } from './serializer'

/**
 * Remark plugin that adds Obsidian callout support to the unified pipeline.
 *
 * Usage:
 * ```ts
 * unified()
 *   .use(remarkParse)
 *   .use(remarkCallout)
 *   .parse(markdown)
 * ```
 *
 * The plugin returns a transformer function that runs during the `run` phase,
 * converting blockquote nodes with `[!type]` syntax into structured CalloutNodes.
 */
export const remarkCallout: Plugin<[], Root> = function () {
  const data = this.data()

  // Register toMarkdown extension for serialization
  const toMarkdownExtensions =
    data.toMarkdownExtensions ?? (data.toMarkdownExtensions = [])
  toMarkdownExtensions.push(calloutToMarkdown())

  // Return a transformer function that runs during the `run` phase
  return (tree: Root) => {
    transformCallouts(tree)
  }
}
