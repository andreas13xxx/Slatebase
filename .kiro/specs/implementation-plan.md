# Implementierungsplan — Slatebase Ausstehende Features

**Stand:** Juni 2026. Die Kernfeatures sind umgesetzt (Vaults, Editor, Auth, Chat, Sync, MCP, Graph v2, Search, Realtime, Plugins, Feature Toggles, Mermaid, Command Palette, Unified Settings, Welcome Vault, Preferences, Keyboard Shortcuts). Es verbleiben 13 ausstehende Features in unterschiedlichen Reifegraden.

**Strategie:** Hybrid — Features mit bestehender Spec direkt umsetzen, komplexe Features erst vollständig spezifizieren.

---

## Abgeschlossen (Referenz)

| # | Spec | Status |
|---|------|--------|
| 1 | `slatebase-mvp` | ✅ Fertig |
| 2 | `persistent-vault-management` | ✅ Fertig |
| 3 | `tabbed-editor-viewer` | ✅ Fertig |
| 4 | `auth-and-user-management` | ✅ Fertig |
| 5 | `advanced-file-operations` | ✅ Fertig |
| 6 | `user-chat` | ✅ Fertig |
| 7 | `chat-enhancements` | ✅ Fertig |
| 8 | `chat-list-refresh-fix` | ✅ Fertig |
| 9 | `vault-sync` | ✅ Fertig ⚠️ experimental |
| 10 | `obsidian-markdown-compat` | ✅ Fertig (Wikilinks, Embeds, Callouts, Tags) |
| 11 | `mcp-context-server` | ✅ Fertig |
| 12 | `context-panel` | ✅ Fertig |
| 13 | `knowledge-graph` | ✅ Fertig |
| 14 | `obsidian-plugin-compat` | ✅ Fertig ⚠️ experimental |
| 15 | `mermaid-rendering` | ✅ Fertig |
| 16 | `feature-toggles` | ✅ Fertig |
| 17 | `session-expiry-fix` | ✅ Fertig |
| 18 | `ci-cd-release` | ✅ Fertig |
| 19 | `realtime-infrastructure` | ✅ Fertig |
| 20 | `search-and-discovery` (Phase 1) | ✅ Fertig |
| 21 | `tier2-daily-workflow` | ✅ Fertig |
| 22 | `login-version-display` | ✅ Fertig |
| 23 | `welcome-vault` | ✅ Fertig (multi-language DE/EN) |
| 24 | `realtime-cleanup` | ✅ Fertig |
| 25 | `knowledge-graph-v2` | ✅ Fertig |
| 26 | `unified-settings` | ✅ Fertig |
| 27 | `presence-indicator-fix` | ✅ Fertig |
| 28 | `command-palette-builtin` | ✅ Fertig |
| 29 | `user-preferences-persistence` | ✅ Fertig |
| 30 | `vault-config` | ✅ Fertig |
| 31 | `configurable-keybindings` | ✅ Fertig |

---

## Ausstehende Features — Umsetzungsreihenfolge

| Prio | Spec | Tier | Aufwand | Status |
|------|------|------|---------|--------|
| 1 | Block References | A | ~8–12h | Spec vorhanden (Tasks 12.1–12.8 in `obsidian-markdown-compat`) |
| 2 | Sync Conflict Resolution | B | ~14–18h | Requirements vorhanden |
| 3 | Obsidian Canvas | B | ~30–40h | Spec vorhanden (vollständig) |
| 4 | Workspace Leaf Compat | C | ~20–30h | Requirements vorhanden |
| 5 | Obsidian Themes | C | ~15–20h | Geplant (keine Spec) |
| 6 | Public Sharing | C | ~15–20h | Geplant (keine Spec) |
| 7 | Live Preview Editor | D | ~48–68h | Geplant (keine Spec) |
| 8 | Semantische Suche / AI-Embeddings | D | ~38–58h | Geplant (keine Spec) |
| 9 | Server-Side Plugins | D | ~48–68h | Tasks vorhanden |
| 10 | Security Hardening | E | ~20–30h | Geplant (keine Spec) |
| 11 | Accessibility Audit | E | ~24–34h | Geplant (keine Spec) |
| 12 | Responsive/Mobile | E | ~24–34h | Geplant (keine Spec) |
| 13 | Collaborative Editing | F | ~68–88h | Requirements vorhanden |

---

## Abhängigkeiten zwischen Specs

```
slatebase-overview (Architektur-Grundlage)
└── slatebase-mvp ✅
      ├── persistent-vault-management ✅
      ├── tabbed-editor-viewer ✅
      │     ├── advanced-file-operations ✅
      │     ├── tier2-daily-workflow ✅ (Editor, Explorer, Trash, Versioning)
      │     ├── live-preview-editor (braucht Editor-Infrastruktur)
      │     └── collaborative-editing (braucht Editor + Realtime)
      ├── auth-and-user-management ✅
      │     ├── user-chat ✅ → chat-enhancements ✅
      │     ├── vault-sync ✅ → sync-conflict-resolution
      │     ├── mcp-context-server ✅
      │     ├── unified-settings ✅
      │     ├── welcome-vault ✅
      │     └── public-sharing (braucht Auth + Rendering)
      ├── obsidian-markdown-compat ✅
      │     ├── Block References (erweitert Wikilink/Embed-Syntax)
      │     ├── context-panel ✅
      │     ├── knowledge-graph ✅ → knowledge-graph-v2 ✅
      │     ├── mermaid-rendering ✅
      │     ├── obsidian-canvas (braucht Markdown-Rendering für Text-Nodes)
      │     └── obsidian-plugin-compat ✅
      │           ├── workspace-leaf-compat (braucht Plugin-Infra + Tab-System)
      │           ├── server-side-plugins (braucht Plugin-Store + Registry)
      │           └── obsidian-themes (braucht Plugin-Store + CSS-Injection)
      ├── realtime-infrastructure ✅
      │     └── collaborative-editing (braucht SSE/WebSocket + Editor)
      ├── search-and-discovery ✅ (Phase 1)
      │     └── semantische-suche (Phase 2: Embeddings, Vector Store)
      ├── feature-toggles ✅ (querschnittlich)
      ├── ci-cd-release ✅ (DevOps, unabhängig)
      ├── security-hardening (querschnittlich, Backend + Frontend)
      ├── accessibility-audit (querschnittlich, alle UI-Komponenten)
      └── responsive-mobile (querschnittlich, alle UI-Komponenten)
```

---

## Parallelisierbare Tracks

```
Track A (Markdown):    Block References → Live Preview Editor
Track B (Canvas):      Obsidian Canvas (unabhängig nach obsidian-markdown-compat ✅)
Track C (Sync):        Sync Conflict Resolution (unabhängig nach vault-sync ✅)
Track D (Plugins):     Workspace Leaf Compat → Obsidian Themes → Server-Side Plugins
Track E (Sharing):     Public Sharing (unabhängig)
Track F (AI):          Semantische Suche (unabhängig)
Track G (Polish):      Security Hardening → Accessibility Audit → Responsive/Mobile
Track H (Collab):      Collaborative Editing (braucht Live Preview Editor oder zumindest Editor-Stabilität)
```

---

## Tier A: Markdown-Erweiterungen (Spec vorhanden, direkt umsetzbar)

---

### Task 1: Block References

Scope: ~8–12h. Erweitert bestehende `obsidian-markdown-compat` Spec (Requirements 17–21).

**Spec:** `.kiro/specs/obsidian-markdown-compat/` (Tasks 12.1–12.8)

**Zusammenfassung:**

- **Block-Marker-Parser**: `^block-id` am Ende von Absätzen/Listen/Headings erkennen und als Node-Metadaten speichern
- **Wikilink-Erweiterung**: `[[Seite#^block-id]]` und `[[#^block-id]]` Syntax parsen und rendern
- **Embed-Erweiterung**: `![[Seite#^block-id]]` Syntax parsen und einzelnen Block inline einbetten
- **Rendering**: Navigation zu Block-Ankern, Broken-Link-Styling bei nicht-gefundenen Blocks
- **Link-Index**: Block-Referenzen als Kanten im Graph erfassen, Backlinks mit Block-Info

**Abhängigkeiten:** Baut auf bestehenden Wikilink/Embed-Plugins auf (bereits implementiert).

**Demo:** `[[Notiz#^abc123]]` verlinkt direkt zu einem spezifischen Absatz. `![[Notiz#^abc123]]` bettet nur diesen einen Block inline ein.

---

## Tier B: Visuelle Features (Spec vorhanden)

---

### Task 2: Sync Conflict Resolution

Scope: ~4h Design, ~10–14h Implementierung.

**Spec:** `.kiro/specs/sync-conflict-resolution/`

**Zusammenfassung:**

- Backend: SyncService um Konfliktkategorisierung erweitern (content/deleted/rename)
- Backend: Endpoints für Merge-Preview und Batch-Auflösung
- Frontend: ConflictWizard-Komponente (mehrstufig: Übersicht → Detail → Auflösung)
- Frontend: DiffView-Komponente (Side-by-Side + Unified, Toggle in localStorage)
- Frontend: Batch-Auflösung mit Bestätigung
- Frontend: Auto-Resolution-Konfiguration (newer_wins, remote_wins, local_wins pro Kategorie)

**Demo:** Geführter Wizard für Sync-Konflikte mit Diff-Ansicht, Batch-Aktionen und Auto-Resolution.

---

### Task 3: Obsidian Canvas

Scope: ~30–40h. Vollständige Spec vorhanden.

**Spec:** `.kiro/specs/obsidian-canvas/` (8 Task-Gruppen, ~30 Subtasks)

**Zusammenfassung:**

- **Parser/Serializer**: `.canvas`-JSON-Format (Nodes + Edges) lesen, validieren, schreiben (Round-Trip-kompatibel)
- **Canvas-View**: Interaktive SVG+HTML-Visualisierung mit Zoom/Pan/Fit-to-View
- **Node-Renderer**: Text (Markdown), File (Vorschau), Link (URL), Group (Container)
- **Edge-Renderer**: Bézier-Kurven mit Pfeilspitzen, Farben, Labels
- **Editing**: Drag & Drop, Resize, Inline-Text-Editing, Node/Edge-CRUD, Multi-Select, Copy/Paste
- **Auto-Save**: 2s Debounce, Dirty-Indikator, Fehlerbehandlung
- **Link-Index**: `.canvas` File-Nodes als Verlinkungen im Knowledge Graph
- **Read-Only-Modus**: Navigation erlaubt, keine Bearbeitung bei Nur-Lese-Rechten

**Abhängigkeiten:** Keine neuen npm-Dependencies. Nutzt bestehende ViewMode-Plugins für Markdown in Text-Nodes.

**Demo:** `.canvas`-Dateien öffnen sich als interaktives Whiteboard. Knoten erstellen, verschieben, verbinden. Auto-Save. Obsidian-kompatibles JSON-Format.

---

## Tier C: Mittelfristige Features (teilweise Spec-Erstellung nötig)

---

### Task 4: Workspace Leaf Compat

Scope: ~20–30h. Requirements vorhanden, Design + Tasks ausstehend.

**Spec:** `.kiro/specs/workspace-leaf-compat/`

**Zusammenfassung:**

- WorkspaceShim-Erweiterung: `registerView`, `getLeaf`, `getLeavesOfType`, `revealLeaf`
- ViewRegistry: Plugin-Views als Tabs im Hauptbereich oder Sections im Context Panel
- ItemView-Basisklasse (Obsidian-kompatibel)
- Tab-Integration: Plugin-Views als eigenständige Tab-Typen
- Compatibility-Analyzer-Update: Leaf-API-Nutzung erkennen

**Abhängigkeiten:** Braucht `obsidian-plugin-compat` ✅ (WorkspaceShim, Plugin-Loader, Tab-System) + `context-panel` ✅ (für Sidebar-Views).

**Demo:** Populäre Plugins wie Calendar, Kanban und Excalidraw können ihre Custom Views in Slatebase als Tabs oder Sidebar-Panels anzeigen.

---

### Task 5: Obsidian Themes

Scope: ~15–20h. Keine Spec vorhanden.

**Vorarbeit:** Spec erstellen (CSS-Variable-Mapping, Theme-Loader, Theme-Store).

**Zusammenfassung:**

- CSS-Variable-Mapping: Obsidians ~200 `--color-*` Tokens auf Slatebase Design Tokens mappen
- Theme-Loader: CSS-Datei aus Plugin-Verzeichnis laden und injizieren (scoped)
- Theme-Auswahl in Settings (Dark/Light-Varianten)
- Theme-Vorschau (Live-Anwendung ohne Speichern)
- Community-Theme-Erkennung aus `.obsidian/themes/` bei Import

**Abhängigkeiten:** Braucht `obsidian-plugin-compat` ✅ (Plugin-Store für Theme-Dateien) + `unified-settings` ✅ (Theme-Auswahl-UI).

**Hinweis:** Hauptaufwand ist das CSS-Variable-Mapping — Obsidian hat ~200 Custom Properties die auf Slatebase Design Tokens abgebildet werden müssen.

---

### Task 6: Public Sharing

Scope: ~4h Design + ~15–20h Implementierung.

**Zusammenfassung:**

- Öffentliche Share-Links für einzelne Dateien oder ganze Vaults (ohne Login)
- Token-basierter Zugang (kryptografisch sicherer Share-Token in URL)
- Read-Only-Rendering (ViewMode ohne Editor, ohne Sidebar)
- Optionale Ablaufzeit (1h, 24h, 7d, 30d, unbegrenzt)
- Optionaler Passwortschutz
- Feature-Toggle `public-sharing` (cold, default: false)
- Audit-Log: Wer hat wann welchen Share erstellt/zugegriffen
- Verwaltung: Liste aktiver Public-Links pro Vault, Widerruf jederzeit

**Abhängigkeiten:** Braucht `auth-and-user-management` ✅ + `obsidian-markdown-compat` ✅ (Rendering).

---

## Tier D: Technisch ambitionierte Features (Spec-first zwingend)

---

### Task 7: Live Preview Editor (WYSIWYG / Side-by-Side)

Scope: ~8h Design + ~40–60h Implementierung.

**Quelle:** Specs-Overview Anforderung 7.2, Product-Overview "Planned".

**Vorarbeit (zwingend):**

- Technologie-Entscheidung: CodeMirror 6 vs. ProseMirror vs. Custom-Lösung
- Design-Dokument mit:
  - Editor-Architektur (WYSIWYG vs. Side-by-Side vs. Hybrid)
  - Integration mit bestehenden remark-Plugins (Wikilinks, Embeds, Callouts, Tags, Block Refs)
  - Cursor-Position-Synchronisation zwischen Source und Preview
  - Auto-Save-Integration mit bestehendem Debounce-Mechanismus
  - Toolbar-Erweiterung (Formatierung wendet sich auf Source an)
  - Performance bei großen Dateien (virtuelles Scrolling, inkrementelles Parsing)

**Empfehlung:** Nach Block References und Canvas umsetzen. Benötigt Entscheidung ob CodeMirror/ProseMirror-Migration oder eigene Lösung auf bestehender Textarea.

---

### Task 8: Semantische Suche / AI-Embeddings

Scope: ~8h Design + ~30–50h Implementierung.

**Quelle:** Specs-Overview Anforderung 9 ("semantische Suche", "Chunking/Embedding-Pipeline").

**Vorarbeit (zwingend):**

- Technologie-Entscheidung: Embedding-Provider (Ollama lokal vs. OpenAI extern)
- Vector-Store-Wahl: In-Memory (hnswlib) vs. SQLite-FTS vs. externer Service (Qdrant)
- Design-Dokument mit:
  - Chunking-Strategie (Absatz, Heading-Section, Fixed-Size)
  - Embedding-Pipeline (Trigger bei File-Write, Batch bei Rebuild)
  - Vector-Store-Schema und Persistenz
  - Query-Flow: Keyword-Search (bestehend) → Semantic-Reranking
  - MCP-Integration: `semantic_search` Tool
  - Konfiguration: Provider, Modell, Chunk-Size als Server-Config

**Empfehlung:** Optionales Feature hinter Feature-Toggle (`semantic-search`). Lokal-First (Ollama) als Standard.

---

### Task 9: Server-Side Plugins

Scope: ~8h Design + ~40–60h Implementierung. Task-Liste existiert (7 Phasen).

**Spec:** `.kiro/specs/server-side-plugins/`

**Vorarbeit:** Design-Dokument erstellen (Sandbox-Architektur mit `vm`, Shim-Interfaces, Settings-Bridge-Protokoll).

**Phasen:**

1. Plugin-Klassifikation (statische Bundle-Analyse)
2. Server-Side Sandbox (vm.createContext, Memory/CPU Limits)
3. Plugin Runtime Manager (Lifecycle, Timer-Tracking)
4. API & Logs (Runtime-Status, Start/Stop, Log-Abruf)
5. Settings-Bridge (DOM-Serialisierung → Frontend)
6. Frontend-Integration (Status-Anzeige, Start/Stop UI)
7. Sicherheit & Hardening (Allowlist, Monitoring, Audit)

**Abhängigkeiten:** Braucht `obsidian-plugin-compat` ✅ (Plugin-Store, Registry, Installer).

**Blockiert:** IMAP-Importer, Git-Plugin, Shell Commands und andere Node.js-basierte Plugins.

**Demo:** Server-Plugins mit Node.js-APIs (tls, net, crypto, fs) können geladen, gestartet, gestoppt werden.

---

## Tier E: Polish & Plattform (querschnittlich)

---

### Task 10: Security Hardening

Scope: ~20–30h.

**Zusammenfassung:**

- OWASP-Top-10-Checkliste durcharbeiten
- Race-Condition-Analyse (parallele Requests, ETag-Validierung, Atomic-Writes prüfen)
- CSP-Header (Content Security Policy) implementieren
- Fehlende Input-Validierung identifizieren und schließen
- Dependency-Audit (npm audit, regelmäßig in CI)
- Rate-Limit-Analyse: alle Endpoints abgedeckt?
- Ergebnis: Security-Report + Fix-Backlog

**Empfehlung:** Vor v1.0 oder bei wachsender Nutzerbasis. Keine bekannten kritischen Lücken, aber systematische Prüfung ausstehend.

---

### Task 11: Accessibility Audit (WCAG 2.1 AA)

Scope: ~4h Audit + ~20–30h Fixes.

**Quelle:** Specs-Overview Anforderung 13.

**Zusammenfassung:**

- Automatisiertes Audit mit axe-core / Lighthouse (CI-Integration)
- Manuelles Testing mit Screenreader (NVDA/VoiceOver)
- Tastaturnavigation komplett durchprüfen (alle Views, Modals, Dropdowns)
- Farbkontrast-Prüfung (4.5:1 normaler Text, 3:1 großer Text)
- Fokus-Indikatoren auf allen interaktiven Elementen
- ARIA-Landmarks und Rollen vervollständigen
- Zoom-Kompatibilität (200% ohne horizontales Scrolling)
- Skip-Navigation-Links
- Ergebnis: Compliance-Report + Fix-Backlog

**Empfehlung:** Nach den visuellen Features (Canvas, Live Preview) durchführen, damit Fixes alle Komponenten abdecken.

---

### Task 12: Responsive/Mobile Layout

Scope: ~4h Design + ~20–30h Implementierung.

**Quelle:** Product-Overview "Planned: Responsive/mobile".

**Zusammenfassung:**

- Responsive Breakpoints: Mobile (<768px), Tablet (768–1024px), Desktop (>1024px)
- Sidebar als Overlay/Drawer auf Mobile (Touch-Swipe zum Öffnen)
- Tab-Leiste: Horizontales Scrolling oder Dropdown auf schmalen Screens
- Context-Panel: Unterhalb des Editors statt rechts auf Mobile
- Touch-Interaktionen: Swipe, Long-Press für Kontextmenü
- Canvas-View: Touch-Zoom/Pan (Pinch-to-Zoom)
- PWA-Manifest für Home-Screen-Installation (optional)

**Empfehlung:** Nach Accessibility Audit (a11y-Fixes gehen Hand in Hand mit responsive Design).

---

## Tier F: Langfristig (größtes Feature, separates Milestone)

---

### Task 13: Collaborative Editing

Scope: ~8h Design + ~60–80h Implementierung.

**Spec:** `.kiro/specs/collaborative-editing/` (Requirements vorhanden)

**Vorarbeit (zwingend):**

- Technologie-Entscheidung: OT vs. CRDT (Yjs? ShareDB?)
- WebSocket-Integration neben bestehendem SSE
- Design-Dokument mit:
  - Session-Management-Architektur
  - OT/CRDT-Algorithmus und Bibliothekswahl
  - Cursor-Presence-Protokoll (farbige Remote-Cursors, max 10 Teilnehmer)
  - Auto-Save-Integration mit bestehendem VaultService
  - Netzwerk-Resilienz-Strategie (lokaler Buffer bei Disconnect)

**Abhängigkeiten:** Braucht `realtime-infrastructure` ✅ + `tabbed-editor-viewer` ✅. Profitiert von `live-preview-editor` (CodeMirror-Basis erleichtert CRDT-Integration).

**Empfehlung:** Als eigenständiges Milestone nach Tier D planen. Technisch anspruchsvollstes Feature.

---

## Zusammenfassung

```
Tier A: Markdown-Erweiterungen        (~8–12h)
└── Block References

Tier B: Visuelle Features              (~44–58h)
├── Sync Conflict Resolution
└── Obsidian Canvas

Tier C: Mittelfristige Features        (~50–70h)
├── Workspace Leaf Compat
├── Obsidian Themes
└── Public Sharing

Tier D: Ambitioniert                   (~96–168h)
├── Live Preview Editor
├── Semantische Suche
└── Server-Side Plugins

Tier E: Polish & Plattform             (~64–94h)
├── Security Hardening
├── Accessibility Audit
└── Responsive/Mobile

Tier F: Langfristig                    (~68–88h)
└── Collaborative Editing
```

---

## Gesamtaufwand (Schätzung, nur verbleibende Features)

| Tier | Design | Implementierung | Gesamt |
|------|--------|-----------------|--------|
| A: Markdown | — | ~8–12h | ~8–12h |
| B: Visuelle Features | ~4h | ~40–54h | ~44–58h |
| C: Mittelfristig | ~8h | ~50–70h | ~58–78h |
| D: Ambitioniert | ~24h | ~110–170h | ~134–194h |
| E: Polish | ~8h | ~60–90h | ~68–98h |
| F: Langfristig | ~8h | ~60–80h | ~68–88h |
| **Summe** | **~52h** | **~328–476h** | **~380–528h** |

---

## Verworfene/Zurückgestellte Ideen

Kontext warum bestimmte Features NICHT geplant sind:

| Idee | Bewertung | Grund |
|------|-----------|-------|
| GitSync (Git als Sync-Backend) | 🔴 Zurückgestellt | CouchDB-Sync deckt den Use-Case ab. Hohe Komplexität (Merge-Konflikte, SSH-Keys). |
| HTML-Rendering (Raw-HTML in Markdown) | 🔴 Verworfen | XSS-Risiko. Markdown + Mermaid + Embeds decken 99% ab. |
| Offline-Modus (PWA/Service Worker) | 🔴 Zurückgestellt | Self-Hosted = Server nötig. Vault-Sync mit Obsidian-Desktop deckt Offline ab. |
| AI-Agent im Editor (Copilot) | 🔴 Zurückgestellt | MCP deckt AI-Zugang ab. Eingebauter Copilot = eigenes Produkt. |
| Kanban/Calendar als native Views | 🟡 Plugin-Lösung | Via `workspace-leaf-compat` — populäre Plugins werden direkt unterstützt. |
| Multi-Cursor / Multi-Selection | 🟡 Langfristig | Nur mit CodeMirror/ProseMirror realistisch → Teil von `live-preview-editor`. |
| Multi-Sprachen/RTL-Support | 🔴 Zurückgestellt | Spezieller Use-Case. Bei Bedarf im Rahmen von `accessibility-audit`. |

---

## Bekannte Limitierungen

### vault-sync: Push ohne Chunking (>8MB-Limit)

- **Problem**: Slatebase pusht Dateien als einzelnes `data`-Feld im CouchDB-Dokument. `max_document_size` (default 8MB) limitiert die Dateigröße.
- **Betrifft**: Nur bidirektionalen Sync bei sehr großen Einzeldateien. Pull funktioniert (Chunks werden reassembliert).
- **Workaround**: CouchDB `max_document_size` erhöhen oder große Dateien vom Sync ausschließen.
- **Langfristige Lösung**: Leaf-Dokumente erzeugen + `children`-Array verwenden (wie livesync). Aufwand: Mittel.
- **Priorität**: Niedrig — typische Vault-Dateien (Markdown, Bilder) sind weit unter 8MB.
