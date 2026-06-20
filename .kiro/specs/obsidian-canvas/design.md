# Design Document

## Overview

Obsidian Canvas Support für Slatebase. Liest, rendert und bearbeitet `.canvas`-Dateien (JSON-basiertes Whiteboard-Format). Die Architektur folgt dem bewährten Muster: Backend stellt die Datei als JSON bereit, Frontend übernimmt Parsing, Rendering und Editing. Keine neue Backend-Logik außer Link-Index-Integration.

## Architecture

### Systemübersicht

```
┌───────────────────────────────────────────────────────┐
│ Frontend                                              │
│                                                       │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────┐  │
│  │CanvasParser │──▶│CanvasState   │──▶│CanvasView│  │
│  │(JSON→Model) │   │(useReducer)  │   │(SVG+HTML)│  │
│  └─────────────┘   └──────────────┘   └──────────┘  │
│         ▲                  │                  │       │
│         │                  ▼                  ▼       │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────┐  │
│  │CanvasSerial.│◀──│ AutoSave     │   │ Toolbar  │  │
│  │(Model→JSON) │   │ (2s debounce)│   │ (CRUD)   │  │
│  └─────────────┘   └──────────────┘   └──────────┘  │
└───────────────────────────────────────────────────────┘
         │                                      ▲
         ▼                                      │
┌───────────────────────────────────────────────────────┐
│ Backend                                               │
│  VaultService.readFile() / writeFile()                │
│  LinkIndexService (canvas file-node extraction)       │
└───────────────────────────────────────────────────────┘
```

### Komponenten

1. **CanvasParser** (`frontend/src/canvas/parser.ts`)
   - Zod-Schema-Validierung des Canvas-JSON
   - Forward-compatible: unbekannte Felder werden durchgereicht (passthrough)
   - Erzeugt typsichere `CanvasDocument`-Struktur

2. **CanvasSerializer** (`frontend/src/canvas/serializer.ts`)
   - Konvertiert internes Modell zurück zu Obsidian-kompatiblem JSON
   - Bewahrt unbekannte Properties (Round-Trip)
   - Stabile JSON-Formatierung (sortierte Keys für minimales Git-Diff)

3. **CanvasState** (`frontend/src/state/canvasState.ts`)
   - `useReducer`-basiert (analog zu anderen Providern)
   - Actions: `MOVE_NODE`, `RESIZE_NODE`, `ADD_NODE`, `DELETE_NODES`, `UPDATE_NODE_TEXT`, `ADD_EDGE`, `DELETE_EDGES`, `SELECT_NODES`, `SET_VIEWPORT`
   - Undo/Redo-Stack (max 50 Einträge)

4. **CanvasView** (`frontend/src/components/CanvasView.tsx`)
   - SVG-Layer für Edges + Grid
   - HTML-Layer (foreignObject oder absolute Positioned Divs) für Nodes
   - Zoom/Pan via CSS Transform auf Container
   - Orchestriert Node/Edge-Komponenten

5. **CanvasNode-Komponenten**
   - `TextNodeRenderer` — Markdown-Rendering innerhalb (nutzt ViewMode-Logik)
   - `FileNodeRenderer` — Datei-Vorschau + Click-to-Open
   - `LinkNodeRenderer` — URL-Display + External-Link-Icon
   - `GroupNodeRenderer` — Hintergrund-Rect mit Label

6. **CanvasEdge-Komponente**
   - Bézier-Pfad-Berechnung basierend auf Ankerpunkten
   - Pfeilspitzen via SVG-Marker
   - Selection-Highlight-State

7. **LinkIndex-Integration** (`backend/src/link-index/`)
   - `canvas-parser.ts` — Extrahiert `file`-Node-Referenzen aus `.canvas`-JSON
   - Integration in `link-index-service.ts` (beim Rebuild und bei inkrementellen Updates)

## Components and Interfaces

### ICanvasParser

```typescript
interface ICanvasParser {
  parse(json: string): CanvasParseResult;
  serialize(doc: CanvasDocument): string;
}

interface CanvasParseResult {
  success: boolean;
  document?: CanvasDocument;
  errors?: CanvasValidationError[];
}
```

### CanvasDocument (Datenmodell)

```typescript
interface CanvasDocument {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  _unknown?: Record<string, unknown>; // Round-Trip für unbekannte Top-Level-Felder
}

type CanvasNode = TextNode | FileNode | LinkNode | GroupNode;

interface BaseNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string; // "1"–"6" oder Hex
  _unknown?: Record<string, unknown>;
}

interface TextNode extends BaseNode {
  type: 'text';
  text: string;
}

interface FileNode extends BaseNode {
  type: 'file';
  file: string; // Vault-relative Pfad
  subpath?: string; // #heading oder #^block-id
}

interface LinkNode extends BaseNode {
  type: 'link';
  url: string;
}

interface GroupNode extends BaseNode {
  type: 'group';
  label?: string;
  background?: string;
  backgroundStyle?: 'cover' | 'ratio' | 'exact';
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide: 'top' | 'right' | 'bottom' | 'left';
  fromEnd?: 'none' | 'arrow';
  toNode: string;
  toSide: 'top' | 'right' | 'bottom' | 'left';
  toEnd?: 'none' | 'arrow';
  color?: string;
  label?: string;
  _unknown?: Record<string, unknown>;
}
```

### CanvasView Props

```typescript
interface CanvasViewProps {
  vaultId: string;
  filePath: string;
  content: string; // Raw JSON
  readOnly: boolean;
  onSave: (content: string) => Promise<void>;
  onFileOpen: (path: string) => void;
}
```

## Data Models

### Canvas-JSON (Obsidian-Format, Referenz)

```json
{
  "nodes": [
    { "id": "abc123", "type": "text", "x": 0, "y": 0, "width": 400, "height": 200, "text": "# Titel\n\nInhalt" },
    { "id": "def456", "type": "file", "x": 500, "y": 0, "width": 400, "height": 200, "file": "Notizen/Projekt.md" },
    { "id": "ghi789", "type": "link", "x": 0, "y": 300, "width": 400, "height": 100, "url": "https://example.com" },
    { "id": "grp001", "type": "group", "x": -50, "y": -50, "width": 1000, "height": 500, "label": "Projektübersicht", "color": "1" }
  ],
  "edges": [
    { "id": "edge01", "fromNode": "abc123", "fromSide": "right", "toNode": "def456", "toSide": "left", "toEnd": "arrow" }
  ]
}
```

### Obsidian Color Mapping

| Obsidian Color | Token Name | Light Default | Dark Default |
|---------------|-----------|--------------|-------------|
| 1 (Rot) | `--canvas-color-1` | `#fb464c` | `#e93147` |
| 2 (Orange) | `--canvas-color-2` | `#e9973f` | `#e9973f` |
| 3 (Gelb) | `--canvas-color-3` | `#e0de71` | `#e0de71` |
| 4 (Grün) | `--canvas-color-4` | `#44cf6e` | `#44cf6e` |
| 5 (Cyan) | `--canvas-color-5` | `#53dfdd` | `#53dfdd` |
| 6 (Lila) | `--canvas-color-6` | `#a882ff` | `#a882ff` |

## Error Handling

- **Parse-Fehler**: Fehlermeldung im Tab mit Option zur Textansicht (Raw JSON)
- **Ungültige Edge-Referenzen**: Edge wird nicht gerendert, Warnung in Console
- **Fehlende Datei-Referenz**: File_Node zeigt Broken-Link-Platzhalter
- **Speicherfehler**: Toast-Notification + manueller Retry-Button
- **Zu große Canvas-Dateien** (>500 Nodes): Performance-Warnung, Optional Viewport-Culling

## Testing Strategy

1. **Unit Tests**: CanvasParser (alle Node-Typen, Validierung, Forward-Compat), CanvasSerializer (Round-Trip)
2. **Integration Tests**: CanvasView Rendering (Snapshot-Tests für SVG-Output)
3. **E2E Tests**: Drag & Drop, Zoom/Pan, Node-CRUD, Edge-Erstellung
4. **Performance Tests**: Canvas mit 200+ Nodes (Render-Zeit < 500ms)

## Performance-Überlegungen

- **Viewport-Culling**: Nodes außerhalb des sichtbaren Bereichs werden nicht gerendert (ab >100 Nodes)
- **Debounced Save**: 2s Verzögerung verhindert exzessive Schreibvorgänge
- **Lazy Markdown-Rendering**: Text_Node-Inhalt wird erst bei Sichtbarkeit gerendert
- **SVG-Optimierung**: Edges als einzelner `<path>`-Layer, nicht pro Edge ein SVG-Element
- **Memo**: Alle Node-Renderer mit `React.memo` (Position/Inhalt als Deps)

## Open Questions

1. **Rendering-Technik**: Reines SVG vs. HTML+SVG-Hybrid (foreignObject) vs. Canvas2D? → Empfehlung: HTML-Divs für Nodes (Markdown-Rendering), SVG für Edges/Grid
2. **Undo/Redo**: Eigener History-Stack oder Integration in bestehenden `useHistoryStack`?
3. **Collaborative Editing**: Canvas-Collaboration wird erst mit Task 9 (Collaborative Editing) relevant
4. **Mobile Touch**: Priorität für Touch-Gesten? (niedrig, da Desktop-fokussiert)

