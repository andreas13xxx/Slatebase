# Implementierungsplan — Slatebase Ausstehende Features

**Stand:** Juli 2026 (v0.11.x). Die Kernfeatures sind umgesetzt (Vaults, Editor, Auth, Chat, Sync mit Conflict-Resolution-Wizard, MCP, Graph v2, Search, Realtime, Plugins, Feature Toggles, Mermaid, Command Palette, Unified Settings, Welcome Vault v2, Preferences, Keyboard Shortcuts, Obsidian Canvas, Block References, Workspace Leaf Compat, Status Bar). Es verbleiben 9 ausstehende Features in unterschiedlichen Reifegraden.

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
| 32 | `obsidian-canvas` | ✅ Fertig (Parser, Node-/Edge-Renderer, Editing, Auto-Save, Minimap, Source-View; inkl. Link/File-Node-Interaktion + Datei-Suche im Pfad-Editor) |
| 33 | `block-references` | ✅ Fertig (Block-Marker-Parser, Wikilink/Embed-Erweiterung, Rendering, Link-Index) |
| 34 | `sync-conflict-resolution` | ✅ Fertig (Conflict Wizard, Auto-Resolution, Batch, DiffView, SSE-Live-Updates) |
| 35 | `workspace-leaf-compat` | ✅ Fertig (ViewRegistry, WorkspaceLeaf, ItemView, TabViewBridge, Plugin-Views als Tabs + Sidebar-Sections) |
| 36 | `status-bar` | ✅ Fertig (StatusBar-Komponente, Uhr, Settings-Toggle, Design Tokens, erweiterbar für Plugins) |
| 37 | `welcome-vault-v2` | ✅ Fertig (Backend-API, Frontend-UI, 35+ Guides DE/EN, Screenshots, Vorlagen, Praxis-Übungen, Command Palette, Settings-Button) |

---

## Ausstehende Features — Umsetzungsreihenfolge

| Prio | Spec | Track | Aufwand | Status |
|------|------|-------|---------|--------|
| 1 | Obsidian Themes | B | ~15–20h | Geplant (keine Spec) |
| 2 | Public Sharing | C | ~15–20h | Geplant (keine Spec) |
| 3 | Live Preview Editor | D | ~48–68h | Geplant (keine Spec) |
| 4 | Semantische Suche / AI-Embeddings | E | ~38–58h | Geplant (keine Spec) |
| 5 | Server-Side Plugins | B | ~48–68h | Tasks vorhanden |
| 6 | Security Hardening | F | ~20–30h | Geplant (keine Spec) |
| 7 | Accessibility Audit | F | ~24–34h | Geplant (keine Spec) |
| 8 | Responsive/Mobile | F | ~24–34h | Geplant (keine Spec) |
| 9 | Collaborative Editing | D | ~68–88h | Requirements vorhanden |

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
      │     ├── vault-sync ✅ → sync-conflict-resolution ✅
      │     ├── mcp-context-server ✅
      │     ├── unified-settings ✅
      │     ├── welcome-vault ✅
      │     │     └── welcome-vault-v2 ✅
      │     └── public-sharing (braucht Auth + Rendering)
      ├── obsidian-markdown-compat ✅
      │     ├── Block References ✅
      │     ├── context-panel ✅
      │     ├── knowledge-graph ✅ → knowledge-graph-v2 ✅
      │     ├── mermaid-rendering ✅
      │     ├── obsidian-canvas ✅ (braucht Markdown-Rendering für Text-Nodes)
      │     └── obsidian-plugin-compat ✅
      │           ├── workspace-leaf-compat ✅ (Plugin-Views als Tabs/Sidebar)
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
Track A (Docs):        Welcome Vault v2 ✅
Track B (Plugins):     Obsidian Themes → Server-Side Plugins
Track C (Sharing):     Public Sharing (unabhängig)
Track D (Editor):      Live Preview Editor → Collaborative Editing
Track E (AI):          Semantische Suche (unabhängig)
Track F (Polish):      Security Hardening → Accessibility Audit → Responsive/Mobile
```

---

## Prio 1 — Obsidian Themes (Track B)

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

## Prio 2 — Public Sharing (Track C)

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

## Prio 3 — Live Preview Editor (Track D)

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

**Empfehlung:** Block References und Canvas sind abgeschlossen. Benötigt Entscheidung ob CodeMirror/ProseMirror-Migration oder eigene Lösung auf bestehender Textarea.

---

## Prio 4 — Semantische Suche / AI-Embeddings (Track E)

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

## Prio 5 — Server-Side Plugins (Track B)

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

## Prio 6 — Security Hardening (Track F)

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

## Prio 7 — Accessibility Audit (Track F)

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

## Prio 8 — Responsive/Mobile (Track F)

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

## Prio 9 — Collaborative Editing (Track D)

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

**Empfehlung:** Als eigenständiges Milestone nach Track F (Polish) planen. Technisch anspruchsvollstes Feature.

---

## Zusammenfassung nach Tracks

```
Track A (Docs):      Prio 1: Welcome Vault v2                    (~34–45h)
Track B (Plugins):   Prio 2: Obsidian Themes → Prio 6: Server-Side Plugins  (~63–88h)
Track C (Sharing):   Prio 3: Public Sharing                      (~15–20h)
Track D (Editor):    Prio 4: Live Preview Editor → Prio 10: Collaborative Editing  (~116–156h)
Track E (AI):        Prio 5: Semantische Suche                   (~38–58h)
Track F (Polish):    Prio 7–9: Security → Accessibility → Mobile (~68–98h)
```

---

## Gesamtaufwand (Schätzung, nur verbleibende Features)

| Track | Design | Implementierung | Gesamt |
|-------|--------|-----------------|--------|
| A: Docs | — | ~34–45h | ~34–45h |
| B: Plugins | ~4h | ~63–88h | ~67–92h |
| C: Sharing | ~4h | ~15–20h | ~19–24h |
| D: Editor | ~16h | ~100–140h | ~116–156h |
| E: AI | ~8h | ~30–50h | ~38–58h |
| F: Polish | ~8h | ~60–90h | ~68–98h |
| **Summe** | **~40h** | **~302–433h** | **~342–473h** |

---

## Verworfene/Zurückgestellte Ideen

Kontext warum bestimmte Features NICHT geplant sind:

| Idee | Bewertung | Grund |
|------|-----------|-------|
| GitSync (Git als Sync-Backend) | 🔴 Zurückgestellt | CouchDB-Sync deckt den Use-Case ab. Hohe Komplexität (Merge-Konflikte, SSH-Keys). |
| HTML-Rendering (Raw-HTML in Markdown) | 🔴 Verworfen | XSS-Risiko. Markdown + Mermaid + Embeds decken 99% ab. |
| Offline-Modus (PWA/Service Worker) | 🔴 Zurückgestellt | Self-Hosted = Server nötig. Vault-Sync mit Obsidian-Desktop deckt Offline ab. |
| AI-Agent im Editor (Copilot) | 🔴 Zurückgestellt | MCP deckt AI-Zugang ab. Eingebauter Copilot = eigenes Produkt. |
| Kanban/Calendar als native Views | ✅ Plugin-Lösung | Via `workspace-leaf-compat` ✅ — populäre Plugins werden direkt unterstützt. |
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
