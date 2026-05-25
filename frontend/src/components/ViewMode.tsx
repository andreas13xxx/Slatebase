import { type ReactNode, createElement, useMemo } from 'react'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import { parse as parseYaml } from 'yaml'
import hljs from 'highlight.js'
import type { Root, RootContent, PhrasingContent, AlignType } from 'mdast'
import type { DirectoryTree } from '../types'

/**
 * Props for the ViewMode (Markdown renderer) component.
 */
export interface ViewModeProps {
  content: string
  vaultId: string
  directoryTree: DirectoryTree | null
  onInternalLinkClick?: (targetPath: string) => void
  token?: string
}

/**
 * Searches the DirectoryTree recursively for a file matching the given target name.
 * Matching is case-insensitive and tries both with and without .md extension.
 * Returns the file's relative path if found, or null if not found.
 *
 * Validates: Requirements 6.1, 6.6
 */
export function resolveWikilinkTarget(target: string, tree: DirectoryTree | null): string | null {
  if (!tree) return null

  const normalizedTarget = target.trim()
  if (!normalizedTarget) return null

  // Collect all files from the tree
  const files: { name: string; path: string }[] = []
  collectFiles(tree, files)

  // Try exact match (case-insensitive)
  const targetLower = normalizedTarget.toLowerCase()
  for (const file of files) {
    const nameLower = file.name.toLowerCase()
    if (nameLower === targetLower || nameLower === targetLower + '.md') {
      return file.path
    }
    // Also match if target includes .md and file name matches
    if (targetLower.endsWith('.md') && nameLower === targetLower) {
      return file.path
    }
  }

  return null
}

/**
 * Recursively collects all file entries from a DirectoryTree.
 */
function collectFiles(node: DirectoryTree, result: { name: string; path: string }[]): void {
  if (node.type === 'file') {
    result.push({ name: node.name, path: node.path })
  }
  if (node.children) {
    for (const child of node.children) {
      collectFiles(child, result)
    }
  }
}



/**
 * ViewMode renders Markdown content as formatted React elements.
 *
 * Features:
 * - Headings (H1–H6) as collapsible <details>/<summary> sections (default expanded)
 * - Text formatting (bold, italic, strikethrough, inline code)
 * - Ordered/unordered lists and task lists (non-interactive checkboxes)
 * - Code blocks with highlight.js syntax highlighting
 * - GFM tables, blockquotes, horizontal rules
 * - Wikilinks [[target]] and [[target|display]] with resolution against DirectoryTree
 * - Standard Markdown links with external/internal/broken classification
 * - Invalid/unparsable syntax rendered as plain text without crashing
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */
export function ViewMode({ content, vaultId, directoryTree, onInternalLinkClick, token }: ViewModeProps) {
  const rendered = useMemo(() => {
    try {
      const tree = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkGfm)
        .parse(content)

      return renderRoot(tree, vaultId, directoryTree, onInternalLinkClick, token)
    } catch {
      // Req 5.7: Invalid/unparsable syntax rendered as plain text without crashing
      return createElement('pre', { className: 'view-mode-fallback' }, content)
    }
  }, [content, vaultId, directoryTree, onInternalLinkClick, token])

  return createElement('article', { className: 'view-mode', 'aria-label': 'Markdown-Ansicht' }, rendered)
}

/**
 * Renders the root MDAST node, grouping content under collapsible heading sections.
 * Req 5.2: Headings as collapsible sections with content until next same-or-higher heading.
 */
function renderRoot(
  root: Root,
  vaultId: string,
  directoryTree: DirectoryTree | null,
  onInternalLinkClick?: (targetPath: string) => void,
  token?: string
): ReactNode {
  const children = root.children
  const sections = groupByHeadings(children)

  const elements: ReactNode[] = []
  sections.forEach((section, i) => {
    if (section.type === 'content') {
      elements.push(...renderBlockNodes(section.nodes, vaultId, directoryTree, onInternalLinkClick, `root-${i}`, token))
    } else {
      elements.push(renderHeadingSection(section, vaultId, directoryTree, onInternalLinkClick, `section-${i}`, token))
    }
  })

  return elements
}

interface ContentGroup {
  type: 'content'
  nodes: RootContent[]
}

interface HeadingSection {
  type: 'heading'
  depth: 1 | 2 | 3 | 4 | 5 | 6
  headingChildren: PhrasingContent[]
  body: RootContent[]
}

type SectionGroup = ContentGroup | HeadingSection

/**
 * Groups root-level nodes into heading sections.
 * Content before the first heading is a plain content group.
 * Each heading starts a new section that includes all content until the next
 * heading of same or higher (lower depth number) level.
 */
function groupByHeadings(nodes: RootContent[]): SectionGroup[] {
  const groups: SectionGroup[] = []
  let currentSection: HeadingSection | null = null
  let preamble: RootContent[] = []

  for (const node of nodes) {
    if (node.type === 'heading') {
      // If there's a current section and this heading is same-or-higher level, close it
      if (currentSection && node.depth <= currentSection.depth) {
        groups.push(currentSection)
        currentSection = null
      } else if (currentSection) {
        // This heading is deeper — it belongs inside the current section body
        currentSection.body.push(node)
        continue
      }

      // Flush preamble content before first heading
      if (preamble.length > 0) {
        groups.push({ type: 'content', nodes: preamble })
        preamble = []
      }

      currentSection = {
        type: 'heading',
        depth: node.depth,
        headingChildren: node.children,
        body: [],
      }
    } else {
      if (currentSection) {
        currentSection.body.push(node)
      } else {
        preamble.push(node)
      }
    }
  }

  // Flush remaining
  if (preamble.length > 0) {
    groups.push({ type: 'content', nodes: preamble })
  }
  if (currentSection) {
    groups.push(currentSection)
  }

  return groups
}

/**
 * Renders a heading section as a collapsible <details>/<summary> element.
 * Default expanded (open attribute).
 */
function renderHeadingSection(
  section: HeadingSection,
  vaultId: string,
  directoryTree: DirectoryTree | null,
  onInternalLinkClick: ((targetPath: string) => void) | undefined,
  key: string,
  token?: string
): ReactNode {
  const HeadingTag = `h${section.depth}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  const headingContent = renderPhrasingNodes(section.headingChildren, vaultId, directoryTree, onInternalLinkClick, `${key}-heading`, token)

  // Recursively group the body content for nested headings
  const bodyGroups = groupByHeadings(section.body)
  const bodyElements: ReactNode[] = []
  bodyGroups.forEach((group, i) => {
    if (group.type === 'content') {
      bodyElements.push(...renderBlockNodes(group.nodes, vaultId, directoryTree, onInternalLinkClick, `${key}-body-${i}`, token))
    } else {
      bodyElements.push(renderHeadingSection(group, vaultId, directoryTree, onInternalLinkClick, `${key}-body-${i}`, token))
    }
  })

  return createElement('details', { key, open: true, className: `view-mode-section view-mode-section--h${section.depth}` },
    createElement('summary', { className: 'view-mode-section-summary' },
      createElement(HeadingTag, null, headingContent)
    ),
    ...bodyElements
  )
}

/**
 * Renders an array of block-level MDAST nodes as a fragment.
 */
function renderBlockNodes(
  nodes: RootContent[],
  vaultId: string,
  directoryTree: DirectoryTree | null,
  onInternalLinkClick: ((targetPath: string) => void) | undefined,
  keyPrefix: string,
  token?: string
): ReactNode[] {
  return nodes.map((node, i) => renderBlockNode(node, vaultId, directoryTree, onInternalLinkClick, `${keyPrefix}-${i}`, token))
}

/**
 * Renders a single block-level MDAST node.
 */
function renderBlockNode(
  node: RootContent,
  vaultId: string,
  directoryTree: DirectoryTree | null,
  onInternalLinkClick: ((targetPath: string) => void) | undefined,
  key: string,
  token?: string
): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return createElement('p', { key },
        renderPhrasingNodes(node.children, vaultId, directoryTree, onInternalLinkClick, key, token)
      )

    case 'heading':
      // Standalone heading (shouldn't normally appear here due to grouping, but handle gracefully)
      return renderHeadingSection(
        { type: 'heading', depth: node.depth, headingChildren: node.children, body: [] },
        vaultId, directoryTree, onInternalLinkClick, key, token
      )

    case 'blockquote':
      return createElement('blockquote', { key },
        renderBlockNodes(node.children, vaultId, directoryTree, onInternalLinkClick, key, token)
      )

    case 'code':
      return renderCodeBlock(node.value, node.lang, key)

    case 'list':
      return renderList(node, vaultId, directoryTree, onInternalLinkClick, key, token)

    case 'table':
      return renderTable(node, vaultId, directoryTree, onInternalLinkClick, key, token)

    case 'thematicBreak':
      return createElement('hr', { key })

    case 'html':
      // Render raw HTML as plain text for safety (Req 5.7)
      return createElement('pre', { key, className: 'view-mode-html' }, node.value)

    case 'definition':
      // Link definitions are not rendered visually
      return null

    case 'footnoteDefinition':
      // Not rendered inline
      return null

    case 'yaml':
      // Frontmatter — render as formatted key-value table
      return renderFrontmatter(node.value, key)

    default:
      // Req 5.7: Unknown node types rendered as plain text
      return createElement('span', { key }, String((node as { value?: string }).value ?? ''))
  }
}

/**
 * Renders a code block with highlight.js syntax highlighting.
 * Req 5.5: Syntax highlighting with fallback to monospace for unknown languages.
 */
function renderCodeBlock(code: string, lang: string | null | undefined, key: string): ReactNode {
  let highlighted: string | null = null

  if (lang) {
    try {
      const result = hljs.highlight(code, { language: lang, ignoreIllegals: true })
      highlighted = result.value
    } catch {
      // Language not supported — fallback to plain monospace
      highlighted = null
    }
  }

  if (highlighted !== null) {
    return createElement('pre', { key, className: 'view-mode-code' },
      createElement('code', {
        className: `hljs language-${lang}`,
        dangerouslySetInnerHTML: { __html: highlighted },
      })
    )
  }

  // No language or unsupported language — render as plain monospace
  return createElement('pre', { key, className: 'view-mode-code' },
    createElement('code', null, code)
  )
}

/**
 * Renders YAML frontmatter as a formatted key-value table.
 * Falls back to a code block if YAML parsing fails.
 */
function renderFrontmatter(yamlContent: string, key: string): ReactNode {
  try {
    const data = parseYaml(yamlContent)
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return renderCodeBlock(yamlContent, 'yaml', key)
    }

    const entries = Object.entries(data as Record<string, unknown>)
    if (entries.length === 0) {
      return null
    }

    const rows = entries.map(([k, v], i) => {
      const valueStr = Array.isArray(v)
        ? v.join(', ')
        : typeof v === 'object' && v !== null
          ? JSON.stringify(v)
          : String(v ?? '')

      return createElement('tr', { key: `${key}-fm-${i}` },
        createElement('th', null, k),
        createElement('td', null, valueStr),
      )
    })

    return createElement('div', { key, className: 'view-mode-frontmatter' },
      createElement('table', { className: 'view-mode-frontmatter-table' },
        createElement('tbody', null, ...rows),
      ),
    )
  } catch {
    // YAML parse error — fall back to code block
    return renderCodeBlock(yamlContent, 'yaml', key)
  }
}

/**
 * Renders ordered/unordered lists and task lists.
 * Req 5.4: Task list checkboxes are non-interactive.
 */
function renderList(
  node: { ordered?: boolean | null; start?: number | null; children: Array<{ type: string; checked?: boolean | null; children: RootContent[] }> },
  vaultId: string,
  directoryTree: DirectoryTree | null,
  onInternalLinkClick: ((targetPath: string) => void) | undefined,
  key: string,
  token?: string
): ReactNode {
  const Tag = node.ordered ? 'ol' : 'ul'
  const attrs: Record<string, unknown> = { key }
  if (node.ordered && node.start != null && node.start !== 1) {
    attrs.start = node.start
  }

  const items = node.children.map((item, i) => {
    const itemKey = `${key}-li-${i}`

    if (item.checked != null) {
      // Task list item — render with non-interactive checkbox
      return createElement('li', { key: itemKey, className: 'view-mode-task-item' },
        createElement('input', {
          type: 'checkbox',
          checked: item.checked,
          disabled: true,
          readOnly: true,
          'aria-label': item.checked ? 'Erledigt' : 'Offen',
        }),
        renderBlockNodes(item.children as RootContent[], vaultId, directoryTree, onInternalLinkClick, itemKey, token)
      )
    }

    return createElement('li', { key: itemKey },
      renderBlockNodes(item.children as RootContent[], vaultId, directoryTree, onInternalLinkClick, itemKey, token)
    )
  })

  return createElement(Tag, attrs, ...items)
}

/**
 * Renders a GFM table.
 * Req 5.6: GFM pipe tables rendered as HTML table elements.
 */
function renderTable(
  node: { align?: AlignType[] | null; children: Array<{ type: string; children: Array<{ type: string; children: PhrasingContent[] }> }> },
  vaultId: string,
  directoryTree: DirectoryTree | null,
  onInternalLinkClick: ((targetPath: string) => void) | undefined,
  key: string,
  token?: string
): ReactNode {
  const align = node.align ?? []
  const rows = node.children

  if (rows.length === 0) {
    return createElement('table', { key })
  }

  // First row is the header
  const headerRow = rows[0]
  const bodyRows = rows.slice(1)

  const thead = createElement('thead', { key: `${key}-thead` },
    createElement('tr', null,
      ...headerRow.children.map((cell, ci) =>
        createElement('th', {
          key: `${key}-th-${ci}`,
          style: align[ci] ? { textAlign: align[ci] as string } : undefined,
        },
          renderPhrasingNodes(cell.children, vaultId, directoryTree, onInternalLinkClick, `${key}-th-${ci}`, token)
        )
      )
    )
  )

  const tbody = bodyRows.length > 0
    ? createElement('tbody', { key: `${key}-tbody` },
        ...bodyRows.map((row, ri) =>
          createElement('tr', { key: `${key}-tr-${ri}` },
            ...row.children.map((cell, ci) =>
              createElement('td', {
                key: `${key}-td-${ri}-${ci}`,
                style: align[ci] ? { textAlign: align[ci] as string } : undefined,
              },
                renderPhrasingNodes(cell.children, vaultId, directoryTree, onInternalLinkClick, `${key}-td-${ri}-${ci}`, token)
              )
            )
          )
        )
      )
    : null

  return createElement('table', { key, className: 'view-mode-table' }, thead, tbody)
}

/**
 * Renders an array of phrasing (inline) MDAST nodes.
 */
function renderPhrasingNodes(
  nodes: PhrasingContent[],
  vaultId: string,
  directoryTree: DirectoryTree | null,
  onInternalLinkClick: ((targetPath: string) => void) | undefined,
  keyPrefix: string,
  token?: string
): ReactNode[] {
  return nodes.map((node, i) => renderPhrasingNode(node, vaultId, directoryTree, onInternalLinkClick, `${keyPrefix}-${i}`, token))
}

/**
 * Renders a single phrasing (inline) MDAST node.
 * Req 5.3: Text formatting as proper HTML elements.
 */
function renderPhrasingNode(
  node: PhrasingContent,
  vaultId: string,
  directoryTree: DirectoryTree | null,
  onInternalLinkClick: ((targetPath: string) => void) | undefined,
  key: string,
  token?: string
): ReactNode {
  switch (node.type) {
    case 'text':
      return renderTextWithEmbeds(node.value, vaultId, directoryTree, onInternalLinkClick, key, token)

    case 'strong':
      return createElement('strong', { key },
        renderPhrasingNodes(node.children, vaultId, directoryTree, onInternalLinkClick, key, token)
      )

    case 'emphasis':
      return createElement('em', { key },
        renderPhrasingNodes(node.children, vaultId, directoryTree, onInternalLinkClick, key, token)
      )

    case 'delete':
      return createElement('del', { key },
        renderPhrasingNodes(node.children, vaultId, directoryTree, onInternalLinkClick, key, token)
      )

    case 'inlineCode':
      return createElement('code', { key, className: 'view-mode-inline-code' }, node.value)

    case 'break':
      return createElement('br', { key })

    case 'link':
      return renderLink(node, vaultId, directoryTree, onInternalLinkClick, key, token)

    case 'image':
      // Req 7.5: Render inline images with max-width 100%
      // Req 7.6: Show placeholder for images not found
      return renderImage(node.url, node.alt, vaultId, directoryTree, key, token)

    case 'html':
      // Inline HTML rendered as plain text for safety
      return node.value

    case 'footnoteReference':
      return createElement('sup', { key, className: 'view-mode-footnote-ref' },
        `[${node.identifier}]`
      )

    case 'imageReference':
      return createElement('span', { key }, `![${node.alt ?? ''}]`)

    case 'linkReference':
      // Render link reference as plain text (definitions not resolved here)
      return createElement('span', { key },
        renderPhrasingNodes(node.children, vaultId, directoryTree, onInternalLinkClick, key, token)
      )

    default:
      // Req 5.7: Unknown inline nodes rendered as text
      return String((node as { value?: string }).value ?? '')
  }
}

/** Supported image extensions for embed detection. */
const IMAGE_EXTENSIONS = ['.png', '.jpeg', '.jpg', '.gif', '.avif', '.webp', '.svg']

/**
 * Checks if a filename has a supported image extension.
 */
function isImageFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  return IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext))
}

/**
 * Recursively searches the DirectoryTree for a file by name (case-insensitive).
 * Returns the full relative path if found, or null otherwise.
 */
export function findFileInTree(tree: DirectoryTree | null, filename: string): string | null {
  if (!tree) return null

  const lowerFilename = filename.toLowerCase()

  function search(node: DirectoryTree): string | null {
    if (node.type === 'file' && node.name.toLowerCase() === lowerFilename) {
      return node.path
    }
    if (node.type === 'directory' && node.children) {
      for (const child of node.children) {
        const result = search(child)
        if (result) return result
      }
    }
    return null
  }

  return search(tree)
}

/**
 * Checks if a path exists in the DirectoryTree.
 */
function pathExistsInTree(tree: DirectoryTree | null, filePath: string): boolean {
  if (!tree) return false

  const normalizedPath = filePath.replace(/\\/g, '/')

  function search(node: DirectoryTree): boolean {
    const nodePath = node.path.replace(/\\/g, '/')
    if (nodePath === normalizedPath) return true
    if (node.type === 'directory' && node.children) {
      for (const child of node.children) {
        if (search(child)) return true
      }
    }
    return false
  }

  return search(tree)
}

/**
 * Constructs the image src URL for a vault file.
 */
function buildImageSrc(vaultId: string, resolvedPath: string, token?: string): string {
  let url = `/api/v1/vaults/${vaultId}/files?path=${encodeURIComponent(resolvedPath)}&raw=true`
  if (token) {
    url += `&token=${encodeURIComponent(token)}`
  }
  return url
}

/**
 * Renders an inline image from standard Markdown ![alt](path) syntax.
 * Resolves the path against the vault and shows a placeholder if not found.
 * Validates: Requirements 7.5, 7.6
 */
function renderImage(
  url: string,
  alt: string | null | undefined,
  vaultId: string,
  directoryTree: DirectoryTree | null,
  key: string,
  token?: string
): ReactNode {
  // Check if the image exists in the vault tree
  const exists = pathExistsInTree(directoryTree, url)

  if (!exists) {
    // Req 7.6: Show placeholder notice for images not found
    return createElement('span', { key, className: 'view-mode-image-not-found' },
      `Bild nicht gefunden: ${alt ?? url}`
    )
  }

  return createElement('img', {
    key,
    src: buildImageSrc(vaultId, url, token),
    alt: alt ?? '',
    style: { maxWidth: '100%', height: 'auto' },
    className: 'view-mode-image',
  })
}

/**
 * Combined regex to detect both Obsidian embeds ![[...]] and wikilinks [[...]] in text nodes.
 * Embeds: ![[filename]] — rendered as images if supported extension
 * Wikilinks: [[target]] or [[target|display]] — rendered as internal links
 */

/**
 * Renders text that may contain Obsidian embed syntax ![[filename.ext]] and wikilinks [[target]] or [[target|display]].
 * Splits the text into segments: plain text, embedded images, and wikilinks.
 * Only image files (by extension) are rendered as images; other embeds are left as text.
 * Wikilinks are resolved against the DirectoryTree and rendered as internal links.
 * Validates: Requirements 6.1, 6.6, 7.5, 7.6
 */
function renderTextWithEmbeds(
  text: string,
  vaultId: string,
  directoryTree: DirectoryTree | null,
  onInternalLinkClick: ((targetPath: string) => void) | undefined,
  key: string,
  token?: string
): ReactNode | ReactNode[] {
  // Quick check: if no embed or wikilink syntax present, return plain text
  if (!text.includes('![[') && !text.includes('[[')) {
    return text
  }

  const parts: ReactNode[] = []
  let lastIndex = 0

  // Combined regex: matches ![[...]] (embeds) and [[...|...]] or [[...]] (wikilinks)
  // The embed regex must come first to avoid matching ![[...]] as a wikilink
  const COMBINED_REGEX = /!\[\[([^\]]+)\]\]|\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g
  COMBINED_REGEX.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = COMBINED_REGEX.exec(text)) !== null) {
    const fullMatch = match[0]
    const matchStart = match.index

    // Add text before the match
    if (matchStart > lastIndex) {
      parts.push(text.slice(lastIndex, matchStart))
    }

    if (match[1] !== undefined) {
      // This is an embed: ![[filename]]
      const filename = match[1]

      if (isImageFile(filename)) {
        const resolvedPath = findFileInTree(directoryTree, filename)

        if (resolvedPath) {
          parts.push(createElement('img', {
            key: `${key}-embed-${matchStart}`,
            src: buildImageSrc(vaultId, resolvedPath, token),
            alt: filename,
            style: { maxWidth: '100%', height: 'auto' },
            className: 'view-mode-image',
          }))
        } else {
          // Req 7.6: Image not found in vault
          parts.push(createElement('span', {
            key: `${key}-embed-${matchStart}`,
            className: 'view-mode-image-not-found',
          }, `Bild nicht gefunden: ${filename}`))
        }
      } else {
        // Not an image embed — leave as-is
        parts.push(fullMatch)
      }
    } else {
      // This is a wikilink: [[target]] or [[target|display]]
      const target = match[2]
      const displayText = match[3] ?? target

      // Resolve the wikilink target against the directory tree
      const resolvedPath = resolveWikilinkTarget(target, directoryTree)
      const isBroken = resolvedPath === null

      const linkPath = resolvedPath ?? `${target}.md`
      const className = isBroken
        ? 'view-mode-link view-mode-link--internal view-mode-link--broken'
        : 'view-mode-link view-mode-link--internal'

      parts.push(createElement('a', {
        key: `${key}-wikilink-${matchStart}`,
        href: '#',
        className,
        onClick: (e: React.MouseEvent) => {
          e.preventDefault()
          onInternalLinkClick?.(linkPath)
        },
      }, displayText))
    }

    lastIndex = matchStart + fullMatch.length
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  if (parts.length === 0) return text
  return parts.length === 1 ? parts[0] : parts
}

/**
 * Renders a Markdown link.
 * External links open in new tab with noopener noreferrer.
 * Internal links: resolve against DirectoryTree, apply broken link styling if not found.
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */
function renderLink(
  node: { url: string; children: PhrasingContent[] },
  vaultId: string,
  directoryTree: DirectoryTree | null,
  onInternalLinkClick: ((targetPath: string) => void) | undefined,
  key: string,
  token?: string
): ReactNode {
  const url = node.url
  const children = renderPhrasingNodes(node.children, vaultId, directoryTree, onInternalLinkClick, key, token)

  // External link (http/https)
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return createElement('a', {
      key,
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer',
      className: 'view-mode-link view-mode-link--external',
    }, ...children)
  }

  // Internal link — check if target exists in tree
  const exists = pathExistsInTree(directoryTree, url)
  const className = exists
    ? 'view-mode-link view-mode-link--internal'
    : 'view-mode-link view-mode-link--internal view-mode-link--broken'

  return createElement('a', {
    key,
    href: '#',
    className,
    onClick: (e: React.MouseEvent) => {
      e.preventDefault()
      onInternalLinkClick?.(url)
    },
  }, ...children)
}
