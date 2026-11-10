/**
 * Polyfill for tokenClassNodeProp — removed from @codemirror/language in v6.x.
 *
 * In older versions of CodeMirror 6, `@codemirror/language` exported a
 * `tokenClassNodeProp` (a `NodeProp<string>`) that mapped Lezer syntax tree
 * node types to space-separated CSS class names (e.g. "inline-code", "strong",
 * "em", "formatting"). Obsidian still exports this prop and plugins like
 * Dataview use it to identify inline code nodes in the syntax tree.
 *
 * This module provides:
 * 1. A singleton `NodeProp<string>` instance that can be set on NodeTypes
 * 2. A mapping table from Lezer Markdown node names to CSS class strings
 * 3. A `props` array suitable for `parser.configure({ props: [...] })`
 *
 * The Markdown parser must be configured with these props for the polyfill
 * to actually return values when plugins call `nodeType.prop(tokenClassNodeProp)`.
 *
 * @module token-class-node-prop
 */

import { NodeProp, NodeType } from '@lezer/common'

/**
 * Singleton NodeProp instance — the same reference must be used everywhere:
 * - Set on NodeTypes during parser configuration
 * - Exported on window.__codemirrorLanguage.tokenClassNodeProp
 * - Exported on window.obsidian.tokenClassNodeProp
 * - Used by plugins via require('@codemirror/language').tokenClassNodeProp
 */
export const tokenClassNodeProp = new NodeProp<string>({ deserialize: (s: string) => s })

/**
 * Mapping of Lezer Markdown NodeType names to space-separated CSS class strings.
 * These match what Obsidian's internal CM6 build provides via the original
 * tokenClassNodeProp. Dataview checks for "inline-code" and "formatting".
 */
const nodeClassMapping: Record<string, string> = {
  InlineCode: 'inline-code',
  CodeText: 'inline-code',
  Emphasis: 'em',
  StrongEmphasis: 'strong',
  Strikethrough: 'strikethrough',
  Comment: 'comment',
  // Mark types (formatting tokens)
  CodeMark: 'inline-code formatting formatting-code',
  EmphasisMark: 'em formatting formatting-em',
  // Note: StrongEmphasis uses EmphasisMark for **, not a separate StrongMark
  HeaderMark: 'formatting formatting-header',
  QuoteMark: 'formatting formatting-quote',
  ListMark: 'formatting formatting-list',
  LinkMark: 'formatting formatting-link',
  // Code blocks
  CodeBlock: 'code',
  FencedCode: 'code',
  CodeInfo: 'code meta',
  // Links
  Link: 'link',
  Autolink: 'link url',
  URL: 'url',
  // Headings
  ATXHeading1: 'header header-1',
  ATXHeading2: 'header header-2',
  ATXHeading3: 'header header-3',
  ATXHeading4: 'header header-4',
  ATXHeading5: 'header header-5',
  ATXHeading6: 'header header-6',
  SetextHeading1: 'header header-1',
  SetextHeading2: 'header header-2',
  // Block elements
  Blockquote: 'quote',
  HorizontalRule: 'hr',
  // HTML
  HTMLBlock: 'html',
  HTMLTag: 'html',
  // GFM extensions
  TaskMarker: 'formatting formatting-task',
}

/**
 * NodeProp configuration for parser.configure({ props: [...] }).
 * Adds tokenClassNodeProp values to all mapped Markdown NodeTypes.
 */
export const tokenClassNodePropSource = tokenClassNodeProp.add(nodeClassMapping)

// ─── Closing tokens (Obsidian 1.15) ──────────────────────────────────────────
//
// Obsidian 1.15 gives CLOSING formatting tokens a `formatting-*-end` class
// segment (e.g. the closing backtick: `formatting-code-end`). The Lezer
// Markdown parser uses one node type per mark kind for opening and closing
// marks, and `tokenClassNodeProp` holds one value per node type, so the
// distinction cannot live in the parser props. Instead the plugin-facing
// `syntaxTree()` wrapper swaps in a derived node type for closing marks.

/** Mark node types that come in open/close pairs. */
const PAIRED_MARKS: ReadonlySet<string> = new Set(['CodeMark', 'EmphasisMark'])

/** The class list of a closing mark, or `undefined` when the node name has no `-end` variant. */
export function closingTokenClass(nodeName: string): string | undefined {
  if (!PAIRED_MARKS.has(nodeName)) return undefined
  const base = nodeClassMapping[nodeName]
  const kind = base?.split(' ').find((c) => c.startsWith('formatting-'))
  return base && kind ? `${base} ${kind}-end` : undefined
}

const closingTypeCache = new Map<NodeType, NodeType>()
let nextClosingTypeId = 0x7fff0000

/**
 * A node type equal to `type` (same name) whose `tokenClassNodeProp` carries the
 * `formatting-*-end` class. `undefined` for node types without a closing variant.
 */
export function closingMarkType(type: NodeType): NodeType | undefined {
  const cached = closingTypeCache.get(type)
  if (cached) return cached
  const classes = closingTokenClass(type.name)
  if (classes === undefined) return undefined
  const derived = NodeType.define({ id: nextClosingTypeId++, name: type.name, props: [[tokenClassNodeProp, classes]] })
  closingTypeCache.set(type, derived)
  return derived
}
