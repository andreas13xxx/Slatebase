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
| 11 | `obsidian-markdown-compat` | Feature | ✅ Fertig | Wikilinks, Embeds (Bilder, PDFs inline, Notizen), Callouts, Tags — Obsidian-kompatibles Rendering |
| 12 | `mcp-context-server` | Feature | ✅ Fertig | AI Context Server mit MCP-Integration (Kern-Feature) |
| 13 | `context-panel` | Feature | ✅ Fertig | Rechtes Seitenpanel mit Outline, Links, Tags, Properties (Tab-Navigation, Drag & Drop, Split-Sections) |
| 14 | `knowledge-graph` | Feature | ✅ Fertig | Visuelle Darstellung der Verlinkungen zwischen Notizen (interaktiver Graph mit Nodes und Edges) |
| 15 | `live-preview-editor` | Feature | 📋 Geplant | Side-by-Side oder WYSIWYG Live-Preview im Editor |
| 16 | `obsidian-plugin-compat` | Feature | 📋 Geplant | Obsidian Community Plugin Compatibility Layer |
| 17 | `accessibility-audit` | Feature | 📋 Geplant | WCAG 2.1 AA Compliance (systematischer Audit + Fixes) |

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
        │     └── obsidian-plugin-compat (braucht Obsidian-Kompatibilität)
        └── accessibility-audit (querschnittlich, alle UI-Komponenten)
```

## Geplante Specs (noch keine Spec-Dateien vorhanden)

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
- Task-Status: `- [x]` = fertig, `- [ ]` = offen, `- [ ]*` = optional
