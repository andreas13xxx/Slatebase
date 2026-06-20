# Requirements Document

## Introduction

Obsidian Canvas ist ein visuelles Whiteboard-Format das Notizen, Bilder, Links und Gruppen auf einer unendlichen Leinwand anordnet. Obsidian speichert Canvas-Dateien als `.canvas`-JSON-Dateien im Vault. Slatebase soll diese Dateien lesen, darstellen und bearbeiten können, damit Benutzer ihre Canvas-Inhalte auch in der Web-Oberfläche nutzen können. Das Feature umfasst das Parsen des Canvas-JSON-Formats, eine interaktive SVG/Canvas-Visualisierung mit Zoom/Pan, das Bearbeiten von Knoten-Inhalten und -Positionen sowie die Persistenz zurück ins `.canvas`-Format.

## Glossary

- **Canvas_File**: Eine `.canvas`-Datei im Vault die das Obsidian-Canvas-JSON-Format enthält (Knoten, Kanten, optional Gruppen)
- **Canvas_View**: Die Frontend-Komponente die eine Canvas-Datei als interaktive visuelle Fläche darstellt
- **Canvas_Node**: Ein Element auf dem Canvas — kann Text (Markdown), Datei-Referenz, Link (URL) oder Gruppe sein
- **Text_Node**: Ein Canvas-Knoten der Markdown-Freitext enthält (inline bearbeitbar)
- **File_Node**: Ein Canvas-Knoten der auf eine Vault-Datei verweist (Markdown, Bild, PDF)
- **Link_Node**: Ein Canvas-Knoten der eine externe URL referenziert
- **Group_Node**: Ein visueller Container der andere Knoten gruppiert (mit optionalem Label und Hintergrundfarbe)
- **Canvas_Edge**: Eine gerichtete Verbindung zwischen zwei Canvas-Knoten (mit optionalem Label und Farbe)
- **Canvas_JSON**: Das JSON-Schema einer `.canvas`-Datei gemäß Obsidian-Spezifikation (`{ nodes: [...], edges: [...] }`)
- **Node_Position**: Die x/y-Koordinaten und Breite/Höhe eines Knotens auf dem Canvas (pixelbasiert)
- **Edge_Anchor**: Der Ankerpunkt einer Kante an einem Knoten (top, right, bottom, left)
- **Canvas_Parser**: Backend/Frontend-Modul das `.canvas`-JSON validiert und in interne Datenstrukturen überführt
- **Canvas_Renderer**: Frontend-Komponente die Knoten und Kanten als interaktive SVG- oder HTML-Elemente zeichnet

## Requirements

### Requirement 1: Canvas-Datei-Erkennung und Routing

**User Story:** Als Benutzer möchte ich `.canvas`-Dateien im File_Explorer sehen und durch Klick in einer Canvas-Ansicht öffnen, damit ich meine visuellen Boards betrachten kann.

#### Acceptance Criteria

1. THE File_Explorer SHALL `.canvas`-Dateien mit einem eigenen Icon (Lucide `LayoutDashboard` oder vergleichbar) darstellen und sie wie andere Dateien klickbar machen
2. WHEN ein Benutzer eine `.canvas`-Datei im File_Explorer anklickt, THE Tab_Manager SHALL einen neuen Tab mit der Canvas_View öffnen (nicht den Markdown-Editor/Viewer)
3. WHEN eine `.canvas`-Datei in einem Tab geöffnet ist, THE Tab_Bar SHALL den Dateinamen (ohne Extension) und ein Canvas-Icon anzeigen
4. THE Vault_Service SHALL `.canvas`-Dateien beim Lesen als raw JSON zurückgeben (kein Markdown-Processing)
5. IF eine `.canvas`-Datei syntaktisch ungültiges JSON enthält, THEN THE Canvas_View SHALL eine Fehlermeldung mit Parse-Error-Details anzeigen und einen Fallback auf die Textansicht anbieten

### Requirement 2: Canvas-JSON-Parsing und Validierung

**User Story:** Als Entwickler möchte ich ein robustes Parsing-Modul haben, das Canvas-Dateien validiert und in typsichere Datenstrukturen überführt.

#### Acceptance Criteria

1. THE Canvas_Parser SHALL das Obsidian-Canvas-JSON-Schema validieren: Top-Level-Objekt mit `nodes: CanvasNode[]` und `edges: CanvasEdge[]` Arrays
2. THE Canvas_Parser SHALL folgende Node-Typen erkennen und validieren:
   - `text`: `{ id, type: "text", x, y, width, height, text: string, color? }`
   - `file`: `{ id, type: "file", x, y, width, height, file: string, subpath?, color? }`
   - `link`: `{ id, type: "link", x, y, width, height, url: string, color? }`
   - `group`: `{ id, type: "group", x, y, width, height, label?, color?, background?, backgroundStyle? }`
3. THE Canvas_Parser SHALL Edges validieren: `{ id, fromNode, fromSide, fromEnd?, toNode, toSide, toEnd?, color?, label? }`
4. WHEN ein unbekannter Node-Typ oder unbekannte Properties auftreten, THE Canvas_Parser SHALL diese ignorieren (forward-compatible) und den Rest der Datei korrekt parsen
5. THE Canvas_Parser SHALL bei fehlenden Pflichtfeldern (id, x, y, width, height) einen Validierungsfehler mit Position und Feldname melden
6. THE Canvas_Parser SHALL Node-IDs auf Eindeutigkeit prüfen und Edge-Referenzen (fromNode, toNode) gegen existierende Node-IDs validieren

### Requirement 3: Canvas-Rendering (Anzeige)

**User Story:** Als Benutzer möchte ich mein Canvas als interaktive visuelle Darstellung sehen, die alle Knoten und Verbindungen korrekt positioniert.

#### Acceptance Criteria

1. THE Canvas_Renderer SHALL alle Knoten an ihren x/y-Koordinaten mit der spezifizierten Breite und Höhe rendern
2. THE Canvas_Renderer SHALL Text_Nodes als Container mit gerendertem Markdown-Inhalt darstellen (nutzt bestehende ViewMode-Logik für Wikilinks, Callouts, Tags etc.)
3. THE Canvas_Renderer SHALL File_Nodes als Container mit dem referenzierten Dateinamen und Vorschau darstellen:
   - Markdown-Dateien: Erster Absatz als Vorschau-Text
   - Bild-Dateien: Thumbnail-Vorschau
   - Andere Dateien: Dateiname mit Icon
4. THE Canvas_Renderer SHALL Link_Nodes als Container mit URL und optionaler Favicon/Vorschau darstellen
5. THE Canvas_Renderer SHALL Group_Nodes als halbtransparente Hintergrundrechtecke mit optionalem Label rendern (z-index unter den enthaltenen Knoten)
6. THE Canvas_Renderer SHALL Edges als SVG-Pfade (Bézier-Kurven oder gerade Linien) zwischen den Ankerpunkten (`fromSide`/`toSide`) der verbundenen Knoten zeichnen
7. THE Canvas_Renderer SHALL Edges mit Pfeilspitzen am Endpunkt rendern wenn `toEnd: "arrow"` gesetzt ist
8. THE Canvas_Renderer SHALL die `color`-Property von Nodes und Edges als Rahmen-/Linienfarbe verwenden (Obsidian-Farbnummern 1–6 → CSS-Token-Mapping)
9. IF ein File_Node auf eine nicht existierende Vault-Datei verweist, THEN THE Canvas_Renderer SHALL den Knoten mit einem „Datei nicht gefunden"-Platzhalter und Broken-Link-Styling darstellen

### Requirement 4: Canvas-Navigation (Zoom, Pan, Scroll)

**User Story:** Als Benutzer möchte ich mein Canvas frei navigieren können (Zoom, Verschieben), damit ich auch bei großen Boards den Überblick behalte.

#### Acceptance Criteria

1. THE Canvas_View SHALL Mausrad-Zoom unterstützen (Zoom-In/Out, Bereich: 10%–400%, Standard: 100%, Schritte: 10%)
2. THE Canvas_View SHALL Drag-Panning unterstützen (Mittelmaustaste oder Leertaste+Maustaste zum Verschieben der Ansicht)
3. THE Canvas_View SHALL einen „Fit to View"-Button bereitstellen der die Ansicht so anpasst dass alle Knoten sichtbar sind (mit 50px Padding)
4. THE Canvas_View SHALL einen Minimap-Indikator anzeigen der die aktuelle Viewport-Position auf dem Gesamtcanvas darstellt (optional, per Toggle ein-/ausblendbar)
5. THE Canvas_View SHALL bei Öffnung die Ansicht zentriert auf den Mittelpunkt aller Knoten positionieren
6. THE Canvas_View SHALL Touch-Gesten (Pinch-to-Zoom, Two-Finger-Pan) auf Touch-Geräten unterstützen

### Requirement 5: Canvas-Bearbeitung (Knoten)

**User Story:** Als Benutzer möchte ich Knoten auf dem Canvas verschieben, in der Größe ändern und den Inhalt bearbeiten können.

#### Acceptance Criteria

1. WHEN ein Benutzer einen Knoten per Drag & Drop verschiebt, THE Canvas_View SHALL die x/y-Koordinaten des Knotens aktualisieren und die verbundenen Edges live mitbewegen
2. WHEN ein Benutzer einen Resize-Handle an einem Knoten zieht, THE Canvas_View SHALL die Breite/Höhe des Knotens aktualisieren (Minimum: 100×60px)
3. WHEN ein Benutzer per Doppelklick einen Text_Node öffnet, THE Canvas_View SHALL einen Inline-Markdown-Editor innerhalb des Knotens aktivieren
4. WHEN ein Benutzer die Bearbeitung eines Text_Nodes abschließt (Escape oder Klick außerhalb), THE Canvas_View SHALL den neuen Text speichern und den Knoten als gerenderten Markdown anzeigen
5. WHEN ein Benutzer per Doppelklick einen File_Node öffnet, THE Canvas_View SHALL die referenzierte Datei in einem neuen Tab öffnen (Standard-Editor/Viewer)
6. THE Canvas_View SHALL Mehrfachauswahl unterstützen (Shift+Klick oder Lasso-Auswahl) für gemeinsames Verschieben
7. WHEN ein Benutzer einen oder mehrere ausgewählte Knoten mit der Entf-Taste löscht, THE Canvas_View SHALL nach Bestätigung die Knoten und alle verbundenen Edges entfernen

### Requirement 6: Canvas-Bearbeitung (Edges)

**User Story:** Als Benutzer möchte ich Verbindungen zwischen Knoten erstellen und entfernen können.

#### Acceptance Criteria

1. WHEN ein Benutzer von einem Knoten-Rand (Ankerpunkt) eine Linie zu einem anderen Knoten zieht, THE Canvas_View SHALL eine neue Edge erstellen mit den entsprechenden `fromNode`, `fromSide`, `toNode`, `toSide` Werten
2. THE Canvas_View SHALL während des Ziehens einer neuen Edge eine visuelle Vorschau-Linie anzeigen
3. WHEN ein Benutzer auf eine Edge klickt, THE Canvas_View SHALL die Edge als ausgewählt markieren (visuelles Highlight)
4. WHEN ein Benutzer eine ausgewählte Edge mit Entf löscht, THE Canvas_View SHALL die Edge nach Bestätigung entfernen
5. THE Canvas_View SHALL optional ein Label auf einer Edge anzeigen (editierbar per Doppelklick)
6. THE Canvas_View SHALL Pfeilspitzen (Start/Ende) per Kontextmenü oder Panel konfigurierbar machen

### Requirement 7: Canvas-Bearbeitung (Knoten erstellen)

**User Story:** Als Benutzer möchte ich neue Knoten auf dem Canvas erstellen können.

#### Acceptance Criteria

1. WHEN ein Benutzer per Doppelklick auf den leeren Canvas-Hintergrund klickt, THE Canvas_View SHALL einen neuen Text_Node an dieser Position erstellen und den Inline-Editor aktivieren
2. THE Canvas_View SHALL eine Toolbar oder ein Kontextmenü bereitstellen zum Erstellen von: Text_Node, File_Node (mit Dateiauswahl-Dialog), Link_Node (mit URL-Eingabe), Group_Node
3. WHEN ein File_Node erstellt wird, THE Canvas_View SHALL einen Datei-Picker anzeigen der Vault-Dateien durchsuchen lässt
4. WHEN ein Link_Node erstellt wird, THE Canvas_View SHALL ein URL-Eingabefeld anzeigen
5. WHEN ein Group_Node erstellt wird, THE Canvas_View SHALL eine Lasso-Auswahl ermöglichen um existierende Knoten in die Gruppe einzuschließen
6. THE Canvas_View SHALL Copy & Paste von Knoten unterstützen (Ctrl+C/Ctrl+V, neue IDs generiert)

### Requirement 8: Canvas-Persistenz (Speichern)

**User Story:** Als Benutzer möchte ich dass meine Canvas-Änderungen automatisch gespeichert werden, damit keine Arbeit verloren geht.

#### Acceptance Criteria

1. WHEN ein Benutzer Änderungen am Canvas vornimmt (Knoten verschieben/erstellen/löschen, Edges ändern), THE Canvas_View SHALL die Änderungen nach einer Debounce-Periode von 2 Sekunden automatisch als `.canvas`-JSON-Datei im Vault speichern
2. THE Canvas_Parser SHALL beim Serialisieren das exakte Obsidian-Canvas-JSON-Format erzeugen, sodass die Datei in Obsidian korrekt gelesen werden kann
3. THE Canvas_View SHALL einen visuellen Indikator anzeigen ob ungespeicherte Änderungen vorliegen (analog zum Markdown-Editor)
4. WHEN das Speichern fehlschlägt, THE Canvas_View SHALL eine Fehlermeldung anzeigen und den Benutzer zum manuellen Retry auffordern
5. THE Canvas_Parser SHALL unbekannte Properties die beim Parsing ignoriert wurden beim Serialisieren beibehalten (Round-Trip-Kompatibilität für zukünftige Obsidian-Features)
6. WHEN mehrere Knoten gleichzeitig verschoben werden (Gruppenverschiebung), THE Canvas_View SHALL nur einen Speichervorgang nach Abschluss der Gesamtaktion auslösen (nicht pro Knoten)

### Requirement 9: Canvas-Styling und Design Tokens

**User Story:** Als Benutzer möchte ich dass das Canvas im Slatebase-Design-System konsistent gestylt ist und im Dark Mode korrekt dargestellt wird.

#### Acceptance Criteria

1. THE Canvas_View SHALL CSS Custom Properties (Design Tokens) für alle Canvas-Farben verwenden: Node-Hintergrund, Node-Rand, Edge-Farbe, Selektionsfarbe, Gruppenfarbe
2. THE Canvas_View SHALL die Obsidian-Farbnummern (1–6) auf Design-Token-basierte CSS-Klassen mappen (z.B. `--canvas-color-1` bis `--canvas-color-6`)
3. THE Canvas_View SHALL im Dark Mode alle Farben über Design-Token-Overrides anpassen
4. THE Canvas_View SHALL ein Grid-Pattern als Hintergrund anzeigen (optional, per Toggle)
5. THE Canvas_View SHALL eine konsistente Schriftgröße verwenden die beim Zoom-Level ≥50% lesbar bleibt

### Requirement 10: Canvas und Knowledge Graph Integration

**User Story:** Als Benutzer möchte ich dass Datei-Verweise in Canvas-Dateien im Knowledge Graph als Verlinkungen erscheinen.

#### Acceptance Criteria

1. THE Link_Index_Service SHALL `.canvas`-Dateien beim Index-Aufbau parsen und `file`-Nodes als Verlinkungen (Canvas → referenzierte Datei) im Index erfassen
2. WHEN Backlinks für eine Datei abgefragt werden, THE Link_Index_Service SHALL auch Canvas-Dateien auflisten die die Datei als File_Node referenzieren
3. THE Knowledge_Graph SHALL Canvas-Dateien als eigenen Node-Typ mit Canvas-Icon darstellen
4. WHEN ein Benutzer im Knowledge Graph auf einen Canvas-Node klickt, THE Graph_View SHALL die Canvas-Datei im Canvas_View-Tab öffnen

### Requirement 11: Canvas Read-Only-Modus

**User Story:** Als Benutzer mit Leserechten möchte ich Canvas-Dateien betrachten können, ohne sie versehentlich zu bearbeiten.

#### Acceptance Criteria

1. WHEN ein Benutzer nur Leserechte auf einen Vault hat, THE Canvas_View SHALL im Read-Only-Modus öffnen (Navigation erlaubt, keine Bearbeitung)
2. IN Read-Only-Modus, THE Canvas_View SHALL keine Drag-Handles, Resize-Handles oder Bearbeitungsoptionen anzeigen
3. IN Read-Only-Modus, THE Canvas_View SHALL Doppelklick auf File_Nodes weiterhin zur Dateiöffnung nutzen (Navigation ist erlaubt)
4. THE Canvas_View SHALL den Read-Only-Status visuell anzeigen (z.B. Hinweistext oder dezentes Badge)

