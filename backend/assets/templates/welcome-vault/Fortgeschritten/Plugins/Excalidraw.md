---
tags: [fortgeschritten, plugins]
---

# Excalidraw Plugin

Excalidraw bringt ein visuelles Whiteboard direkt in deinen Vault. Du erstellst Freihand-Zeichnungen, Diagramme, Wireframes und Skizzen — eingebettet in dein Wissensmanagement.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Excalidraw-Plugin installiert und aktiviert
- Plugin-ZIP von GitHub: `obsidian-excalidraw-plugin`

---

## Installation

1. **Plugin-Verwaltung** → Tab **"Verfügbare Plugins"** öffnen und nach "Excalidraw" suchen
2. **Installieren** klicken, dann den **Aktivierungs-Schalter** einschalten

Nicht gelistet, oder ein bestimmter Fork/eine bestimmte Version nötig? Stattdessen die Plugin-ZIP von GitHub herunterladen und unter **"Installierte Plugins" → Plugin hochladen** verwenden.

---

## Zeichnung erstellen

### Über die Command Palette

1. `Ctrl+P` → "Excalidraw: Neue Zeichnung erstellen"
2. Dateinamen eingeben
3. Der Excalidraw-Editor öffnet sich

### Manuell

Erstelle eine Datei mit der Endung `.excalidraw.md` — das Plugin erkennt sie automatisch.

---

## Werkzeuge

| Werkzeug | Shortcut | Beschreibung |
|----------|----------|--------------|
| Auswahl | `V` | Elemente auswählen und verschieben |
| Rechteck | `R` | Rechteck zeichnen |
| Ellipse | `O` | Kreis/Ellipse zeichnen |
| Pfeil | `A` | Pfeil/Verbindung zeichnen |
| Linie | `L` | Freie Linie |
| Text | `T` | Text einfügen |
| Freihand | `P` | Freihand-Zeichnung (Pen) |

---

## Beispiel: Architektur-Diagramm

Erstelle ein System-Architektur-Diagramm:

1. Neue Excalidraw-Zeichnung erstellen
2. Rechtecke für Komponenten zeichnen (Frontend, Backend, DB)
3. Pfeile für Datenflüsse zwischen Komponenten
4. Text-Labels für Beschriftungen
5. Farben zur Gruppierung (z.B. blau = Frontend, grün = Backend)

### Typische Elemente

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│  Datenbank  │
│   (React)   │◀────│   (Hono)    │◀────│  (Filesystem)│
└─────────────┘     └─────────────┘     └─────────────┘
        │                   │
        ▼                   ▼
┌─────────────┐     ┌─────────────┐
│   Browser   │     │   CouchDB   │
│   (Client)  │     │   (Sync)    │
└─────────────┘     └─────────────┘
```

---

## Beispiel: Mindmap

Nutze Excalidraw für visuelle Mindmaps:

1. Zentrales Thema in der Mitte (großes Rechteck/Ellipse)
2. Hauptäste als Pfeile nach außen
3. Unterthemen als kleinere Elemente
4. Farbcodierung nach Kategorie

---

## Beispiel: Wireframe

Erstelle UI-Mockups:

1. Rechtecke für Layout-Bereiche (Header, Sidebar, Content)
2. Kleinere Rechtecke für Buttons und Inputs
3. Text für Labels und Platzhalter
4. Linien für Trennlinien und Borders

---

## Einbetten in Notizen

Excalidraw-Zeichnungen kannst du in andere Notizen einbetten:

```markdown
# Projektdokumentation

## Architektur

Die folgende Zeichnung zeigt die Systemarchitektur:

![[Architektur-Diagramm.excalidraw]]

## Beschreibung

Das System besteht aus drei Hauptkomponenten...
```

---

## Dateiformat

Excalidraw speichert Zeichnungen als `.excalidraw.md`-Dateien:

- **Markdown-Header** mit Frontmatter
- **JSON-Daten** im Datei-Body (Excalidraw-Format)
- Kompatibel mit Excalidraw.com (Import/Export)

---

## Einschränkungen in Slatebase

| Feature | Status |
|---------|--------|
| Grundlegende Zeichenwerkzeuge | Funktioniert |
| Formen und Pfeile | Funktioniert |
| Text | Funktioniert |
| Farben und Styles | Funktioniert |
| Exportieren als PNG/SVG | Eingeschränkt |
| Bibliotheken (Libraries) | Nicht unterstützt |
| Kollaboratives Zeichnen | Nicht unterstützt |

---

## Tipps für effektives Arbeiten

### Tastenkürzel

| Shortcut | Aktion |
|----------|--------|
| `Ctrl+D` | Duplikat erstellen |
| `Ctrl+G` | Gruppieren |
| `Ctrl+Shift+G` | Gruppierung aufheben |
| `Ctrl+]` | Nach vorne bringen |
| `Ctrl+[` | Nach hinten bringen |
| `Ctrl+A` | Alles auswählen |
| `Delete` | Löschen |

### Organisation

- Ein Excalidraw-File pro Diagramm/Thema
- Benenne Dateien deskriptiv: `Architektur-Backend.excalidraw.md`
- Speichere Zeichnungen im gleichen Ordner wie die zugehörige Dokumentation
- Verlinke von Textnotizen auf Zeichnungen und umgekehrt

---

> [!tip] Excalidraw vs. Canvas
> **Excalidraw** ist ideal für Freihand-Zeichnungen und Diagramme. **Canvas** ([[Features/Canvas]]) eignet sich besser für verlinkte Notiz-Karten und Workflows. Nutze beides ergänzend.

> [!todo] Übung
> 1. Installiere und aktiviere das Excalidraw-Plugin
> 2. Erstelle eine neue Zeichnung (`Ctrl+P` → "Excalidraw")
> 3. Zeichne ein einfaches Diagramm mit 3 Rechtecken und Pfeilen
> 4. Füge Text-Labels hinzu
> 5. Experimentiere mit Farben und Stilen
> 6. Erstelle eine Notiz, die die Zeichnung einbettet (`![[Zeichnung.excalidraw]]`)
> 7. Probiere die Freihand-Zeichnung (Pen-Tool)

---

## Live-Beispiel

Die folgende Datei wird als Excalidraw-Zeichnung gerendert wenn das Plugin aktiviert ist:

→ [[Fortgeschritten/Plugins/Beispiel-Zeichnung.excalidraw]]

---

## Verwandte Features

- [[Features/Canvas]] — Knoten-basiertes Whiteboard (Alternative)
- [[Fortgeschritten/Canvas Workflows]] — Canvas für Workflows
- [[Features/Embeds]] — Dateien in Notizen einbetten
- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
