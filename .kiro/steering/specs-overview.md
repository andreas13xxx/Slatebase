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
| 7 | `user-chat` | Feature | 🟡 Kern fertig | Echtzeit-Chat zwischen Benutzern (optionale PBT-Tests offen) |
| 8 | `chat-enhancements` | Feature | ✅ Fertig | Unread-Badges, Archivierung, Leave-Funktion, Pagination |
| 9 | `chat-list-refresh-fix` | Bugfix | ✅ Fertig | Konversationsliste aktualisiert sich nach Senden/Tab-Wechsel |
| 10 | `vault-sync` | Feature | ✅ Kern fertig | CouchDB-basierte Vault-Synchronisation (optionale PBT-Tests offen) |
| 11 | `obsidian-markdown-compat` | Feature | 📋 Geplant | Wikilinks, Embeds, Obsidian-kompatibles Rendering |
| 12 | `mcp-context-server` | Feature | 📋 Geplant | AI Context Server mit MCP-Integration (Kern-Feature) |
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

## Offene Specs

### vault-sync — Optionale Tasks
- **Offen**: Property-Based Tests (Tasks 2.2, 2.3, 2.5, 4.3, 6.3, 6.4, 8.2, 8.5, 10.2, 10.3)
- **Kern-Implementierung**: Vollständig (Backend Sync-Modul + Frontend UI + Composition Root)
- **Priorität**: Niedrig (optionale Qualitätssicherung)

### user-chat — Optionale Tasks
- **Offen**: Property-Based Tests (Task 12) und Integration Tests (Task 13)
- **Kern-Implementierung**: Vollständig (Backend + Frontend + Composition Root)
- **Priorität**: Niedrig (optionale Qualitätssicherung)

## Geplante Specs (noch keine Spec-Dateien vorhanden)

### obsidian-markdown-compat
- **Beschreibung**: Wikilinks (`[[Link]]`), Embeds (`![[Datei]]`), Callouts, Tags — Obsidian-kompatibles Markdown-Rendering
- **Abhängigkeit**: Braucht Markdown-Rendering-Infrastruktur aus MVP (remark-parse, remark-gfm)
- **Priorität**: Hoch — Kern-Feature für Obsidian-Vault-Kompatibilität
- **Aufwand**: Mittel

### mcp-context-server
- **Beschreibung**: AI Context Server mit Model Context Protocol (MCP) Integration. Ermöglicht KI-Assistenten den Zugriff auf Vault-Inhalte über standardisierte MCP-Endpunkte.
- **Abhängigkeit**: Braucht auth-and-user-management + Vault-Zugriff
- **Priorität**: Hoch — namensgebendes Feature ("Knowledge-Context-Server")
- **Aufwand**: Mittel-Groß

### knowledge-graph
- **Beschreibung**: Visuelle Darstellung der Verlinkungen zwischen Notizen (interaktiver Graph mit Nodes und Edges)
- **Abhängigkeit**: Braucht obsidian-markdown-compat (Wikilink-Parsing für Link-Extraktion)
- **Priorität**: Mittel
- **Aufwand**: Groß

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
