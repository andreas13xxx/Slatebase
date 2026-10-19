# Obsidian Themes, Stufe 2 (Struktur) — Design

## 1. Messung (Grundlage der Spec)

### Methode
`measure-selectors.py` (in diesem Ordner) liest ein `theme.css`, zerlegt es in Selektoren (Kommentare, Strings,
Deklarationen und `@keyframes`/`@font-face` bleiben außen vor) und zählt jede Klasse, die in einem Selektor vorkommt.
Jede Klasse bekommt genau eine Art:

| Art | Bedeutung | In Stufe 2 |
|---|---|---|
| `native` | Teil von Obsidians eigenem DOM, gruppiert nach UI-Bereich | **ja** |
| `toggle` | Body-Klasse, die das Theme oder *Style Settings* schaltet (`body.minimal-focus-mode`) | nein |
| `plugin` | Klasse eines Community-Plugins (`.dataview`, `.cards`, `.tasks`, …) | nein |
| `syntax` | Prism-/Token-Klassen (`.token`, `.string`) | nein |

„Vorhanden in Slatebase" heißt: der Klassenname kommt in einer App-Datei (`*.ts`, `*.tsx`, `*.css`, **ohne** Tests
und **ohne** `plugins/compat/`) vor oder im DOM der laufenden Anwendung. Compat-Dateien zählen bewusst nicht: Dort
definierte Obsidian-Klassen (`.markdown-rendered`, `.view-header`, …) stylen das DOM von Plugins, nicht Slatebases
eigenes. Das DOM wurde im Browser gegengeprüft (Quelltext ∪ DOM von Source-Modus und Live Preview eines Welcome-Vault-
Dokuments, 209 Klassen); es hat keine zusätzlichen Klassen geliefert.

> **Korrektur während der Arbeit:** Ein erster Lauf mit relativem Quellpfad schloss `plugins/compat/` nicht aus und
> kam auf 59 % (Things) bzw. 54 % (Minimal). Das waren zu niedrige Werte, weil Klassen wie `mod-cm6`, `is-checked`
> oder `markdown-rendered` nur in Compat-Dateien stehen. Maßgeblich sind die Zahlen unten (absoluter Pfad); das
> Skript im Spec-Ordner wird mit Pfad `frontend/src` aus der Repo-Wurzel gestartet.

Grenzen: Ein vorhandener Klassenname bedeutet nicht, dass er dasselbe Element meint wie in Obsidian
(`is-active`, `is-collapsed` sind generisch). Die Leseansicht (`ViewMode`) und Dialoge wurden nicht im DOM erfasst.
Plattformabhängige Body-Klassen (`is-mobile`, `mod-macos`, …) werden unter Linux/Desktop nicht gesetzt und erscheinen
daher als fehlend (siehe Requirements R3.2).

### Ergebnis

| Art | Things | Minimal |
|---|---|---|
| native | 300 | 2954 |
| toggle | 124 | 831 |
| plugin | 31 | 408 |
| syntax | 84 | 1 |
| nicht eingeordnet | 51 (u. a. Todoist) | 712 (u. a. Style-Settings-Klassen) |

Native Treffer, **fehlend / gesamt**, nach Bereich:

| Bereich | Things | Minimal |
|---|---|---|
| Workspace und Tabs | 10 / 10 | **1049 / 1305** |
| Editor (CM6 / Live Preview) | **119 / 148** | 342 / 525 |
| Leseansicht | **89 / 91** | 281 / 289 |
| Body-Zustand (plattformabhängige Klassen eingerechnet) | 10 / 46 | 167 / 566 |
| Canvas, Graph, Bases, Properties | 1 / 1 | 34 / 53 |
| Navigation (Explorer, Baum) | 1 / 1 | 28 / 75 |
| Dialoge, Menüs, Popovers | 1 / 2 | 20 / 41 |
| Einstellungsdialog | 0 / 0 | 10 / 49 |
| Statusleiste | 0 / 0 | 7 / 44 |
| Controls | 0 / 1 | 3 / 7 |
| **Summe** | **231 / 300 (77 %)** | **1941 / 2954 (66 %)** |

Meistgenutzte fehlende Klassen (Things + Minimal):
- **Editor:** `.mod-cm6` (91), `.is-readable-line-width` (61), `.cm-contentContainer` (50), `.is-live-preview` (41),
  `.HyperMD-header` (21), `.cm-s-obsidian` (21), `.cm-formatting` (9), `.cm-active` (8), `.cm-table-widget` (8),
  `.HyperMD-codeblock` (7), `.cm-gutterElement` (7), `.HyperMD-task-line` (6), `.cm-inline-code` (6),
  `.cm-lineNumbers` (6), `.HyperMD-header-1…6` (je 4–5), `.HyperMD-quote` (5)
- **Leseansicht:** `.markdown-preview-view` (142), `.markdown-rendered` (43), `.markdown-preview-sizer` (34),
  `.task-list-item` (32), `.image-embed` (26), `.is-checked` (26), `.markdown-reading-view` (13),
  `.markdown-preview-section` (11), `.internal-embed` (9)
- **Workspace/Tabs:** `.mod-primary-split` (136), `.workspace-tab-header` (112), `.mod-top` (84), `.mod-primary` (82),
  `.workspace-tab-header-container` (82), `.workspace-ribbon` (70), `.workspace-tabs` (62), `.mod-secondary-split` (42)
- **Body-Zustand (echte Lücken, ohne plattformabhängige Klassen):** `.is-hidden-frameless` (36), `.is-focused` (29),
  `.is-fullscreen` (10), `.is-translucent` (3), `.is-popout-window` (2), `.is-grabbing` (2)

**Folgerung:** Editor und Leseansicht machen bei Things 208 von 231 fehlenden Treffern aus (90 %); die restlichen 23
sind Workspace/Body-Zustand. Bei Minimal liegt mehr als die Hälfte der Lücke (1049 von 1941) in Workspace und Tabs,
das braucht eine eigene Entscheidung (Phase 0). `.mod-cm6` allein ist mit 91 Treffern der größte Einzelposten im
Editor und kostet fast nichts.

## 2. Zuordnung Obsidian → Slatebase

Slatebases Editor hat bereits eigene Zeilen- und Elementklassen (`cm-lp-*`). Die Obsidian-Klassen kommen
**zusätzlich** dazu; die eigenen bleiben, weil `live-preview.css` auf sie zielt.

| Obsidian | Slatebase heute | Ergänzen in |
|---|---|---|
| `HyperMD-header` + `HyperMD-header-N` | Zeilen-Decoration `cm-lp-hN` | `editor/live-preview/inline-decorations.ts` (`Decoration.line`, Zeile ~62) |
| `HyperMD-codeblock`, `-bg`, `-begin`, `-end` | `cm-lp-code-block-line/-first/-last` | `editor/live-preview/widget-decorations.ts` |
| `HyperMD-quote` | `cm-lp-blockquote` | `widget-decorations.ts` |
| `HyperMD-task-line` | Zeile mit `cm-lp-checkbox` | `widget-decorations.ts` |
| `HyperMD-list-line` | keine eigene Listenzeilen-Klasse | prüfen, sonst neue Line-Decoration |
| `cm-inline-code`, `cm-highlight`, `cm-hashtag` | `cm-lp-inline-code`, `cm-lp-highlight`, `cm-lp-tag` (Marks) | `inline-decorations.ts` |
| `cm-formatting`, `cm-formatting-header` | `cm-lp-heading-marker` und Marker der Inline-Formate | `inline-decorations.ts` |
| `cm-s-obsidian` | — | `EditorView.editorAttributes` im Editor-Setup (`CodeMirrorEditor.tsx`) |
| `mod-cm6`, `is-live-preview`, `is-readable-line-width` | `markdown-source-view` auf `container.parentElement` (Zeile ~502) | `CodeMirrorEditor.tsx`; folgt Modus und `readableLineLength` |
| `cm-active` | CM6-eigenes `cm-activeLine` | kleine Line-Decoration für die Cursorzeile |
| `markdown-preview-view`, `markdown-rendered`, `markdown-reading-view` | `<article class="view-mode">` | `components/ViewMode.tsx` (Zeile ~336) |
| `markdown-preview-sizer`, `-section` | — | Wrapper in `ViewMode.tsx`, nur falls die Messung ihn braucht |
| `task-list-item`, `contains-task-list`, `task-list-item-checkbox` | erzeugt remark-gfm bereits teilweise | im Browser prüfen, in `ViewMode`-Pipeline ergänzen |
| `is-checked` | — | erledigte Aufgaben: Checkbox-Widget (`cm-lp-checkbox`) und Leseansicht |
| `image-embed`, `internal-embed` | `view-mode-embed`-Klassen | `ViewMode.tsx` |
| `is-focused`, `is-fullscreen` (body) | — | `plugins/compat/body-classes.ts` (setzt `theme-*` und Plattform bereits) |

**Nicht zuordenbar ohne DOM-Umbau:** `.cm-contentContainer` und `.cm-sizer` (Obsidian-Wrapper um `.cm-content`,
zusammen 55 Treffer, fast nur bei Minimal für die Zeilenbreite). Ein zusätzlicher Wrapper greift in CodeMirrors
Koordinatenberechnung ein (siehe Kommentar in `live-preview.css` zur Breite am Wrapper). Vorerst nicht umsetzen; die
Zeilenbreite folgt bereits `--file-line-width` (Stufe 1).

## 3. Workspace und Tabs: zwei Strategien

Minimals Tab- und Sidebar-Styling (953 Treffer) zielt auf Obsidians verschachtelten Aufbau
(`.workspace-tabs > .workspace-tab-header-container > .workspace-tab-header-container-inner > .workspace-tab-header > .workspace-tab-header-inner`).
Slatebases Tab-Leiste ist flacher (`.tab-bar` mit `.tab-bar-tab-icon/-label`, `.tab-bar-close-btn`).

| | A: DOM-Marker | B: Selektor-Umschreibung beim Anwenden |
|---|---|---|
| Prinzip | Zusätzliche Klassen auf vorhandenen Elementen (wie `workspace-split` heute) | `ThemeInjector` ersetzt in der Theme-CSS Obsidian-Selektoren durch Slatebase-Selektoren (Tabelle) |
| Stärke | Einfach, wirkt auch für Plugin-CSS, bestehender Präzedenzfall | Kein DOM-Eingriff, nichts ändert sich ohne Theme, Slatebases Struktur bleibt |
| Schwäche | Verschachtelte Container fehlen; Marker auf falschen Elementen verschieben Layout-Regeln des Themes (`display`, Abstände) | Eigener Parser nötig (CSSOM oder PostCSS), Spezifität und `:is()`/Verschachtelung heikel, 270 KB Theme-CSS pro Anwendung |
| Risiko | Mittel: Theme-Regeln für Obsidians Layout treffen Slatebases andere Struktur und können sie verbiegen | Mittel: Fehler im Umschreiben wirken still |

**Entscheidungsregel für Phase 0 (Spike):** Beide Ansätze an den fünf meistgenutzten Klassen aus Minimal
(`workspace-tab-header`, `workspace-tabs`, `mod-top`, `mod-primary`, `workspace-ribbon`) ausprobieren und im Browser
vergleichen. Nur wenn das Ergebnis erkennbar besser aussieht als ohne, wird ein Ansatz übernommen. Andernfalls wird
**entschieden, das Tab-/Sidebar-Layout nicht anzugleichen**, und das in Doku und PR so festgehalten. Das ist ein
vollwertiges Ergebnis: Das Ziel dieser Spec ist Wirkung bei möglichst wenig Eingriff, nicht Vollständigkeit.

## 4. Reihenfolge nach Nutzen

1. **Editor-Klassen** (R1): löst bei Things 119 von 231 Lücken, bei Minimal 342 von 1941; billig (Zusatzklassen an
   bestehenden Decorations und Wrappern).
2. **Leseansicht** (R2): Things 89, Minimal 281.
3. **Body-Zustand** (R3): klein, aber Minimal nutzt `is-hidden-frameless`/`is-focused`/`is-fullscreen` an 75 Stellen.
4. **Workspace/Tabs** (R4): nach Spike.

## 5. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Neue Klassen verändern Slatebases Aussehen | Test, dass Slatebases CSS keine der Klassen als Selektor nutzt (R5.1); Phase 0 prüft `obsidian-compat*.css` erneut (am 2026-10-19: keine Treffer) |
| Plugin-CSS greift plötzlich | Gewollte Parität (R5.3), in der Doku erwähnen |
| `HyperMD-*` und `cm-formatting` an vielen Zeilen/Marks kosten Rendering | Klassen hängen an bereits vorhandenen Decorations (keine zusätzlichen Ranges); bei Bedarf Messung großer Dokumente |
| Theme-Regel für Obsidians Layout verbiegt Slatebases Layout (Marker auf Tab-Leiste) | Spike in Phase 0; Entscheidung „nicht angleichen" bleibt möglich |
| Klassennamen aus der Messung passen nicht zur Bedeutung in Obsidian | Abnahme im Browser mit echten Themes, nicht nur Klassenzählung |

## 6. Tests und Akzeptanz

- Pro Klasse ein Test am erzeugten DOM (CodeMirror-`EditorState` mit der Decoration, bzw. gerendertes HTML von `ViewMode`).
- Test „keine eigene Regel" (R5.1) über die CSS-Dateien.
- Messung wiederholen (gleiche Eingaben wie die Basislinie): Things ≤ 10 % fehlend, Minimal Editor/Leseansicht ≤ 15 %;
  die Zahlen stehen in `tasks.md`.
- Manuelle Abnahme wie Stufe 1 (isolierte Instanz, Hell/Dunkel, Screenshots).
