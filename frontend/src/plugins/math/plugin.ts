/**
 * Remark plugin wrapper for LaTeX math syntax.
 *
 * Registers the micromark syntax extension (inline math) and mdast-util
 * handlers, plus a transformer for block math ($$...$$).
 */
import type { Plugin } from 'unified'
import type { Root } from 'mdast'
import { mathSyntax } from './syntax'
import { mathFromMarkdown, mathToMarkdown, mathBlockTransformer } from './mdast-util'

/**
 * Remark plugin that adds LaTeX math support ($...$ inline, $$...$$ block)
 * to the unified pipeline.
 *
 * Usage:
 * ```ts
 * unified()
 *   .use(remarkParse)
 *   .use(remarkMath)
 *   .parse(markdown)
 * ```
 */
export const remarkMath: Plugin<[], Root> = function () {
  const data = this.data()

  const micromarkExtensions =
    data.micromarkExtensions ?? (data.micromarkExtensions = [])
  micromarkExtensions.push(mathSyntax())

  const fromMarkdownExtensions =
    data.fromMarkdownExtensions ?? (data.fromMarkdownExtensions = [])
  fromMarkdownExtensions.push(mathFromMarkdown())

  const toMarkdownExtensions =
    data.toMarkdownExtensions ?? (data.toMarkdownExtensions = [])
  toMarkdownExtensions.push(mathToMarkdown())

  // Block math transformer: converts paragraphs containing $$...$$ into MathBlockNode
  return (tree: Root) => {
    mathBlockTransformer(tree)
  }
}
