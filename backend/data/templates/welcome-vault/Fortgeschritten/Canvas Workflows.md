---
tags: [fortgeschritten]
---

# Canvas Workflows

Das Canvas-Feature eignet sich nicht nur für einfache Skizzen. In diesem Guide lernst du fortgeschrittene Workflows: Brainstorming mit Text-Nodes, Projektplanung mit File-Nodes, Mindmap-Patterns und die Verlinkung zwischen Canvas und Notizen.

---

## Brainstorming mit Text-Nodes

Ein Canvas eignet sich hervorragend als freier Denkraum. Im Gegensatz zu linearen Notizen kannst du Ideen räumlich anordnen und visuell gruppieren.

### Schritt-für-Schritt: Brainstorming-Session

1. Erstelle eine neue `.canvas`-Datei (Rechtsklick → Neu → Canvas)
2. Doppelklick auf den leeren Bereich → neuer Text-Node
3. Schreibe eine Kernidee in den ersten Node
4. Erstelle weitere Nodes für verwandte Ideen
5. Verbinde zusammengehörige Nodes mit Edges (Ankerpunkt ziehen)
6. Gruppiere Cluster mit Group-Nodes (Toolbar → Gruppe hinzufügen)

### Tipps für effektives Brainstorming

- **Farben nutzen:** Rechtsklick auf Node → Farbe wählen (z.B. Grün = umgesetzt, Gelb = offen, Rot = verworfen)
- **Kurz halten:** Maximal 2–3 Sätze pro Node — Details kommen in verlinkte Notizen
- **Edges beschriften:** Klicke auf eine Verbindungslinie und füge ein Label hinzu (z.B. "hängt ab von", "inspiriert durch")
- **Zoom-Ebenen:** Überblick mit Minimap, Details durch Hineinzoomen

---

## Projektplanung mit File-Nodes

File-Nodes zeigen den Inhalt einer Markdown-Datei direkt im Canvas an. Das ist ideal für Projektübersichten, in denen jede Aufgabe oder jeder Meilenstein eine eigene Notiz ist.

### Projekt-Canvas erstellen

1. Erstelle Notizen für deine Projektkomponenten:
   - `Meilenstein 1.md`, `Meilenstein 2.md`, ...
   - `Aufgabe A.md`, `Aufgabe B.md`, ...
2. Erstelle ein Canvas `Projektplan.canvas`
3. Ziehe die Notizen als File-Nodes auf das Canvas (Toolbar → Datei-Node)
4. Ordne sie chronologisch oder nach Abhängigkeiten an
5. Verbinde abhängige Elemente mit gerichteten Edges (Pfeil aktivieren)

### File-Node-Vorteile

| Eigenschaft | Vorteil |
|-------------|---------|
| Live-Vorschau | Änderungen in der Notiz aktualisieren den Node |
| Markdown-Rendering | Formatierter Inhalt direkt sichtbar |
| Klick zum Öffnen | Doppelklick öffnet die Notiz als Tab |
| Pfad-Bearbeitung | Rechtsklick → "Dateipfad ändern" für Verknüpfung |

> [!tip] Dateisuche im Canvas
> Beim Bearbeiten eines File-Node-Pfads öffnet sich eine Dropdown-Suche über alle Dateien im Vault. Gib einen Teilnamen ein, um schnell die richtige Datei zu finden.

---

## Mindmap-Patterns

Ein Mindmap folgt einem zentralen Thema mit Ästen, die sich immer weiter verzweigen. Mit Canvas lässt sich dieses Muster umsetzen.

### Aufbau einer Mindmap

1. **Zentrum:** Erstelle einen großen Text-Node mit dem Hauptthema (ggf. mit Farbe hervorheben)
2. **Hauptäste:** 4–6 Nodes für die Hauptkategorien, gleichmäßig um das Zentrum verteilt
3. **Unteräste:** Weitere Nodes an den Hauptästen für Details
4. **Verbindungen:** Edges vom Zentrum zu den Hauptästen, von dort zu den Unterästen

### Layout-Empfehlungen

- Nutze die **Toolbar → Anordnen** Funktion (falls verfügbar) oder arrangiere manuell
- Halte gleiche Hierarchie-Ebenen auf gleicher Höhe/Entfernung
- Verwende Gruppen-Nodes als visuelle Container für Äste
- Nutze die Minimap zur Übersichtsnavigation

---

## Canvas mit Notizen verlinken

Canvas-Dateien können aus regulären Markdown-Notizen heraus verlinkt werden — und umgekehrt.

### Von Notiz → Canvas

In einer Markdown-Datei verlinkst du ein Canvas wie jede andere Datei:

```markdown
Mein Brainstorming-Board: [[Projektideen.canvas]]
```

### Von Canvas → Notiz

File-Nodes sind automatisch Verknüpfungen. Zusätzlich kannst du in Text-Nodes Wikilinks verwenden:

```markdown
Siehe Details in [[Projektplan]] und [[Meeting-Notizen]]
```

### Link-Nodes für externe Ressourcen

Link-Nodes zeigen eine Webseiten-Vorschau (iframe) direkt im Canvas:

1. Toolbar → Link-Node hinzufügen
2. URL eingeben (z.B. `https://docs.example.com`)
3. Der Node zeigt eine Live-Vorschau der Seite

> [!warning] iframe-Einschränkungen
> Viele Webseiten verbieten die Einbettung per iframe (X-Frame-Options/CSP). In diesem Fall bleibt der Link-Node leer. Das ist kein Fehler — die Zielseite blockiert die Anzeige.

---

## Workflow-Beispiele

### Wöchentliche Planung

| Element | Typ | Inhalt |
|---------|-----|--------|
| Zentrum | Text-Node | "KW 25 — Planung" |
| Links | Group-Node | "Montag–Mittwoch" mit Aufgaben-Nodes |
| Rechts | Group-Node | "Donnerstag–Freitag" mit Aufgaben-Nodes |
| Unten | File-Node | Link zu `Wochenbericht.md` |

### Recherche-Sammlung

1. Erstelle ein Canvas `Recherche - Thema X.canvas`
2. Füge Link-Nodes für Webquellen hinzu
3. Erstelle Text-Nodes für eigene Gedanken/Zusammenfassungen
4. Verbinde Quellen mit Schlussfolgerungen per Edge
5. Exportiere Ergebnisse als Markdown-Notiz

---

## Source-View für Fortgeschrittene

Über Toolbar → Source-View kannst du die JSON-Struktur des Canvas direkt bearbeiten. Nützlich für:

- Bulk-Änderungen (z.B. alle Nodes um 100px verschieben)
- Kopieren von Node-Gruppen zwischen Canvas-Dateien
- Debugging bei unerwarteten Layouts

> [!tip] Undo funktioniert
> Alle Canvas-Änderungen unterstützen Undo/Redo. Wenn du im Source-View etwas kaputt machst, drücke einfach `Ctrl+Z`.

---

## Verwandte Features

- [[Features/Canvas]] — Grundlagen des Canvas-Features
- [[Praxis/Übung 5 - Canvas erstellen]] — Praktische Canvas-Übung
- [[Features/Wikilinks]] — Verlinkung zwischen Notizen
- [[Features/Embeds]] — Dateien einbetten
