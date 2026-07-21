---
tags: [features]
---

# Live Preview Editor

Der Live Preview Editor kombiniert Bearbeitung und Vorschau in einer einzigen Ansicht. Markdown-Syntax wird beim Schreiben inline gerendert — Überschriften, fetter/kursiver Text, Links, Callouts und mehr erscheinen sofort formatiert. Sobald der Cursor eine Stelle berührt, werden die Markdown-Marker sichtbar, damit du sie bearbeiten kannst.

---

## Die zwei Modi

### Source-Modus

Der klassische Editor — du siehst den reinen Markdown-Text mit Syntax-Highlighting. Alle Markdown-Marker (`#`, `**`, `[[...]]`) bleiben jederzeit sichtbar.

**Wann verwenden:** Bei komplexer Formatierung, Tabellen oder wenn du die volle Kontrolle über die Syntax brauchst.

### Live-Preview-Modus

Markdown wird inline formatiert dargestellt. Überschriften erscheinen in der richtigen Größe, Links werden klickbar, Bilder werden eingebettet angezeigt. Bewegt sich der Cursor in einen formatierten Bereich, werden die Marker automatisch eingeblendet.

**Wann verwenden:** Für normales Schreiben und wenn du das Ergebnis sofort sehen möchtest.

---

## Modus wechseln

| Methode | Aktion |
|---------|--------|
| Toolbar | Klick auf das Modus-Symbol (Quelltext/Vorschau) |
| Tastenkürzel | `Ctrl+E` (Source ↔ Live Preview) |
| Command Palette | `Ctrl+P` → "Editor-Modus wechseln" |

---

## Bilder einfügen

### Per Zwischenablage

1. Bild in die Zwischenablage kopieren (Screenshot, Bild aus Browser)
2. Im Editor `Ctrl+V` drücken
3. Das Bild wird automatisch im Vault gespeichert und als Embed eingefügt

### Per Drag & Drop

1. Bild-Datei vom Desktop oder Explorer in den Editor ziehen
2. Loslassen — die Datei wird hochgeladen und ein Embed-Link eingefügt

---

## Tastenkürzel im Editor

| Kürzel | Aktion |
|--------|--------|
| `Ctrl+B` | Fett |
| `Ctrl+I` | Kursiv |
| `Ctrl+K` | Link einfügen |
| `Ctrl+E` | Modus wechseln (Source ↔ Live Preview) |
| `Ctrl+Z` | Rückgängig |
| `Ctrl+Shift+Z` | Wiederherstellen |
| `Ctrl+D` | Zeile duplizieren |
| `Tab` | Einrücken |
| `Shift+Tab` | Ausrücken |

---

## Vim-Modus

Für erfahrene Vim-Nutzer steht ein optionaler Vim-Modus zur Verfügung. Aktivierung über die Einstellungen (Ctrl+,) → Darstellung → Vim-Modus.

Im Vim-Modus stehen die gewohnten Modi (Normal, Insert, Visual) und Befehle zur Verfügung.

---

## Hinweise

- **Große Dateien:** Bei Dateien mit mehr als 50.000 Zeichen wird automatisch auf den Source-Modus umgeschaltet (Performance-Schutz).
- **Feature-Toggle:** Der Live-Preview-Modus kann unter Einstellungen → Feature Toggles deaktiviert werden. Der Editor funktioniert dann als reiner Source-Editor.
- **Alle Obsidian-Syntax:** Wikilinks, Embeds, Callouts, Tags und Mermaid-Diagramme werden im Live-Preview korrekt dargestellt.

---

## Was wird im Live-Preview gerendert?

| Element | Beispiel | Rendering |
|---------|----------|-----------|
| Überschriften | `## Titel` | Schriftgröße + Marker versteckt |
| Fett/Kursiv | `**fett**` / `*kursiv*` | Formatiert, Marker versteckt |
| Durchgestrichen | `~~text~~` | Durchgestrichen |
| Highlight | `==text==` | Farbiger Hintergrund |
| Inline-Code | `` `code` `` | Monospace-Styling |
| Links | `[text](url)` | Klickbar (Ctrl+Click) |
| Wikilinks | `[[Seite]]` | Klickbar, Brackets versteckt |
| Embeds | `![[bild.png]]` | Inline-Bild |
| Standard-Bilder | `![alt](url)` | Inline-Bild |
| Checkboxen | `- [x] done` | Klickbare Checkbox |
| Tabellen | Pipe-Syntax | HTML-Tabelle |
| Code-Blöcke | ` ```js ` | Fences versteckt, Hintergrund |
| Mermaid | ` ```mermaid ` | SVG-Diagramm |
| Blockzitate | `> text` | Border-Left, Prefix versteckt |
| Callouts | `> [!tip]` | Farbige Box mit Icon |
| Horizontale Linie | `---` | Echte Trennlinie |

> [!info] Cursor-Reveal
> Alle versteckten Marker werden sofort sichtbar, sobald der Cursor den formatierten Bereich berührt. So bleibt die volle Kontrolle über die Syntax erhalten.
