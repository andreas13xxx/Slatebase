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
| 17 | `mermaid-rendering` | Feature | 📋 Requirements | Mermaid-Diagramme in Fenced Code Blocks als SVG rendern (Dark/Light Mode, Lazy Loading, Fehlerbehandlung) |
| 18 | `accessibility-audit` | Feature | 📋 Geplant | WCAG 2.1 AA Compliance (systematischer Audit + Fixes) |
| 19 | `server-side-plugins` | Feature | 📋 Geplant | Serverseitige Ausführung von Obsidian-Plugins die Node.js-APIs benötigen (tls, net, crypto, etc.) |
| 20 | `feature-toggles` | Feature | ✅ Fertig | Zentrale Feature-Toggles in der Serverkonfiguration (vault-sync, obsidian-plugin-compat, chat, mcp, knowledge-graph) mit Admin-UI und Hot-Toggle-Support |
| 21 | `workspace-leaf-compat` | Feature | 📋 Requirements | Workspace Leaf API-Kompatibilität — Obsidian-Plugin-Views als Tabs im Hauptbereich und Sections im Context Panel |
| 22 | `session-expiry-fix` | Bugfix | ✅ Fertig | CSRF-Secret-Persistenz, Sliding Session Expiry, localStorage-Migration, synchroner Token-Restore, Expiry-UX, CSRF-Mismatch-Recovery |
| 23 | `editor-improvements` | Feature | 📋 Geplant | Zeilennummern, Undo/Redo, Recent Files, Templates/Daily Notes, Bild-Paste, Favoriten |
| 24 | `vault-explorer-enhancements` | Feature | 📋 Geplant | Vault-Statistiken, Custom Context-Menu, Drag & Drop Upload |
| 25 | `unified-settings` | Feature | 📋 Geplant | Zentrale Einstellungsseite mit Kategorien, Log-Verwaltung, Keybindings |
| 26 | `realtime-infrastructure` | Feature | ✅ Fertig | SSE-basierte Echtzeit-Updates (Chat-Nachrichten, Online-Status/Presence, Vault-Änderungen mit Tree-Refresh + Tab-Reload, Sync-Konflikte, Toast-Notifications, Server-Shutdown-Warnung) |
| 27 | `search-and-discovery` | Feature | ✅ Fertig | Volltextsuche + Replace (Phase 1): Vault-weite Suche mit Regex, Kontext-Zeilen, Multi-Vault, Find & Replace mit atomaren Schreiboperationen, SearchPanel als Seitenpanel |
| 28 | `responsive-mobile` | Feature | 📋 Geplant | Responsive Design für Smartphones und Tablets |
| 29 | `obsidian-themes` | Feature | 📋 Geplant | Obsidian Community Themes laden und anwenden (CSS-Variable-Mapping) |
| 30 | `ci-cd-release` | Feature | ✅ Fertig | GitHub Actions CI/CD, Auto-Release (Release Please), Multi-Arch Docker (GHCR + optional DockerHub), Version-Check in Admin-UI |
| 31 | `security-hardening` | Feature | 📋 Geplant | Security-Audit (OWASP), Race-Condition-Analyse, CSP-Header, Dependency-Audit |
| 32 | `trash-and-versioning` | Feature | 📋 Geplant | Papierkorb (Soft-Delete + Wiederherstellung) + Datei-Versionierung (letzte N Versionen) |
| 33 | `public-sharing` | Feature | 📋 Geplant | Einzelne Notizen per öffentlichem Link teilen (ohne Login, mit Ablaufdatum) |

## Abhängigkeiten zwischen Specs

```
slatebase-overview (Architektur-Grundlage)
  └── slatebase-mvp (Basis-Funktionalität)
        ├── persistent-vault-management (Vault-Persistenz)
        ├── tabbed-editor-viewer (Editor/Viewer)
        │     ├── advanced-file-operations (Datei-Ops brauchen Tabs)
        │     ├── live-preview-editor (braucht Editor-Infrastruktur)
        │     └── editor-improvements (Zeilennummern, Undo/Redo, Recent Files)
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
        ├── vault-explorer-enhancements (Statistiken, Context-Menu, DnD-Upload)
        ├── search-and-discovery (Volltextsuche + Replace, optional semantisch)
        ├── trash-and-versioning (Papierkorb + Datei-History, braucht advanced-file-operations)
        ├── public-sharing (öffentliche Links, braucht Auth + Markdown-Rendering)
        ├── accessibility-audit (querschnittlich, alle UI-Komponenten)
        ├── responsive-mobile (querschnittlich, alle UI-Komponenten)
        ├── security-hardening (querschnittlich, Backend + Frontend)
        ├── feature-toggles (querschnittlich, braucht Auth + Config + alle Feature-Module)
        └── ci-cd-release (DevOps, keine Code-Abhängigkeit)
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
| 5 | `vault-explorer-enhancements` | Niedrig–Mittel | Quick Win: Context-Menu + Stats + DnD. Großer UX-Impact. |
| 6 | `editor-improvements` | Mittel | Templates + Daily Notes + Bild-Paste = Obsidian-Parität für Kern-Workflows. |
| 7 | `trash-and-versioning` | Mittel | Vertrauens-Feature. Schützt vor Datenverlust bei Multi-User + Auto-Save. |

### Tier 3: Mittelfristig (UX-Qualität + Differenzierung)

| Prio | Spec | Aufwand | Begründung |
|------|------|---------|------------|
| 8 | `realtime-infrastructure` | ✅ Fertig | SSE implementiert: Chat-Push, Presence, Vault-Change-Events mit Tree-Refresh + Tab-Reload, Toast-Notifications. |
| 9 | `unified-settings` | Mittel | Konsolidiert fragmentierte Settings nach vielen neuen Features. |
| 10 | `public-sharing` | Mittel | Starkes Marketing-Feature. Differenziert gegen Obsidian Publish. |
| 11 | `mermaid-rendering` | Niedrig | Requirements fertig. Quick Win zwischen größeren Features. |
| 12 | `responsive-mobile` | Hoch | Erweitert Nutzerbasis. Setzt stabile Desktop-UX voraus (Tier 1–2). |

### Tier 4: Langfristig (Ökosystem + Advanced Features)

| Prio | Spec | Aufwand | Begründung |
|------|------|---------|------------|
| 13 | `workspace-leaf-compat` | Mittel | Braucht fertiges Plugin-System. Hebt Plugins auf "full" Kompatibilität. |
| 14 | `obsidian-themes` | Mittel | Visuelle Personalisierung, Community-Anschluss. |
| 15 | `live-preview-editor` | Hoch | Nice-to-have. View/Edit-Modus funktioniert. CodeMirror-Migration nötig. |
| 16 | `security-hardening` | Mittel | Systematischer Audit vor v1.0 oder wachsender Nutzerbasis. |
| 17 | `server-side-plugins` | Hoch | Nur relevant für Desktop-only Plugins (Git, Shell Commands). |
| 18 | `accessibility-audit` | Mittel | Laufende Verbesserung statt Big-Bang. |

### Parallelisierbare Tracks

```
Track A (Backend):     session-expiry-fix ✅ → realtime-infrastructure ✅ → security-hardening
Track B (Frontend):    vault-explorer-enhancements → editor-improvements → responsive-mobile
Track C (Plugins):     obsidian-plugin-compat → workspace-leaf-compat → obsidian-themes
Track D (DevOps):      ci-cd-release (unabhängig)
Track E (Content):     search-and-discovery → trash-and-versioning → public-sharing
```

### Grobe Timeline (bei Vollzeit-Entwicklung)

```
Woche 1–2:     session-expiry-fix ✅ + ci-cd-release ✅
Woche 3–4:     obsidian-plugin-compat fertigstellen
Woche 5–6:     search-and-discovery (Phase 1) + vault-explorer-enhancements
Woche 7–8:     editor-improvements (Templates, Daily Notes, Bild-Paste)
Woche 9–10:    trash-and-versioning
Woche 11–14:   realtime-infrastructure (SSE) ✅
Woche 15–16:   unified-settings + mermaid-rendering
Woche 17–18:   public-sharing
Woche 19–22:   responsive-mobile
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
- **Status**: Requirements fertig, Design + Tasks ausstehend

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

### unified-settings
- **Beschreibung**: Zentrale Einstellungsseite mit Kategorien (Profil, Sicherheit, Editor, Sync, Plugins, Admin, Logs). Ersetzt die aktuell verteilten Settings-Seiten (Profile, Sessions, Admin-Seiten) durch eine einheitliche Oberfläche. Enthält: Log-Verwaltung (Audit-Log + Sync-Log löschen/archivieren), Sync-Log-Redesign (gleiche Darstellung wie Server-Log), anpassbare Keybindings (Hotkey-Editor mit Kollisionserkennung).
- **Abhängigkeit**: Braucht auth-and-user-management (bestehende Settings-Infrastruktur)
- **Priorität**: Mittel (UX-Verbesserung, kein neues Feature)
- **Aufwand**: Mittel (Frontend-Refactoring, neue Kategorien-Navigation, Backend: Log-Deletion-Endpoint)

### editor-improvements
- **Beschreibung**: Ergänzende Editor-Features: Zeilennummern (an/aus via Toggle), Undo/Redo-History (über Browser-native Textarea-Undo hinaus mit explizitem History-Stack für Toolbar-Aktionen), Recent Files (zuletzt geöffnete Dateien als Schnellzugriff in Sidebar oder Command Palette), Templates/Vorlagen (neue Notiz aus Vorlage erstellen — Daily Note, Meeting, etc.), Daily Notes (automatische Tagesnotiz YYYY-MM-DD.md per Klick/Shortcut), Bild-Paste (Ctrl+V Screenshot → automatisch als Bild-Datei speichern + Embed-Link einfügen), Favoriten/Bookmarks (Dateien pinnen für schnellen Zugriff).
- **Abhängigkeit**: Braucht tabbed-editor-viewer (Editor-Infrastruktur)
- **Priorität**: Mittel–Hoch (Templates + Daily Notes sind Obsidian-Kernfeatures, Bild-Paste ist häufig angefragt)
- **Aufwand**: Mittel (rein Frontend außer Bild-Paste — das braucht einen Upload-Endpoint für Clipboard-Blobs)

### realtime-infrastructure ✅ Fertig
- **Beschreibung**: Server-Sent Events (SSE) als Push-Kanal für Echtzeit-Updates. Ersetzt das bisherige Polling. Implementiert: Chat-Nachrichten sofort empfangen, Online-Status/Presence (Heartbeat-basiert), Unread-Count-Updates ohne Polling, Vault-Änderungs-Benachrichtigungen mit automatischem Tree-Refresh + Tab-Content-Reload, Toast-Notifications bei Server-Events, Sync-Konflikt-Warnungen, Server-Shutdown-Hinweis.
- **Architektur**: SSE-Endpoint (`GET /api/v1/events`), Event-Bus mit Replay-Buffer, ConnectionManager (per-user), Exponential-Backoff-Reconnect (5 Versuche → Fallback auf Polling), Page Visibility API Integration, Last-Event-ID Replay.
- **Hinweis**: SSE statt WebSocket gewählt — einfacher (HTTP-basiert, kein Upgrade), Nginx-kompatibel ohne Extra-Config, ausreichend für Server→Client-Push.

### vault-explorer-enhancements
- **Beschreibung**: UX-Verbesserungen im File Explorer: Vault-Statistiken (Gesamtgröße, Anzahl Dateien/Ordner) als Badge oder Tooltip am Vault-Eintrag, Custom Context-Menu (Rechtsklick überall durch eigenes Menü ersetzen — Dateien: Umbenennen/Löschen/Kopieren/Verschieben; Vaults: Erstellen/Löschen/Export; Ordner: Neuer Ordner/Neue Datei/Löschen), Drag & Drop Datei-Upload (Dateien direkt in Explorer oder Editor droppen statt über Import-Dialog).
- **Abhängigkeit**: Braucht slatebase-mvp (File Explorer Grundfunktion)
- **Priorität**: Mittel (UX-Polish, macht Slatebase professioneller)
- **Aufwand**: Niedrig–Mittel (Vault-Stats: Backend-Endpoint, Frontend-Badge. Context-Menu: ContextMenu-Komponente mit positioniertem Overlay. DnD-Upload: Drop-Zone + bestehender Import-Endpoint)

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

### trash-and-versioning
- **Beschreibung**: Zwei zusammenhängende Schutzmaßnahmen gegen Datenverlust: (1) Papierkorb/Trash — gelöschte Dateien werden nicht sofort entfernt, sondern in einen `.trash/`-Ordner verschoben (analog Obsidian). Wiederherstellung per UI möglich. Automatische Bereinigung nach konfigurierbarer Frist (z.B. 30 Tage). (2) Datei-Versionierung — bei jedem Save wird die vorherige Version aufbewahrt (letzte N Versionen, konfigurierbar). Versions-Browser in der UI (Diff-Ansicht, Wiederherstellen einzelner Versionen). Speicherung als `.versions/<path>/<timestamp>.md` im Vault-Datenverzeichnis.
- **Abhängigkeit**: Braucht advanced-file-operations (Delete-Logik) + tabbed-editor-viewer (Save-Hook für Versionierung)
- **Priorität**: Mittel–Hoch (schützt vor versehentlichem Datenverlust — besonders wichtig bei Multi-User und Auto-Save)
- **Aufwand**: Mittel (Backend: Soft-Delete-Logik, Versions-Store, Cleanup-Job. Frontend: Trash-Ansicht, Versions-Browser, Diff-Darstellung)

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
