/**
 * Remark plugin wrapper for Obsidian inline tag syntax.
 *
 * Registers the micromark syntax extension and mdast-util
 * (fromMarkdown + toMarkdown) extensions on the unified
 * processor's data store.
 */
import type { Plugin } from 'unified'
import type { Root } from 'mdast'
import { tagSyntax } from './syntax'
import { tagFromMarkdown, tagToMarkdown } from './mdast-util'

/**
 * Remark plugin that adds Obsidian inline tag support to the unified pipeline.
 *
 * Usage:
 * ```ts
 * unified()
 *   .use(remarkParse)
 *   .use(remarkTag)
 *   .parse(markdown)
 * ```
 */
export const remarkTag: Plugin<[], Root> = function () {
  const data = this.data()

  const micromarkExtensions =
    data.micromarkExtensions ?? (data.micromarkExtensions = [])
  micromarkExtensions.push(tagSyntax())

  const fromMarkdownExtensions =
    data.fromMarkdownExtensions ?? (data.fromMarkdownExtensions = [])
  fromMarkdownExtensions.push(tagFromMarkdown())

  const toMarkdownExtensions =
    data.toMarkdownExtensions ?? (data.toMarkdownExtensions = [])
  toMarkdownExtensions.push(tagToMarkdown())
}
