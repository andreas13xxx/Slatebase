/**
 * The curated slash-command list — the single source of truth for what the
 * in-editor `/` menu offers.
 *
 * Each entry carries a stable, language-independent id (label resolved via
 * `slash-command-i18n.ts`), a Lucide/Obsidian icon name, and an action that is
 * EITHER an existing core command id (executed through the CommandRegistry, so
 * the Command Palette and the slash menu share one implementation) OR a small
 * direct-insert handler for things with no core command (date / time).
 *
 * Deliberately not plugin-extensible in this version — plugins already have
 * their own EditorSuggest API.
 *
 * @module editor/slash/slash-commands
 */

import type { EditorView } from '@codemirror/view'

/** A single entry in the slash-command menu. */
export interface SlashCommand {
  /** Stable, language-independent id, e.g. `slash:heading-1`. */
  id: string
  /** Lucide / Obsidian icon name shown left of the label. */
  icon: string
  /**
   * Existing core-command id to run via the CommandRegistry. Mutually
   * exclusive with `insert`. `editor:*` commands keep their prefix; a few
   * core commands (e.g. `insert-template`) are unprefixed in the registry.
   */
  commandId?: string
  /**
   * Direct-insert handler, for entries with no backing core command. Dispatches
   * straight to CM6 so the insertion lands at the cursor with correct undo
   * history. Mutually exclusive with `commandId`.
   */
  insert?: (view: EditorView) => void
}

/** Zero-pad a number to two digits. */
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Insert plain text at the current primary selection via a CM6 transaction,
 * placing the cursor after the inserted text. Shared by the date/time entries.
 */
function insertTextAtCursor(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    scrollIntoView: true,
  })
}

/** `YYYY-MM-DD`, matching `substituteTemplatePlaceholders`'s `{{date}}`. */
function formatDate(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** `HH:mm`, matching `substituteTemplatePlaceholders`'s `{{time}}`. */
function formatTime(now: Date): string {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/**
 * The curated slash-command list, in menu order. Entries whose `commandId`
 * does not resolve at runtime (feature off, no context) are filtered out by
 * the suggest source, so this list is the superset of possible entries.
 */
export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { id: 'slash:heading-1', icon: 'heading-1', commandId: 'editor:set-heading-1' },
  { id: 'slash:heading-2', icon: 'heading-2', commandId: 'editor:set-heading-2' },
  { id: 'slash:heading-3', icon: 'heading-3', commandId: 'editor:set-heading-3' },
  { id: 'slash:bullet-list', icon: 'list', commandId: 'editor:toggle-bullet-list' },
  { id: 'slash:numbered-list', icon: 'list-ordered', commandId: 'editor:toggle-numbered-list' },
  { id: 'slash:task-list', icon: 'list-checks', commandId: 'editor:toggle-checklist-status' },
  { id: 'slash:blockquote', icon: 'quote', commandId: 'editor:toggle-blockquote' },
  { id: 'slash:code-block', icon: 'code', commandId: 'editor:insert-codeblock' },
  { id: 'slash:callout', icon: 'alert-circle', commandId: 'editor:insert-callout' },
  { id: 'slash:table', icon: 'table', commandId: 'editor:insert-table' },
  { id: 'slash:horizontal-rule', icon: 'minus', commandId: 'editor:insert-horizontal-rule' },
  { id: 'slash:internal-link', icon: 'link', commandId: 'editor:insert-wikilink' },
  { id: 'slash:template', icon: 'file-text', commandId: 'insert-template' },
  { id: 'slash:date', icon: 'calendar', insert: (view) => insertTextAtCursor(view, formatDate(new Date())) },
  { id: 'slash:time', icon: 'clock', insert: (view) => insertTextAtCursor(view, formatTime(new Date())) },
]
