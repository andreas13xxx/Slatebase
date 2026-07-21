import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

/**
 * Creates a CM6 theme that references Slatebase CSS Custom Properties.
 * No hardcoded colors — all values come from Design Tokens.
 * Automatically adapts to Dark/Light mode via CSS variable resolution.
 */
export function createSlatebaseTheme(): Extension {
  return EditorView.theme({
    '&': {
      fontFamily: 'var(--font-sans)',
      backgroundColor: 'var(--bg-elevated)',
      color: 'var(--text-primary)',
      height: '100%',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
    '.cm-content': {
      fontFamily: 'var(--font-mono)',
      caretColor: 'var(--text-primary)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--text-primary)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'var(--accent-light)',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--sidebar-hover)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--bg-surface)',
      color: 'var(--text-muted)',
      borderRight: '1px solid var(--border-subtle)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--sidebar-active)',
      color: 'var(--text-secondary)',
    },
    '.cm-searchMatch': {
      backgroundColor: 'var(--search-match-bg)',
      color: 'var(--search-match-text)',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'var(--search-active-bg)',
    },
    '&.cm-focused .cm-matchingBracket': {
      backgroundColor: 'var(--accent-light)',
      outline: '1px solid var(--accent)',
    },
    '&.cm-focused .cm-nonmatchingBracket': {
      backgroundColor: 'var(--danger-bg)',
      outline: '1px solid var(--danger)',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      color: 'var(--text-muted)',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
      color: 'var(--text-primary)',
    },
    '.cm-tooltip-autocomplete': {
      backgroundColor: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
    },
    '.cm-completionLabel': {
      color: 'var(--text-primary)',
    },
    '.cm-completionMatchedText': {
      color: 'var(--accent)',
      textDecoration: 'none',
    },
    '.cm-panels': {
      backgroundColor: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border-subtle)',
      color: 'var(--text-primary)',
    },
    '.cm-panels button': {
      color: 'var(--text-primary)',
      backgroundColor: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
    },
    '.cm-textfield': {
      backgroundColor: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
      color: 'var(--text-primary)',
    },
  })
}

/**
 * Creates a CM6 highlight style using Design Token colors.
 * Maps Lezer syntax tags to CSS custom properties.
 * Returns a syntaxHighlighting extension ready to use.
 */
export function createSlatebaseHighlightStyle(): Extension {
  const highlightStyle = HighlightStyle.define([
    { tag: tags.heading, color: 'var(--accent-text)', fontWeight: 'bold' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strong, color: 'var(--text-primary)', fontWeight: 'bold' },
    { tag: tags.keyword, color: 'var(--accent)' },
    { tag: tags.string, color: 'var(--success)' },
    { tag: tags.comment, color: 'var(--text-muted)', fontStyle: 'italic' },
    { tag: tags.link, color: 'var(--accent-text)', textDecoration: 'underline' },
    { tag: tags.url, color: 'var(--accent-text)' },
    { tag: tags.monospace, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' },
    { tag: tags.processingInstruction, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' },
    { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--text-muted)' },
    { tag: tags.atom, color: 'var(--accent)' },
    { tag: tags.bool, color: 'var(--accent)' },
    { tag: tags.number, color: 'var(--warning)' },
    { tag: tags.operator, color: 'var(--text-secondary)' },
    { tag: tags.punctuation, color: 'var(--text-muted)' },
    { tag: tags.meta, color: 'var(--text-muted)' },
    { tag: tags.contentSeparator, color: 'var(--border-strong)' },
    { tag: tags.definition(tags.variableName), color: 'var(--accent-text)' },
    { tag: tags.function(tags.variableName), color: 'var(--accent)' },
    { tag: tags.typeName, color: 'var(--warning)' },
    { tag: tags.className, color: 'var(--warning)' },
    { tag: tags.propertyName, color: 'var(--accent-text)' },
    { tag: tags.labelName, color: 'var(--text-secondary)' },
    { tag: tags.attributeName, color: 'var(--accent-text)' },
    { tag: tags.attributeValue, color: 'var(--success)' },
    { tag: tags.tagName, color: 'var(--danger-text)' },
    { tag: tags.angleBracket, color: 'var(--text-muted)' },
    { tag: tags.quote, color: 'var(--text-secondary)', fontStyle: 'italic' },
  ])

  return syntaxHighlighting(highlightStyle)
}
