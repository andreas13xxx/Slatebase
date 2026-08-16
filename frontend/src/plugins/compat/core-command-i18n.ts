/**
 * core-command-i18n — German/English display names for Obsidian's core commands.
 *
 * `core-commands.ts` and `core-commands-app.ts` register commands under Obsidian's
 * own IDs (`workspace:close`, `editor:toggle-bold`, ...) so plugins resolving them
 * via `executeCommandById()` keep working — that part is intentionally fixed and
 * language-independent. The display `name` shown in the Command Palette is not:
 * real Obsidian localizes it, so Slatebase does too, via this lookup keyed by the
 * same full command ID.
 *
 * Kept as its own module (rather than inlined into the two files above) so
 * translating names never touches the `buildSpecs()`/`commands` arrays those files
 * own — only the two `registerCore*Commands()` entry points import from here.
 *
 * @module core-command-i18n
 */

import type { Locale } from '../../i18n'

const NAMES: Record<string, { de: string; en: string }> = {
  // ── editor:* (core-commands.ts, formatting/insertion) ──
  'editor:toggle-checklist-status': { de: 'Liste/Checkliste durchschalten', en: 'Cycle list and checklist' },
  'editor:toggle-code': { de: 'Inline-Code umschalten', en: 'Toggle inline code' },
  'editor:toggle-blockquote': { de: 'Zitatblock umschalten', en: 'Toggle blockquote' },
  'editor:toggle-comments': { de: 'Kommentar umschalten', en: 'Toggle comment' },
  'editor:insert-wikilink': { de: 'Internen Link einfügen', en: 'Insert internal link' },
  'editor:insert-embed': { de: 'Einbettung einfügen', en: 'Insert embed' },
  'editor:insert-tag': { de: 'Tag einfügen', en: 'Insert tag' },
  'editor:insert-link': { de: 'Link einfügen', en: 'Insert link' },
  'editor:insert-table': { de: 'Tabelle einfügen', en: 'Insert table' },
  'editor:insert-mathblock': { de: 'Mathe-Block einfügen', en: 'Insert math block' },
  'editor:insert-callout': { de: 'Callout einfügen', en: 'Insert callout' },
  'editor:swap-line-up': { de: 'Zeile nach oben verschieben', en: 'Move line up' },
  'editor:swap-line-down': { de: 'Zeile nach unten verschieben', en: 'Move line down' },
  'editor:clear-formatting': { de: 'Formatierung entfernen', en: 'Clear formatting' },
  'editor:toggle-bold': { de: 'Fett umschalten', en: 'Toggle bold' },
  'editor:toggle-italics': { de: 'Kursiv umschalten', en: 'Toggle italic' },
  'editor:toggle-strikethrough': { de: 'Durchgestrichen umschalten', en: 'Toggle strikethrough' },
  'editor:toggle-highlight': { de: 'Hervorhebung umschalten', en: 'Toggle highlight' },
  'editor:toggle-inline-math': { de: 'Inline-Mathe umschalten', en: 'Toggle inline maths' },
  'editor:toggle-bullet-list': { de: 'Aufzählungsliste umschalten', en: 'Toggle bullet list' },
  'editor:toggle-numbered-list': { de: 'Nummerierte Liste umschalten', en: 'Toggle numbered list' },
  'editor:cycle-list-checklist': { de: 'Aufzählung/Checkbox durchschalten', en: 'Cycle bullet/checkbox' },
  'editor:indent-list': { de: 'Listenelement einrücken', en: 'Indent list item' },
  'editor:unindent-list': { de: 'Listenelement ausrücken', en: 'Unindent list item' },
  'editor:set-heading': { de: 'Überschrift umschalten', en: 'Toggle heading' },
  'editor:set-heading-0': { de: 'Überschrift entfernen', en: 'Remove heading' },
  'editor:set-heading-1': { de: 'Als Überschrift 1 festlegen', en: 'Set as heading 1' },
  'editor:set-heading-2': { de: 'Als Überschrift 2 festlegen', en: 'Set as heading 2' },
  'editor:set-heading-3': { de: 'Als Überschrift 3 festlegen', en: 'Set as heading 3' },
  'editor:set-heading-4': { de: 'Als Überschrift 4 festlegen', en: 'Set as heading 4' },
  'editor:set-heading-5': { de: 'Als Überschrift 5 festlegen', en: 'Set as heading 5' },
  'editor:set-heading-6': { de: 'Als Überschrift 6 festlegen', en: 'Set as heading 6' },
  'editor:rename-heading': { de: 'Diese Überschrift umbenennen …', en: 'Rename this heading...' },
  'editor:insert-horizontal-rule': { de: 'Horizontale Linie einfügen', en: 'Insert horizontal rule' },
  'editor:insert-codeblock': { de: 'Codeblock einfügen', en: 'Insert code block' },
  'editor:insert-footnote': { de: 'Fußnote einfügen', en: 'Insert footnote' },
  'editor:delete-paragraph': { de: 'Absatz löschen', en: 'Delete paragraph' },
  'editor:add-cursor-above': { de: 'Cursor darüber hinzufügen', en: 'Add cursor above' },
  'editor:add-cursor-below': { de: 'Cursor darunter hinzufügen', en: 'Add cursor below' },
  'editor:focus': { de: 'Letzte Notiz fokussieren', en: 'Focus on last note' },
  'editor:table-col-after': { de: 'Tabelle: Spalte danach einfügen', en: 'Table: Add column after' },
  'editor:table-col-before': { de: 'Tabelle: Spalte davor einfügen', en: 'Table: Add column before' },
  'editor:table-col-align-left': { de: 'Tabelle: Linksbündig ausrichten', en: 'Table: Align left' },
  'editor:table-col-align-center': { de: 'Tabelle: Zentriert ausrichten', en: 'Table: Align centre' },
  'editor:table-col-align-right': { de: 'Tabelle: Rechtsbündig ausrichten', en: 'Table: Align right' },
  'editor:table-col-copy': { de: 'Tabelle: Spalte duplizieren', en: 'Table: Duplicate column' },
  'editor:table-col-delete': { de: 'Tabelle: Spalte löschen', en: 'Table: Delete column' },
  'editor:table-col-left': { de: 'Tabelle: Spalte nach links verschieben', en: 'Table: Move column left' },
  'editor:table-col-right': { de: 'Tabelle: Spalte nach rechts verschieben', en: 'Table: Move column right' },
  'editor:table-row-after': { de: 'Tabelle: Zeile danach einfügen', en: 'Table: Add row after' },
  'editor:table-row-before': { de: 'Tabelle: Zeile davor einfügen', en: 'Table: Add row before' },
  'editor:table-row-copy': { de: 'Tabelle: Zeile duplizieren', en: 'Table: Duplicate row' },
  'editor:table-row-delete': { de: 'Tabelle: Zeile löschen', en: 'Table: Delete row' },
  'editor:table-row-down': { de: 'Tabelle: Zeile nach unten verschieben', en: 'Table: Move row down' },
  'editor:table-row-up': { de: 'Tabelle: Zeile nach oben verschieben', en: 'Table: Move row up' },
  'editor:attach-file': { de: 'Anhang einfügen', en: 'Insert attachment' },
  'editor:context-menu': { de: 'Kontextmenü unter dem Cursor anzeigen', en: 'Show context menu under cursor' },
  'editor:download-attachments': { de: 'Anhänge der aktuellen Datei herunterladen', en: 'Download attachments for current file' },
  'editor:fold-all': { de: 'Alle Überschriften und Listen einklappen', en: 'Fold all headings and lists' },
  'editor:fold-less': { de: 'Weniger einklappen', en: 'Fold less' },
  'editor:fold-more': { de: 'Mehr einklappen', en: 'Fold more' },
  'editor:toggle-fold': { de: 'Einklappen der aktuellen Zeile umschalten', en: 'Toggle fold on the current line' },
  'editor:toggle-fold-properties': { de: 'Einklappen der Eigenschaften umschalten', en: 'Toggle fold properties in current file' },
  'editor:unfold-all': { de: 'Alle Überschriften und Listen ausklappen', en: 'Unfold all headings and lists' },
  'editor:toggle-readable-line-length': { de: 'Lesbare Zeilenlänge umschalten', en: 'Toggle readable line length' },
  'editor:toggle-spellcheck': { de: 'Rechtschreibprüfung umschalten', en: 'Toggle spellcheck' },
  'editor:focus-top': { de: 'Tab-Gruppe darüber fokussieren', en: 'Focus on tab group above' },
  'editor:focus-bottom': { de: 'Tab-Gruppe darunter fokussieren', en: 'Focus on tab group below' },
  'editor:focus-left': { de: 'Tab-Gruppe links fokussieren', en: 'Focus on tab group to the left' },
  'editor:focus-right': { de: 'Tab-Gruppe rechts fokussieren', en: 'Focus on tab group to the right' },

  // ── workspace:* (core-commands-app.ts, tabs) ──
  'workspace:close': { de: 'Aktuellen Tab schließen', en: 'Close current tab' },
  'workspace:close-others': { de: 'Alle anderen Tabs schließen', en: 'Close all other tabs' },
  'workspace:close-tab-group': { de: 'Diese Tab-Gruppe schließen', en: 'Close this tab group' },
  'workspace:close-others-tab-group': { de: 'Andere in der Tab-Gruppe schließen', en: 'Close others in tab group' },
  'workspace:next-tab': { de: 'Zum nächsten Tab wechseln', en: 'Go to next tab' },
  'workspace:previous-tab': { de: 'Zum vorherigen Tab wechseln', en: 'Go to previous tab' },
  'workspace:goto-last-tab': { de: 'Zum letzten Tab wechseln', en: 'Go to last tab' },
  'workspace:copy-path': { de: 'Dateipfad ab Vault-Ordner kopieren', en: 'Copy current file path from vault folder' },
  'workspace:copy-full-path': { de: 'Dateipfad ab Systemwurzel kopieren', en: 'Copy current file path from system root' },
  'workspace:edit-file-title': { de: 'Datei umbenennen', en: 'Rename file' },
  'workspace:show-trash': { de: 'Papierkorb anzeigen', en: 'Show trash' },
  'workspace:new-tab': { de: 'Neuer Tab', en: 'New tab' },
  'workspace:toggle-pin': { de: 'Anheften umschalten', en: 'Toggle pin' },
  'workspace:split-vertical': { de: 'Rechts teilen', en: 'Split right' },
  'workspace:split-horizontal': { de: 'Unten teilen', en: 'Split down' },
  'workspace:undo-close-pane': { de: 'Tab-Schließen rückgängig machen', en: 'Undo close tab' },
  'workspace:move-to-new-window': { de: 'Aktuellen Tab in neues Fenster verschieben', en: 'Move current tab to new window' },
  'workspace:new-window': { de: 'Neues Fenster', en: 'New window' },
  'workspace:close-window': { de: 'Fenster schließen', en: 'Close window' },
  'workspace:open-in-new-window': { de: 'Aktuellen Tab in neuem Fenster öffnen', en: 'Open current tab in new window' },
  'workspace:toggle-stacked-tabs': { de: 'Gestapelte Tabs umschalten', en: 'Toggle stacked tabs' },
  'workspace:copy-url': { de: 'Obsidian-URL der aktuellen Datei kopieren', en: 'Copy Obsidian URL for current file' },
  'workspace:export-pdf': { de: 'Als PDF exportieren …', en: 'Export to PDF...' },
  'workspace:goto-tab-1': { de: 'Zu Tab Nr. 1 wechseln', en: 'Go to tab #1' },
  'workspace:goto-tab-2': { de: 'Zu Tab Nr. 2 wechseln', en: 'Go to tab #2' },
  'workspace:goto-tab-3': { de: 'Zu Tab Nr. 3 wechseln', en: 'Go to tab #3' },
  'workspace:goto-tab-4': { de: 'Zu Tab Nr. 4 wechseln', en: 'Go to tab #4' },
  'workspace:goto-tab-5': { de: 'Zu Tab Nr. 5 wechseln', en: 'Go to tab #5' },
  'workspace:goto-tab-6': { de: 'Zu Tab Nr. 6 wechseln', en: 'Go to tab #6' },
  'workspace:goto-tab-7': { de: 'Zu Tab Nr. 7 wechseln', en: 'Go to tab #7' },
  'workspace:goto-tab-8': { de: 'Zu Tab Nr. 8 wechseln', en: 'Go to tab #8' },

  // ── file-explorer:* ──
  'file-explorer:new-file': { de: 'Neue Notiz erstellen', en: 'Create new note' },
  'file-explorer:new-file-in-current-tab': { de: 'Neue Notiz im aktuellen Tab erstellen', en: 'Create new note in current tab' },
  'file-explorer:new-file-in-new-pane': { de: 'Notiz rechts erstellen', en: 'Create note to the right' },
  'file-explorer:new-folder': { de: 'Dateien: Neuen Ordner erstellen', en: 'Files: Create new folder' },
  'file-explorer:open': { de: 'Dateien: Dateiexplorer anzeigen', en: 'Files: Show file explorer' },
  'file-explorer:reveal-active-file': { de: 'Dateien: Aktuelle Datei in Navigation anzeigen', en: 'Files: Reveal current file in navigation' },
  'file-explorer:duplicate-file': { de: 'Kopie der aktuellen Datei erstellen', en: 'Make a copy of the current file' },
  'file-explorer:move-file': { de: 'Aktuelle Datei in anderen Ordner verschieben', en: 'Move current file to another folder' },

  // ── app:* ──
  'app:reload': { de: 'App neu laden, ohne zu speichern', en: 'Reload app without saving' },
  'app:open-settings': { de: 'Einstellungen öffnen', en: 'Open settings' },
  'app:toggle-left-sidebar': { de: 'Linke Seitenleiste umschalten', en: 'Toggle left sidebar' },
  'app:toggle-right-sidebar': { de: 'Rechte Seitenleiste umschalten', en: 'Toggle right sidebar' },
  'app:delete-file': { de: 'Aktuelle Datei löschen', en: 'Delete current file' },
  'app:open-vault': { de: 'Vaults verwalten', en: 'Manage vaults' },
  'app:switch-vault': { de: 'Vault wechseln …', en: 'Change vault...' },
  'app:open-another-vault': { de: 'Vault öffnen …', en: 'Open vault...' },
  'app:toggle-ribbon': { de: 'Ribbon umschalten', en: 'Toggle ribbon' },
  'app:go-back': { de: 'Zurück navigieren', en: 'Navigate back' },
  'app:go-forward': { de: 'Vorwärts navigieren', en: 'Navigate forward' },
  'app:open-sandbox-vault': { de: 'Sandbox-Vault öffnen', en: 'Open sandbox vault' },
  'app:open-help': { de: 'Hilfe öffnen', en: 'Open help' },
  'app:show-debug-info': { de: 'Debug-Informationen anzeigen', en: 'Show debug info' },
  'app:show-release-notes': { de: 'Versionshinweise anzeigen', en: 'Show release notes' },
  'app:toggle-default-new-pane-mode': { de: 'Standardmodus für neue Tabs umschalten', en: 'Toggle default mode for new tabs' },

  // ── theme:* ──
  'theme:toggle-light-dark': { de: 'Hell-/Dunkelmodus umschalten', en: 'Toggle light/dark mode' },
  'theme:switch': { de: 'Theme wechseln …', en: 'Change theme...' },

  // ── window:* ──
  'window:zoom-in': { de: 'Vergrößern', en: 'Zoom in' },
  'window:zoom-out': { de: 'Verkleinern', en: 'Zoom out' },
  'window:reset-zoom': { de: 'Zoom zurücksetzen', en: 'Reset zoom' },
  'window:toggle-always-on-top': { de: 'Fenster immer im Vordergrund umschalten', en: 'Toggle window always on top' },

  // ── Graph / Canvas / Daily Notes / Templates ──
  'graph:open': { de: 'Graph-Ansicht: Graph-Ansicht öffnen', en: 'Graph view: Open graph view' },
  'graph:open-local': { de: 'Graph-Ansicht: Lokalen Graphen öffnen', en: 'Graph view: Open local graph' },
  'graph:animate': { de: 'Graph-Ansicht: Zeitraffer-Animation starten', en: 'Graph view: Start graph time-lapse animation' },
  'canvas:new-file': { de: 'Canvas: Neues Canvas erstellen', en: 'Canvas: Create new canvas' },
  'canvas:jump-to-group': { de: 'Canvas: Zu Gruppe springen', en: 'Canvas: Jump to group' },
  'canvas:export-as-image': { de: 'Canvas: Als Bild exportieren', en: 'Canvas: Export as image' },
  'canvas:convert-to-file': { de: 'Canvas: In Datei umwandeln …', en: 'Canvas: Convert to file...' },
  'daily-notes': { de: 'Tagesnotizen: Heutige Tagesnotiz öffnen', en: "Daily notes: Open today's daily note" },
  'daily-notes:goto-next': { de: 'Tagesnotizen: Nächste Tagesnotiz öffnen', en: 'Daily notes: Open next daily note' },
  'daily-notes:goto-prev': { de: 'Tagesnotizen: Vorherige Tagesnotiz öffnen', en: 'Daily notes: Open previous daily note' },
  'insert-template': { de: 'Vorlagen: Vorlage einfügen', en: 'Templates: Insert template' },
  'insert-current-date': { de: 'Vorlagen: Aktuelles Datum einfügen', en: 'Templates: Insert current date' },
  'insert-current-time': { de: 'Vorlagen: Aktuelle Uhrzeit einfügen', en: 'Templates: Insert current time' },

  // ── markdown:* ──
  'markdown:toggle-preview': { de: 'Lesemodus umschalten', en: 'Toggle reading view' },
  'markdown:add-alias': { de: 'Alias hinzufügen', en: 'Add alias' },
  'markdown:add-metadata-property': { de: 'Dateieigenschaft hinzufügen', en: 'Add file property' },
  'markdown:clear-metadata-properties': { de: 'Dateieigenschaften löschen', en: 'Clear file properties' },

  // ── Side panels / bookmarks / search ──
  'outline:open': { de: 'Gliederung: Gliederung anzeigen', en: 'Outline: Show outline' },
  'outline:open-for-current': { de: 'Gliederung: Gliederung der aktuellen Datei öffnen', en: 'Outline: Open outline of the current file' },
  'backlink:open': { de: 'Backlinks: Backlinks anzeigen', en: 'Backlinks: Show backlinks' },
  'backlink:open-backlinks': { de: 'Backlinks: Backlinks der aktuellen Notiz öffnen', en: 'Backlinks: Open backlinks for the current note' },
  'backlink:toggle-backlinks-in-document': { de: 'Backlinks: Backlinks im Dokument umschalten', en: 'Backlinks: Toggle backlinks in document' },
  'outgoing-links:open': { de: 'Ausgehende Links: Ausgehende Links anzeigen', en: 'Outgoing links: Show outgoing links' },
  'outgoing-links:open-for-current': { de: 'Ausgehende Links: Ausgehende Links der aktuellen Datei öffnen', en: 'Outgoing links: Open outgoing links for the current file' },
  'tag-pane:open': { de: 'Tag-Ansicht: Tags anzeigen', en: 'Tags view: Show tags' },
  'bookmarks:open': { de: 'Lesezeichen: Lesezeichen anzeigen', en: 'Bookmarks: Show bookmarks' },
  'bookmarks:bookmark-current-view': { de: 'Lesezeichen: Lesezeichen setzen …', en: 'Bookmarks: Bookmark...' },
  'bookmarks:unbookmark-current-view': { de: 'Lesezeichen: Lesezeichen der aktuellen Datei entfernen', en: 'Bookmarks: Remove bookmark for the current file' },
  'bookmarks:bookmark-all-tabs': { de: 'Lesezeichen: Alle Tabs mit Lesezeichen versehen …', en: 'Bookmarks: Bookmark all tabs...' },
  'bookmarks:bookmark-current-heading': { de: 'Lesezeichen: Überschrift unter dem Cursor mit Lesezeichen versehen …', en: 'Bookmarks: Bookmark heading under cursor...' },
  'bookmarks:bookmark-current-search': { de: 'Lesezeichen: Aktuelle Suche mit Lesezeichen versehen …', en: 'Bookmarks: Bookmark current search...' },
  'bookmarks:bookmark-current-section': { de: 'Lesezeichen: Block unter dem Cursor mit Lesezeichen versehen …', en: 'Bookmarks: Bookmark block under cursor...' },
  'file-recovery:open': { de: 'Dateiwiederherstellung: Lokalen Verlauf öffnen', en: 'File recovery: Open local history' },
  'footnotes:open': { de: 'Fußnoten-Ansicht: Fußnoten anzeigen', en: 'Footnotes view: Show footnotes' },
  'note-composer:extract-heading': { de: 'Notiz-Composer: Diese Überschrift extrahieren …', en: 'Note composer: Extract this heading...' },
  'note-composer:merge-file': { de: 'Notiz-Composer: Aktuelle Datei mit anderer Datei zusammenführen …', en: 'Note composer: Merge current file with another file...' },
  'note-composer:split-file': { de: 'Notiz-Composer: Aktuelle Auswahl extrahieren …', en: 'Note composer: Extract current selection...' },
  'bases:add-item': { de: 'Bases: Element hinzufügen', en: 'Bases: Add item' },
  'bases:add-view': { de: 'Bases: Ansicht hinzufügen', en: 'Bases: Add view' },
  'bases:change-view': { de: 'Bases: Ansicht wechseln', en: 'Bases: Change view' },
  'bases:copy-table': { de: 'Bases: Tabelle in Zwischenablage kopieren', en: 'Bases: Copy table to clipboard' },
  'bases:insert': { de: 'Bases: Neue Base einfügen', en: 'Bases: Insert new base' },
  'bases:new-file': { de: 'Bases: Neue Base erstellen', en: 'Bases: Create new base' },
  'open-with-default-app:open': { de: 'In Standard-App öffnen', en: 'Open in default app' },
  'open-with-default-app:show': { de: 'Im Datei-Explorer anzeigen', en: 'Show in system explorer' },
  'switcher:open': { de: 'Schnellwechsler: Schnellwechsler öffnen', en: 'Quick switcher: Open quick switcher' },
  'global-search:open': { de: 'Suche: In allen Dateien suchen', en: 'Search: Search in all files' },
  'command-palette:open': { de: 'Befehlspalette: Befehlspalette öffnen', en: 'Command palette: Open command palette' },

  // ── editor:* needing app context (core-commands-app.ts) ──
  'editor:save-file': { de: 'Aktuelle Datei speichern', en: 'Save current file' },
  'editor:toggle-source': { de: 'Live-Vorschau/Quelltext-Modus umschalten', en: 'Toggle Live Preview/Source mode' },
  'editor:toggle-line-numbers': { de: 'Zeilennummern umschalten', en: 'Toggle line numbers' },
  'editor:follow-link': { de: 'Link unter dem Cursor folgen', en: 'Follow link under cursor' },
  'editor:open-link-in-new-leaf': { de: 'Link unter dem Cursor in neuem Tab öffnen', en: 'Open link under cursor in new tab' },
  'editor:open-link-in-new-split': { de: 'Link unter dem Cursor rechts öffnen', en: 'Open link under cursor to the right' },
  'editor:open-link-in-new-window': { de: 'Link unter dem Cursor in neuem Fenster öffnen', en: 'Open link under cursor in new window' },
  'editor:open-search': { de: 'Aktuelle Datei durchsuchen', en: 'Search current file' },
  'editor:open-search-replace': { de: 'Suchen & Ersetzen in aktueller Datei', en: 'Search & replace in current file' },
}

/**
 * Resolves the display name for a core command ID in the given locale.
 * Falls back to `fallback` (the hardcoded English name from the spec) for any
 * ID not yet in the table above, so a newly added command still shows *something*
 * instead of breaking, rather than being silently dropped.
 */
export function translateCoreCommandName(id: string, locale: Locale, fallback: string): string {
  return NAMES[id]?.[locale] ?? fallback
}
