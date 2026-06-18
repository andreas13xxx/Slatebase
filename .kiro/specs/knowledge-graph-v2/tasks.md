# Implementation Plan: Knowledge Graph V2

## Overview

Erweiterung des Knowledge Graphs um Konfigurierbarkeit (Farben, Layout-Parameter), Tag-Nodes und Property-Nodes. Die Implementierung erweitert den bestehenden LinkIndexService, die Graph-API und die GraphView-Komponente. Neue Dateien: Tag-Extractor, Property-Extractor, GraphConfig, GraphSettingsPanel.

## Tasks

- [x] 1. Backend: Tag- und Property-Extraction Utilities
  - [x] 1.1 Refactor Tag-Extraction in eigene Utility
    - Create `backend/src/link-index/tag-extractor.ts`
    - Refactor bestehende `extractTagsFromContent()` aus `graphRoutes.ts` in diese Datei
    - Funktion: `extractTags(content: string): string[]` — extrahiert Tags ohne `#`-Prefix
    - Ignoriert Tags in fenced/indented Code-Blöcken und inline Code
    - Unterstützt verschachtelte Tags (`#projekt/alpha`)
    - Export über `backend/src/link-index/index.ts` Barrel
    - _Requirements: 3.5, 5.5_

  - [x] 1.2 Implement Property-Extraction Utility
    - Create `backend/src/link-index/property-extractor.ts`
    - Funktion: `extractProperties(content: string): Record<string, string[]>`
    - Parst YAML-Frontmatter (zwischen `---` Fences)
    - Extrahiert einfache String/Number-Werte und String-Arrays
    - Überspringt komplexe verschachtelte Objekte (nur top-level Keys)
    - Konvertiert alle Werte zu Strings (Numbers → String-Representation)
    - Gibt leeres Objekt zurück bei fehlendem/ungültigem Frontmatter (kein Throw)
    - Export über Barrel
    - _Requirements: 4.6, 5.5_

  - [x] 1.3 Write unit tests for Tag-Extractor
    - Test: einfache Tags (`#tag` → `["tag"]`)
    - Test: verschachtelte Tags (`#projekt/alpha` → `["projekt/alpha"]`)
    - Test: Tags in Code-Blöcken werden ignoriert
    - Test: Tags in inline Code werden ignoriert
    - Test: Heading-`#` wird nicht als Tag erkannt
    - Test: leerer Input → leeres Array
    - Test: Duplikate werden dedupliziert
    - _Requirements: 3.5_

  - [x] 1.4 Write unit tests for Property-Extractor
    - Test: einfache String-Property (`status: aktiv` → `{status: ["aktiv"]}`)
    - Test: Number-Property (`priority: 3` → `{priority: ["3"]}`)
    - Test: Array-Property (`tags: [a, b]` → `{tags: ["a", "b"]}`)
    - Test: Nested Objects werden übersprungen
    - Test: Kein Frontmatter → leeres Objekt
    - Test: Ungültiges YAML → leeres Objekt (kein Throw)
    - Test: Leerer Frontmatter-Block → leeres Objekt
    - _Requirements: 4.6_

- [x] 2. Backend: LinkIndexService erweitern
  - [x] 2.1 Extend LinkIndexService mit Tag/Property-Speicherung
    - Neue In-Memory-Maps: `fileTags: Map<string, Set<string>>` und `fileProperties: Map<string, Map<string, string[]>>`
    - `rebuild()` erweitern: pro Datei zusätzlich `extractTags()` und `extractProperties()` aufrufen
    - `updateFile()` erweitern: Tags und Properties für die Datei aktualisieren
    - `removeFile()` erweitern: Tags und Properties der Datei entfernen
    - `renameFile()` erweitern: Tags/Properties von oldPath auf newPath übertragen
    - _Requirements: 3.5, 4.6, 5.5_

  - [x] 2.2 Extend Persistenz-Schema auf v2
    - `persist()` schreibt v2-Schema: `{ version: 2, updatedAt, forwardLinks, tags, properties }`
    - `loadFromDisk()`: Wenn `version === 1` → Tags/Properties als leere Objekte laden → Rebuild triggern
    - `loadFromDisk()`: Wenn `version === 2` → Tags/Properties aus JSON laden, Reverse-Maps aufbauen
    - `validateSchema()` anpassen für beide Versionen
    - _Requirements: 5.5_

  - [x] 2.3 Implement `getGraph()` mit GraphQueryOptions
    - Signatur erweitern: `getGraph(options?: GraphQueryOptions): GraphData`
    - Ohne Options: Rückgabe wie bisher (nur File-Nodes + Link-Edges), aber mit neuem `id`, `type`-Feld
    - Mit `includeTags: true`: Zusätzlich Tag-Nodes (`id: "tag:<name>"`, `type: "tag"`) und Tag-Edges (`type: "tag"`)
    - Mit `includePropertyKeys: [...]`: Zusätzlich Property-Nodes (`id: "prop:<key>:<value>"`, `type: "property"`) und Property-Edges (`type: "property"`)
    - Node-IDs sind unique (Property 8)
    - _Requirements: 3.2, 3.3, 3.6, 4.3, 4.4, 4.7, 5.1, 5.2, 5.3_

  - [x] 2.4 Implement `getGraphMeta()`
    - Neue Methode auf LinkIndexService
    - Aggregiert alle Tags über alle Dateien: `{ name, count }` (count = Anzahl Dateien mit diesem Tag)
    - Aggregiert alle Property-Keys über alle Dateien: `{ key, count }` (count = Anzahl Dateien mit diesem Key)
    - Sortiert jeweils absteigend nach count
    - _Requirements: 5.4_

  - [x] 2.5 Update ILinkIndex Interface und Barrel-Export
    - `GraphQueryOptions`, `GraphMeta`, `GraphNodeType` Types zu `types.ts` hinzufügen
    - `GraphNode` um `id`, `type`, optionales `path` Feld erweitern
    - `GraphEdge` um `type: 'link' | 'tag' | 'property'` erweitern
    - ILinkIndex-Interface um `getGraph(options?)` Signatur-Erweiterung und `getGraphMeta()` erweitern
    - Barrel-Export aktualisieren
    - _Requirements: 5.1, 5.4, 5.5_

  - [x] 2.6 Write unit tests for extended LinkIndexService
    - Test: rebuild extrahiert Tags und Properties korrekt
    - Test: updateFile aktualisiert Tags/Properties
    - Test: removeFile entfernt Tags/Properties
    - Test: v2 Persistenz-Round-Trip (save → load → verify)
    - Test: v1 → v2 Migration (load v1 → rebuild triggered)
    - Test: getGraph mit includeTags erzeugt korrekte Tag-Nodes + Edges
    - Test: getGraph mit includePropertyKeys erzeugt korrekte Property-Nodes + Edges
    - Test: getGraphMeta aggregiert korrekt
    - _Requirements: 3.5, 3.6, 4.6, 4.7, 5.4, 5.5_

- [x] 3. Backend: Graph-API erweitern
  - [x] 3.1 Extend GET /graph Route mit Query-Parametern
    - Query-Parameter parsen: `includeTags` (boolean), `includeProperties` (comma-separated string)
    - Zod-Validierung für Query-Parameter
    - Weiterleitung an `linkIndex.getGraph({ includeTags, includePropertyKeys })`
    - Bestehende Clients ohne Query-Parameter erhalten weiterhin das bisherige Format (mit neuem `id`/`type` Feld)
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 3.2 Implement GET /graph/meta Route
    - Neue Route: `GET /api/v1/vaults/:vaultId/graph/meta`
    - Gleiche Auth-Prüfung wie `/graph` (read/write Permission)
    - Ruft `linkIndex.getGraphMeta()` auf
    - Response: `{ tags: [{name, count}], propertyKeys: [{key, count}] }`
    - Lazy-Init: Wenn Index nicht ready → Rebuild triggern
    - _Requirements: 5.4_

  - [x] 3.3 Cleanup: Tag-Extraction aus graphRoutes entfernen
    - `extractTagsFromContent()` und Helper aus `graphRoutes.ts` entfernen
    - Bestehende `GET /vaults/:vaultId/tags` Route umbauen: nutzt `linkIndex` statt eigenes File-Scanning
    - Falls kein linkIndex vorhanden → Fallback auf altes Verhalten oder leere Response
    - _Requirements: 3.5_

  - [x] 3.4 Write unit tests for extended Graph API
    - Test: GET /graph ohne Query-Params → bisherige Response (mit id/type)
    - Test: GET /graph?includeTags=true → Tag-Nodes + Tag-Edges enthalten
    - Test: GET /graph?includeProperties=status → Property-Nodes + Edges enthalten
    - Test: GET /graph/meta → Tags und PropertyKeys mit korrekten Counts
    - Test: GET /graph/meta → 403 ohne Permission
    - Test: GET /graph/meta → 404 für unbekannten Vault
    - Test: Ungültiger Query-Parameter wird ignoriert (kein Fehler)
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 4. Frontend: GraphConfig und API Client
  - [x] 4.1 Implement GraphConfig (localStorage-Persistierung)
    - Create `frontend/src/components/graph-config.ts`
    - Interfaces: `GraphColorConfig`, `GraphLayoutConfig`, `GraphNodeConfig`, `GraphConfig`
    - `DEFAULT_GRAPH_CONFIG` mit Design-Token-Werten
    - `loadGraphConfig(): GraphConfig` — lädt aus localStorage, validiert, Fallback auf Defaults
    - `saveGraphConfig(config: GraphConfig): void` — speichert in localStorage
    - `resetGraphConfig(): void` — entfernt localStorage-Eintrag
    - Key: `slatebase-graph-config`
    - _Requirements: 1.4, 1.5, 2.3_

  - [x] 4.2 Extend IApiClient und ApiClient
    - `getGraph(vaultId, options?)` Signatur erweitern: optionale `{ includeTags?: boolean; includeProperties?: string[] }`
    - Implementierung: Query-String aus Options aufbauen
    - Neue Methode: `getGraphMeta(vaultId: string): Promise<GraphMeta>`
    - `GraphMeta` Type zu `frontend/src/types.ts` hinzufügen
    - `GraphNode` Type erweitern: `id`, `type`, optionales `path`
    - `GraphEdge` Type erweitern: `type: 'link' | 'tag' | 'property'`
    - _Requirements: 5.1, 5.4_

  - [x] 4.3 Write unit tests for GraphConfig
    - Test: loadGraphConfig mit leerem localStorage → Defaults
    - Test: saveGraphConfig → loadGraphConfig Round-Trip
    - Test: resetGraphConfig → nächster Load gibt Defaults
    - Test: korruptes JSON in localStorage → Defaults (kein Throw)
    - Test: Partial Config (fehlende Keys) → Defaults für fehlende Keys
    - _Requirements: 1.4, 1.5_

- [x] 5. Frontend: GraphSettingsPanel
  - [x] 5.1 Implement GraphSettingsPanel Component
    - Create `frontend/src/components/GraphSettingsPanel.tsx`
    - Create `frontend/src/components/GraphSettingsPanel.css`
    - Collapsible Panel (Toggle-Button mit Settings-Icon)
    - Sektion "Farben": 6 Color-Picker (`<input type="color">`) mit Labels (Datei, Unresolved, Tag, Property, Kanten, Hervorhebung)
    - Sektion "Layout": 4 Slider (`<input type="range">`) mit numerischer Wert-Anzeige (Abstoßung, Anziehung, Distanz, Schwerkraft)
    - Sektion "Knotentypen": Toggle "Tags anzeigen", Toggle "Properties anzeigen" + Property-Key-Multi-Select
    - "Zurücksetzen"-Button
    - Props: `config`, `meta`, `onConfigChange`, `onReset`
    - Accessibility: Labels, aria-attributes für Slider
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.4, 3.1, 4.1, 4.2_

  - [x] 5.2 Write unit tests for GraphSettingsPanel
    - Test: Render mit Default-Config zeigt korrekte Werte
    - Test: Color-Picker Änderung ruft onConfigChange auf
    - Test: Slider Änderung ruft onConfigChange mit korrektem Wert auf
    - Test: Toggle Tags ruft onConfigChange auf
    - Test: Zurücksetzen-Button ruft onReset auf
    - Test: Property-Keys aus Meta werden als Checkboxen angezeigt
    - Test: Panel ist collapsible (toggle open/close)
    - _Requirements: 1.1, 1.2, 1.3, 2.1_

- [x] 6. Frontend: GraphView erweitern
  - [x] 6.1 Integrate GraphConfig in GraphView
    - GraphConfig beim Mount laden (`loadGraphConfig()`)
    - State: `config: GraphConfig` mit `setConfig` Handler
    - Config-Änderungen via `onConfigChange` → State updaten + `saveGraphConfig()`
    - Farben als inline-styles auf SVG-Elemente anwenden (statt nur CSS-Token)
    - Bei Farb-Änderung: kein Re-Fetch, nur Re-Render
    - _Requirements: 1.3, 1.4_

  - [x] 6.2 Integrate Layout-Parameter in d3-force Simulation
    - Force-Simulation mit Config-Werten initialisieren: `forceManyBody().strength(-config.layout.repulsion)`, `forceLink().distance(config.layout.linkDistance).strength(config.layout.linkStrength)`, `forceCenter().strength(config.layout.centerGravity)`
    - Bei Layout-Parameter-Änderung: `simulation.force(...)` updaten → `simulation.alpha(0.5).restart()`
    - _Requirements: 2.1, 2.2_

  - [x] 6.3 Implement Tag/Property-Node Rendering
    - Node-Typ-Erkennung: Switch auf `node.type` für Rendering-Unterschiede
    - Tag-Nodes: Eigene Farbe (`config.colors.tagNode`), kleinerer Basis-Radius (3px), `#`-Prefix im Label
    - Property-Nodes: Eigene Farbe (`config.colors.propertyNode`), `key:value` Label
    - Unresolved-Nodes: Farbe aus `config.colors.unresolvedNode`
    - File-Nodes: Farbe aus `config.colors.fileNode`
    - _Requirements: 3.3, 4.5_

  - [x] 6.4 Implement Tag/Property-Node Click-Behavior
    - Click auf Tag-Node: Alle verbundenen File-Nodes hervorheben (Edges + Nodes in Accent-Farbe, Rest dimmen)
    - Click auf Property-Node: Gleiches Verhalten wie Tag-Click
    - Kein Tab-Öffnen für Tag/Property-Nodes
    - Second Click oder Click auf Background: Highlight aufheben
    - _Requirements: 3.4, 4.5_

  - [x] 6.5 Implement Toggle-basiertes Data-Fetching
    - Wenn `config.nodes.showTags` geändert wird → neuer API-Call mit `includeTags`
    - Wenn `config.nodes.showProperties` oder `selectedPropertyKeys` geändert → neuer API-Call mit `includeProperties`
    - Loading-State während Re-Fetch (partielle Anzeige: bestehende Nodes bleiben, neue werden hinzugefügt)
    - Toggle-Off: Tag/Property-Nodes sofort aus lokaler GraphData entfernen (kein API-Call nötig für Entfernung)
    - _Requirements: 3.1, 3.7, 4.1, 4.8_

  - [x] 6.6 Integrate GraphSettingsPanel in GraphView
    - GraphSettingsPanel als Kind-Komponente im Graph-Container rendern
    - Meta-Daten via `apiClient.getGraphMeta()` laden (einmalig beim Panel-Öffnen)
    - Config-Änderungen an GraphView-State durchreichen
    - Reset-Handler: `resetGraphConfig()` → Config auf Defaults setzen → Re-Render
    - _Requirements: 1.1, 1.5, 5.4_

  - [x] 6.7 Update GraphView für neues GraphNode-Schema
    - `node.path` → `node.id` als Identifier im SimNode
    - File-Öffnung: `node.path ?? node.id` verwenden (nur für type 'file')
    - filterNodes-Utility anpassen: sucht in `label` (unverändert)
    - computeNodeSize: berücksichtigt Typ (Tag/Property-Nodes haben kleineren Basis-Radius)
    - _Requirements: 5.1_

  - [x] 6.8 Write unit tests for extended GraphView
    - Test: Tag-Nodes werden mit korrekter Farbe und Label gerendert
    - Test: Property-Nodes werden mit korrekter Farbe und Label gerendert
    - Test: Click auf Tag-Node öffnet keinen Tab, hebt verbundene Nodes hervor
    - Test: Config-Änderung (Farbe) rendert SVG mit neuer Farbe
    - Test: Config-Änderung (Layout) startet Simulation neu
    - Test: Toggle Tags → API-Call mit includeTags=true
    - Test: Toggle Tags off → Tag-Nodes werden entfernt (kein API-Call)
    - _Requirements: 1.3, 2.2, 3.3, 3.4, 3.7_

- [x] 7. Frontend: CSS Design Tokens erweitern
  - [x] 7.1 Add new Graph Tokens to index.css
    - Light Mode: `--graph-tag-node: #10b981`, `--graph-property-node: #f59e0b`
    - Dark Mode (`:root[data-theme="dark"]`): `--graph-tag-node: #34d399`, `--graph-property-node: #fbbf24`
    - Dark Mode (`@media (prefers-color-scheme: dark)`): gleiche Werte
    - _Requirements: 3.3, 4.5_

- [x] 8. Integration und Abschluss
  - [x] 8.1 Backend-Build verifizieren
    - `npx tsc --noEmit` im Backend — keine Compile-Fehler
    - `npm run test` im Backend — alle Tests grün
    - _Requirements: alle_

  - [x] 8.2 Frontend-Build verifizieren
    - `npm run build` im Frontend — keine Compile-Fehler
    - `npm run test` im Frontend — alle Tests grün
    - `npm run lint` — kein Lint-Fehler
    - _Requirements: alle_

  - [x] 8.3 End-to-End Smoke-Test
    - Backend starten, Frontend starten
    - Graph-Tab öffnen → Nodes + Edges sichtbar
    - Settings-Panel öffnen → Farbe ändern → sofort sichtbar
    - Layout-Parameter ändern → Simulation reagiert
    - Tags-Toggle aktivieren → Tag-Nodes erscheinen
    - Properties-Toggle aktivieren → Property-Keys auswählbar → Property-Nodes erscheinen
    - Zurücksetzen → Default-Werte wiederhergestellt
    - _Requirements: 1.1–5.5_

## Notes

- Bestehende `GET /vaults/:vaultId/tags` Route bleibt erhalten (wird vom Context Panel genutzt), aber intern auf LinkIndex umgestellt
- Der bestehende `GET /vaults/:vaultId/graph` Endpoint bekommt neue Felder (`id`, `type`) — bestehende Clients müssen den neuen Response-Shape verarbeiten können
- `yaml` Package ist im Frontend bereits als Dependency vorhanden (für Frontmatter-Display) — im Backend muss ggf. ein YAML-Parser ergänzt werden (oder simpler Regex-basierter Ansatz für Frontmatter)
- Property-Extraction im Backend kann das bestehende Pattern aus dem Frontend (`parseFrontmatter` in `frontend/src/components/context-panel/utils/parseFrontmatter.ts`) als Referenz nutzen
- Die `extractTagsFromContent()`-Funktion in `graphRoutes.ts` enthält bereits die Tag-Extraction-Logik — wird refactored, nicht neu geschrieben
- Backend `.js`-Extensions bei allen relativen Imports nicht vergessen
- Tag-IDs: `tag:<name>` (z.B. `tag:projekt`), Property-IDs: `prop:<key>:<value>` (z.B. `prop:status:aktiv`)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "4.1", "7.1"] },
    { "id": 1, "tasks": ["1.3", "1.4", "2.5", "4.3"] },
    { "id": 2, "tasks": ["2.1", "2.2"] },
    { "id": 3, "tasks": ["2.3", "2.4"] },
    { "id": 4, "tasks": ["2.6", "3.1", "3.2", "3.3"] },
    { "id": 5, "tasks": ["3.4", "4.2"] },
    { "id": 6, "tasks": ["5.1", "6.7"] },
    { "id": 7, "tasks": ["5.2", "6.1", "6.2", "6.3"] },
    { "id": 8, "tasks": ["6.4", "6.5", "6.6"] },
    { "id": 9, "tasks": ["6.8"] },
    { "id": 10, "tasks": ["8.1", "8.2"] },
    { "id": 11, "tasks": ["8.3"] }
  ]
}
```
