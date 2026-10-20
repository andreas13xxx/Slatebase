# Obsidian Themes, Stufe 2 (Struktur) — Tasks

Umsetzung in Phasen; jede Phase einzeln committbar und grün (tsc, Lint, betroffene Tests). Branch:
`obsidian-themes-structure`, aufbauend auf `master` (Stufe 1 ist mit PR #251 gemergt).

## Phase 0 — Messung und Spike (abgeschlossen 2026-10-19)
- [x] 0.1 Messskript `measure-selectors.py` (Selektor-Zerlegung, Einordnung native/toggle/plugin/syntax, Abgleich mit dem
      Quelltext, Trennung erreichbar/gesperrt)
- [x] 0.2 Basislinie an Things 2.2.4 und Minimal 9.1.4, gegengeprüft am DOM der laufenden Anwendung.
      Erreichbar und fehlend: **Things 155/203 (76 %), Minimal 1131/1626 (69 %)**; durch Schalter gesperrt: 97 bzw. 1328
      Treffer. Zwei Korrekturen unterwegs (Compat-Ausschluss, Schalter-Sperre), im Design dokumentiert
- [x] 0.3 Prüfung auf Kollisionen: keine Regel in `index.css`, `App.css`, Komponenten-CSS oder `obsidian-compat*.css` für die
      Zielklassen
- [x] 0.4 Leseansicht geklärt: `TabMode` `view` ist die bearbeitbare Live Preview, `ViewMode` rendert nur Hover-Vorschau und
      Einbettungen und nutzt eigene `view-mode-*`-Klassen (per Test-Render geprüft: `view-mode-section` mit `<details>`,
      `view-mode-task-item`, `view-mode-callout`; keine remark-Standardklassen wie `task-list-item`)
- [x] 0.5 Spike Workspace/Tabs und Editor mit Wirkungssonden (`probe-workspace-effect.js`, `probe-editor-effect.js`):
      Workspace/Tabs/Ribbon/Body bei Minimal 1 von 945 Elementen (Screenshot byte-identisch); Editor Things 0 von 164,
      Minimal 6 von 164 (Editorbreite und Tabellen). Ursache: Minimals Regeln hängen an `.markdown-source-view.mod-cm6`
- [x] 0.6 Entscheidung: Workspace/Tabs/Ribbon/Titelleiste, Body-Zustand und Leseansicht werden **nicht** angeglichen;
      Editor-Wrapper-Klassen werden umgesetzt; Editor-Zeilen- und Elementklassen sind optional. Siehe Requirements und
      Design §3

## Phase 1 — Editor-Wrapper-Klassen (R1) — abgeschlossen 2026-10-19
- [x] 1.1 `CodeMirrorEditor.tsx`: `mod-cm6` am `editorArea`, neben `markdown-source-view`; Aufräumen beim Abbau
- [x] 1.2 `is-live-preview` (folgt dem `livePreview`-Prop, auch beim Moduswechsel) und `is-readable-line-width` (folgt
      `readableLineLength`, Gegenstück zu `cm-full-width`). Umsetzung als eigener Effect, weil das Element EditModes Markup
      gehört und die Klassen den Props folgen müssen. `is-live-preview` nutzt dasselbe Prop wie `editorLivePreviewField`
      (und damit wie die Plugins), nicht die interne 50.000-Zeichen-Abschaltung
- [x] 1.3 `cm-s-obsidian` am `.cm-editor` über `EditorView.editorAttributes`
- [x] 1.4 Tests (`CodeMirrorEditor.obsidianClasses.test.tsx`, 10): Setzen, Moduswechsel, Einstellung an/aus inklusive
      Gegenstück `cm-full-width`, Aufräumen beim Unmount, `cm-s-obsidian` am `.cm-editor`, und „keine CSS-Regel in Slatebase
      zielt auf die vier Klassen" (über alle CSS-Dateien außer Compat)
- [x] 1.5 Wirkungsprobe in der laufenden Anwendung: Editor-Sonde bei **Minimal 0 von 164 Elementen** (vorher 6, die
      Tabellen- und Breitenregeln greifen jetzt nativ: Tabellenrahmen 1 px, Zellabstände `4px 10px 4px 0px`,
      `.cm-content` `max-width: 100%`), bei **Things 0 von 164** (unverändert). Klassen im DOM:
      `edit-mode-editor-area markdown-source-view mod-cm6 is-live-preview is-readable-line-width` und
      `cm-editor cm-s-obsidian`
- Hinweis: `src/editor/live-preview/standalone-block-spacing.test.ts` schlägt im Verbund mit anderen Tests fehl (allein
  grün). Das ist **vorbestehend**: Der Lauf ohne meine Änderung zeigt dasselbe.

## Phase 2 — Editor-Zeilen und Elemente (R2) — umgesetzt 2026-10-19
- [x] 2.1 Entscheidung: auf Wunsch umgesetzt, obwohl keine Wirkung belegt ist (Parität). Aufwand klein: nur Zusatzklassen an
      bestehenden Decorations, keine neuen Ranges
- [x] 2.2 `HyperMD-header` + `HyperMD-header-N` (Überschriftenzeile), `cm-formatting` (Überschriften-Marker),
      `HyperMD-codeblock`/`-bg` (jede Zeile), `-begin`/`-end` (erste/letzte), `HyperMD-quote`, `HyperMD-task-line`,
      `cm-inline-code`, `cm-highlight`, `cm-hashtag`. Die `cm-lp-*`-Klassen bleiben unverändert
- [x] 2.3 Tests (`live-preview/obsidian-classes.test.ts`, 11) pro Klasse am erzeugten Decoration-Set; der
      „keine eigene Regel"-Test deckt jetzt alle 12 Klassen ab. Wirkungsprobe in der laufenden Anwendung noch **nicht**
      wiederholt (Phase 3.1)
- Nicht umgesetzt: `cm-formatting` an weiteren Markern (Listen-, Zitat-, Emphasis-Zeichen), weil Slatebase sie ausblendet
  statt zu markieren

## Phase 3 — Abnahme und Doku
- [x] 3.1 Wirkungsprobe wiederholt (2026-10-20, isolierte Instanz, Welcome-Vault mit Probe-Notiz: Überschriften 1–6,
      Inline-Code, Markierung, Tag, Zitat, Codeblock, Aufgaben, Tabelle). Alle Klassen stehen nativ im DOM
      (`HyperMD-header` 6, `-header-1`/`-6` je 1, `cm-inline-code`, `cm-highlight`, `cm-hashtag`, `HyperMD-quote` je 1,
      `HyperMD-codeblock` 3 mit je einem `-begin`/`-end`, `HyperMD-task-line` 2). Editor-Sonde: **Minimal 0 von 105,
      Things 0 von 105** geänderte Elemente, d. h. die Klassen verändern nichts, was Phase 1 nicht schon bewirkt hat.
      Ausnahme: `cm-formatting` am Überschriften-Marker erscheint nur, solange der Marker sichtbar ist (Cursor in der
      Zeile); sonst wird er ausgeblendet. Die Klassenzählung (`measure-selectors.py`) wurde nicht wiederholt
- [ ] 3.2 Themes-Seite im Welcome-Vault (DE + EN), README und `AGENTS.md`: Tabellen und Editorbreite sind angeglichen,
      Tab-Leiste, Ribbon, Titelleiste und Style-Settings-Optionen nicht
- [ ] 3.3 `test:coverage` und Lint in beiden Paketen; Coverage-Schwellen nie senken

## Entscheidungen
- 2026-10-19: Workspace/Tabs/Ribbon/Titelleiste werden nicht angeglichen (Spike, Design §2/§3).
- 2026-10-19: Body-Zustand und Leseansicht werden nicht umgesetzt (Design §3).
- Ausgeschlossen: Style-Settings-Klassen, Plugin-Klassen, Obsidian-Layout 1:1, Lesemodus als Tab-Ansicht,
  `.cm-contentContainer`/`.cm-sizer`.

## Offene Fragen
- Ob Phase 2 sich lohnt, entscheidet sich nach Phase 1 anhand der Sonde und des Aufwands.
- Ob ein echter Lesemodus gewünscht ist, wäre ein eigenes Feature mit eigener Spec.
- Ob die Wirkungssonde dauerhaft als Skript im Repo bleibt (Spec-Ordner) oder später in einen E2E-Test wandert.
