# Requirements Document

## Introduction

Der Knowledge Graph wird um Konfigurierbarkeit (Farben, Gewichte, Layout-Parameter) und neue Knotentypen (Tags und YAML-Properties) erweitert. Benutzer können das visuelle Erscheinungsbild des Graphen anpassen und über Toggles steuern ob Tags und Properties als eigene Knoten im Graph erscheinen. Dies ermöglicht reichhaltigere Wissensstrukturen jenseits reiner Datei-Verlinkungen.

## Glossary

- **Graph_Config**: Benutzerspezifische Einstellungen für die Darstellung des Knowledge Graphs (Farben, Gewichte, aktive Knotentypen)
- **Tag_Node**: Ein Knoten im Graph der einen Tag repräsentiert (z.B. `#projekt`), verbunden mit allen Dateien die diesen Tag enthalten
- **Property_Node**: Ein Knoten im Graph der einen YAML-Frontmatter-Property-Wert repräsentiert (z.B. `status: aktiv`), verbunden mit allen Dateien die diese Property haben
- **Node_Type**: Klassifikation eines Knotens — `file` (existierende Datei), `unresolved` (referenzierte aber nicht existierende Datei), `tag`, `property`
- **Force_Weight**: Die Stärke der Anziehung/Abstoßung im Force-Layout, beeinflusst den Abstand zwischen Nodes
- **Graph_Settings_Panel**: Ein Einstellungsbereich im Graph-Tab der die Konfigurationsoptionen bereitstellt

## Requirements

### Requirement 1: Graph-Darstellung konfigurierbar

**User Story:** Als Benutzer möchte ich die Farben und visuellen Parameter des Knowledge Graphs anpassen können, damit der Graph meinen Vorlieben und meinem Workflow entspricht.

#### Acceptance Criteria

1. THE Graph_Settings_Panel SHALL folgende Farbeinstellungen pro Knotentyp bereitstellen: Füllfarbe für `file`-Nodes, Füllfarbe für `unresolved`-Nodes, Füllfarbe für `tag`-Nodes, Füllfarbe für `property`-Nodes, Edge-Farbe, Hervorhebungsfarbe (Hover/Suche)
2. THE Graph_Settings_Panel SHALL einen Color-Picker (HTML `<input type="color">`) für jede Farbeinstellung bereitstellen, mit den aktuellen Design-Token-Werten als Standard
3. WHEN der Benutzer eine Farbe ändert, THE Graph_View SHALL die Änderung sofort (ohne Neustart der Simulation) auf den Graphen anwenden
4. THE Graph_Settings_Panel SHALL die Konfiguration pro Benutzer in `localStorage` persistieren (Key: `slatebase-graph-config`)
5. THE Graph_Settings_Panel SHALL einen "Zurücksetzen"-Button bereitstellen der alle Einstellungen auf die Design-Token-Standardwerte zurücksetzt

### Requirement 2: Layout-Parameter konfigurierbar

**User Story:** Als Benutzer möchte ich die physikalischen Parameter des Graph-Layouts anpassen können, damit ich den Graphen für verschiedene Vault-Größen optimieren kann.

#### Acceptance Criteria

1. THE Graph_Settings_Panel SHALL folgende Layout-Parameter als Slider (Range-Input) bereitstellen: Abstoßungskraft (Bereich: 50–500, Standard: 150), Anziehungskraft/Link-Stärke (Bereich: 0.1–2.0, Standard: 0.5), Link-Distanz (Bereich: 30–200, Standard: 80), Schwerkraft zum Zentrum (Bereich: 0–0.5, Standard: 0.1)
2. WHEN der Benutzer einen Layout-Parameter ändert, THE Graph_View SHALL die Force-Simulation mit den neuen Parametern neu starten
3. THE Graph_Settings_Panel SHALL die Layout-Parameter zusammen mit den Farbeinstellungen in `localStorage` persistieren
4. THE Graph_Settings_Panel SHALL neben jedem Slider den aktuellen numerischen Wert anzeigen

### Requirement 3: Tags als Knoten im Graph

**User Story:** Als Benutzer möchte ich Tags als eigene Knoten im Knowledge Graph sehen können, damit ich die thematische Struktur meiner Notizen visuell erfassen kann.

#### Acceptance Criteria

1. THE Graph_Settings_Panel SHALL einen Toggle "Tags als Knoten anzeigen" bereitstellen (Standard: aus)
2. WHEN der Toggle aktiviert ist, THE Graph_View SHALL für jeden einzigartigen Tag im Vault einen Tag_Node erstellen und diesen mit allen Dateien verbinden die den Tag enthalten
3. THE Tag_Node SHALL visuell von Datei-Knoten unterscheidbar sein: eigene Farbe (konfigurierbar, Standard: Design-Token `--graph-tag-node`), Rauten-Symbol (`#`) als Prefix im Label, kleinere Standardgröße (Radius: 3px Basis)
4. THE Tag_Node SHALL bei Klick keine Datei öffnen, sondern alle verbundenen Datei-Nodes hervorheben (Edges + Nodes der verbundenen Dateien in Akzentfarbe)
5. THE Link_Index_Service SHALL beim Index-Aufbau zusätzlich zu Wikilinks auch Tags aus jeder Markdown-Datei extrahieren und im Index speichern
6. THE Graph-API SHALL bei aktiviertem Tag-Modus zusätzliche Nodes (Typ `tag`) und Edges (Datei→Tag) in der Response zurückgeben
7. IF der Tag-Toggle deaktiviert wird, THEN THE Graph_View SHALL alle Tag_Nodes und zugehörigen Edges sofort aus dem Graph entfernen

### Requirement 4: Properties als Knoten im Graph

**User Story:** Als Benutzer möchte ich YAML-Frontmatter-Properties als Knoten im Graph sehen können, damit ich Notizen nach Metadaten-Beziehungen gruppieren und visualisieren kann.

#### Acceptance Criteria

1. THE Graph_Settings_Panel SHALL einen Toggle "Properties als Knoten anzeigen" bereitstellen (Standard: aus)
2. WHEN der Toggle aktiviert ist, THE Graph_Settings_Panel SHALL eine Auswahl bereitstellen welche Property-Keys als Knoten angezeigt werden sollen (Multi-Select aus allen im Vault vorhandenen Keys, z.B. `status`, `kategorie`, `projekt`)
3. WHEN Property-Keys ausgewählt sind, THE Graph_View SHALL für jeden einzigartigen Wert der ausgewählten Keys einen Property_Node erstellen (z.B. Key `status` mit Werten `aktiv`, `archiviert` → 2 Property_Nodes: `status:aktiv`, `status:archiviert`)
4. THE Property_Node SHALL mit allen Dateien verbunden werden deren Frontmatter den entsprechenden Key-Value-Paar enthält
5. THE Property_Node SHALL visuell unterscheidbar sein: eigene Farbe (konfigurierbar, Standard: Design-Token `--graph-property-node`), Format `key:value` als Label, Quadrat-Form oder eigene Darstellung
6. THE Link_Index_Service SHALL beim Index-Aufbau YAML-Frontmatter parsen und Property-Key-Value-Paare im Index speichern
7. THE Graph-API SHALL bei aktiviertem Property-Modus die ausgewählten Keys als Query-Parameter akzeptieren und zusätzliche Nodes (Typ `property`) und Edges (Datei→Property) zurückgeben
8. IF der Property-Toggle deaktiviert wird, THEN THE Graph_View SHALL alle Property_Nodes und zugehörigen Edges sofort entfernen

### Requirement 5: Graph-API-Erweiterung

**User Story:** Als Frontend-Entwickler möchte ich über die Graph-API konfigurieren können welche Knotentypen zurückgegeben werden, damit das Frontend nur die benötigten Daten lädt.

#### Acceptance Criteria

1. THE Graph-API SHALL optionale Query-Parameter akzeptieren: `includeTags=true|false` (Standard: false), `includeProperties=key1,key2,...` (Standard: leer/keine)
2. WHEN `includeTags=true`, THE Graph-API SHALL zusätzlich zu Datei-Nodes auch Tag-Nodes (Typ: `tag`, Label: Tag-Name ohne `#`) und Tag-Edges (source: Dateipfad, target: Tag-ID, type: `tag`) zurückgeben
3. WHEN `includeProperties` nicht leer ist, THE Graph-API SHALL für jeden angegebenen Key die Property-Nodes (Typ: `property`, Label: `key:value`) und Property-Edges (source: Dateipfad, target: Property-ID, type: `property`) zurückgeben
4. THE Graph-API SHALL eine neue Route `GET /api/v1/vaults/:vaultId/graph/meta` bereitstellen die alle im Vault vorhandenen Property-Keys (mit Häufigkeit) und alle Tags (mit Häufigkeit) zurückgibt, damit das Frontend die Auswahl-UI befüllen kann
5. THE Link_Index_Datei SHALL das erweiterte Schema mit Tags und Properties unterstützen, abwärtskompatibel (fehlende Felder = leere Arrays)
