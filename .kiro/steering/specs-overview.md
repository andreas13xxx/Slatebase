---
inclusion: manual
---

# Slatebase — Spec-Übersicht & Reihenfolge

Überblick über alle Specs, ihren Status, die Umsetzungsreihenfolge und Abhängigkeiten.

## Umsetzungsreihenfolge (chronologisch)

| # | Spec | Typ | Status | Beschreibung |
|---|------|-----|--------|--------------|
| 1 | `slatebase-overview` | Feature | ✅ Design | Gesamtarchitektur und Produktvision (nur Requirements + Design, keine Tasks) |
| 2 | `slatebase-mvp` | Feature | ✅ Fertig | Grundfunktionen: Vault-CRUD, File Explorer, Markdown Viewer, Import |
| 3 | `persistent-vault-management` | Feature | ✅ Fertig | Persistente Vault-Registry, atomare Schreiboperationen |
| 4 | `tabbed-editor-viewer` | Feature | ✅ Fertig | Tab-System, Markdown-Editor mit Auto-Save, View/Edit-Modi |
| 5 | `auth-and-user-management` | Feature | ✅ Fertig | Auth (opake Tokens, argon2id), User-CRUD, Admin-Panel, Sharing |
| 6 | `advanced-file-operations` | Feature | ✅ Fertig | Datei-/Ordner-Löschung, Umbenennung, Export (ZIP + FSA API) |
| 7 | `user-chat` | Feature | ✅ Fertig | Echtzeit-Chat zwischen Benutzern |
| 8 | `chat-enhancements` | Feature | ✅ Fertig | Unread-Badges, Archivierung, Leave-Funktion, Pagination |
| 9 | `chat-list-refresh-fix` | Bugfix | ✅ Fertig | Konversationsliste aktualisiert sich nach Senden/Tab-Wechsel |
| 10 | `vault-sync` | Feature | ✅ Fertig ⚠️ experimental | CouchDB-basierte Vault-Synchronisation — experimentell, kann zu Datenverlust führen |
| 11 | `obsidian-markdown-compat` | Feature | ✅ Fertig | Wikilinks, Embeds (Bilder, PDFs inline, Notizen), Callouts, Tags — Obsidian-kompatibles Rendering |
| 12 | `mcp-context-server` | Feature | ✅ Fertig | AI Context Server mit MCP-Integration (Lese- und Schreib-Tools für Vault-Zugriff) |
| 13 | `context-panel` | Feature | ✅ Fertig | Rechtes Seitenpanel mit Outline, Links, Tags, Properties (Tab-Navigation, Drag & Drop, Split-Sections) |
| 14 | `knowledge-graph` | Feature | ✅ Fertig | Visuelle Darstellung der Verlinkungen zwischen Notizen (interaktiver Graph mit Nodes und Edges) |
| 15 | `live-preview-editor` | Feature | 📋 Geplant | Side-by-Side oder WYSIWYG Live-Preview im Editor |
| 16 | `obsidian-plugin-compat` | Feature | ✅ Fertig ⚠️ experimental | Obsidian Community Plugin Compatibility Layer (API-Shims, Plugin-Loader, Sandbox, Verwaltungs-UI, Backend-Persistenz) — experimentell, nur browser-kompatible Plugins; serverseitige Plugins erfordern `server-side-plugins` |
| 17 | `mermaid-rendering` | Feature | ✅ Fertig | Mermaid-Diagramme in Fenced Code Blocks als SVG rendern (Dark/Light Mode, Lazy Loading, Fehlerbehandlung) |
| 18 | `accessibility-audit` | Feature | 📋 Geplant | WCAG 2.1 AA Compliance (systematischer Audit + Fixes) |
| 19 | `server-side-plugins` | Feature | 📋 Geplant | Serverseitige Ausführung von Obsidian-Plugins die Node.js-APIs benötigen (tls, net, crypto, etc.) |
| 20 | `feature-toggles` | Feature | ✅ Fertig | Zentrale Feature-Toggles in der Serverkonfiguration (vault-sync, obsidian-plugin-compat, chat, mcp, knowledge-graph) mit Admin-UI und Hot-Toggle-Support. `realtime`-Toggle wurde nachträglich entfernt (siehe `realtime-cleanup`). |
| 21 | `workspace-leaf-compat` | Feature | 📋 Requirements | Workspace Leaf API-Kompatibilität — Obsidian-Plugin-Views als Tabs im Hauptbereich und Sections im Context Panel |
| 22 | `session-expiry-fix` | Bugfix | ✅ Fertig | CSRF-Secret-Persistenz, Sliding Session Expiry, localStorage-Migration, synchroner Token-Restore, Expiry-UX, CSRF-Mismatch-Recovery |
| 23 | `editor-improvements` | Feature | ✅ Fertig | Zeilennummern, Undo/Redo, Recent Files, Templates/Daily Notes, Bild-Paste, Favoriten (umgesetzt als Teil von `tier2-daily-workflow`) |
| 24 | `vault-explorer-enhancements` | Feature | ✅ Fertig | Vault-Statistiken, Custom Context-Menu, Drag & Drop Upload (umgesetzt als Teil von `tier2-daily-workflow`) |
| 25 | `unified-settings` | Feature | ✅ Fertig | Zentrales Settings-Panel (Ctrl+,) mit Kategorien (Konto, Vault, Administration), Seitenleisten-Navigation, CSS Container Query Layout, Suche, Tastaturnavigation |
| 26 | `realtime-infrastructure` | Feature | ✅ Fertig | SSE-basierte Echtzeit-Updates (Chat-Nachrichten, Online-Status/Presence, Vault-Änderungen mit Tree-Refresh + Tab-Reload, Sync-Konflikte, Toast-Notifications, Server-Shutdown-Warnung) |
| 27 | `search-and-discovery` | Feature | ✅ Fertig | Volltextsuche + Replace (Phase 1): Vault-weite Suche mit Regex, Kontext-Zeilen, Multi-Vault, Find & Replace mit atomaren Schreiboperationen, SearchPanel als Seitenpanel |
| 28 | `responsive-mobile` | Feature | 📋 Geplant | Responsive Design für Smartphones und Tablets |
| 29 | `obsidian-themes` | Feature | 📋 Geplant | Obsidian Community Themes laden und anwenden (CSS-Variable-Mapping) |
| 30 | `ci-cd-release` | Feature | ✅ Fertig | GitHub Actions CI/CD, Auto-Release (Release Please), Multi-Arch Docker (GHCR + optional DockerHub), Version-Check in Admin-UI |
| 31 | `security-hardening` | Feature | 📋 Geplant | Security-Audit (OWASP), Race-Condition-Analyse, CSP-Header, Dependency-Audit |
| 32 | `trash-and-versioning` | Feature | ✅ Fertig | Papierkorb (Soft-Delete + Wiederherstellung) + Datei-Versionierung (letzte N Versionen) (umgesetzt als Teil von `tier2-daily-workflow`) |
| 33 | `public-sharing` | Feature | 📋 Geplant | Einzelne Notizen per öffentlichem Link teilen (ohne Login, mit Ablaufdatum) |
| 34 | `presence-indicator-fix` | Bugfix | ✅ Fertig | Presence-Indikatoren (grüne Dots) im Chat — Module-Level Bridge verdrahtet RealtimeProvider → ConversationList |
| 35 | `tier2-daily-workflow` | Feature | ✅ Fertig | Kombinierter Spec: Vault-Explorer (Statistiken, Context-Menu, DnD Upload), Editor (Zeilennummern, Undo/Redo, Recent Files, Templates, Daily Notes, Bild-Paste, Favoriten), Trash & Versionierung |
| 36 | `login-version-display` | Feature | ✅ Fertig | Versionsnummer auf dem Login-Screen anzeigen (Quick Fix) |
| 36 | `welcome-vault` | Feature | 📋 Requirements | Automatischer "Willkommen"-Vault mit Anleitungen für neue Benutzer |
| 37 | `realtime-cleanup` | Feature | ✅ Fertig | Feature-Toggle für Realtime entfernt, Polling-Fallback entfernt, SSE immer aktiv |
| 38 | `knowledge-graph-v2` | Feature | 📋 Requirements | Knowledge Graph konfigurierbar (Farben, Gewichte) + Tags/Properties als togglebare Knoten |
| 39 | `collaborative-editing` | Feature | 📋 Requirements | Echtzeit-Multi-User-Editing mit CRDT/OT und Cursor-Presence |
| 40 | `sync-conflict-resolution` | Feature | 📋 Requirements | Halbautomatisches Konfliktmanagement bei Sync (Diff-View, Batch-Auflösung, Auto-Strategien) |
| 41 | `command-palette-builtin` | Feature | ✅ Fertig | Command Palette (Ctrl+P) immer aktiv, 40+ Built-in-Befehle (Navigation, Vault-Ops, Editor-Formatierung, Admin, View-Toggles), Editor-Commands via CustomEvent-Bridge |
| 42 | `user-preferences-persistence` | Feature | ✅ Fertig | Per-User Preferences (Recent Files, Favoriten, Keybindings) serverseitig persistiert mit localStorage-Cache + 2s-Debounce-Sync |
| 43 | `vault-config` | Feature | ✅ Fertig | Per-Vault Konfiguration (Vorlagen-Verzeichnis, Tagesnotizen-Verzeichnis) — Owner-only, Settings-UI, TemplateService + DailyNoteService lesen daraus |
| 44 | `configurable-keybindings` | Feature | ✅ Fertig | Konfigurierbare Tastaturkürzel (14 Commands, 4 Kategorien, Platform-agnostisch, Conflict Detection, Settings-UI mit Inline-Recording) |

## Abhängigkeiten zwischen Specs

```
slatebase-overview (Architektur-Grundlage)
  └── slatebase-mvp (Basis-Funktionalität)
        ├── persistent-vault-management (Vault-Persistenz)
        ├── tabbed-editor-viewer (Editor/Viewer)
        │     ├── advanced-file-operations (Datei-Ops brauchen Tabs)
        │     ├── live-preview-editor (braucht Editor-Infrastruktur)
        │     └── editor-improvements ✅ (Zeilennummern, Undo/Redo, Recent Files — via tier2-daily-workflow)
        ├── auth-and-user-management (Auth-System)
        │     ├── user-chat (Chat braucht Auth + User)
        │     │     ├── chat-enhancements (Erweiterungen auf Chat)
        │     │     ├── chat-list-refresh-fix (Bugfix auf Chat)
        │     │     └── realtime-infrastructure (SSE für Chat + Collaboration)
        │     ├── vault-sync (CouchDB-Sync, braucht Auth)
        │     ├── mcp-context-server (braucht Auth + Vault-Zugriff)
        │     ├── unified-settings (zentrale Einstellungsseite, braucht Auth + Config)
        │     └── session-expiry-fix (Bugfix auf Auth-System)
        ├── obsidian-markdown-compat (braucht Markdown-Rendering aus MVP)
        │     ├── context-panel (braucht Wikilink-Parsing + Heading-Anchors)
        │     ├── knowledge-graph (braucht Wikilink-Parsing)
        │     ├── mermaid-rendering (braucht Fenced Code Block-Rendering)
        │     └── obsidian-plugin-compat (braucht Obsidian-Kompatibilität)
        │           ├── workspace-leaf-compat (braucht Plugin-Infrastruktur + Tab-System)
        │           ├── server-side-plugins (braucht Plugin-Infrastruktur)
        │           └── obsidian-themes (braucht Plugin-Store + CSS-Injection)
        ├── vault-explorer-enhancements ✅ (Statistiken, Context-Menu, DnD-Upload — via tier2-daily-workflow)
        ├── search-and-discovery (Volltextsuche + Replace, optional semantisch)
        ├── trash-and-versioning ✅ (Papierkorb + Datei-History — via tier2-daily-workflow)
        ├── public-sharing (öffentliche Links, braucht Auth + Markdown-Rendering)
        ├── accessibility-audit (querschnittlich, alle UI-Komponenten)
        ├── responsive-mobile (querschnittlich, alle UI-Komponenten)
        ├── security-hardening (querschnittlich, Backend + Frontend)
        ├── feature-toggles (querschnittlich, braucht Auth + Config + alle Feature-Module)
        ├── ci-cd-release (DevOps, keine Code-Abhängigkeit)
        ├── login-version-display (braucht versionRoutes, LoginPage)
        ├── welcome-vault (braucht auth-and-user-management, VaultService)
        ├── realtime-cleanup (braucht realtime-infrastructure ✅)
        ├── knowledge-graph-v2 (braucht knowledge-graph ✅)
        │     └── erweitert Link-Index um Tags + Properties
        ├── sync-conflict-resolution (braucht vault-sync ✅)
        │     └── erweitert Conflict UI um Diff-View, Batch, Auto-Strategien
        └── collaborative-editing (braucht realtime-infrastructure ✅ + tabbed-editor-viewer ✅)
              └── CRDT/OT-Engine, Cursor-Presence, Collaboration-Server
```

## Empfohlene Umsetzungsreihenfolge (ab jetzt)

Priorisiert nach: Blockierungen auflösen → Nutzerwert maximieren → Quick Wins zuerst.

### Tier 1: Sofort (Grundlagen stabilisieren + Release-Fähigkeit)

| Prio | Spec | Aufwand | Begründung |
|------|------|---------|------------|
| 1 | `session-expiry-fix` | ✅ Fertig | Behoben: CSRF-Persistenz, Sliding Expiry, localStorage, synchrone Wiederherstellung. |
| 2 | `ci-cd-release` | ✅ Fertig | Pipeline konfiguriert. Erster Release bei nächstem Merge auf `main`. |
| 3 | `obsidian-plugin-compat` (fertigstellen) | ✅ Fertig | Alle Tasks abgeschlossen. Frontend + Backend komplett integriert. |

### Tier 2: Kurzfristig (Kern-Features für tägliche Nutzung)

| Prio | Spec | Aufwand | Begründung |
|------|------|---------|------------|
| 4 | `search-and-discovery` (Phase 1) | ✅ Fertig | Kern-Feature. Ohne Suche bei >50 Dateien kaum nutzbar. |
| 5 | `tier2-daily-workflow` | ✅ Fertig | Kombinierter Spec: Vault-Explorer + Editor + Trash & Versionierung. 93 Tasks, alle implementiert. |
| 6 | `login-version-display` | Niedrig | ✅ Fertig. Version wird auf Login-Screen angezeigt (v-Prefix, dev-Modus). |
| 7 | `realtime-cleanup` | Niedrig–Mittel | ✅ Fertig. Toggle entfernt, Fallback entfernt, SSE immer aktiv. |

### Tier 3: Mittelfristig (UX-Qualität + Differenzierung)

| Prio | Spec | Aufwand | Begründung |
|------|------|---------|------------|
| 10 | `realtime-infrastructure` | ✅ Fertig | SSE implementiert: Chat-Push, Presence, Vault-Change-Events mit Tree-Refresh + Tab-Reload, Toast-Notifications. |
| 11 | `welcome-vault` | Mittel | Onboarding-Feature. Neue Nutzer bekommen sofort Orientierung. |
| 12 | `knowledge-graph-v2` | Mittel | Differenzierung: Konfigurierbar + Tags/Properties als Knoten. Hebt den Graph auf nächstes Level. |
| 13 | `sync-conflict-resolution` | Mittel | UX-kritisch für Sync-Nutzer: Geführter Prozess statt manueller Einzelauflösung. |
| 14 | `unified-settings` | Mittel | Konsolidiert fragmentierte Settings nach vielen neuen Features. |
| 15 | `public-sharing` | Mittel | Starkes Marketing-Feature. Differenziert gegen Obsidian Publish. |
| 16 | `mermaid-rendering` | ✅ Fertig | Implementiert: MermaidRenderer.tsx + ViewMode-Integration + 14 Tests. |
| 17 | `responsive-mobile` | Hoch | Erweitert Nutzerbasis. Setzt stabile Desktop-UX voraus (Tier 1–2). |

### Tier 4: Langfristig (Ökosystem + Advanced Features)

| Prio | Spec | Aufwand | Begründung |
|------|------|---------|------------|
| 18 | `workspace-leaf-compat` | Mittel | Braucht fertiges Plugin-System. Hebt Plugins auf "full" Kompatibilität. |
| 19 | `obsidian-themes` | Mittel | Visuelle Personalisierung, Community-Anschluss. |
| 20 | `collaborative-editing` | Sehr Hoch | Echtzeit-Multi-User-Editing mit CRDT/OT. Technisch anspruchsvollstes Feature. |
| 21 | `live-preview-editor` | Hoch | Nice-to-have. View/Edit-Modus funktioniert. CodeMirror-Migration nötig. |
| 22 | `security-hardening` | Mittel | Systematischer Audit vor v1.0 oder wachsender Nutzerbasis. |
| 23 | `server-side-plugins` | Hoch | Nur relevant für Desktop-only Plugins (Git, Shell Commands). |
| 24 | `accessibility-audit` | Mittel | Laufende Verbesserung statt Big-Bang. |

### Parallelisierbare Tracks

```
Track A (Backend):     session-expiry-fix ✅ → realtime-infrastructure ✅ → realtime-cleanup ✅ → collaborative-editing
Track B (Frontend):    tier2-daily-workflow ✅ → login-version-display ✅ → responsive-mobile
Track C (Plugins):     obsidian-plugin-compat ✅ → workspace-leaf-compat → obsidian-themes
Track D (DevOps):      ci-cd-release ✅ (unabhängig)
Track E (Content):     search-and-discovery ✅ → trash-and-versioning ✅ → public-sharing
Track F (Knowledge):   knowledge-graph ✅ → knowledge-graph-v2
Track G (Sync):        vault-sync ✅ → sync-conflict-resolution
Track H (Onboarding):  welcome-vault (unabhängig)
```

### Grobe Timeline (bei Vollzeit-Entwicklung)

```
Woche 1–2:     session-expiry-fix ✅ + ci-cd-release ✅
Woche 3–4:     obsidian-plugin-compat fertigstellen ✅
Woche 5–6:     search-and-discovery (Phase 1) ✅ + login-version-display ✅
Woche 7–9:     tier2-daily-workflow ✅ (Vault-Explorer + Editor + Trash & Versioning)
Woche 10:      realtime-cleanup ✅
Woche 11–12:   knowledge-graph-v2
Woche 13–14:   sync-conflict-resolution
Woche 15–16:   unified-settings ✅ + mermaid-rendering ✅
Woche 17–18:   public-sharing + welcome-vault
Woche 19–22:   responsive-mobile
Woche 23–30:   collaborative-editing (CRDT/OT — größtes Feature)
Danach:        workspace-leaf-compat, obsidian-themes, live-preview-editor, ...
```

## Geplante Specs (noch keine Spec-Dateien vorhanden)

### live-preview-editor
- **Beschreibung**: Side-by-Side oder WYSIWYG Live-Preview im Markdown-Editor (aktuell nur getrennter View/Edit-Modus)
- **Abhängigkeit**: Braucht tabbed-editor-viewer (Editor-Infrastruktur)
- **Priorität**: Mittel
- **Aufwand**: Mittel

### mermaid-rendering
- **Beschreibung**: Mermaid-Diagramme in Fenced Code Blocks (`\`\`\`mermaid`) als interaktive SVG-Grafiken rendern. Dark/Light Mode, Lazy Loading per dynamic import(), Fehlerbehandlung mit Fallback, Obsidian-kompatible Syntax.
- **Abhängigkeit**: Braucht obsidian-markdown-compat (Fenced Code Block Rendering in ViewMode)
- **Priorität**: Mittel
- **Aufwand**: Niedrig–Mittel (rein Frontend, eine neue Dependency `mermaid`)
- **Status**: ✅ Fertig — MermaidRenderer-Komponente mit lazy loading (dynamic import), Theme-aware re-rendering (MutationObserver), 5s Timeout, Error-Fallback, 14 Unit-Tests

### workspace-leaf-compat
- **Beschreibung**: Workspace Leaf API-Kompatibilitätsschicht — mappt Obsidians Workspace-Leaf-System (registerView, getLeaf, getLeavesOfType, revealLeaf, etc.) auf Slatebase's Tab-System und Context Panel. Ermöglicht Plugins wie Calendar, Kanban und Excalidraw ihre Custom Views in Slatebase anzuzeigen.
- **Abhängigkeit**: Braucht obsidian-plugin-compat (WorkspaceShim, Plugin-Loader, Tab-System) + context-panel (für Sidebar-Views)
- **Priorität**: Hoch (hebt viele populäre Plugins von "partial" auf "full" Kompatibilität)
- **Aufwand**: Mittel (rein Frontend — WorkspaceShim-Erweiterung, ViewRegistry, ItemView-Klasse, Tab-Integration, Analyzer-Update)
- **Status**: Requirements fertig, Design + Tasks ausstehend

### server-side-plugins
- **Beschreibung**: Serverseitige Ausführung von Obsidian-Plugins die Node.js-APIs benötigen (tls, net, crypto, fs, etc.). Isolierte vm-Sandbox, Vault-I/O-Shims, Settings-Bridge zum Frontend, Plugin-Logs und Monitoring.
- **Abhängigkeit**: Braucht obsidian-plugin-compat (Plugin-Store, Registry, Installer)
- **Priorität**: Hoch (blockiert IMAP-Importer und andere Node.js-basierte Plugins)
- **Aufwand**: Hoch (7 Phasen, 36 Tasks)

### accessibility-audit
- **Beschreibung**: Systematischer WCAG 2.1 AA Audit aller UI-Komponenten mit anschließenden Fixes (Keyboard-Navigation, Screen-Reader, Kontraste, ARIA)
- **Abhängigkeit**: Querschnittlich — betrifft alle Frontend-Komponenten
- **Priorität**: Niedrig (laufend bei neuen Features beachten)
- **Aufwand**: Mittel

### unified-settings ✅ Fertig
- **Beschreibung**: Zentrales Settings-Panel (Ctrl+,) mit Kategorien (Konto, Vault, Administration), Seitenleisten-Navigation, CSS Container Query Layout (700px responsive), Suche mit 150ms Debounce, sessionStorage-Persistenz, ARIA landmarks, Tastaturnavigation.
- **Abhängigkeit**: Braucht auth-and-user-management (bestehende Settings-Infrastruktur)
- **Priorität**: Mittel (UX-Verbesserung, kein neues Feature)
- **Aufwand**: Mittel (~8–12h)
- **Status**: ✅ Fertig — SettingsProvider, SettingsRegistry, SettingsPanel mit Sidebar/Content, 116 Tests

### search-and-discovery
- **Beschreibung**: Zwei-Phasen-Feature: Phase 1 — Vault-weite Volltextsuche mit Replace (case-insensitive, Regex-Support, Ergebnisvorschau mit Kontext-Zeilen, Suche über mehrere Vaults, Find & Replace für Refactoring: Tag umbenennen, Link-Target ändern). Phase 2 (optional, zukunftsfähig) — Semantische Suche mit Embedding-Modell (lokale oder API-basierte Embedding-Generierung, Vektor-Ähnlichkeitssuche, "ähnliche Notizen"-Feature).
- **Abhängigkeit**: Phase 1: Braucht slatebase-mvp (Vault-Dateizugriff). Phase 2: Braucht Phase 1 + externes Embedding-Modell (OpenAI/Ollama)
- **Priorität**: Phase 1: Hoch (Kern-Feature für Knowledge Management). Phase 2: Niedrig (nice-to-have, braucht AI-Infrastruktur)
- **Aufwand**: Phase 1: Mittel (Backend: Datei-Iteration + String-Matching + Replace-Endpoint, Frontend: Suchleiste + Ergebnisliste + Replace-UI). Phase 2: Hoch (Embedding-Pipeline, Vektor-Storage, Index-Maintenance)

### responsive-mobile
- **Beschreibung**: Responsive Design für Mobile-Nutzung (Smartphones und Tablets). Breakpoints für 3-Spalten → 2-Spalten → 1-Spalte. Touch-optimierte Interaktionen (Swipe für Sidebar, größere Touch-Targets). Mobile-spezifische Navigation (Bottom-Bar oder Hamburger-Menü). File Explorer als Fullscreen-Overlay auf kleinen Screens.
- **Abhängigkeit**: Querschnittlich — betrifft alle Frontend-Komponenten (ähnlich wie accessibility-audit)
- **Priorität**: Mittel–Hoch (erweitert Nutzerbasis signifikant, Marketing-Argument für Mobile-Nutzer)
- **Aufwand**: Hoch (umfangreiche CSS-Media-Queries, Touch-Events, Layout-Refactoring, ggf. Komponenten-Varianten)

### obsidian-themes
- **Beschreibung**: Obsidian Community Themes in Slatebase laden und anwenden. CSS-Variable-Mapping (Obsidians `--color-*` Tokens auf Slatebase Design Tokens mappen), Theme-Loader (CSS-Datei aus Plugin-Verzeichnis laden und injizieren), Theme-Auswahl in Einstellungen, Dark/Light-Varianten, Vorschau.
- **Abhängigkeit**: Braucht obsidian-plugin-compat (Plugin-Store für Theme-Dateien) + unified-settings (Theme-Auswahl-UI)
- **Priorität**: Mittel (visuelle Personalisierung, Community-Anschluss)
- **Aufwand**: Mittel (CSS-Variable-Mapping ist der Hauptaufwand — Obsidian hat ~200 CSS-Variablen)

### security-hardening
- **Beschreibung**: Systematische Sicherheitshärtung: OWASP-Top-10-Checkliste durcharbeiten, Race-Condition-Analyse (parallele Requests auf gleiche Ressource — ETag-System validieren, Atomic-Writes prüfen), CSP-Header (Content Security Policy), fehlende Input-Validierung identifizieren, Dependency-Audit (npm audit + Snyk), Rate-Limit-Analyse (alle Endpoints abgedeckt?).
- **Abhängigkeit**: Querschnittlich — betrifft Backend + Frontend
- **Priorität**: Mittel (keine bekannten kritischen Lücken, aber systematische Prüfung ausstehend)
- **Aufwand**: Mittel (Analyse + gezielte Fixes, kein neues Feature)

### login-version-display ✅ Fertig
- **Beschreibung**: Versionsnummer auf dem Login-Screen anzeigen. Der bestehende öffentliche Endpoint `GET /api/v1/version` wird beim Laden der LoginPage abgefragt und die Version dezent unterhalb des Login-Buttons dargestellt.
- **Abhängigkeit**: Braucht versionRoutes (✅ vorhanden), LoginPage (✅ vorhanden)
- **Priorität**: Hoch (Quick Fix, extrem niedriger Aufwand, sofort umsetzbar)
- **Aufwand**: Sehr niedrig (1–2h, rein Frontend: ein `fetch`-Call + ein `<span>`)
- **Status**: ✅ Fertig — `getVersion()` war bereits in IApiClient vorhanden, LoginPage um useEffect + Versionsanzeige erweitert

### welcome-vault
- **Beschreibung**: Neue Benutzer erhalten bei Account-Erstellung automatisch einen "Willkommen"-Vault mit Tutorial-Inhalten (Wikilinks, Callouts, Tags, Embeds, Ordnerstruktur). Template-Verzeichnis anpassbar, per Feature-Toggle steuerbar.
- **Abhängigkeit**: Braucht auth-and-user-management (✅), VaultService (✅)
- **Priorität**: Mittel (Onboarding-Verbesserung, kein Blocker)
- **Aufwand**: Mittel (Backend: Template-Copy-Logik + Feature-Toggle. Content: 5–15 Markdown-Dateien schreiben)
- **Status**: Requirements fertig

### realtime-cleanup ✅ Fertig
- **Beschreibung**: Feature-Toggle `realtime` entfernt (SSE immer aktiv), gesamte Polling-Fallback-Logik entfernt, Status `fallback` eliminiert, Code-Bereinigung aller Conditionals. SSE ist nun die einzige Methode für Push-Updates.
- **Abhängigkeit**: Braucht realtime-infrastructure (✅ Fertig, stabil)
- **Priorität**: Mittel–Hoch (vereinfacht Code signifikant, entfernt tote Pfade)
- **Aufwand**: Niedrig–Mittel (primär Lösch-Arbeit: Toggle, Fallback-Code, Tests anpassen)
- **Status**: ✅ Fertig — Backend: Toggle-Registration, onChange-Listener, featureGuard, isEnabled-Check entfernt. Frontend: `'fallback'` ConnectionStatus, `featureEnabled` Prop, `server:feature-disabled` Handler, Polling-Callbacks, CSS-Token entfernt. EventSource Mock in test-setup hinzugefügt.

### knowledge-graph-v2
- **Beschreibung**: Knowledge Graph Erweiterung: (1) Konfigurierbare Darstellung (Farben pro Knotentyp, Layout-Parameter wie Abstoßung/Anziehung/Distanz via Slider), (2) Tags als togglebare Knoten (verbunden mit allen Dateien die den Tag enthalten), (3) YAML-Properties als togglebare Knoten (wählbare Keys, verbunden mit Dateien die den Property-Wert haben). Erweitert den Link-Index und die Graph-API.
- **Abhängigkeit**: Braucht knowledge-graph (✅ Fertig)
- **Priorität**: Mittel (Differenzierungs-Feature, hebt den Graph deutlich über Obsidian-Niveau)
- **Aufwand**: Mittel (Backend: Link-Index erweitern um Tags/Properties. Frontend: Settings-Panel, neue Node-Typen, API-Erweiterung)
- **Status**: Requirements fertig

### collaborative-editing
- **Beschreibung**: Echtzeit-Multi-User-Editing für Markdown-Dokumente. CRDT oder OT-basiert, max 10 Teilnehmer pro Dokument, Cursor-Presence (farbige Remote-Cursors + Selektionen), Auto-Save alle 5s, lokaler Buffer bei Disconnect, Session-Awareness-UI. Technisch anspruchsvollstes geplantes Feature.
- **Abhängigkeit**: Braucht realtime-infrastructure (✅, SSE als Event-Kanal), tabbed-editor-viewer (✅, Editor als Host)
- **Priorität**: Niedrig–Mittel (Nice-to-have, aber starkes Differenzierungsmerkmal für Teams)
- **Aufwand**: Sehr hoch (CRDT/OT-Engine, Collaboration-Server, Editor-Integration, Cursor-Rendering, Netzwerk-Resilienz)
- **Status**: Requirements fertig

### sync-conflict-resolution
- **Beschreibung**: Halbautomatisches Sync-Konfliktmanagement. Erweitert den bestehenden vault-sync um: Konfliktkategorisierung (content/deleted/rename), Diff-View (Side-by-Side + Unified), Batch-Auflösung, konfigurierbare Auto-Resolution-Strategien (newer_wins, remote_wins, local_wins), Merge-Preview mit Editor, geführter Conflict-Wizard (mehrstufig).
- **Abhängigkeit**: Braucht vault-sync (✅ Fertig)
- **Priorität**: Mittel (UX-kritisch für alle Sync-Nutzer, aktuell nur manuelle Einzelauflösung)
- **Aufwand**: Mittel (Backend: Kategorisierung + Strategien. Frontend: Diff-View, Wizard-UI, Batch-Logik)
- **Status**: Requirements fertig

### trash-and-versioning ✅ Fertig (via tier2-daily-workflow)
- **Beschreibung**: Zwei zusammenhängende Schutzmaßnahmen gegen Datenverlust: (1) Papierkorb/Trash — gelöschte Dateien werden in `.trash/`-Ordner verschoben (konfigurierbare Aufbewahrungsfrist 0–365 Tage). Wiederherstellung per UI. (2) Datei-Versionierung — bei jedem Save wird die vorherige Version unter `.versions/<path>/<timestamp>.<ext>` aufbewahrt (konfigurierbar 0–100 Versionen). Versions-Browser mit Inline-Diff (grün/rot). Cleanup-Job entfernt abgelaufene Einträge periodisch.
- **Abhängigkeit**: Braucht advanced-file-operations (Delete-Logik) + tabbed-editor-viewer (Save-Hook für Versionierung)
- **Status**: ✅ Fertig — implementiert als Teil von `tier2-daily-workflow` Spec

### public-sharing
- **Beschreibung**: Einzelne Notizen per öffentlichem Link teilen ohne Login. Generiert einen einzigartigen, nicht erratbaren Share-Link (UUID-basiert). Optionen: Ablaufdatum (1h/24h/7d/30d/unbegrenzt), Passwort-Schutz (optional), Nur-Lesen (immer). Öffentliche Ansicht: minimales Layout, nur Markdown-Rendering, kein Editor/Explorer. Verwaltung: Liste aktiver Public-Links pro Vault, Widerruf jederzeit möglich.
- **Abhängigkeit**: Braucht auth-and-user-management (Link-Generierung) + obsidian-markdown-compat (Rendering der geteilten Notiz)
- **Priorität**: Mittel (starkes Collaboration-Feature, Differenzierungsmerkmal gegenüber Obsidian Publish für Einzelnotizen)
- **Aufwand**: Mittel (Backend: PublicShareStore, Token-Validierung, öffentlicher Render-Endpoint ohne Auth. Frontend: Share-Dialog, Link-Verwaltung, minimale Public-View-Page)

## Gelöschte/Obsolete Specs

| Spec | Grund |
|------|-------|
| `unread-badge-reset-fix` | Obsolet — durch `chat-list-refresh-fix` und nachfolgende Fixes abgedeckt |

## Verworfene/Zurückgestellte Ideen

| Idee | Bewertung | Grund |
|------|-----------|-------|
| **GitSync** (Git als Sync-Backend) | 🔴 Zurückgestellt | CouchDB-Sync deckt den Use-Case bereits ab. Git-basierter Sync wäre ein völlig separater Sync-Mechanismus mit hoher Komplexität (Merge-Konflikte, SSH-Keys, Auth). Ggf. langfristig als Obsidian-Plugin (obsidian-git) kompatibel machen, aber kein Slatebase-Core-Feature. |
| **HTML-Rendering** (Raw-HTML in Markdown) | 🔴 Verworfen | Hohes Sicherheitsrisiko (XSS-Angriffsfläche auch mit Sanitization). Markdown + Mermaid + Embeds decken 99% der Anwendungsfälle ab. Falls gewünscht: als Opt-in-Feature mit iframe-Sandbox und CSP, aber sehr niedrige Priorität. |
| **Recent Files als Obsidian-Plugin** | 🟡 Integriert | In `editor-improvements` als natives Feature aufgenommen — braucht kein Plugin, da Slatebase die Tab-History ohnehin kennt. |
| **Multi-Sprachen/RTL-Support** | 🔴 Zurückgestellt | Sehr spezieller Anwendungsfall, betrifft wenige Nutzer. Kein eigener Spec nötig — bei Bedarf im Rahmen von `accessibility-audit` adressierbar. |
| **Offline-Modus (PWA/Service Worker)** | 🔴 Zurückgestellt | Komplexität vs. Nutzen bei Self-Hosted-Tool gering. Nutzer haben ohnehin Server-Zugang nötig. Vault-Sync mit Obsidian-Desktop deckt Offline-Nutzung ab. |
| **AI-Agent im Editor (Copilot)** | 🔴 Zurückgestellt | MCP-Integration deckt den AI-Zugang bereits ab (externe AI-Assistenten können lesen/schreiben). Ein eingebauter Copilot wäre ein eigenes Produkt mit hoher Komplexität. |
| **Kanban/Calendar als native Views** | 🟡 Plugin-Lösung | Besser über `obsidian-plugin-compat` + `workspace-leaf-compat` lösen — populäre Plugins wie Calendar und Kanban werden dann direkt unterstützt. |
| **Multi-Cursor / Multi-Selection** | 🟡 Langfristig | Nur realistisch mit Wechsel zu CodeMirror/ProseMirror. Teil von `live-preview-editor` wenn ein richtiger Code-Editor eingesetzt wird. |

## Bekannte Limitierungen (kein eigener Spec nötig)

### vault-sync: Push ohne Chunking (>8MB-Limit)
- **Problem**: Slatebase pusht Dateien als einzelnes `data`-Feld im CouchDB-Dokument. CouchDB hat ein `max_document_size` (default 8MB). Dateien über diesem Limit schlagen beim Push fehl.
- **Betrifft**: Nur bidirektionalen Sync bei sehr großen Einzeldateien (>8MB). Pull funktioniert korrekt (Chunks werden reassembliert).
- **Workaround**: CouchDB `max_document_size` erhöhen oder große Dateien vom Sync ausschließen.
- **Langfristige Lösung**: Beim Push ebenfalls Leaf-Dokumente erzeugen und `children`-Array verwenden (wie livesync es macht). Aufwand: Mittel — erfordert Content-Splitting, Hash-basierte Chunk-IDs, Bulk-Write der Leaves.
- **Priorität**: Niedrig — betrifft nur Edge-Cases mit sehr großen Dateien (PDFs, Videos). Typische Vault-Dateien (Markdown, Bilder) sind weit unter 8MB.

## Konventionen

- Spec-Verzeichnis: `.kiro/specs/<feature-name>/`
- Pflichtdateien: `requirements.md` (oder `bugfix.md`), `design.md`, `tasks.md`
- Config: `.config.kiro` mit `specId`, `workflowType`, `specType`
- Task-Status: `- [x]` = fertig, `- [ ]` = offen
