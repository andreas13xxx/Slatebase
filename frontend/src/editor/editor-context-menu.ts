/**
 * Builds the right-click context menu shown inside the CodeMirror editor.
 *
 * Replaces the browser's native menu (previously shown as-is, since
 * `editor:context-menu` was a no-op core command — see core-commands.ts)
 * with native editing actions plus whatever plugins add via
 * `workspace.on('editor-menu', (menu, editor, info) => menu.addItem(...))`,
 * Obsidian's real event for this (verified against `obsidian.d.ts`).
 *
 * Most formatting/insert/table/line actions below run through
 * `window.app.commands.executeCommandById('editor:<id>')` rather than
 * reimplementing them — those `editor:*` core commands are already
 * registered in core-commands.ts against exactly the active editor
 * (`CommandRegistry.executeCommand()` resolves it via the same
 * `editorContextResolver` a plugin's `editorCallback` gets), so this menu
 * and the command palette/hotkeys stay behaviorally identical for free.
 *
 * @module editor-context-menu
 */
import { createElement } from 'react'
import {
  Scissors, Copy, Clipboard, Link2, MessageSquareQuote, MessageSquareOff,
  Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, Pilcrow, Quote,
  FileText, Hash, Type, Bold, Italic, Strikethrough, Code, Highlighter, Sigma,
  RemoveFormatting, Plus, Table, List, ListOrdered, ListChecks, FileCode,
  Asterisk, Minus, Brackets, Image, TableProperties, Columns3, Rows3,
  AlignLeft, AlignCenter, AlignRight, GripVertical, ArrowUp, ArrowDown,
  Trash2, FileOutput, StretchHorizontal, SpellCheck, BookPlus, Ban, Languages,
} from 'lucide-react'
import type { EditorView } from '@codemirror/view'
import type { ContextMenuItem } from '../components/ContextMenu'
import { applyFormatting } from './formatting'
import { editorInfoField } from './editor-state-fields'
import { buildPluginMenuItems } from '../plugins/compat/plugin-menu-bridge'
import { showToast } from '../components/ToastNotification'
import {
  learnWord, ignoreWordForSession, refreshSpellcheck,
  SPELLCHECK_LANGUAGES, SPELLCHECK_LANGUAGE_LABELS,
  type MisspelledWord, type SpellcheckLanguage,
} from './spellcheck'

const ICON_SIZE = 14

/**
 * What the menu needs to know about spelling at the clicked position.
 *
 * `suggestions` is `null` while the worker is still computing them — the menu
 * opens immediately with a placeholder and is rebuilt when they arrive, rather
 * than making the user wait on a right-click (see CodeMirrorEditor.tsx).
 */
export interface SpellcheckMenuContext {
  /** The misspelled word under the pointer, or `null` if there is none. */
  misspelled: MisspelledWord | null
  /** Corrections for that word; `null` means "still loading". */
  suggestions: string[] | null
  /** Whether spellchecking is currently switched on. */
  enabled: boolean
  /** The dictionary being checked against. */
  language: SpellcheckLanguage
}

/** Minimal shape of the plugin-facing `window.app` this module reaches into. */
interface AppShimGlobal {
  app?: {
    commands?: { executeCommandById?: (id: string) => void }
    vault?: {
      getAvailablePath: (basename: string, extension: string) => string
      create: (path: string, content: string) => Promise<unknown>
    }
    workspace?: { openFileDirectly: (path: string) => void }
  }
}

function getApp(): AppShimGlobal['app'] {
  return (window as unknown as AppShimGlobal).app
}

/**
 * Runs an `editor:*` core command (see core-commands.ts) against whichever
 * editor `CommandRegistry` currently considers active — always this view,
 * since a context menu only ever opens on the editor the user right-clicked.
 */
function runCoreCommand(id: string, view: EditorView): void {
  getApp()?.commands?.executeCommandById?.(`editor:${id}`)
  view.focus()
}

/** Best-effort clipboard write — silently ignored if the browser denies permission. */
function copyToClipboard(text: string): void {
  void navigator.clipboard.writeText(text).catch(() => { /* clipboard permission denied — nothing else to do */ })
}

/** Cheap proxy for "the cursor is probably inside a Markdown table": the current line contains a pipe. Mirrors the first check `findTable()` (core-commands.ts) makes before doing real table-boundary detection. */
function isLikelyInTable(view: EditorView): boolean {
  const pos = view.state.selection.main.head
  return view.state.doc.lineAt(pos).text.includes('|')
}

/**
 * Extracts the current selection into a new note in the same folder, replacing
 * it in place with a wikilink to that note — Obsidian's "Extract current
 * selection" (Note Composer). Prompts for the new note's name; a name
 * collision gets a " 1"/" 2"/... suffix via the same `getAvailablePath()`
 * plugins use, rather than silently overwriting an existing note.
 */
async function extractSelectionToNewNote(view: EditorView): Promise<void> {
  const { state } = view
  const sel = state.selection.main
  if (sel.empty) return
  const selectedText = state.sliceDoc(sel.from, sel.to)

  const currentPath = state.field(editorInfoField, false)?.file?.path
  if (!currentPath) return

  const name = window.prompt('Name der neuen Notiz', '')
  if (!name || !name.trim()) return

  const dir = currentPath.includes('/') ? currentPath.slice(0, currentPath.lastIndexOf('/')) : ''
  const basename = dir ? `${dir}/${name.trim()}` : name.trim()

  const app = getApp()
  if (!app?.vault || !app.workspace) return

  const newPath = app.vault.getAvailablePath(basename, 'md')
  try {
    await app.vault.create(newPath, selectedText)
  } catch (err) {
    showToast('error', 'Notiz konnte nicht erstellt werden.')
    console.error('[EditorContextMenu] Extract selection failed:', err)
    return
  }

  view.dispatch({ changes: { from: sel.from, to: sel.to, insert: `[[${name.trim()}]]` } })
  app.workspace.openFileDirectly(newPath)
}

/**
 * The correction block shown above everything else when the user right-clicks
 * a misspelled word — suggestions first, then the two ways of silencing the
 * word for good ("learn") or for this session ("ignore").
 *
 * Returns `[]` when the click wasn't on a misspelling, which is the common
 * case, so the menu keeps its familiar shape.
 */
function buildSpellingItems(view: EditorView, spellcheck: SpellcheckMenuContext | undefined): ContextMenuItem[] {
  const misspelled = spellcheck?.misspelled
  if (!spellcheck || !misspelled) return []

  const items: ContextMenuItem[] = []

  if (spellcheck.suggestions === null) {
    items.push({ id: 'spell-loading', label: 'Vorschläge werden gesucht …', disabled: true })
  } else if (spellcheck.suggestions.length === 0) {
    items.push({ id: 'spell-none', label: 'Keine Vorschläge', disabled: true })
  } else {
    items.push(...spellcheck.suggestions.map((suggestion, index) => ({
      id: `spell-suggestion-${index}`,
      label: suggestion,
      icon: createElement(SpellCheck, { size: ICON_SIZE }),
      run: () => {
        view.dispatch({ changes: { from: misspelled.from, to: misspelled.to, insert: suggestion } })
        view.focus()
      },
    })))
  }

  items.push(
    { id: 'sep-spell-actions', label: '', separator: true },
    {
      id: 'spell-learn',
      label: 'Zum Wörterbuch hinzufügen',
      icon: createElement(BookPlus, { size: ICON_SIZE }),
      run: () => {
        learnWord(misspelled.word)
        view.focus()
      },
    },
    {
      id: 'spell-ignore',
      label: 'Alle ignorieren (diese Sitzung)',
      icon: createElement(Ban, { size: ICON_SIZE }),
      run: () => {
        ignoreWordForSession(misspelled.word)
        refreshSpellcheck(view)
        view.focus()
      },
    },
    { id: 'sep-spell', label: '', separator: true },
  )

  return items
}

/**
 * The "Rechtschreibprüfung" submenu grouping the on/off switch with the
 * dictionary picker.
 *
 * Both dispatch the same `slatebase:editor-command` window event the command
 * palette uses — the state lives in EditMode's `useSpellcheck()` hook, and this
 * menu only ever holds a plain `EditorView` with no path back up to it.
 */
function buildSpellcheckSettingsItem(spellcheck: SpellcheckMenuContext | undefined): ContextMenuItem {
  const languageItems: ContextMenuItem[] = SPELLCHECK_LANGUAGES.map((language) => ({
    id: `spell-lang-${language}`,
    label: SPELLCHECK_LANGUAGE_LABELS[language],
    checked: spellcheck?.language === language,
    run: () => window.dispatchEvent(new CustomEvent('slatebase:editor-command', {
      detail: { action: 'setSpellcheckLanguage', language },
    })),
  }))

  return {
    id: 'spellcheck',
    label: 'Rechtschreibprüfung',
    icon: createElement(Languages, { size: ICON_SIZE }),
    submenu: [
      {
        id: 'toggle-spellcheck',
        label: 'Rechtschreibprüfung aktiv',
        icon: createElement(SpellCheck, { size: ICON_SIZE }),
        checked: spellcheck?.enabled ?? false,
        run: () => window.dispatchEvent(new CustomEvent('slatebase:editor-command', { detail: { action: 'toggleSpellcheck' } })),
      },
      { id: 'sep-spell-lang', label: '', separator: true },
      ...languageItems,
    ],
  }
}

export function buildEditorContextMenuItems(
  view: EditorView,
  showLineNumbers: boolean,
  readableLineLength: boolean,
  spellcheck?: SpellcheckMenuContext,
): ContextMenuItem[] {
  const { state } = view
  const sel = state.selection.main
  const hasSelection = !sel.empty
  const selectedText = state.sliceDoc(sel.from, sel.to)

  const items: ContextMenuItem[] = [
    ...buildSpellingItems(view, spellcheck),
    {
      id: 'cut',
      label: 'Ausschneiden',
      icon: createElement(Scissors, { size: ICON_SIZE }),
      disabled: !hasSelection,
      run: () => {
        copyToClipboard(selectedText)
        view.dispatch({ changes: { from: sel.from, to: sel.to, insert: '' } })
        view.focus()
      },
    },
    {
      id: 'copy',
      label: 'Kopieren',
      icon: createElement(Copy, { size: ICON_SIZE }),
      disabled: !hasSelection,
      run: () => copyToClipboard(selectedText),
    },
    {
      id: 'paste',
      label: 'Einfügen',
      icon: createElement(Clipboard, { size: ICON_SIZE }),
      run: () => {
        navigator.clipboard.readText().then((text) => {
          view.dispatch(view.state.replaceSelection(text))
          view.focus()
        }).catch(() => { /* clipboard permission denied — nothing else to do */ })
      },
    },
    { id: 'sep-clipboard', label: '', separator: true },
    {
      id: 'link',
      label: hasSelection ? 'Link erstellen' : 'Link einfügen',
      icon: createElement(Link2, { size: ICON_SIZE }),
      run: () => { applyFormatting(view, 'link'); view.focus() },
    },

    // ── Textformatierung ──────────────────────────────────────────────
    {
      id: 'text-format',
      label: 'Textformatierung',
      icon: createElement(Type, { size: ICON_SIZE }),
      submenu: [
        { id: 'bold', label: 'Fett', icon: createElement(Bold, { size: ICON_SIZE }), run: () => runCoreCommand('toggle-bold', view) },
        { id: 'italic', label: 'Kursiv', icon: createElement(Italic, { size: ICON_SIZE }), run: () => runCoreCommand('toggle-italics', view) },
        { id: 'strikethrough', label: 'Durchgestrichen', icon: createElement(Strikethrough, { size: ICON_SIZE }), run: () => runCoreCommand('toggle-strikethrough', view) },
        { id: 'inline-code', label: 'Code', icon: createElement(Code, { size: ICON_SIZE }), run: () => runCoreCommand('toggle-code', view) },
        { id: 'highlight', label: 'Markieren', icon: createElement(Highlighter, { size: ICON_SIZE }), run: () => runCoreCommand('toggle-highlight', view) },
        { id: 'inline-math', label: 'Inline-Formel', icon: createElement(Sigma, { size: ICON_SIZE }), run: () => runCoreCommand('toggle-inline-math', view) },
        { id: 'comment', label: 'Kommentar', icon: createElement(MessageSquareOff, { size: ICON_SIZE }), run: () => runCoreCommand('toggle-comments', view) },
        { id: 'sep-clear', label: '', separator: true },
        { id: 'clear-formatting', label: 'Formatierung entfernen', icon: createElement(RemoveFormatting, { size: ICON_SIZE }), disabled: !hasSelection, run: () => runCoreCommand('clear-formatting', view) },
      ],
    },

    // ── Absatzformat ───────────────────────────────────────────────────
    {
      id: 'paragraph-format',
      label: 'Absatzformat',
      icon: createElement(Pilcrow, { size: ICON_SIZE }),
      submenu: [
        { id: 'heading1', label: 'Überschrift 1', icon: createElement(Heading1, { size: ICON_SIZE }), run: () => runCoreCommand('set-heading-1', view) },
        { id: 'heading2', label: 'Überschrift 2', icon: createElement(Heading2, { size: ICON_SIZE }), run: () => runCoreCommand('set-heading-2', view) },
        { id: 'heading3', label: 'Überschrift 3', icon: createElement(Heading3, { size: ICON_SIZE }), run: () => runCoreCommand('set-heading-3', view) },
        { id: 'heading4', label: 'Überschrift 4', icon: createElement(Heading4, { size: ICON_SIZE }), run: () => runCoreCommand('set-heading-4', view) },
        { id: 'heading5', label: 'Überschrift 5', icon: createElement(Heading5, { size: ICON_SIZE }), run: () => runCoreCommand('set-heading-5', view) },
        { id: 'heading6', label: 'Überschrift 6', icon: createElement(Heading6, { size: ICON_SIZE }), run: () => runCoreCommand('set-heading-6', view) },
        { id: 'heading0', label: 'Überschrift entfernen', icon: createElement(Pilcrow, { size: ICON_SIZE }), run: () => runCoreCommand('set-heading-0', view) },
        { id: 'sep-quote', label: '', separator: true },
        { id: 'blockquote', label: 'Zitat', icon: createElement(Quote, { size: ICON_SIZE }), run: () => runCoreCommand('toggle-blockquote', view) },
      ],
    },

    // ── Element einfügen ───────────────────────────────────────────────
    {
      id: 'insert-element',
      label: 'Element einfügen',
      icon: createElement(Plus, { size: ICON_SIZE }),
      submenu: [
        { id: 'insert-table', label: 'Tabelle', icon: createElement(Table, { size: ICON_SIZE }), run: () => runCoreCommand('insert-table', view) },
        { id: 'bullet-list', label: 'Aufzählungsliste', icon: createElement(List, { size: ICON_SIZE }), run: () => runCoreCommand('toggle-bullet-list', view) },
        { id: 'numbered-list', label: 'Nummerierte Liste', icon: createElement(ListOrdered, { size: ICON_SIZE }), run: () => runCoreCommand('toggle-numbered-list', view) },
        { id: 'task-list', label: 'Aufgabenliste', icon: createElement(ListChecks, { size: ICON_SIZE }), run: () => runCoreCommand('toggle-checklist-status', view) },
        { id: 'codeblock', label: 'Codeblock', icon: createElement(FileCode, { size: ICON_SIZE }), run: () => runCoreCommand('insert-codeblock', view) },
        { id: 'mathblock', label: 'Mathe-Block', icon: createElement(Sigma, { size: ICON_SIZE }), run: () => runCoreCommand('insert-mathblock', view) },
        {
          id: 'callout',
          label: 'Callout',
          icon: createElement(MessageSquareQuote, { size: ICON_SIZE }),
          run: () => { applyFormatting(view, 'callout'); view.focus() },
        },
        { id: 'footnote', label: 'Fußnote', icon: createElement(Asterisk, { size: ICON_SIZE }), run: () => runCoreCommand('insert-footnote', view) },
        { id: 'horizontal-rule', label: 'Trennlinie', icon: createElement(Minus, { size: ICON_SIZE }), run: () => runCoreCommand('insert-horizontal-rule', view) },
        { id: 'sep-links', label: '', separator: true },
        { id: 'wikilink', label: 'Wikilink', icon: createElement(Brackets, { size: ICON_SIZE }), run: () => runCoreCommand('insert-wikilink', view) },
        { id: 'embed', label: 'Einbettung', icon: createElement(Image, { size: ICON_SIZE }), run: () => runCoreCommand('insert-embed', view) },
        { id: 'tag', label: 'Tag', icon: createElement(Hash, { size: ICON_SIZE }), run: () => runCoreCommand('insert-tag', view) },
      ],
    },
  ]

  // ── Tabelle bearbeiten (only offered when the cursor is likely inside one) ──
  if (isLikelyInTable(view)) {
    items.push({
      id: 'table-edit',
      label: 'Tabelle bearbeiten',
      icon: createElement(TableProperties, { size: ICON_SIZE }),
      submenu: [
        {
          id: 'table-column',
          label: 'Spalte',
          icon: createElement(Columns3, { size: ICON_SIZE }),
          submenu: [
            { id: 'col-before', label: 'Davor einfügen', run: () => runCoreCommand('table-col-before', view) },
            { id: 'col-after', label: 'Danach einfügen', run: () => runCoreCommand('table-col-after', view) },
            { id: 'col-duplicate', label: 'Duplizieren', run: () => runCoreCommand('table-col-copy', view) },
            { id: 'col-delete', label: 'Löschen', icon: createElement(Trash2, { size: ICON_SIZE }), run: () => runCoreCommand('table-col-delete', view) },
            { id: 'sep-col-move', label: '', separator: true },
            { id: 'col-left', label: 'Nach links verschieben', run: () => runCoreCommand('table-col-left', view) },
            { id: 'col-right', label: 'Nach rechts verschieben', run: () => runCoreCommand('table-col-right', view) },
          ],
        },
        {
          id: 'table-row',
          label: 'Zeile',
          icon: createElement(Rows3, { size: ICON_SIZE }),
          submenu: [
            { id: 'row-before', label: 'Davor einfügen', run: () => runCoreCommand('table-row-before', view) },
            { id: 'row-after', label: 'Danach einfügen', run: () => runCoreCommand('table-row-after', view) },
            { id: 'row-duplicate', label: 'Duplizieren', run: () => runCoreCommand('table-row-copy', view) },
            { id: 'row-delete', label: 'Löschen', icon: createElement(Trash2, { size: ICON_SIZE }), run: () => runCoreCommand('table-row-delete', view) },
            { id: 'sep-row-move', label: '', separator: true },
            { id: 'row-up', label: 'Nach oben verschieben', run: () => runCoreCommand('table-row-up', view) },
            { id: 'row-down', label: 'Nach unten verschieben', run: () => runCoreCommand('table-row-down', view) },
          ],
        },
        {
          id: 'table-align',
          label: 'Ausrichtung',
          icon: createElement(AlignLeft, { size: ICON_SIZE }),
          submenu: [
            { id: 'align-left', label: 'Links', icon: createElement(AlignLeft, { size: ICON_SIZE }), run: () => runCoreCommand('table-col-align-left', view) },
            { id: 'align-center', label: 'Zentriert', icon: createElement(AlignCenter, { size: ICON_SIZE }), run: () => runCoreCommand('table-col-align-center', view) },
            { id: 'align-right', label: 'Rechts', icon: createElement(AlignRight, { size: ICON_SIZE }), run: () => runCoreCommand('table-col-align-right', view) },
          ],
        },
      ],
    })
  }

  items.push(
    // ── Zeile ────────────────────────────────────────────────────────
    {
      id: 'line-ops',
      label: 'Zeile',
      icon: createElement(GripVertical, { size: ICON_SIZE }),
      submenu: [
        { id: 'line-up', label: 'Nach oben verschieben', icon: createElement(ArrowUp, { size: ICON_SIZE }), run: () => runCoreCommand('swap-line-up', view) },
        { id: 'line-down', label: 'Nach unten verschieben', icon: createElement(ArrowDown, { size: ICON_SIZE }), run: () => runCoreCommand('swap-line-down', view) },
        { id: 'sep-delete', label: '', separator: true },
        { id: 'delete-paragraph', label: 'Absatz löschen', icon: createElement(Trash2, { size: ICON_SIZE }), run: () => runCoreCommand('delete-paragraph', view) },
      ],
    },
    { id: 'sep-extract', label: '', separator: true },
    {
      id: 'extract-selection',
      label: 'Ausgewählten Text extrahieren…',
      icon: createElement(FileOutput, { size: ICON_SIZE }),
      disabled: !hasSelection,
      run: () => { void extractSelectionToNewNote(view) },
    },
    { id: 'sep-copy-md', label: '', separator: true },
    {
      id: 'copy-md',
      label: 'Als Markdown kopieren',
      icon: createElement(FileText, { size: ICON_SIZE }),
      run: () => copyToClipboard(hasSelection ? selectedText : state.doc.toString()),
    },
    { id: 'sep-line-numbers', label: '', separator: true },
    {
      id: 'toggle-line-numbers',
      label: 'Zeilennummern anzeigen',
      icon: createElement(Hash, { size: ICON_SIZE }),
      checked: showLineNumbers,
      // Reuses the same 'editor:toggle-line-numbers' core command the
      // command palette calls (core-commands-app.ts) — the actual toggle
      // state lives in EditMode's useLineNumbers() hook, reached the same
      // way: a window event, not a prop, since this menu is built from a
      // plain EditorView reference with no path back up to that hook.
      run: () => window.dispatchEvent(new CustomEvent('slatebase:editor-command', { detail: { action: 'toggleLineNumbers' } })),
    },
    {
      id: 'toggle-readable-line-length',
      label: 'Lesbare Zeilenlänge',
      icon: createElement(StretchHorizontal, { size: ICON_SIZE }),
      checked: readableLineLength,
      // Same pattern as toggle-line-numbers above: the actual toggle state
      // lives in EditMode's useReadableLineLength() hook, reached via a
      // window event since this menu only has a plain EditorView reference.
      run: () => window.dispatchEvent(new CustomEvent('slatebase:editor-command', { detail: { action: 'toggleReadableLineLength' } })),
    },
    buildSpellcheckSettingsItem(spellcheck),
  )

  // 'editor-menu' fires with the real Editor + MarkdownFileInfo-shaped info,
  // matching workspace.on('editor-menu', (menu, editor, info) => ...) — both
  // already live on this StateField (see editor-state-fields.ts).
  const info = state.field(editorInfoField, false)
  if (info?.editor) {
    items.push(...buildPluginMenuItems('editor-menu', [info.editor, info], 'editor-menu'))
  }

  return items
}
