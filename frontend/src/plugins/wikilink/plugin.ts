/**
 * Remark plugin wrapper for Obsidian wikilink syntax.
 *
 * Registers the micromark syntax extension and mdast-util
 * (fromMarkdown + toMarkdown) extensions on the unified
 * processor's data store.
 */
import type { Plugin } from 'unified'
import type { Root } from 'mdast'
import type { Options as ToMarkdownExtension } from 'mdast-util-to-markdown'
import { wikilinkSyntax } from './syntax'
import { wikilinkFromMarkdown, wikilinkToMarkdown } from './mdast-util'

declare module 'unified' {
  interface Data {
    toMarkdownExtensions?: Array<ToMarkdownExtension[] | ToMarkdownExtension>
  }
}

/**
 * Remark plugin that adds Obsidian wikilink support to the unified pipeline.
 *
 * Usage:
 * ```ts
 * unified()
 *   .use(remarkParse)
 *   .use(remarkWikilink)
 *   .parse(markdown)
 * ```
 */
export const remarkWikilink: Plugin<[], Root> = function () {
  const data = this.data()

  const micromarkExtensions =
    data.micromarkExtensions ?? (data.micromarkExtensions = [])
  micromarkExtensions.push(wikilinkSyntax())

  const fromMarkdownExtensions =
    data.fromMarkdownExtensions ?? (data.fromMarkdownExtensions = [])
  fromMarkdownExtensions.push(wikilinkFromMarkdown())

  const toMarkdownExtensions =
    data.toMarkdownExtensions ?? (data.toMarkdownExtensions = [])
  toMarkdownExtensions.push(wikilinkToMarkdown())
}
