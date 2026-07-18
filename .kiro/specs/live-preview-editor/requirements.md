# Requirements — Live Preview Editor (CodeMirror 6 Migration)

## Einleitung

Slatebase nutzt aktuell ein `<textarea>` als Editor. Dieses soll durch **CodeMirror 6** ersetzt werden, um Syntax-Highlighting, Live Preview, Vim/Emacs-Modi, Performance bei großen Dateien und volle Plugin-Kompatibilität (`registerEditorExtension`, `registerEditorSuggest`, `editorCallback`) zu ermöglichen.

Das Feature wird in drei Phasen umgesetzt:
- **Phase 1**: CM6 als Source-Editor (ersetzt textarea, Syntax-Highlighting, Vim-Mode, Plugin-Extension-API)
- **Phase 2**: Live Preview (Inline-Rendering von Headings, Bold, Links, Embeds, Callouts direkt im Editor)
- **Phase 3**: Plugin-Integration (`registerEditorExtension`, `registerEditorSuggest`, `editorCallback` Commands)

## Glossar

- **CM6**: CodeMirror 6 — modulares Editor-Framework für den Browser
- **EditorView**: CM6 View-Instanz die den DOM-Output verwaltet
- **EditorState**: CM6 State-Container (Dokument + Selections + Extensions)
- **Extension**: CM6 Plugin/Facet das Editor-Verhalten erweitert (Syntax, Keybindings, Decorations)
- **Decoration**: Visuelle Modifikation im Editor (Widgets, Markierungen, Line-Klassen)
- **StateField**: Persistenter State der an eine Editor-Instanz gebunden ist
- **ViewPlugin**: CM6 Plugin das Zugang zum DOM hat (für imperative Effekte)
- **Live_Preview**: Modus in dem Markdown-Syntax inline gerendert wird (Headings groß, Bold fett, Links klickbar)
- **Source_Mode**: Modus in dem roher Markdown-Text angezeigt wird (mit Syntax-Highlighting)
- **EditorShim**: Bestehende Plugin-Compat-Schicht die Editor-Methoden bereitstellt (getCursor, replaceRange, etc.)

## Requirements

### Requirement 1: CodeMirror 6 Grundintegration

**User Story:** Als Benutzer möchte ich einen modernen Editor mit Syntax-Highlighting statt des einfachen Textfeldes, damit das Schreiben angenehmer wird.

#### Acceptance Criteria

1. THE EditMode-Komponente SHALL `<textarea>` durch eine CM6 `EditorView`-Instanz ersetzen
2. THE CM6-Editor SHALL Markdown-Syntax-Highlighting via `@codemirror/lang-markdown` bereitstellen (Headings, Bold, Italic, Code, Links, Lists farblich hervorgehoben)
3. THE CM6-Editor SHALL Code-Block-Syntax-Highlighting für gängige Sprachen unterstützen (via `@codemirror/language-data` — JavaScript, TypeScript, Python, CSS, HTML, JSON, YAML, Bash mindestens)
4. THE CM6-Editor SHALL das bestehende Dark/Light-Theme über CSS Custom Properties (Design Tokens) unterstützen — kein eigenes hartkodiertes Farbschema
5. THE CM6-Editor SHALL die bestehende Auto-Save-Logik (2s Debounce) beibehalten — `EditorView.updateListener` triggert den Debounce bei doc-Änderungen
6. THE CM6-Editor SHALL Line Numbers optional anzeigen (bestehender `useLineNumbers`-Toggle wird beibehalten)
7. THE CM6-Editor SHALL die bestehende Toolbar (Bold, Italic, Heading, Link, etc.) unterstützen — Toolbar-Buttons operieren via CM6 Transactions auf dem Editor-State
8. THE CM6-Editor SHALL in der Höhe den verfügbaren Container ausfüllen (flex: 1) und korrekt in das bestehende TabContent-Layout passen
9. THE CM6-Editor SHALL den Read-Only-Modus unterstützen (EditorState.readOnly Extension basierend auf dem bestehenden `readOnly`-Prop)
10. THE CM6-Editor SHALL bei Tab-Wechsel den Editor-State bewahren (Cursor-Position, Scroll-Position, Undo-History pro Tab)

### Requirement 2: Editor-Lifecycle und State-Management

**User Story:** Als Benutzer möchte ich nahtlos zwischen Tabs wechseln und meine Cursor-Position und Undo-History behalten.

#### Acceptance Criteria

1. THE Editor SHALL pro geöffnetem Tab einen separaten `EditorState` halten (Undo-History, Selections, Scroll-Position)
2. WHEN ein Tab aktiviert wird, THE Editor SHALL den gespeicherten EditorState wiederherstellen (oder einen neuen erstellen bei erstmaligem Öffnen)
3. WHEN ein Tab geschlossen wird, THE Editor SHALL den zugehörigen EditorState verwerfen (Memory-Freigabe)
4. WHEN der Dateiinhalt extern geändert wird (SSE `vault:change`), THE Editor SHALL den State aktualisieren OHNE die Undo-History zu löschen — nur wenn `editBuffer === null` (keine ungespeicherten Änderungen)
5. THE Editor SHALL maximal 200 Undo-Schritte in der History behalten (via `historyConfig`)
6. WHEN der Editor-Inhalt sich ändert, THE EditMode SHALL `onContentChange(newContent)` aufrufen (identisches Interface wie aktuell, damit TabContent/Auto-Save unverändert funktioniert)

### Requirement 3: Tastatur-Interaktion und Keybindings

**User Story:** Als Benutzer möchte ich die gewohnten Tastenkürzel nutzen und optional Vim/Emacs-Mode aktivieren können.

#### Acceptance Criteria

1. THE Editor SHALL Standard-Keybindings bereitstellen: Ctrl+Z (Undo), Ctrl+Y/Ctrl+Shift+Z (Redo), Ctrl+A (Select All), Tab/Shift+Tab (Indent/Dedent), Ctrl+D (Select Word/Next Occurrence)
2. THE Editor SHALL die bestehenden konfigurierbaren Keybindings (`keybindingsStore`) respektieren — Editor-Formatting-Commands (Ctrl+B, Ctrl+I, Ctrl+K, etc.) aus dem Command-Palette-System werden über CM6 Keymaps registriert
3. THE Editor SHALL den `slatebase:editor-command` CustomEvent-Listener beibehalten — Commands aus CommandPaletteContainer operieren auf dem CM6-Editor statt auf dem textarea
4. THE Editor SHALL optional Vim-Mode unterstützen (via `@replit/codemirror-vim` oder gleichwertig) — aktivierbar über Settings (neue Option unter "Editor")
5. THE Editor SHALL Bracket-Auto-Completion bieten (Klammer-, Anführungszeichen-Paare automatisch schließen) — konfigurierbar in Settings

### Requirement 4: Image-Paste und Drag-and-Drop

**User Story:** Als Benutzer möchte ich Bilder weiterhin per Paste und Drag-and-Drop in den Editor einfügen können.

#### Acceptance Criteria

1. THE Editor SHALL Clipboard-Paste von Bildern (`image/*` MIME) abfangen, über die Upload-API hochladen und einen Markdown-Embed-Link (`![[dateiname.png]]`) an der Cursor-Position einfügen
2. THE Editor SHALL Datei-Drag-and-Drop unterstützen: gezogene Bild-Dateien werden hochgeladen und als Embed-Link eingefügt, Markdown-Dateien als Wikilink
3. THE Editor SHALL während des Uploads einen Platzhalter anzeigen (`![Uploading...](...)`) und diesen nach erfolgreichem Upload durch den echten Link ersetzen
4. THE Editor SHALL Text-Paste NICHT intercepten (nur `image/*` MIME-Typen)

### Requirement 5: Undo/Redo

**User Story:** Als Benutzer möchte ich Änderungen rückgängig machen und wiederherstellen können.

#### Acceptance Criteria

1. THE Editor SHALL CM6 `@codemirror/commands` History-Extension nutzen (ersetzt den bestehenden `useHistoryStack`-Hook)
2. THE Editor SHALL Undo/Redo-Buttons in der Toolbar bereitstellen die den CM6-History-Befehl ausführen
3. THE Editor SHALL die History bei Datei-Wechsel (Tab-Switch) bewahren und bei Tab-Close verwerfen
4. THE Editor SHALL bei externem Content-Update (SAVE_SUCCESS, vault:change) den aktuellen State als neuen Checkpoint in die History einfügen (nicht die History löschen)

### Requirement 6: Live Preview Modus

**User Story:** Als Benutzer möchte ich Markdown direkt im Editor gerendert sehen (Headings groß, Bold fett, Links klickbar), damit ich das Ergebnis während des Schreibens sehe.

#### Acceptance Criteria

1. THE Editor SHALL einen umschaltbaren "Live Preview"-Modus anbieten (Toggle in der Toolbar oder via Keybinding)
2. IN Live Preview Mode, THE Editor SHALL Markdown-Syntax durch visuelle Darstellung ersetzen:
   - `# Heading` → großer Text (Heading-Level-spezifische Schriftgröße)
   - `**bold**` → fetter Text (Marker ausgeblendet wenn Cursor nicht in der Zeile)
   - `*italic*` → kursiver Text (Marker ausgeblendet)
   - `~~strikethrough~~` → durchgestrichener Text
   - `[link text](url)` → klickbarer Link (URL ausgeblendet wenn Cursor nicht im Link)
   - `[[wikilink]]` → interner Link (klickbar, öffnet Datei)
   - `![[embed]]` → Inline-Preview (Bild/PDF-Vorschau direkt im Editor)
   - `` `inline code` `` → monospace Hintergrund
   - Fenced code blocks → Syntax-Highlighted mit Sprach-Label
   - `> blockquote` → eingerückt mit Seitenbalken
   - `- [ ] task` → Checkbox (klickbar, togglet Status)
   - Callouts (`> [!info]`) → farbiger Container mit Icon
3. WHEN der Cursor sich IN einen formatierten Bereich bewegt, THE Editor SHALL die rohe Markdown-Syntax anzeigen (Marker werden sichtbar für Bearbeitung)
4. WHEN der Cursor den formatierten Bereich VERLÄSST, THE Editor SHALL die Syntax wieder durch die visuelle Darstellung ersetzen
5. IN Source Mode (nicht Live Preview), THE Editor SHALL reines Syntax-Highlighting zeigen (keine Inline-Rendering, keine versteckten Marker)
6. THE Modus-Einstellung (Source vs. Live Preview) SHALL per-User persistent gespeichert werden (keybindingsStore oder separater Preference-Key)

### Requirement 7: Plugin-Kompatibilitäts-Integration

**User Story:** Als Plugin-Entwickler möchte ich `registerEditorExtension()` und `registerEditorSuggest()` nutzen können, damit meine Plugins den Editor erweitern.

#### Acceptance Criteria

1. THE Plugin-Compat-Layer SHALL `registerEditorExtension(extension)` unterstützen — Plugins können CM6-Extensions (StateFields, ViewPlugins, Keymaps, Decorations) registrieren die beim nächsten Editor-Recreate angewendet werden
2. THE Plugin-Compat-Layer SHALL `registerEditorSuggest(suggest)` unterstützen — Plugins können Custom-Autocomplete-Provider registrieren die in CM6s Autocompletion-System integriert werden
3. THE Plugin-Compat-Layer SHALL Commands mit `editorCallback: (editor, view) => {}` unterstützen — der `editor` Parameter ist der EditorShim (Obsidian Editor Interface), `view` ist ein MarkdownView-artiges Objekt
4. THE EditorShim SHALL die CM6 `EditorView`-Instanz wrappen statt ein textarea — alle bestehenden IEditor-Methoden (getCursor, replaceRange, getValue, etc.) delegieren an CM6-State/Dispatch
5. WHEN ein Plugin deaktiviert wird, THE Editor SHALL dessen registrierte Extensions entfernen (Compartment-basiert)
6. THE Plugin-Extension-Registrierung SHALL isoliert sein — ein fehlerhaftes Plugin-Extension crasht nicht den gesamten Editor (try/catch um Extension-Evaluation)

### Requirement 8: Performance

**User Story:** Als Benutzer möchte ich auch große Markdown-Dateien (>10.000 Zeilen) flüssig bearbeiten können.

#### Acceptance Criteria

1. THE Editor SHALL Virtuelles Scrolling nutzen (CM6 built-in — rendert nur sichtbare Zeilen)
2. THE Editor SHALL bei Dateien >50.000 Zeichen Live Preview automatisch deaktivieren und eine Info-Notice anzeigen ("Datei zu groß für Live Preview — Source-Modus aktiv")
3. THE Editor SHALL Syntax-Highlighting inkrementell berechnen (CM6 `@codemirror/language` lezt-Parser-Modell)
4. THE Editor-Initialisierung SHALL unter 100ms liegen für eine typische Datei (< 5000 Zeilen)
5. THE Auto-Save-Debounce SHALL bei schnellem Tippen keine Lag-Spikes erzeugen (getValue() via CM6 State.doc.toString() ist O(n) aber sub-ms für <100KB)

### Requirement 9: Theming und Darstellung

**User Story:** Als Benutzer möchte ich den Editor nahtlos in das Slatebase-Designsystem integriert sehen, mit korrektem Dark Mode.

#### Acceptance Criteria

1. THE Editor SHALL ein eigenes CM6-Theme erstellen das die Slatebase Design Tokens (CSS Custom Properties) referenziert — keine hartkodierte Farben
2. THE Editor-Theme SHALL automatisch zwischen Light und Dark Mode wechseln (reagiert auf `:root[data-theme="dark"]`)
3. THE Editor SHALL die bestehende `--font-editor` Custom Property für die Schriftart verwenden
4. THE Editor SHALL Cursor, Selection, Active-Line, Search-Highlights mit Design Token-Farben darstellen
5. IN Live Preview Mode, THE Editor SHALL Heading-Größen, Blockquote-Styling, Code-Block-Hintergründe konsistent mit dem bestehenden ViewMode-CSS rendern (gleiche visuelle Erscheinung)

### Requirement 10: Migration und Rückwärtskompatibilität

**User Story:** Als Benutzer möchte ich, dass der Editor-Wechsel transparent ist — meine bestehende Konfiguration (Keybindings, Line Numbers, Auto-Save) funktioniert wie zuvor.

#### Acceptance Criteria

1. THE Migration SHALL den bestehenden `useLineNumbers`-Hook und Settings-Toggle beibehalten (übersetzt in CM6 lineNumbers Extension)
2. THE Migration SHALL den bestehenden `useHistoryStack`-Hook entfernen und durch CM6-History ersetzen
3. THE Migration SHALL den bestehenden `LineNumbers.tsx`-Komponent entfernen (CM6 rendert Line Numbers nativ)
4. THE Migration SHALL das bestehende Auto-Save-Interface (`onContentChange`) beibehalten
5. THE Migration SHALL den `slatebase:editor-command` CustomEvent-Listener beibehalten — Commands operieren auf CM6-Transaktionen
6. THE Migration SHALL den `EditorShim` in der Plugin-Compat-Schicht von textarea-Wrapping auf CM6-EditorView-Wrapping umstellen
7. THE Feature-Toggle `live-preview` (hot, default: true) SHALL den Live-Preview-Modus steuern — bei `false` ist nur Source-Mode mit Highlighting verfügbar
8. THE Editor SHALL feature-toggle-unabhängig CM6 verwenden — der Toggle steuert nur ob Live Preview verfügbar ist, nicht ob CM6 oder textarea genutzt wird

## Abhängigkeiten

- `tabbed-editor-viewer` ✅ (bestehende EditMode/TabContent-Architektur)
- `obsidian-plugin-compat` ✅ (EditorShim, registerEditorExtension-Schnittstelle)
- `configurable-keybindings` ✅ (Keybinding-System)
- `unified-settings` ✅ (Vim-Mode-Toggle, Editor-Präferenzen)

## NPM-Pakete (pinned)

```
@codemirror/view
@codemirror/state
@codemirror/commands
@codemirror/language
@codemirror/lang-markdown
@codemirror/language-data
@codemirror/autocomplete
@codemirror/search
@codemirror/lint (optional, für Plugin-Extensions)
@lezer/highlight
```

Optional (Phase 3 / Vim-Mode):
```
@replit/codemirror-vim
```

## Nicht im Scope

- Side-by-Side-Ansicht (Source links, Preview rechts) — kann als spätere Erweiterung ergänzt werden
- WYSIWYG-Modus (Block-basiert wie Notion) — Obsidians Live Preview ist hybrid (Markdown-Quelle bleibt sichtbar bei Cursor-Fokus)
- Collaborative Editing (CRDT/OT) — eigene Spec, profitiert aber von CM6-Basis
- Table-Editing (Markdown Tables als visuelle Tabellen) — kann als separate Extension in Phase 3 ergänzt werden
