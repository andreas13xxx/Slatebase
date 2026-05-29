/**
 * Remark plugin wrapper for Obsidian embed syntax.
 *
 * Registers the micromark syntax extension and mdast-util
 * (fromMarkdown + toMarkdown) extensions on the unified
 * processor's data store.
 */
import type { Plugin } from 'unified'
import type { Root } from 'mdast'
import { embedSyntax } from './syntax'
import { embedFromMarkdown, embedToMarkdown } from './mdast-util'

/**
 * Remark plugin that adds Obsidian embed support to the unified pipeline.
 *
 * Usage:
 * ```ts
 * unified()
 *   .use(remarkParse)
 *   .use(remarkEmbed)
 *   .parse(markdown)
 * ```
 */
export const remarkEmbed: Plugin<[], Root> = function () {
  const data = this.data()

  const micromarkExtensions =
    data.micromarkExtensions ?? (data.micromarkExtensions = [])
  micromarkExtensions.push(embedSyntax())

  const fromMarkdownExtensions =
    data.fromMarkdownExtensions ?? (data.fromMarkdownExtensions = [])
  fromMarkdownExtensions.push(embedFromMarkdown())

  const toMarkdownExtensions =
    data.toMarkdownExtensions ?? (data.toMarkdownExtensions = [])
  toMarkdownExtensions.push(embedToMarkdown())
}
