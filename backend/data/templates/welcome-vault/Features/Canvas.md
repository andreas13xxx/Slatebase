---
tags: [features]
---

# Canvas

Canvas ist eine visuelle Arbeitsfläche für freies Denken. Du kannst Text, Dateien, Links und Gruppen als Knoten (Nodes) anordnen, mit Verbindungen (Edges) verknüpfen und so Ideen räumlich organisieren.

![[Screenshots/canvas-nodes.png]]

*Canvas mit verschiedenen Node-Typen und Verbindungen*

---

## Canvas erstellen

1. **Kontextmenü:** Rechtsklick im Explorer → "Neue Datei" → Dateiname mit `.canvas` Extension
2. **Command Palette:** `Ctrl+P` → "Neue Canvas-Datei"
3. **Ergebnis:** Eine leere Arbeitsfläche öffnet sich im Tab

### Das `.canvas`-Dateiformat

Canvas-Dateien werden als JSON gespeichert (Endung `.canvas`). Das Format enthält:

```json
{
  "nodes": [
    { "id": "abc1", "type": "text", "x": 100, "y": 50, "width": 300, "height": 200, "text": "..." }
  ],
  "edges": [
    { "id": "edge1", "fromNode": "abc1", "toNode": "def2", "label": "..." }
  ]
}
```

Du musst die JSON-Struktur nicht manuell bearbeiten — die visuelle Oberfläche übernimmt alles. Über die Source-View kannst du das Rohdaten-JSON aber einsehen und direkt ändern.

---

## Node-Typen

### Text-Node

Ein Freitext-Feld mit Markdown-Unterstützung:

- Doppelklick zum Bearbeiten
- Markdown wird im Viewer-Modus gerendert
- Ideal für Ideen, Stichpunkte, kurze Texte

### File-Node

Bettet eine Datei aus dem Vault ein:

- Zeigt eine Vorschau des Dateiinhalts (Markdown, Bilder, PDFs)
- Klick öffnet die eingebettete Datei im Haupteditor
- Verknüpft dein Canvas mit bestehendem Wissen

### Link-Node

Bindet eine externe URL ein:

- Zeigt eine iframe-Vorschau der Webseite (sofern erlaubt)
- Nützlich für Referenz-Websites, Dokumentationen, Web-Apps
- Die Vorschau wird interaktiv wenn der Node ausgewählt ist

### Group-Node

Ein Container, der andere Nodes visuell gruppiert:

- Erstelle Bereiche für Kategorien oder Themen
- Nodes innerhalb einer Gruppe bewegen sich gemeinsam
- Gruppen können farblich markiert werden

---

## Nodes erstellen

- **Toolbar:** Klicke auf das entsprechende Icon in der Canvas-Toolbar (Text, File, Link, Group)
- **Doppelklick:** Doppelklick auf die leere Arbeitsfläche erstellt einen Text-Node
- **Kontextmenü:** Rechtsklick auf die Arbeitsfläche → "Neuer Node" → Typ wählen

Nach dem Erstellen kannst du den Node an die gewünschte Position ziehen und seine Größe über die Ecken anpassen.

---

## Edges (Verbindungen)

Edges verbinden zwei Nodes miteinander:

### Edge erstellen

1. Fahre mit der Maus über einen Node — Ankerpunkte erscheinen an den Rändern
2. Klicke auf einen Ankerpunkt und ziehe zum Ziel-Node
3. Lasse auf einem Ankerpunkt des Ziel-Nodes los

### Edge-Optionen

- **Label:** Rechtsklick auf eine Edge → "Label bearbeiten" — beschriftet die Verbindung
- **Pfeilrichtung:** Konfigurierbar (Pfeil am Start, Ende, beidseitig oder ohne)
- **Löschen:** Rechtsklick → "Löschen" oder Edge auswählen + `Delete`

---

## Navigation

### Zoom und Pan

- **Zoomen:** Mausrad (oder Pinch-Geste)
- **Verschieben:** Klicke auf die leere Fläche und ziehe (Pan)
- **Fit:** Toolbar-Button "Einpassen" zentriert alle Nodes im sichtbaren Bereich

### Minimap

Die Minimap zeigt eine Übersicht der gesamten Arbeitsfläche:

- Aktivierbar über die Toolbar (Minimap-Icon)
- Zeigt deine aktuelle Viewport-Position als Rechteck
- Klick auf die Minimap navigiert direkt zu dieser Stelle

---

## Toolbar

Die Canvas-Toolbar bietet schnellen Zugriff auf:

| Icon | Funktion |
|------|----------|
| Text | Neuen Text-Node erstellen |
| Datei | Neuen File-Node erstellen |
| Link | Neuen Link-Node erstellen |
| Gruppe | Neue Gruppe erstellen |
| Zoom + / − | Zoom-Stufe ändern |
| Einpassen | Alle Nodes in den Viewport einpassen |
| Raster | Raster ein-/ausblenden |
| Minimap | Minimap ein-/ausblenden |
| Undo/Redo | Letzte Aktion rückgängig/wiederherstellen |
| Source | Zwischen visueller und JSON-Ansicht wechseln |

---

## Source View

Über den Source-Button in der Toolbar kannst du den Rohdaten-JSON-Editor öffnen:

- Zeigt die vollständige `.canvas`-Datei als JSON
- Änderungen können direkt im JSON vorgenommen werden
- "Anwenden" übernimmt Änderungen in die visuelle Darstellung
- Nützlich für Batch-Operationen oder Debugging

---

## Bearbeitung und Auswahl

- **Einzelauswahl:** Klick auf einen Node
- **Mehrfachauswahl:** `Ctrl+Klick` oder Rahmenauswahl (Lasso)
- **Verschieben:** Ausgewählte Nodes per Drag bewegen
- **Größe ändern:** Ziehe an den Ecken eines ausgewählten Nodes
- **Löschen:** Auswählen + `Delete`-Taste
- **Farbzuweisung:** Kontextmenü → Farbe wählen

---

## Praktisches Beispiel

Erstelle ein kleines Brainstorming-Canvas:

1. Erstelle eine neue Datei `Brainstorming.canvas`
2. Erstelle einen Text-Node in der Mitte: "Projektidee: Wissensdatenbank"
3. Erstelle drei weitere Text-Nodes drumherum: "Zielgruppe", "Features", "Technologie"
4. Verbinde den zentralen Node mit den drei äußeren (Edges ziehen)
5. Erstelle eine Gruppe um alle Nodes
6. Füge ein Label "gehört zu" an eine Edge
7. Aktiviere die Minimap und zoome heraus

---

> [!tip] Canvas für Planung nutzen
> Canvas eignet sich hervorragend für Projektplanung, Mindmaps und Brainstorming. Kombiniere Text-Nodes für Ideen mit File-Nodes, die auf ausgearbeitete Notizen verweisen. So verbindest du das freie Denken mit deiner strukturierten Wissensbasis.

> [!todo] Übung
> 1. Erstelle ein neues Canvas im Vault
> 2. Erstelle je einen Node von jedem Typ (Text, File, Link, Group)
> 3. Verbinde mindestens zwei Nodes mit einer beschrifteten Edge
> 4. Wechsle in die Source-View und betrachte die JSON-Struktur
> 5. Nutze die Minimap zur Navigation

---

## Verwandte Features

- [[Features/Wikilinks]] — File-Nodes verlinken auf Vault-Dateien
- [[Features/Embeds]] — Ähnliches Konzept: Inhalte einbetten
- [[Features/Command Palette]] — Canvas-Befehle per Tastenkürzel
- [[Fortgeschritten/Canvas Workflows]] — Komplexe Anwendungsfälle für Canvas
