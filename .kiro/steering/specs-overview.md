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
| 16 | `obsidian-plugin-compat` | Feature | 🔧 In Arbeit ⚠️ experimental | Obsidian Community Plugin Compatibility Layer (API-Shims, Plugin-Loader, Sandbox, Verwaltungs-UI, Backend-Persistenz) — experimentell, nur browser-kompatible Plugins; serverseitige Plugins erfordern `server-side-plugins` |
| 17 | `mermaid-rendering` | Feature | 📋 Requirements | Mermaid-Diagramme in Fenced Code Blocks als SVG rendern (Dark/Light Mode, Lazy Loading, Fehlerbehandlung) |
| 18 | `accessibility-audit` | Feature | 📋 Geplant | WCAG 2.1 AA Compliance (systematischer Audit + Fixes) |
| 19 | `server-side-plugins` | Feature | 📋 Geplant | Serverseitige Ausführung von Obsidian-Plugins die Node.js-APIs benötigen (tls, net, crypto, etc.) |
| 20 | `feature-toggles` | Feature | ✅ Fertig | Zentrale Feature-Toggles in der Serverkonfiguration (vault-sync, obsidian-plugin-compat, chat, mcp, knowledge-graph) mit Admin-UI und Hot-Toggle-Support |

## Abhängigkeiten zwischen Specs

```
slatebase-overview (Architektur-Grundlage)
  └── slatebase-mvp (Basis-Funktionalität)
        ├── persistent-vault-management (Vault-Persistenz)
        ├── tabbed-editor-viewer (Editor/Viewer)
        │     ├── advanced-file-operations (Datei-Ops brauchen Tabs)
        │     └── live-preview-editor (braucht Editor-Infrastruktur)
        ├── auth-and-user-management (Auth-System)
        │     ├── user-chat (Chat braucht Auth + User)
        │     │     ├── chat-enhancements (Erweiterungen auf Chat)
        │     │     └── chat-list-refresh-fix (Bugfix auf Chat)
        │     ├── vault-sync (CouchDB-Sync, braucht Auth)
        │     └── mcp-context-server (braucht Auth + Vault-Zugriff)
        ├── obsidian-markdown-compat (braucht Markdown-Rendering aus MVP)
        │     ├── context-panel (braucht Wikilink-Parsing + Heading-Anchors)
        │     ├── knowledge-graph (braucht Wikilink-Parsing)
        │     ├── mermaid-rendering (braucht Fenced Code Block-Rendering)
        │     └── obsidian-plugin-compat (braucht Obsidian-Kompatibilität)
        │           └── server-side-plugins (braucht Plugin-Infrastruktur)
        └── accessibility-audit (querschnittlich, alle UI-Komponenten)
        └── feature-toggles (querschnittlich, braucht Auth + Config + alle Feature-Module)
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

## Gelöschte/Obsolete Specs

| Spec | Grund |
|------|-------|
| `unread-badge-reset-fix` | Obsolet — durch `chat-list-refresh-fix` und nachfolgende Fixes abgedeckt |

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
