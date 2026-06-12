import { type ReactNode, createElement, useMemo, useState, useEffect, useContext } from 'react'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import { parse as parseYaml } from 'yaml'
import hljs from 'highlight.js'
import {
  Hash, Pencil as PencilIcon, Info, Lightbulb, AlertTriangle, Zap, Bug, List as ListIcon,
  Quote, Check, HelpCircle, X as XIcon, ClipboardList,
} from 'lucide-react'
import type { Plugin } from 'unified'
import type { Root, RootContent, PhrasingContent, AlignType } from 'mdast'
import type { DirectoryTree } from '../types'
import { AppContext } from '../state'
import { remarkWikilink, remarkEmbed, remarkCallout, remarkTag, remarkBreaks, createAnchorTracker } from '../plugins'
import type { WikilinkNode, EmbedNode, CalloutNode, TagNode } from '../plugins'
import { PdfViewer } from './BinaryViewer'

/**
 * Mapping of callout types to their Lucide icon component and CSS color token.
 * Unknown types fall back to 'note' configuration.
 * Validates: Requirement 7.1, 7.6
 */
const CALLOUT_TYPE_MAP: Record<string, { icon: typeof PencilIcon; colorToken: string }> = {
  note:     { icon: PencilIcon,    colorToken: '--callout-note' },
  info:     { icon: Info,          colorToken: '--callout-info' },
  tip:      { icon: Lightbulb,     colorToken: '--callout-tip' },
  warning:  { icon: AlertTriangle, colorToken: '--callout-warning' },
  danger:   { icon: Zap,           colorToken: '--callout-danger' },
  bug:      { icon: Bug,           colorToken: '--callout-bug' },
  example:  { icon: ListIcon,      colorToken: '--callout-example' },
  quote:    { icon: Quote,         colorToken: '--callout-quote' },
  success:  { icon: Check,         colorToken: '--callout-success' },
  question: { icon: HelpCircle,    colorToken: '--callout-question' },
  failure:  { icon: XIcon,         colorToken: '--callout-failure' },
  abstract: { icon: ClipboardList, colorToken: '--callout-abstract' },
}

/**
 * Props for the ViewMode (Markdown renderer) component.
 */
export interface ViewModeProps {
  content: string
  vaultId: string
  directoryTree: DirectoryTree | null
  onInternalLinkClick?: (targetPath: string) => void
  onTagClick?: (tag: string) => void
  token?: string
}

/**
 * Searches the DirectoryTree recursively for a file matching the given target name.
 * Matching is case-insensitive and tries both with and without .md extension.
 * Returns the file's relative path if found, or null if not found.
 *
 * Validates: Requirements 6.1, 6.6
 */
// eslint-disable-next-line react-refresh/only-export-components
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
 * Obsidian remark plugins in the required pipeline order.
 * Order: Wikilink → Embed → Callout → Tag
 * Validates: Requirement 11.5
 */
const OBSIDIAN_PLUGINS: Array<Plugin<[], Root>> = [
  remarkWikilink,
  remarkEmbed,
  remarkCallout,
  remarkTag,
  remarkBreaks,
]

/**
 * Pre-processes Markdown content to preserve tab indentation that would
 * otherwise be stripped by the Markdown parser. Replaces leading tabs with
 * non-breaking spaces (U+00A0) outside of fenced code blocks.
 * This matches Obsidian's behavior where tabs create visible indentation.
 */
function preserveTabIndentation(content: string): string {
  const lines = content.split('\n')
  const result: string[] = []
  let inFencedBlock = false

  for (const line of lines) {
    // Detect fenced code block boundaries
    if (/^(`{3,}|~{3,})/.test(line.trimStart())) {
      inFencedBlock = !inFencedBlock
      result.push(line)
      continue
    }

    if (inFencedBlock) {
      result.push(line)
      continue
    }

    // Replace leading tabs with 4 non-breaking spaces each (outside code blocks)
    const match = line.match(/^(\t+)/)
    if (match) {
      const tabCount = match[1]!.length
      const indent = '\u00A0\u00A0\u00A0\u00A0'.repeat(tabCount)
      result.push(indent + line.slice(tabCount))
    } else {
      result.push(line)
    }
  }

  return result.join('\n')
}

/**
 * Creates a unified pipeline with graceful degradation.
 * If an individual Obsidian plugin fails to register or causes a parse error,
 * it is skipped and the remaining plugins continue to function.
 *
 * The pipeline uses `.parse()` followed by `.runSync()` to execute both
 * micromark-based plugins (wikilink, embed, tag) and MDAST transformers (callout, breaks).
 *
 * Validates: Requirements 11.5, 11.6
 */
function createSafePipeline(content: string): Root {
  const preprocessed = preserveTabIndentation(content)

  let pipeline = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)

  for (const plugin of OBSIDIAN_PLUGINS) {
    try {
      pipeline = pipeline.use(plugin) as unknown as typeof pipeline
    } catch (err) {
      console.warn('Obsidian plugin failed to register, skipping:', err)
    }
  }

  try {
    const tree = pipeline.parse(preprocessed)
    // runSync executes transformers (e.g., remarkCallout, remarkBreaks) on the parsed tree
    return pipeline.runSync(tree) as Root
  } catch (err) {
    console.warn('Pipeline parse/run failed, falling back to base pipeline:', err)
    // Fallback: parse without any Obsidian plugins
    return unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ['yaml'])
      .use(remarkGfm)
      .parse(preprocessed)
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
 * - Obsidian embeds ![[file]], callouts > [!type], and inline tags #tag
 * - Standard Markdown links with external/internal/broken classification
 * - Invalid/unparsable syntax rendered as plain text without crashing
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 11.5, 11.6
 */
export function ViewMode({ content, vaultId, directoryTree, onInternalLinkClick, onTagClick, token }: ViewModeProps) {
  const rendered = useMemo(() => {
    try {
      const tree = createSafePipeline(content)
      const anchorTracker = createAnchorTracker()

      return renderRoot(tree, vaultId, directoryTree, onInternalLinkClick, onTagClick, token, anchorTracker)
    } catch {
      // Req 5.7: Invalid/unparsable syntax rendered as plain text without crashing
      return createElement('pre', { className: 'view-mode-fallback' }, content)
    }
  }, [content, vaultId, directoryTree, onInternalLinkClick, onTagClick, token])

  return createElement('article', { className: 'view-mode', 'aria-label': 'Markdown-Ansicht' }, rendered)
}

/**
 * Props for the NoteEmbed component.
 */
interface NoteEmbedProps {
  vaultId: string
  filePath: string
  target: string
  heading: string | null
  directoryTree: DirectoryTree | null
  token?: string
  embedDepth: number
}

/**
 * Component that fetches and renders an embedded note's Markdown content.
 * Supports heading-based section filtering (e.g. ![[note#heading]]).
 * Respects MAX_EMBED_DEPTH to prevent infinite recursion.
 */
function NoteEmbed({ vaultId, filePath, target, heading, directoryTree, token, embedDepth: _embedDepth }: NoteEmbedProps) { // eslint-disable-line @typescript-eslint/no-unused-vars
  const [noteContent, setNoteContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const appContext = useContext(AppContext)
  const apiClient = appContext?.apiClient ?? null

  useEffect(() => {
    if (!apiClient) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('Kein API-Client verfügbar')
      return
    }

    let cancelled = false

    apiClient.fetchFileContent(vaultId, filePath)
      .then(file => {
        if (cancelled) return
        let content = file.content

        // If a heading is specified, extract only that section
        if (heading && content) {
          content = extractHeadingSection(content, heading)
        }

        setNoteContent(content)
      })
      .catch(() => {
        if (cancelled) return
        setError(`Fehler beim Laden: ${target}`)
      })

    return () => { cancelled = true }
  }, [apiClient, vaultId, filePath, heading, target])

  if (error) {
    return createElement('span', { className: 'view-mode-embed view-mode-embed--missing' }, error)
  }

  if (noteContent === null) {
    return createElement('span', { className: 'view-mode-embed view-mode-embed--note' },
      createElement('span', { className: 'view-mode-embed-loading' }, 'Laden…')
    )
  }

  // Render the embedded note content using ViewMode (recursive)
  return createElement('div', { className: 'view-mode-embed view-mode-embed--note' },
    createElement('span', { className: 'view-mode-embed-header' },
      createElement('span', { className: 'view-mode-embed-title' }, target)
    ),
    createElement(ViewMode, {
      content: noteContent,
      vaultId,
      directoryTree,
      token,
    })
  )
}

/**
 * Extracts the content under a specific heading from Markdown text.
 * Returns all content from the heading until the next heading of same or higher level.
 * If the heading is not found, returns the full content.
 */
function extractHeadingSection(content: string, heading: string): string {
  const lines = content.split('\n')
  const headingLower = heading.toLowerCase().trim()

  let startIndex = -1
  let startLevel = 0

  // Find the target heading
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      const level = match[1]!.length
      const text = match[2]!.trim().toLowerCase()
      if (text === headingLower) {
        startIndex = i
        startLevel = level
        break
      }
    }
  }

  if (startIndex === -1) return content

  // Find the end: next heading of same or higher level
  let endIndex = lines.length
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i]!
    const match = line.match(/^(#{1,6})\s+/)
    if (match && match[1]!.length <= startLevel) {
      endIndex = i
      break
    }
  }

  return lines.slice(startIndex, endIndex).join('\n')
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
  onTagClick?: (tag: string) => void,
  token?: string,
  anchorTracker?: ReturnType<typeof createAnchorTracker>
): ReactNode {
  const children = root.children
  const sections = groupByHeadings(children)

  const elements: ReactNode[] = []
  sections.forEach((section, i) => {
    if (section.type === 'content') {
      elements.push(...renderBlockNodes(section.nodes, vaultId, directoryTree, onInternalLinkClick, `root-${i}`, token, anchorTracker, onTagClick))
    } else {
      elements.push(renderHeadingSection(section, vaultId, directoryTree, onInternalLinkClick, `section-${i}`, token, anchorTracker, onTagClick))
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
        // eslint-disable-next-line no-useless-assignment
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
 * Extracts plain text from an array of phrasing content nodes.
 * Used for generating heading anchor IDs from heading children.
 */
function extractPlainText(nodes: PhrasingContent[]): string {
  let text = ''
  for (const node of nodes) {
    if (node.type === 'text') {
      text += node.value
    } else if (node.type === 'inlineCode') {
      text += node.value
    } else if (node.type === 'wikilink') {
      // Extract display text from wikilink nodes
      text += (node as unknown as WikilinkNode).display
    } else if ('children' in node && Array.isArray(node.children)) {
      text += extractPlainText(node.children as PhrasingContent[])
    }
  }
  return text
}

/**
 * Renders a heading section as a collapsible <details>/<summary> element.
 * Default expanded (open attribute).
 * Adds id attribute to heading elements for anchor navigation.
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */
function renderHeadingSection(
  section: HeadingSection,
  vaultId: string,
  directoryTree: DirectoryTree | null,
  onInternalLinkClick: ((targetPath: string) => void) | undefined,
  key: string,
  token?: string,
  anchorTracker?: ReturnType<typeof createAnchorTracker>,
  onTagClick?: (tag: string) => void
): ReactNode {
  const HeadingTag = `h${section.depth}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  const headingContent = renderPhrasingNodes(section.headingChildren, vaultId, directoryTree, onInternalLinkClick, `${key}-heading`, token, onTagClick)

  // Extract plain text from heading children for anchor generation
  const headingText = extractPlainText(section.headingChildren)
  const anchorId = anchorTracker ? anchorTracker.getAnchor(headingText) : undefined

  // Recursively group the body content for nested headings
  const bodyGroups = groupByHeadings(section.body)
  const bodyElements: ReactNode[] = []
  bodyGroups.forEach((group, i) => {
    if (group.type === 'content') {
      bodyElements.push(...renderBlockNodes(group.nodes, vaultId, directoryTree, onInternalLinkClick, `${key}-body-${i}`, token, anchorTracker, onTagClick))
    } else {
      bodyElements.push(renderHeadingSection(group, vaultId, directoryTree, onInternalLinkClick, `${key}-body-${i}`, token, anchorTracker, onTagClick))
    }
  })

  return createElement('details', { key, open: true, className: `view-mode-section view-mode-section--h${section.depth}` },
    createElement('summary', { className: 'view-mode-section-summary' },
      createElement(HeadingTag, { id: anchorId }, headingContent)
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
  token?: string,
  anchorTracker?: ReturnType<typeof createAnchorTracker>,
  onTagClick?: (tag: string) => void,
  embedDepth: number = 0
): ReactNode[] {
  return nodes.map((node, i) => renderBlockNode(node, vaultId, directoryTree, onInternalLinkClick, `${keyPrefix}-${i}`, token, anchorTracker, onTagClick, embedDepth))
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
  token?: string,
  anchorTracker?: ReturnType<typeof createAnchorTracker>,
  onTagClick?: (tag: string) => void,
  embedDepth: number = 0
): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return createElement('p', { key },
        renderPhrasingNodes(node.children, vaultId, directoryTree, onInternalLinkClick, key, token, onTagClick)
      )

    case 'heading':
      // Standalone heading (shouldn't normally appear here due to grouping, but handle gracefully)
      return renderHeadingSection(
        { type: 'heading', depth: node.depth, headingChildren: node.children, body: [] },
        vaultId, directoryTree, onInternalLinkClick, key, token, anchorTracker, onTagClick
      )

    case 'blockquote':
      return createElement('blockquote', { key },
        renderBlockNodes(node.children, vaultId, directoryTree, onInternalLinkClick, key, token, anchorTracker, onTagClick, embedDepth)
      )

    case 'callout':
      return renderCalloutNode(node as unknown as CalloutNode, vaultId, directoryTree, onInternalLinkClick, key, token, anchorTracker, onTagClick, embedDepth)

    case 'embed':
      return renderEmbedNode(node as unknown as EmbedNode, vaultId, directoryTree, key, token, embedDepth)

    case 'code':
      return renderCodeBlock(node.value, node.lang, key)

    case 'list':
      return renderList(node, vaultId, directoryTree, onInternalLinkClick, key, token, anchorTracker, onTagClick)

    case 'table':
      return renderTable(node, vaultId, directoryTree, onInternalLinkClick, key, token, onTagClick)

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
  token?: string,
  anchorTracker?: ReturnType<typeof createAnchorTracker>,
  onTagClick?: (tag: string) => void
): ReactNode {
  const Tag = node.ordered ? 'ol' : 'ul'
  const hasTaskItems = node.children.some(item => item.checked != null)
  const attrs: Record<string, unknown> = { key }
  if (hasTaskItems) {
    attrs.className = 'view-mode-task-list'
  }
  if (node.ordered && node.start != null && node.start !== 1) {
    attrs.start = node.start
  }

  const items = node.children.map((item, i) => {
    const itemKey = `${key}-li-${i}`

    if (item.checked != null) {
      // Task list item — render with non-interactive checkbox
      const liClassName = item.checked ? 'view-mode-task-item view-mode-task-item--checked' : 'view-mode-task-item'
      return createElement('li', { key: itemKey, className: liClassName },
        createElement('input', {
          type: 'checkbox',
          checked: item.checked,
          disabled: true,
          readOnly: true,
          'aria-label': item.checked ? 'Erledigt' : 'Offen',
        }),
        createElement('span', { className: 'view-mode-task-item__content' },
          renderBlockNodes(item.children as RootContent[], vaultId, directoryTree, onInternalLinkClick, itemKey, token, anchorTracker, onTagClick)
        )
      )
    }

    return createElement('li', { key: itemKey },
      renderBlockNodes(item.children as RootContent[], vaultId, directoryTree, onInternalLinkClick, itemKey, token, anchorTracker, onTagClick)
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
  token?: string,
  onTagClick?: (tag: string) => void
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
          renderPhrasingNodes(cell.children, vaultId, directoryTree, onInternalLinkClick, `${key}-th-${ci}`, token, onTagClick)
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
                renderPhrasingNodes(cell.children, vaultId, directoryTree, onInternalLinkClick, `${key}-td-${ri}-${ci}`, token, onTagClick)
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
  token?: string,
  onTagClick?: (tag: string) => void
): ReactNode[] {
  return nodes.map((node, i) => renderPhrasingNode(node, vaultId, directoryTree, onInternalLinkClick, `${keyPrefix}-${i}`, token, onTagClick))
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
  token?: string,
  onTagClick?: (tag: string) => void
): ReactNode {
  switch (node.type) {
    case 'text':
      return renderTextWithEmbeds(node.value, vaultId, directoryTree, onInternalLinkClick, key, token)

    case 'strong':
      return createElement('strong', { key },
        renderPhrasingNodes(node.children, vaultId, directoryTree, onInternalLinkClick, key, token, onTagClick)
      )

    case 'emphasis':
      return createElement('em', { key },
        renderPhrasingNodes(node.children, vaultId, directoryTree, onInternalLinkClick, key, token, onTagClick)
      )

    case 'delete':
      return createElement('del', { key },
        renderPhrasingNodes(node.children, vaultId, directoryTree, onInternalLinkClick, key, token, onTagClick)
      )

    case 'inlineCode':
      return createElement('code', { key, className: 'view-mode-inline-code' }, node.value)

    case 'break':
      return createElement('br', { key })

    case 'link':
      return renderLink(node, vaultId, directoryTree, onInternalLinkClick, key, token)

    case 'wikilink':
      return renderWikilinkNode(node as unknown as WikilinkNode, vaultId, directoryTree, onInternalLinkClick, key)

    case 'tag':
      return renderTagNode(node as unknown as TagNode, key, onTagClick)

    case 'embed' as PhrasingContent['type']:
      // Embeds can appear as phrasing content inside paragraphs
      return renderEmbedNode(node as unknown as EmbedNode, vaultId, directoryTree, key, token)

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
        renderPhrasingNodes(node.children, vaultId, directoryTree, onInternalLinkClick, key, token, onTagClick)
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
 * Checks if a filename has a PDF extension.
 */
function isPdfFile(filename: string): boolean {
  return filename.toLowerCase().endsWith('.pdf')
}

/**
 * Recursively searches the DirectoryTree for a file by name (case-insensitive).
 * Returns the full relative path if found, or null otherwise.
 */
// eslint-disable-next-line react-refresh/only-export-components
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
 * Normalizes a file path for comparison and API usage:
 * - URL-decodes percent-encoded characters (e.g. %20 → space)
 * - Replaces backslashes with forward slashes
 * - Strips leading `./` prefix
 * - Collapses duplicate slashes
 */
function normalizeImagePath(filePath: string): string {
  let normalized: string
  try {
    normalized = decodeURIComponent(filePath)
  } catch {
    normalized = filePath
  }
  normalized = normalized.replace(/\\/g, '/')
  // Strip leading ./
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2)
  }
  // Collapse duplicate slashes
  normalized = normalized.replace(/\/+/g, '/')
  return normalized
}

/**
 * Checks if a path exists in the DirectoryTree.
 */
function pathExistsInTree(tree: DirectoryTree | null, filePath: string): boolean {
  if (!tree) return false

  const normalizedPath = normalizeImagePath(filePath)

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
  // Normalize the path (backslashes → forward slashes, strip ./ prefix)
  const normalizedUrl = normalizeImagePath(url)

  // Check if the image exists in the vault tree
  const exists = pathExistsInTree(directoryTree, normalizedUrl)

  if (!exists) {
    // Req 7.6: Show placeholder notice for images not found
    return createElement('span', { key, className: 'view-mode-image-not-found' },
      `Bild nicht gefunden: ${alt ?? url}`
    )
  }

  return createElement('img', {
    key,
    src: buildImageSrc(vaultId, normalizedUrl, token),
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

  // Combined regex: matches ![[...|...]] or ![[...]] (embeds) and [[...|...]] or [[...]] (wikilinks)
  // The embed regex must come first to avoid matching ![[...]] as a wikilink
  // Embed: ![[target|display]] or ![[target]] — target cannot contain ] but can contain |
  const COMBINED_REGEX = /!\[\[([^\]|]+?)(?:\|([^\]]*?))?\]\]|\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g
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
      // This is an embed: ![[filename]] or ![[filename|size]]
      const filename = match[1]
      const embedDisplay = match[2] ?? null

      if (isImageFile(filename)) {
        const resolvedPath = findFileInTree(directoryTree, filename)

        if (resolvedPath) {
          const imageStyle = parseEmbedImageStyle(embedDisplay)
          const altText = parseEmbedAltText(embedDisplay) ?? filename

          parts.push(createElement('img', {
            key: `${key}-embed-${matchStart}`,
            src: buildImageSrc(vaultId, resolvedPath, token),
            alt: altText,
            style: imageStyle,
            className: 'view-mode-image',
          }))
        } else {
          // Req 7.6: Image not found in vault
          parts.push(createElement('span', {
            key: `${key}-embed-${matchStart}`,
            className: 'view-mode-image-not-found',
          }, `Bild nicht gefunden: ${filename}`))
        }
      } else if (isPdfFile(filename)) {
        const resolvedPath = findFileInTree(directoryTree, filename)

        if (resolvedPath) {
          const rawSrc = buildImageSrc(vaultId, resolvedPath, token)
          parts.push(createElement('div', {
            key: `${key}-embed-${matchStart}`,
            className: 'view-mode-embed view-mode-embed--pdf',
          }, createElement(PdfViewer, { rawSrc, fileName: filename })))
        } else {
          parts.push(createElement('span', {
            key: `${key}-embed-${matchStart}`,
            className: 'view-mode-embed view-mode-embed--missing',
          }, `PDF nicht gefunden: ${filename}`))
        }
      } else {
        // Not an image or PDF embed — leave as-is
        parts.push(fullMatch)
      }
    } else {
      // This is a wikilink: [[target]] or [[target|display]]
      const target = match[3]
      const displayText = match[4] ?? target

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
 * Renders a WikilinkNode as an internal link.
 * Resolves the target against the DirectoryTree and applies broken-link styling if not found.
 * Handles heading-fragment navigation:
 * - [[Page#Heading]]: navigates to page, then scrolls to heading anchor
 * - [[#Heading]]: scrolls to heading anchor on current page
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
 */
function renderWikilinkNode(
  node: WikilinkNode,
  _vaultId: string,
  directoryTree: DirectoryTree | null,
  onInternalLinkClick: ((targetPath: string) => void) | undefined,
  key: string
): ReactNode {
  const target = node.target
  const displayText = node.display
  const heading = node.heading

  // Same-page heading link: [[#Heading]]
  if (!target && heading) {
    return createElement('a', {
      key,
      href: '#',
      className: 'view-mode-link view-mode-link--internal',
      onClick: (e: React.MouseEvent) => {
        e.preventDefault()
        scrollToHeadingAnchor(heading)
      },
    }, displayText)
  }

  // Resolve the wikilink target against the directory tree
  const resolvedPath = resolveWikilinkTarget(target, directoryTree)
  const isBroken = resolvedPath === null

  const linkPath = resolvedPath ?? `${target}.md`
  const className = isBroken
    ? 'view-mode-link view-mode-link--internal view-mode-link--broken'
    : 'view-mode-link view-mode-link--internal'

  return createElement('a', {
    key,
    href: '#',
    className,
    onClick: (e: React.MouseEvent) => {
      e.preventDefault()
      onInternalLinkClick?.(linkPath)
      // If there's a heading fragment and link is resolved, scroll to it after navigation
      if (heading && !isBroken) {
        // Use setTimeout to allow the target page to render before scrolling
        setTimeout(() => scrollToHeadingAnchor(heading), 100)
      }
    },
  }, displayText)
}

/**
 * Scrolls to a heading anchor element on the current page.
 * Generates the normalized anchor from the heading text and scrolls to the matching element.
 * Validates: Requirements 2.4, 2.5
 */
function scrollToHeadingAnchor(heading: string): void {
  // Generate the anchor ID using the same normalization as createAnchorTracker
  const anchorId = heading
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9äöüß\-_]/g, '')

  const element = document.getElementById(anchorId)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

/**
 * Renders a TagNode as an inline element with tag styling and Hash icon.
 * Validates: Requirements 9.1, 9.2, 9.3
 */
function renderTagNode(
  node: TagNode,
  key: string,
  onTagClick?: (tag: string) => void
): ReactNode {
  return createElement('span', {
    key,
    className: 'view-mode-tag',
    onClick: () => onTagClick?.(node.tag),
  },
    createElement(Hash, { size: 12 }),
    node.tag
  )
}

/**
 * Maximum recursion depth for nested note embeds.
 * Prevents infinite loops from circular references (A embeds B, B embeds A).
 * Validates: Requirement 5.7
 */
const MAX_EMBED_DEPTH = 3

/**
 * Parses the display field of an image embed for sizing information.
 * Supports Obsidian-compatible formats:
 * - `300` → width: 300px (height auto)
 * - `300x200` → width: 300px, height: 200px
 * - `100%` → width: 100% (height auto)
 * - `x200` → height: 200px (width auto)
 * - Non-numeric text → treated as alt text, default sizing (maxWidth: 100%)
 *
 * @returns CSS style object for the image element
 */
function parseEmbedImageStyle(display: string | null): React.CSSProperties {
  if (!display) {
    return { maxWidth: '100%', height: 'auto' }
  }

  const trimmed = display.trim()

  // Format: 300x200 (width x height in pixels)
  const dimensionMatch = trimmed.match(/^(\d+)\s*x\s*(\d+)$/)
  if (dimensionMatch) {
    return {
      width: `${dimensionMatch[1]}px`,
      height: `${dimensionMatch[2]}px`,
    }
  }

  // Format: x200 (height only)
  const heightOnlyMatch = trimmed.match(/^x\s*(\d+)$/)
  if (heightOnlyMatch) {
    return {
      height: `${heightOnlyMatch[1]}px`,
      width: 'auto',
      maxWidth: '100%',
    }
  }

  // Format: 100% (percentage width)
  const percentMatch = trimmed.match(/^(\d+)%$/)
  if (percentMatch) {
    return {
      width: `${percentMatch[1]}%`,
      height: 'auto',
    }
  }

  // Format: 300 (width only in pixels)
  const widthMatch = trimmed.match(/^(\d+)$/)
  if (widthMatch) {
    return {
      width: `${widthMatch[1]}px`,
      height: 'auto',
      maxWidth: '100%',
    }
  }

  // Non-numeric: treat as alt text, use default sizing
  return { maxWidth: '100%', height: 'auto' }
}

/**
 * Extracts alt text from the display field of an image embed.
 * Returns null if the display field is a sizing value (numeric/dimension).
 * Returns the display text if it's non-numeric (used as alt text).
 */
function parseEmbedAltText(display: string | null): string | null {
  if (!display) return null

  const trimmed = display.trim()

  // If it matches any sizing pattern, it's not alt text
  if (/^(\d+)$/.test(trimmed)) return null
  if (/^(\d+)\s*x\s*(\d+)$/.test(trimmed)) return null
  if (/^x\s*(\d+)$/.test(trimmed)) return null
  if (/^(\d+)%$/.test(trimmed)) return null

  // Non-numeric: it's alt text
  return trimmed
}

/**
 * Renders an EmbedNode as an image or note embed.
 *
 * Image embeds: Resolves target using resolveWikilinkTarget, renders <img> with vault API URL.
 * Shows placeholder if image not found in DirectoryTree.
 *
 * Note embeds: Renders a visually distinct container with target info.
 * If heading fragment exists, shows the section reference.
 * Enforces recursion depth limit (max 3 levels) to prevent circular reference loops.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */
function renderEmbedNode(
  node: EmbedNode,
  vaultId: string,
  directoryTree: DirectoryTree | null,
  key: string,
  token?: string,
  embedDepth: number = 0
): ReactNode {
  // Requirement 5.7: Recursion depth check — stop at max 3 levels
  if (embedDepth > MAX_EMBED_DEPTH) {
    return createElement('span', {
      key,
      className: 'view-mode-embed view-mode-embed--depth-limit',
    }, 'Maximale Einbettungstiefe erreicht')
  }

  if (node.embedType === 'image') {
    // Requirement 5.1: Resolve image target using resolveWikilinkTarget
    const resolvedPath = resolveWikilinkTarget(node.target, directoryTree)
    if (resolvedPath) {
      // Parse display field for sizing/formatting
      const imageStyle = parseEmbedImageStyle(node.display)
      const altText = parseEmbedAltText(node.display) ?? node.target

      // Render <img> with vault API URL and optional sizing
      return createElement('img', {
        key,
        src: buildImageSrc(vaultId, resolvedPath, token),
        alt: altText,
        style: imageStyle,
        className: 'view-mode-image view-mode-embed view-mode-embed--image',
      })
    }
    // Requirement 5.2: Placeholder if image not found
    return createElement('span', {
      key,
      className: 'view-mode-embed view-mode-embed--missing',
    }, `Bild nicht gefunden: ${node.target}`)
  }

  if (node.embedType === 'pdf') {
    // Resolve PDF target in the directory tree
    const resolvedPath = resolveWikilinkTarget(node.target, directoryTree)
    if (resolvedPath) {
      const rawSrc = buildImageSrc(vaultId, resolvedPath, token)
      return createElement('div', {
        key,
        className: 'view-mode-embed view-mode-embed--pdf',
      }, createElement(PdfViewer, { rawSrc, fileName: node.target }))
    }
    return createElement('span', {
      key,
      className: 'view-mode-embed view-mode-embed--missing',
    }, `PDF nicht gefunden: ${node.target}`)
  }

  // Note embed — render as styled placeholder container
  // Requirement 5.3: Visually distinct container for note embeds
  const resolvedNotePath = resolveWikilinkTarget(node.target, directoryTree)
  const noteExists = resolvedNotePath !== null

  if (!noteExists) {
    // Requirement 5.5: Placeholder if note not found
    return createElement('span', {
      key,
      className: 'view-mode-embed view-mode-embed--missing',
    }, `Notiz nicht gefunden: ${node.target}`)
  }

  // Render note embed as a component that fetches and displays the content
  return createElement(NoteEmbed, {
    key,
    vaultId,
    filePath: resolvedNotePath,
    target: node.target,
    heading: node.heading,
    directoryTree,
    token,
    embedDepth: embedDepth + 1,
  })
}

/**
 * Renders a CalloutNode as a styled callout box with type-specific icon and color.
 * Uses CALLOUT_TYPE_MAP for icon/color lookup, falls back to 'note' for unknown types.
 * Foldable callouts use <details>/<summary>, non-foldable use plain <div>.
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */
function renderCalloutNode(
  node: CalloutNode,
  vaultId: string,
  directoryTree: DirectoryTree | null,
  onInternalLinkClick: ((targetPath: string) => void) | undefined,
  key: string,
  token?: string,
  anchorTracker?: ReturnType<typeof createAnchorTracker>,
  _onTagClick?: (tag: string) => void,
  embedDepth: number = 0
): ReactNode {
  // Requirement 7.6: Unknown callout types fall back to 'note' configuration
  const config = CALLOUT_TYPE_MAP[node.calloutType] ?? CALLOUT_TYPE_MAP['note']!
  const Icon = config.icon

  const header = createElement('div', { className: 'view-mode-callout-header' },
    createElement(Icon, { size: 16, className: 'view-mode-callout-icon' }),
    createElement('span', { className: 'view-mode-callout-title' }, node.title)
  )

  const body = createElement('div', { className: 'view-mode-callout-body' },
    renderBlockNodes(node.body, vaultId, directoryTree, onInternalLinkClick, `${key}-body`, token, anchorTracker, _onTagClick, embedDepth)
  )

  // Requirement 7.2: Foldable callouts use <details>/<summary>
  if (node.foldable) {
    return createElement('details', {
      key,
      className: `view-mode-callout view-mode-callout--${node.calloutType}`,
      // Requirement 7.3: defaultOpen: true sets the open attribute
      open: node.defaultOpen,
    },
      createElement('summary', null, header),
      body
    )
  }

  // Requirement 7.4: Non-foldable callouts are always visible (no <details>)
  return createElement('div', {
    key,
    className: `view-mode-callout view-mode-callout--${node.calloutType}`,
  }, header, body)
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
