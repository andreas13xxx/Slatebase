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
| 10 | `vault-sync` | Feature | ✅ Fertig | CouchDB-basierte Vault-Synchronisation |
| 11 | `obsidian-markdown-compat` | Feature | ✅ Fertig | Wikilinks, Embeds, Callouts, Tags — Obsidian-kompatibles Rendering |
| 12 | `mcp-context-server` | Feature | ✅ Fertig | AI Context Server mit MCP-Integration (Kern-Feature) |
| 13 | `knowledge-graph` | Feature | 📋 Geplant | Visuelle Darstellung der Verlinkungen zwischen Notizen |
| 14 | `live-preview-editor` | Feature | 📋 Geplant | Side-by-Side oder WYSIWYG Live-Preview im Editor |
| 15 | `obsidian-plugin-compat` | Feature | 📋 Geplant | Obsidian Community Plugin Compatibility Layer |
| 16 | `accessibility-audit` | Feature | 📋 Geplant | WCAG 2.1 AA Compliance (systematischer Audit + Fixes) |

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
        │     ├── knowledge-graph (braucht Wikilink-Parsing)
        │     └── obsidian-plugin-compat (braucht Obsidian-Kompatibilität)
        └── accessibility-audit (querschnittlich, alle UI-Komponenten)
```

## Geplante Specs (noch keine Spec-Dateien vorhanden)

### knowledge-graph
- **Beschreibung**: Visuelle Darstellung der Verlinkungen zwischen Notizen (interaktiver Graph mit Nodes und Edges)
- **Abhängigkeit**: Braucht obsidian-markdown-compat (Wikilink-Parsing für Link-Extraktion)
- **Priorität**: Mittel
- **Aufwand**: Groß
- **Technischer Ansatz (entschieden):**
  - Phase 1: In-Memory-Index (`Map<filePath, Set<linkedPath>>` + Reverse-Map für Backlinks), persistiert als JSON (`data/vaults/<vaultId>/_link-index.json`)
  - Inkrementelles Update: Datei gespeichert → nur diese Datei neu parsen → Index updaten
  - Kein DB-Wechsel nötig — reicht für typische Vaults (hunderte bis wenige tausend Dateien, 5.000–20.000 Kanten)
  - Phase 2 (optional, nur bei Performance-Problemen): SQLite als ergänzender Index (`data/vaults/<vaultId>/_index.sqlite`) mit `better-sqlite3`, Recursive CTEs für Pfad-Traversierung
  - SQLite-Trigger: Index-Aufbau beim Start >2–3s, Vaults mit 10.000+ Dateien, komplexe transitive Queries
  - **Keine CouchDB als internen Store** — bleibt externer Sync-Partner
  - Interface `ILinkIndex` abstrahiert die Implementierung → Wechsel von JSON zu SQLite ohne API-Änderung

### live-preview-editor
- **Beschreibung**: Side-by-Side oder WYSIWYG Live-Preview im Markdown-Editor (aktuell nur getrennter View/Edit-Modus)
- **Abhängigkeit**: Braucht tabbed-editor-viewer (Editor-Infrastruktur)
- **Priorität**: Mittel
- **Aufwand**: Mittel

### obsidian-plugin-compat
- **Beschreibung**: Compatibility Layer für Obsidian Community Plugins (Plugin-API-Subset, Plugin-Loader)
- **Abhängigkeit**: Braucht obsidian-markdown-compat
- **Priorität**: Niedrig — sehr großer Scope, langfristiges Ziel
- **Aufwand**: Sehr groß

### accessibility-audit
- **Beschreibung**: Systematischer WCAG 2.1 AA Audit aller UI-Komponenten mit anschließenden Fixes (Keyboard-Navigation, Screen-Reader, Kontraste, ARIA)
- **Abhängigkeit**: Querschnittlich — betrifft alle Frontend-Komponenten
- **Priorität**: Niedrig (laufend bei neuen Features beachten)
- **Aufwand**: Mittel

## Gelöschte/Obsolete Specs

| Spec | Grund |
|------|-------|
| `unread-badge-reset-fix` | Obsolet — durch `chat-list-refresh-fix` und nachfolgende Fixes abgedeckt |

## Konventionen

- Spec-Verzeichnis: `.kiro/specs/<feature-name>/`
- Pflichtdateien: `requirements.md` (oder `bugfix.md`), `design.md`, `tasks.md`
- Config: `.config.kiro` mit `specId`, `workflowType`, `specType`
- Task-Status: `- [x]` = fertig, `- [ ]` = offen, `- [ ]*` = optional
