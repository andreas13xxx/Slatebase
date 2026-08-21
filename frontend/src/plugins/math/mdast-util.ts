/**
 * mdast-util extension for LaTeX math syntax.
 *
 * - Inline math ($...$): fromMarkdown/toMarkdown handlers for micromark tokens.
 * - Block math ($$...$$): MDAST transformer that converts paragraphs starting
 *   with $$ into MathBlockNode. This avoids micromark flow tokenizer complexity.
 */
import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown'
import type { Options as ToMarkdownExtension } from 'mdast-util-to-markdown'
import type { Root, Paragraph, RootContent } from 'mdast'
import type { MathInlineNode, MathBlockNode } from './types'

/**
 * Creates a fromMarkdown extension that converts inline math tokens to MDAST nodes.
 */
export function mathFromMarkdown(): FromMarkdownExtension {
  return {
    enter: {
      mathInline(token) {
        const node: MathInlineNode = {
          type: 'mathInline',
          value: '',
        }
        this.enter(node, token)
      },
    },
    exit: {
      mathInlineValue(token) {
        const value = this.sliceSerialize(token)
        const current = this.stack[this.stack.length - 1]
        if (current && current.type === 'mathInline') {
          (current as unknown as MathInlineNode).value = value
        }
      },
      mathInline(token) {
        this.exit(token)
      },
    },
  }
}

/**
 * Regex to detect block math in paragraph text: $$...$$
 * Matches the full content between $$ delimiters (multiline allowed in paragraph text nodes).
 */
const BLOCK_MATH_PARAGRAPH_RE = /^\$\$([\s\S]*?)\$\$\s*$/

/**
 * MDAST transformer that converts paragraphs whose text content is exactly
 * a $$...$$ block into MathBlockNode. This handles block math without needing
 * a micromark flow tokenizer.
 *
 * Paragraph children can include text nodes and softBreak nodes (for line breaks
 * within the same paragraph). We reconstruct the full text with \n for breaks.
 */
export function mathBlockTransformer(tree: Root): void {
  const newChildren: RootContent[] = []

  for (const node of tree.children) {
    if (node.type === 'paragraph') {
      const para = node as Paragraph
      // Reconstruct text from paragraph children, inserting \n for breaks
      const text = para.children
        .map((child) => {
          if (child.type === 'break') return '\n'
          if ('value' in child) return (child as { value: string }).value
          return ''
        })
        .join('')

      const match = BLOCK_MATH_PARAGRAPH_RE.exec(text)
      if (match) {
        const value = (match[1] ?? '').replace(/^\n+|\n+$/g, '')
        const mathBlock: MathBlockNode = {
          type: 'mathBlock',
          value,
          position: node.position,
        }
        newChildren.push(mathBlock as unknown as RootContent)
        continue
      }
    }
    newChildren.push(node)
  }

  tree.children = newChildren
}

/**
 * Creates a toMarkdown extension that serializes math nodes back to markdown.
 */
export function mathToMarkdown(): ToMarkdownExtension {
  return {
    handlers: {
      mathInline(node: MathInlineNode): string {
        return `$${node.value}$`
      },
      mathBlock(node: MathBlockNode): string {
        return `$$\n${node.value}\n$$`
      },
    },
  }
}
