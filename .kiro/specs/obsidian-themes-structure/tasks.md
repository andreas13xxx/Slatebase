# Obsidian Themes, Stufe 2 (Struktur) — Tasks

Umsetzung in Phasen; jede Phase einzeln committbar und grün (tsc, Lint, betroffene Tests). Branch:
`obsidian-themes-structure`, aufbauend auf `obsidian-themes` (PR #251). Vor der Umsetzung muss Stufe 1 gemergt oder
dieser Branch auf deren Stand gehalten werden.

## Phase 0 — Messung und Spike
- [x] 0.1 Messskript `measure-selectors.py` (Selektor-Zerlegung, Einordnung native/toggle/plugin/syntax, Abgleich mit
      dem Quelltext) im Spec-Ordner
- [x] 0.2 Basislinie 2026-10-19 an Things 2.2.4 und Minimal 9.1.4, gegengeprüft am DOM der laufenden Anwendung
      (Source-Modus und Live Preview). **Things 231/300 fehlend (77 %), Minimal 1941/2954 (66 %).** Siehe Design §1.
      Ein erster Lauf ohne Compat-Ausschluss lieferte zu niedrige Werte (59 %/54 %); korrigiert und im Design vermerkt
- [x] 0.3 Prüfung auf Kollisionen: keine Regel in `index.css`, `App.css`, Komponenten-CSS oder
      `obsidian-compat*.css` für die Zielklassen (`HyperMD*`, `cm-formatting`, `cm-inline-code`, `cm-hashtag`,
      `cm-highlight`, `cm-active`, `mod-cm6`, `is-live-preview`, `cm-s-obsidian`, `is-readable-line-width`,
      `markdown-preview-view`, `markdown-reading-view`, `workspace-tab-header`, `task-list-item`, `is-focused`,
      `is-fullscreen`)
- [ ] 0.4 Prüfen, welcher Tab-Modus `ViewMode` (Leseansicht, `.view-mode`) tatsächlich rendert und wie die
      Modi „Vorschau anzeigen" (Source) und „Bearbeiten" (Live Preview) zusammenhängen; DOM der Leseansicht erfassen
      und die Messung dafür ergänzen
- [ ] 0.5 **Spike Workspace/Tabs** (Design §3): die fünf Minimal-Klassen mit Strategie A (Marker) und B
      (Selektor-Umschreibung) ausprobieren, Vergleich mit Screenshots. Ergebnis: A, B oder „nicht angleichen"
- [ ] 0.6 Entscheidung eintragen (unten) und Zielwerte für Workspace/Tabs festlegen

## Phase 1 — Editor-Klassen (R1)
- [ ] 1.1 `editorAttributes`: `cm-s-obsidian` am `.cm-editor`
- [ ] 1.2 `CodeMirrorEditor.tsx`: `mod-cm6`, `is-live-preview` (folgt dem Modus), `is-readable-line-width`
      (folgt `readableLineLength`) am Editorbereich neben `markdown-source-view`
- [ ] 1.3 `inline-decorations.ts`: `HyperMD-header` + `HyperMD-header-N`, `cm-formatting(-header)` an Markern,
      `cm-inline-code`, `cm-highlight`, `cm-hashtag`
- [ ] 1.4 `widget-decorations.ts`: `HyperMD-codeblock(-bg/-begin/-end)`, `HyperMD-quote`, `HyperMD-task-line`;
      Listenzeilen (`HyperMD-list-line`) klären, ob dafür eine Line-Decoration existiert
- [ ] 1.5 `cm-active` für die Cursorzeile
- [ ] 1.6 Tests: eine Prüfung pro Klasse am erzeugten DOM; Test „keine eigene CSS-Regel für die neuen Klassen"

## Phase 2 — Leseansicht (R2)
- [ ] 2.1 `ViewMode.tsx`: `markdown-preview-view`, `markdown-rendered`, `markdown-reading-view` am Container;
      Sizer/Section nur, wenn die Messung sie braucht
- [ ] 2.2 Aufgabenlisten: `contains-task-list`, `task-list-item`, `task-list-item-checkbox`, `is-checked`
      (zuerst im Browser prüfen, was remark-gfm schon erzeugt)
- [ ] 2.3 `image-embed`, `internal-embed`, `el-pre`-Umfeld
- [ ] 2.4 Tests am gerenderten HTML

## Phase 3 — Body-Zustand (R3)
- [ ] 3.1 `body-classes.ts`: `is-focused` (Fensterfokus), `is-fullscreen`
- [ ] 3.2 Entscheiden, ob `is-hidden-frameless`/`is-translucent` gesetzt werden (nur bei erkennbarem Nutzen)
- [ ] 3.3 Tests für Setzen und Entfernen (Fokus, Vollbild, Aufräumen beim Unmount)

## Phase 4 — Workspace und Tabs (R4, nach Entscheidung in 0.6)
- [ ] 4.1 Umsetzung der gewählten Strategie, oder dokumentierte Entscheidung „nicht angleichen"
- [ ] 4.2 Tests und Screenshots (Minimal, Hell/Dunkel)

## Phase 5 — Abnahme und Doku
- [ ] 5.1 Messung wiederholen (gleiche Eingaben); Zahlen hier eintragen; Ziele: Things ≤ 10 %, Minimal Editor und
      Leseansicht ≤ 15 %
- [ ] 5.2 Manuelle Abnahme wie Stufe 1 (isolierte Instanz, Things und Minimal, Hell/Dunkel, Screenshots)
- [ ] 5.3 Themes-Seite im Welcome-Vault (DE + EN), README, `AGENTS.md`: was jetzt angeglichen ist und was nicht
- [ ] 5.4 `test:coverage` und Lint in beiden Paketen; Coverage-Schwellen nie senken

## Entscheidungen
- (offen) Strategie für Workspace/Tabs: wird nach dem Spike (0.5) eingetragen.
- Ausgeschlossen (Requirements, Nicht-Ziele): Style-Settings-Klassen, Plugin-Klassen, Obsidian-Layout 1:1,
  Mobile/Popout.
- `.cm-contentContainer`/`.cm-sizer` werden nicht nachgebaut (Eingriff in die Koordinatenberechnung von CodeMirror);
  die Zeilenbreite folgt bereits `--file-line-width` aus Stufe 1.

## Offene Fragen
- Wo ist die Leseansicht erreichbar (Tab-Modus, Einbettungen, schreibgeschützte Vaults)? → 0.4
- Soll das Messskript langfristig in `frontend/` als Test laufen (Regressionsschutz für die Abdeckung), oder bleibt
  es ein Werkzeug im Spec-Ordner? Es braucht heruntergeladene Themes und gehört deshalb eher nicht in die CI.
