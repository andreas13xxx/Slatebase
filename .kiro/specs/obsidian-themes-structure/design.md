# Obsidian Themes, Stufe 2 (Struktur) — Design

## 1. Messung der Klassen-Abdeckung

### Methode
`measure-selectors.py` (in diesem Ordner) liest ein `theme.css`, zerlegt es in Selektoren (Kommentare, Strings,
Deklarationen und `@keyframes`/`@font-face` bleiben außen vor) und zählt jede Klasse, die in einem Selektor vorkommt.
Aufruf aus der Repo-Wurzel: `python3 .kiro/specs/obsidian-themes-structure/measure-selectors.py <theme.css> frontend/src <out.json>`.

Jede Klasse bekommt genau eine Art:

| Art | Bedeutung | In Stufe 2 |
|---|---|---|
| `native` | Teil von Obsidians eigenem DOM, gruppiert nach UI-Bereich | ja |
| `toggle` | Body-Klasse, die das Theme oder *Style Settings* schaltet (`body.minimal-focus-mode`) | nein |
| `plugin` | Klasse eines Community-Plugins (`.dataview`, `.cards`, `.tasks`, …) | nein |
| `syntax` | Prism-/Token-Klassen (`.token`, `.string`) | nein |

Außerdem trennt das Skript Selektoren, die **einen Schalter voraussetzen** (eine Toggle-Klasse außerhalb von `:not(...)`):
Solche Regeln können in Slatebase nie greifen und zählen als „gesperrt", nicht als Lücke.

„Vorhanden in Slatebase" heißt: Der Klassenname kommt in einer App-Datei (`*.ts`, `*.tsx`, `*.css`, **ohne** Tests und
**ohne** `plugins/compat/`) vor. Compat-Dateien zählen bewusst nicht: Dort definierte Obsidian-Klassen stylen das DOM von
Plugins, nicht Slatebases eigenes. Gegengeprüft am DOM der laufenden Anwendung (Source-Modus und Live Preview, 209 Klassen):
keine zusätzlichen Treffer.

### Zwei Korrekturen während der Arbeit
1. Ein erster Lauf mit relativem Quellpfad schloss `plugins/compat/` nicht aus und lieferte 59 % (Things) und 54 % (Minimal)
   fehlend. Zu niedrig, weil `mod-cm6`, `is-checked`, `markdown-rendered` nur in Compat-Dateien stehen.
2. Der korrigierte Lauf (77 % / 66 %) zählte noch Regeln, die an Style-Settings-Schalter gebunden sind. Maßgeblich ist die
   Trennung in „erreichbar" und „gesperrt" (unten).

### Ergebnis

| | Things 2.2.4 | Minimal 9.1.4 |
|---|---|---|
| Selektoren | 172 | 944 |
| native Treffer gesamt | 300 | 2954 |
| davon **erreichbar** | 203 | 1626 |
| erreichbar und in Slatebase **fehlend** | **155 (76 %)** | **1131 (69 %)** |
| durch Schalter **gesperrt** | 97 (76 fehlend) | 1328 (810 fehlend) |
| Toggle-Klassen im Theme | 22 | 65 |

Erreichbar und fehlend, nach Bereich (fehlend / gesamt):

| Bereich | Things | Minimal |
|---|---|---|
| Workspace und Tabs | 8 / 8 | 351 / 450 |
| Editor (CM6 / Live Preview) | 65 / 74 | 330 / 513 |
| Leseansicht | 73 / 75 | 275 / 283 |
| Body-Zustand | 7 / 42 | 104 / 193 |
| Canvas, Graph, Bases, Properties | 1 / 1 | 27 / 46 |
| Navigation | 0 / 0 | 21 / 57 |
| Dialoge, Menüs, Popovers | 1 / 2 | 11 / 31 |
| Einstellungsdialog | 0 / 0 | 6 / 33 |
| Statusleiste | 0 / 0 | 5 / 19 |

Das Bild unterscheidet sich stark von der Rohzählung: 698 der 1049 Minimal-Treffer in „Workspace und Tabs" stehen hinter
Schaltern (`.labeled-nav`, `.colorful-frame`, `.tabs-modern`, `.vault-profile-top`, …).

Grenzen: Ein vorhandener Klassenname bedeutet nicht, dass er dasselbe Element meint (`is-active`, `is-collapsed` sind
generisch). Plattformabhängige Body-Klassen (`is-mobile`, `mod-macos`, …) setzt `plugins/compat/body-classes.ts` nur auf der
passenden Plattform; unter Linux/Desktop erscheinen sie als fehlend, gehören aber nicht zur Lücke.

## 2. Wirkungsmessung (Spike)

Die Klassenzählung beantwortet nicht, ob ein Theme dadurch anders aussieht. Die Sonden tun das:

- `probe-editor-effect.js`: setzt die Editor-Klassen auf das Live-Preview-DOM und vergleicht die berechneten Stile aller
  Elemente unter `.markdown-source-view` (21 Eigenschaften).
- `probe-workspace-effect.js`: setzt Workspace-, Tab-, Ribbon-, Leaf- und Header-Klassen sowie `is-focused` und
  `is-hidden-frameless` und vergleicht alle Elemente der Seite (16 Eigenschaften).

Die Sonden brauchen eine laufende Instanz mit aktivem Theme und eine Notiz mit Überschriften 1 bis 6, Inline-Code,
Zitat, Codeblock, Aufgaben und Tabelle.

| Sonde | Theme | Ergebnis |
|---|---|---|
| Workspace/Tabs/Ribbon/Body | Minimal | 1 von 945 Elementen, eine Eigenschaft (`position: static → relative` auf `.side-panel__view-content`, durch `.workspace-leaf-content`). Screenshot der Tab-Leiste byte-identisch (Strategie A) |
| Editor | Things | **0 von 164** |
| Editor | Minimal | **6 von 164:** `.cm-content` `max-width: none → 100%`, `table.cm-lp-table` Rahmen 0 → 1 px, vier `th`/`td` Zellabstände |

### Warum so wenig Wirkung
- **Variablen:** Minimals Tab-Look (`--tab-background-active`, `--tab-radius`, `--tab-outline-width`, …) wird von 69
  Variablen gesteuert, die fast alle innerhalb gesperrter Selektoren gesetzt werden (`.tabs-underline .mod-root`,
  `.tabs-plain-square .mod-root`). Im Standardzustand gilt Obsidians Default.
- **Gesperrte Regeln:** Was an Schaltern hängt, greift nicht, gleich welche Klassen Slatebase trägt.
- **Andere Elemente:** Minimals Regeln für Obsidians Tab-Container, Ribbon und Titelleiste treffen Elemente, die
  Slatebase nicht oder anders baut; zusätzliche Klassen verschieben daran nichts.
- **Editor-Zeilen:** Überschriften, Inline-Code, Codeblöcke werden über Variablen gestylt, die Stufe 1 schon anbindet
  (`--h1-size`, `--code-*`). Die `HyperMD-*`-Klassen setzen bei den Standardthemes nichts, was nicht schon gesetzt ist.

### Was wirkt
Minimals Regeln `.markdown-source-view.mod-cm6 table { … }` und
`.markdown-source-view.mod-cm6.is-readable-line-width .cm-content { max-width: 100%; width: 100% }` (21 Regeln hängen an
`mod-cm6`) schalten **Tabellenstil und Editorbreite**. Slatebase trägt `markdown-source-view` schon
(`CodeMirrorEditor.tsx`, Zeile ~502); es fehlen `mod-cm6` und `is-readable-line-width`.
Offen: Regeln, die zusätzlich `.cm-contentContainer` voraussetzen (Randabstände), greifen weiter nicht; dieses Element
baut Slatebase nicht nach.

## 3. Entscheidungen

| Bereich | Entscheidung | Begründung |
|---|---|---|
| Workspace, Tabs, Ribbon, Titelleiste | **nicht angleichen** | A: wirkungslos; B (Selektor-Umschreibung): dieselben gesperrten und variablengetriebenen Regeln, plus Parser-Aufwand und stille Fehler; C (Tab-Variablen in die Brücke): Minimal setzt sie nur in gesperrten Selektoren |
| Body-Zustand | **nicht umsetzen** | im Spike ohne Wirkung |
| Leseansicht | **nicht umsetzen** | kein Tab-Modus (siehe unten); ein Lesemodus wäre ein eigenes Feature |
| Editor-Wrapper (`mod-cm6`, `is-live-preview`, `is-readable-line-width`, `cm-s-obsidian`) | **umsetzen** | belegte Wirkung |
| Editor-Zeilen/Elemente (`HyperMD-*`, `cm-*`) | **optional** | Parität ohne messbare Wirkung |

### Leseansicht: Befund
`TabMode` ist `'edit' | 'view'` (`state/tabState.ts`). `'edit'` ist der Source-Modus (rohes Markdown in CodeMirror), `'view'`
ist die **bearbeitbare Live Preview** (ebenfalls CodeMirror, Kommentar „Preview mode — editable CM6 Live Preview" in
`TabContent.tsx`). Die React-Komponente `ViewMode` rendert nur in `HoverPreview.tsx` und in eingebetteten Notizen
(`widget-decorations.ts`) und nutzt eigene Klassen (`view-mode`, `view-mode-section` mit `<details>`,
`view-mode-task-item`, `view-mode-callout`, …). Obsidians `.markdown-preview-view` (die Leseansicht) hat in Slatebase kein
Gegenstück im Hauptbereich.

## 4. Zuordnung für R1 und R2

| Obsidian | Slatebase heute | Ergänzen in |
|---|---|---|
| `mod-cm6` | — | `editor/CodeMirrorEditor.tsx`, am `editorArea` (neben `markdown-source-view`, Zeile ~502) |
| `is-live-preview` | Modus `livePreviewMode` | ebd.; folgt dem Prop, Aufräumen beim Abbau |
| `is-readable-line-width` | Prop `readableLineLength` (Wrapper hat `cm-full-width`, wenn aus) | ebd.; Gegenstück zu `cm-full-width` |
| `cm-s-obsidian` | — | Editor-Setup, `EditorView.editorAttributes` |
| `HyperMD-header(-N)` | Zeilen-Decoration `cm-lp-hN` | `editor/live-preview/inline-decorations.ts` (~Zeile 62) |
| `HyperMD-codeblock(-bg/-begin/-end)` | `cm-lp-code-block-line/-first/-last` | `editor/live-preview/widget-decorations.ts` |
| `HyperMD-quote`, `HyperMD-task-line` | `cm-lp-blockquote`, Zeile mit `cm-lp-checkbox` | `widget-decorations.ts` |
| `cm-inline-code`, `cm-highlight`, `cm-hashtag`, `cm-formatting` | `cm-lp-inline-code`, `cm-lp-highlight`, `cm-lp-tag`, `cm-lp-heading-marker` | `inline-decorations.ts` |

## 5. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Neue Klassen verändern Slatebases Aussehen | R3.1-Test; die Prüfung vom 2026-10-19 fand weder in App-CSS noch in `obsidian-compat*.css` Regeln für diese Klassen |
| `is-readable-line-width` und `cm-full-width` widersprechen sich | beide folgen derselben Einstellung, ein Test deckt beide Zustände ab |
| Plugin-CSS greift plötzlich | gewollte Parität, in der Doku erwähnen |
| `.cm-content` bekommt durch Minimals Regel `max-width: 100%` ein anderes Verhalten als heute | manuelle Abnahme der Editorbreite mit Minimal in Hell und Dunkel; Slatebase begrenzt die Breite am Wrapper, nicht am `.cm-content` |
| Sonden messen nur Standardzustände | nur Themes ohne aktive Style-Settings-Schalter; das ist ausdrücklich der Anspruch dieser Spec |

## 6. Tests und Akzeptanz

- Pro Wrapper-Klasse ein Test (Setzen, Moduswechsel, Einstellung, Aufräumen).
- Test „keine eigene Regel" (R3.1) über die CSS-Dateien.
- Editor-Sonde bei Minimal und Things vor und nach der Änderung; erwartet: Things 0, Minimal ohne Rest-Unterschied für die
  Wrapper-Klassen.
- Manuelle Abnahme wie Stufe 1 (isolierte Instanz, Hell/Dunkel, Screenshots der Tabellen und der Editorbreite).
