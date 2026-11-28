import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkFrontmatter from 'remark-frontmatter'

/** A Markdown heading outside code blocks. */
export interface MarkdownHeadingLine {
  lineNumber: number
  level: number
  text: string
}

/**
 * Finds Markdown headings from the parsed syntax tree.
 *
 * @param content - Markdown source
 * @returns Headings in document order, with one-based line numbers
 */
export function findMarkdownHeadingLines(content: string): MarkdownHeadingLine[] {
  const headings: MarkdownHeadingLine[] = []
  // Frontmatter is parsed as its own node: otherwise `key: value` above the closing `---` reads as a setext heading.
  const root = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).parse(content)

  const readText = (node: { value?: unknown; children?: unknown }): string => {
    if (typeof node.value === 'string') return node.value
    if (!Array.isArray(node.children)) return ''
    return node.children.map((child) => readText(child as { value?: unknown; children?: unknown })).join('')
  }

  const visit = (node: { type?: unknown; depth?: unknown; position?: unknown; children?: unknown }): void => {
    if (node.type === 'heading' && typeof node.depth === 'number' && node.position) {
      const position = node.position as { start?: { line?: unknown } }
      const lineNumber = position.start?.line
      if (typeof lineNumber === 'number') {
        headings.push({
          lineNumber,
          level: node.depth,
          text: readText(node as { value?: unknown; children?: unknown }),
        })
      }
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) visit(child as { type?: unknown; depth?: unknown; position?: unknown; children?: unknown })
    }
  }

  visit(root as unknown as { type?: unknown; depth?: unknown; position?: unknown; children?: unknown })

  return headings
}
