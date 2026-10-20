# Obsidian Themes, Stufe 2 (Struktur) — Requirements

## Kontext

Stufe 1 (`.kiro/specs/obsidian-themes/`, PR #251, gemergt) macht Themes nutzbar, die **über CSS-Variablen** arbeiten:
Farben, Schriften, Überschriftengrößen. Regeln, die Obsidians **DOM-Klassen** ansprechen (`.HyperMD-header`,
`.workspace-tab-header`, `.markdown-preview-view`, …), blieben wirkungslos, weil es diese Klassen in Slatebase nicht gibt.

Diese Spec sollte ursprünglich diese Klassen angleichen. Die **Messung in Phase 0** (2026-10-19, Things 2.2.4 und
Minimal 9.1.4) hat gezeigt, dass das **kaum Wirkung hätte**. Der Umfang ist deshalb auf das reduziert, was messbar etwas
bewirkt.

### Klassen-Abdeckung (Basislinie)

„Erreichbar" heißt: Die Regel hängt nicht an einem Schalter, den nur das Plugin *Style Settings* setzt
(`body.colorful-frame`, `body.tabs-modern`, …). Solche Regeln können in Slatebase nie greifen.

| Theme | Native Klassen-Treffer | erreichbar | davon in Slatebase fehlend | durch Schalter gesperrt |
|---|---|---|---|---|
| Things 2.2.4 | 300 | 203 | **155 (76 %)** | 97 (76 fehlend) |
| Minimal 9.1.4 | 2954 | 1626 | **1131 (69 %)** | 1328 (810 fehlend) |

Die Lücke liegt bei Things in Editor (65 von 74) und Leseansicht (73 von 75); bei Minimal in Workspace/Tabs
(351 von 450), Editor (330 von 513) und Leseansicht (275 von 283). Details im Design.

### Wirkungsmessung (Spike)

Klassen-Abdeckung ist **nicht** dasselbe wie sichtbare Wirkung. Die Spike-Sonden (im Spec-Ordner) setzen die fehlenden
Klassen auf das laufende DOM und vergleichen die berechneten Stile aller Elemente vor und nach dem Setzen:

| Sonde | Theme | Ergebnis |
|---|---|---|
| Workspace, Tabs, Ribbon, Leaf, Header, `is-focused`, `is-hidden-frameless` | Minimal | **1 von 945** Elementen ändert **eine** Eigenschaft (`position` eines Containers); der Screenshot der Tab-Leiste ist byte-identisch |
| Editor-Klassen (`HyperMD-*`, `cm-formatting`, `cm-inline-code`, `mod-cm6`, `is-live-preview`, …) | Things | **0 von 164** Elementen ändern sich |
| dieselben | Minimal | **6 von 164**: Editorbreite (`max-width`) und Tabellen (Rahmen, Zellabstände) |

Ursache für die Minimal-Wirkung: Seine Tabellen- und Breitenregeln hängen an `.markdown-source-view.mod-cm6 table` und
`.markdown-source-view.mod-cm6.is-readable-line-width .cm-content`. Alles andere, was die Messung als „fehlend" zählt,
steckt in Regeln, die entweder gesperrt sind, Variablen setzen (Stufe 1 deckt das ab) oder Elemente treffen, die Slatebase
anders baut.

## Ziel

Der kleinste Eingriff mit messbarer Wirkung: die **Editor-Wrapper-Klassen** (`mod-cm6`, `is-live-preview`,
`is-readable-line-width`, `cm-s-obsidian`). Sie schalten bei Minimal die Tabellen- und Breitenregeln frei und kosten
eine kleine Änderung an `CodeMirrorEditor.tsx`. Alles Weitere wird nur umgesetzt, wenn es eine Wirkung belegt.

Zielgröße ist **die Wirkungsprobe**, nicht die Klassenzählung: Nach Phase 1 ändert die Editor-Sonde bei Minimal
nichts mehr (die Wrapper-Klassen sind schon gesetzt), und Things bleibt unverändert.

## Entscheidungen aus Phase 0

| Bereich | Entscheidung | Begründung |
|---|---|---|
| Workspace, Tabs, Ribbon, Titelleiste | **nicht angleichen** | Strategie A (Marker) wirkungslos (1 von 945); Strategie B (Selektor-Umschreibung) trifft dieselben gesperrten Regeln; Minimals Tab-Look hängt an Style-Settings-Schaltern |
| Body-Zustand (`is-focused`, `is-hidden-frameless`, `is-fullscreen`) | **nicht umsetzen** | im Spike ohne Wirkung; die Regeln dazu treffen Elemente, die Slatebase nicht hat |
| Leseansicht (`markdown-preview-view`, …) | **nicht umsetzen** | `ViewMode` ist kein Tab-Modus: Der Modus „Vorschau" ist die bearbeitbare Live Preview, `ViewMode` rendert nur Hover-Vorschau und eingebettete Notizen (eigene Klassen, `view-mode-*`) |
| Editor-Zeilen- und Elementklassen (`HyperMD-*`, `cm-*`) | **optional** (R2) | im Spike ohne Wirkung; nur als Parität sinnvoll |
| Editor-Wrapper-Klassen | **umsetzen** (R1) | belegte Wirkung bei Minimal |

## Nicht-Ziele

- **Style Settings** und die davon gesetzten Body-Klassen (Things 124, Minimal 831 Treffer).
- **Plugin-Klassen** (`.dataview`, `.cards`, `.tasks`, Todoist, Kanban, …) und Prism-Token-Klassen.
- **Obsidian-Layout 1:1 nachbauen**, insbesondere Tab-Container, Ribbon und Titelleiste.
- Ein echter **Lesemodus** (Obsidians `markdown-preview-view` als Tab-Ansicht). Das wäre ein eigenes Feature.
- `.cm-contentContainer` / `.cm-sizer` (Wrapper in CodeMirrors DOM; Eingriff in die Koordinatenberechnung).

## Anforderungen

### R1 — Editor-Wrapper-Klassen (umsetzen)
1.1 Der Editorbereich (der Container, der schon `markdown-source-view` trägt) bekommt `mod-cm6`.
1.2 Im Live-Preview-Modus trägt er `is-live-preview`, im Source-Modus nicht; die Klasse folgt dem Moduswechsel.
1.3 Bei begrenzter Zeilenbreite (`readableLineLength`) trägt er `is-readable-line-width`; sie folgt der Einstellung.
1.4 Der `.cm-editor` trägt `cm-s-obsidian`.
1.5 Alle vier Klassen werden beim Abbau des Editors wieder entfernt (wie `markdown-source-view` heute).

### R2 — Editor-Zeilen- und Elementklassen (optional)
2.1 Überschriftenzeilen: `HyperMD-header` + `HyperMD-header-N`; Codeblock-Zeilen: `HyperMD-codeblock`, `-bg`, `-begin`, `-end`;
    Zitate: `HyperMD-quote`; Aufgaben: `HyperMD-task-line`; Inline-Elemente: `cm-inline-code`, `cm-highlight`, `cm-hashtag`,
    `cm-formatting`.
2.2 Nur umsetzen, wenn der Aufwand klein bleibt (Zusatzklassen an vorhandenen Decorations, keine zusätzlichen Ranges)
    und die Wirkungsprobe nichts verschlechtert. Rechtfertigung ist Parität (Plugin-CSS, ein späteres Style-Settings-
    Support), nicht Wirkung bei Standardthemes.

### R3 — Keine Änderung ohne Theme
3.1 Die neuen Klassen haben in Slatebases eigenem CSS **keine Regeln**. Ein Test prüft, dass weder `index.css`, `App.css`
    noch Komponenten-CSS einen der Klassennamen als Selektor nutzt (Prüfung vom 2026-10-19: keine Treffer in App-CSS und
    `obsidian-compat*.css`).
3.2 Plugin-CSS, das diese Klassen anspricht, greift ab jetzt ebenfalls (gewollte Parität); in der Doku nennen.

### R4 — Wirkungsmessung
4.1 Die Sonden `probe-editor-effect.js` und `probe-workspace-effect.js` liegen im Spec-Ordner und sind mit einem Befehl
    ausführbar. Ergebnisse der Abnahme stehen in `tasks.md`.
4.2 Abnahme: (a) Editor-Sonde bei Minimal nach R1 ohne Unterschied für die Wrapper-Klassen (sie sind schon gesetzt),
    (b) Things unverändert, (c) manuelle Sicht auf Minimal-Tabellen und Editorbreite in Hell/Dunkel, Screenshots
    vorher/nachher.

### R5 — Dokumentation
5.1 Die Themes-Seite im Welcome-Vault (DE und EN) und `README.md` nennen, was angeglichen ist (Tabellen, Zeilenbreite im
    Editor) und was nicht (Tab-Leiste, Ribbon, Titelleiste, Style-Settings-Optionen).
