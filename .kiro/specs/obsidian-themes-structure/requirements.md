# Obsidian Themes, Stufe 2 (Struktur) — Requirements

## Kontext

Stufe 1 (`.kiro/specs/obsidian-themes/`, PR #251) macht Themes nutzbar, die **über CSS-Variablen** arbeiten:
Farben, Schriften, Überschriftengrößen. Sie lässt Regeln wirkungslos, die Obsidians **DOM-Klassen** ansprechen
(`.HyperMD-header`, `.workspace-tab-header`, `.markdown-preview-view`, …), weil es diese Klassen in Slatebase nicht gibt.

Diese Spec schließt die Lücke, soweit sie sich **messbar** schließen lässt. Grundlage ist eine Messung an zwei
echten Themes (Stand 2026-10-19; Methode und Zahlen im Design):

| Theme | Selektoren | Treffer auf native Obsidian-Klassen | davon auf Klassen, die Slatebase nicht hat |
|---|---|---|---|
| Things 2.2.4 (70 KB) | 172 | 300 | **231 (77 %)** |
| Minimal 9.1.4 (267 KB) | 944 | 2954 | **1941 (66 %)** |

Die Lücke ist nicht gleichmäßig verteilt. Bei Things liegt sie fast vollständig im **Editor** (119 von 148 Treffern)
und in der **Leseansicht** (89 von 91). Bei Minimal dominiert **Workspace und Tabs** (1049 von 1305), danach Editor
(342 von 525) und Leseansicht (281 von 289). Navigation, Statusleiste, Einstellungen und Dialoge sind teilweise
abgedeckt (51 bis 84 %) und nachrangig.

Es gibt einen Präzedenzfall für Marker-Klassen ohne eigene Wirkung: `App.tsx` setzt `app-container`, `workspace-split`,
`mod-vertical`, `mod-root`, `workspace-tab-container` für Plugin-Kompatibilität (Spec `workspace-leaf-compat`),
und `CodeMirrorEditor.tsx` setzt `markdown-source-view` auf den Editorbereich.

## Ziel

Struktur-Selektoren aus Themes treffen in Slatebase dieselben Elemente wie in Obsidian, **ohne dass sich das
Erscheinungsbild ohne Theme ändert**. Messbare Ziele (gleiche Messung wie oben, Skript im Spec-Ordner):

- Things: Anteil der Treffer auf fehlende native Klassen **von 77 % auf höchstens 10 %**.
- Minimal, Bereiche **Editor und Leseansicht**: von 342/525 bzw. 281/289 auf **höchstens 15 %** fehlend.
- Minimal, **Workspace und Tabs**: Ziel wird nach dem Spike (Phase 0) festgelegt; ohne Entscheidung gilt es als
  nicht Teil dieser Spec.

## Nicht-Ziele

- **Style Settings:** Die „Toggle"-Klassen, die ein Theme oder das Plugin Style Settings auf `<body>` setzt
  (`.minimal-focus-mode`, `.h2-no-underline`, `.colorful-frame`, …), sind kein Obsidian-DOM. Sie sind in der Messung
  getrennt gezählt (Things 124, Minimal 831 Treffer) und bleiben außen vor.
- **Plugin-Klassen** (`.dataview`, `.cards`, `.tasks`, Todoist, Kanban, …) und Prism-Token-Klassen.
- **Obsidian-Layout 1:1 nachbauen.** Wo Slatebases Aufbau abweicht (z. B. verschachtelte Tab-Container), wird nicht
  das DOM umgebaut, nur um einem Theme zu gefallen.
- Mobile-spezifische Klassen und Popout-Fenster (`is-popout-window`).

## Anforderungen

### R1 — Editor: Zeilen- und Elementklassen
1.1 Überschriftenzeilen tragen zusätzlich zu `cm-lp-hN` die Obsidian-Klassen `HyperMD-header` und `HyperMD-header-N`.
1.2 Codeblock-Zeilen tragen `HyperMD-codeblock` und `HyperMD-codeblock-bg`; die erste/letzte Zeile zusätzlich
    `HyperMD-codeblock-begin` bzw. `HyperMD-codeblock-end`.
1.3 Zitatzeilen tragen `HyperMD-quote`, Aufgabenzeilen `HyperMD-task-line`, Listenzeilen `HyperMD-list-line`.
1.4 Inline-Elemente tragen die Obsidian-Entsprechung zusätzlich zur eigenen Klasse: `cm-inline-code`, `cm-highlight`,
    `cm-hashtag`; Formatierungszeichen (`#`, `**`, …) tragen `cm-formatting` (und `cm-formatting-header`, …).
1.5 Der `.cm-editor` trägt `cm-s-obsidian`; der Editorbereich trägt `mod-cm6`, im Live-Preview-Modus `is-live-preview`
    und bei begrenzter Zeilenbreite `is-readable-line-width` (diese folgen dem Modus bzw. der Einstellung).
1.6 Die aktive Zeile trägt `cm-active`.

### R2 — Leseansicht (`ViewMode`)
2.1 Der Container trägt `markdown-preview-view` und `markdown-rendered`; der Inhalt ist in `markdown-preview-sizer`
    und `markdown-preview-section` gekapselt, soweit ein Theme darauf angewiesen ist (Messung entscheidet).
2.2 Aufgabenlisten tragen `contains-task-list`, `task-list-item` und `task-list-item-checkbox`; erledigte
    Aufgaben zusätzlich `is-checked` (Things: 24 Treffer).
2.3 Codeblöcke tragen das `el-pre`-Umfeld, Bild- und Notiz-Einbettungen `image-embed` bzw. `internal-embed`.

### R3 — Zustandsklassen auf `<body>`
3.1 `is-focused` folgt dem Fensterfokus, `is-fullscreen` dem Vollbild (Minimal: 29 bzw. 10 Treffer). `is-hidden-frameless` und `is-translucent`
    sind in Slatebase nie gesetzt (kein eigenes Fenster) und werden nur dann geführt, wenn die Messung zeigt, dass
    Themes sie zur Entscheidung brauchen.
3.2 Bestehende Klassen (`theme-light`, `theme-dark`, `is-mobile`, `mod-<os>`) bleiben unverändert. Hinweis zur
    Messung: `is-mobile`, `is-phone`, `is-tablet`, `is-ios`, `mod-macos`/`mod-windows` setzt
    `plugins/compat/body-classes.ts` plattformabhängig; die Messung lief unter Linux/Desktop und zählt sie deshalb
    als fehlend, obwohl sie auf der passenden Plattform gesetzt werden. Sie gehören nicht zur Lücke.

### R4 — Workspace und Tabs (nach Spike)
4.1 Phase 0 vergleicht zwei Strategien und legt eine fest (siehe Design §3): **DOM-Marker** auf den vorhandenen
    Elementen oder **Selektor-Umschreibung** beim Anwenden des Themes.
4.2 Gilt als erfüllt, wenn die in Minimal meistgenutzten Klassen (`workspace-tab-header*`, `workspace-tabs`,
    `mod-top`, `mod-primary(-split)`, `workspace-ribbon`) in Slatebase dieselben Elemente treffen **oder** die
    Entscheidung dokumentiert ist, dass das Tab-/Sidebar-Layout nicht angeglichen wird.

### R5 — Keine Änderung ohne Theme
5.1 Die neuen Klassen haben in Slatebases eigenem CSS **keine Regeln**. Ein Test prüft, dass weder `index.css`/
    `App.css` noch Komponenten-CSS einen der neuen Klassennamen als Selektor verwenden.
5.2 Die Messung vom 2026-10-19 hat gezeigt, dass auch `obsidian-compat.css` und `obsidian-components.css` keine
    Regeln für diese Klassen enthalten. Phase 0 wiederholt die Prüfung, bevor Klassen gesetzt werden.
5.3 Plugin-CSS, das diese Klassen anspricht, greift ab jetzt ebenfalls (gewollte Parität). Das ist in der Doku
    zu nennen.

### R6 — Messbarkeit und Tests
6.1 Das Messskript liegt im Spec-Ordner und ist mit einem Befehl reproduzierbar; die Messwerte der Abnahme stehen in
    `tasks.md`.
6.2 Pro neuer Klasse ein Test, der die Klasse am erzeugten DOM (CodeMirror-Zeilen bzw. gerendertes HTML) prüft.
6.3 Manuelle Abnahme wie in Stufe 1: isolierte Instanz, Things und Minimal in Hell und Dunkel, Vorher-/Nachher-
    Screenshots.

### R7 — Dokumentation
7.1 Die Themes-Seite im Welcome-Vault (DE und EN) und `README.md` nennen, welche Strukturen jetzt angeglichen sind und
    welche nicht.
