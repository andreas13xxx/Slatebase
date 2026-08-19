---
tags: [fortgeschritten]
---

# Obsidian Plugins

Slatebase bietet eine experimentelle Kompatibilitätsschicht für Obsidian-Plugins. Du kannst ausgewählte Community-Plugins installieren und nutzen — direkt im Browser, ohne Desktop-App.

> [!warning] Kompatibilitätsgrenzen
> Viele Obsidian-Plugins nutzen Desktop-APIs (Node.js, Electron), die im Browser nicht verfügbar sind. Slatebase emuliert nur einen Teil der Obsidian-API. Nicht jedes Plugin funktioniert — erwarte Einschränkungen.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` ist aktiviert (Admin)
- Plugin als ZIP-Datei (von GitHub oder bestehender Obsidian-Installation)

---

## Plugin installieren

### Aus dem Community-Plugin-Verzeichnis (empfohlen)

Slatebase bindet das offizielle Obsidian Community-Plugin-Verzeichnis direkt ein — rund 6000 Plugins, durchsuchbar ohne manuellen Download.

1. Öffne **Einstellungen → Vault → Plugins**
2. Wechsle zum Tab **"Verfügbare Plugins"**
3. Suche per Textsuche oder filtere nach Kategorie; die Filter "Kompatibel" und "Nicht installiert" grenzen die Liste weiter ein
4. Desktop-only Plugins sind ausgegraut markiert ("Nur Desktop") und lassen sich nicht installieren
5. Klicke **"Installieren"** bei einem Plugin — Slatebase lädt das neueste Release automatisch von GitHub herunter und installiert es
6. Nach Installation: **Aktivierungs-Toggle** einschalten

### Manuell per ZIP-Datei

Für Plugins, die (noch) nicht im offiziellen Verzeichnis gelistet sind, oder für lokale/private Forks.

Eine gültige ZIP enthält mindestens:
- `manifest.json` — Plugin-Metadaten (ID, Name, Version)
- `main.js` — Plugin-Code (JavaScript-Bundle)
- `styles.css` — Optionale Styles

Quellen: GitHub Releases des Plugins oder `.obsidian/plugins/<id>/` aus einer bestehenden Installation.

1. Öffne **Einstellungen → Vault → Plugins** → Tab **"Installierte Plugins"**
2. Klicke **"Plugin installieren"** → ZIP auswählen oder per Drag & Drop
3. Slatebase validiert Manifest und prüft Kompatibilität
4. Nach Installation: **Aktivierungs-Toggle** einschalten
5. Plugin wird geladen, Commands registriert, Styles injiziert

---

## Updates

Im Tab **"Installierte Plugins"** zeigt **"Nach Updates suchen"**, ob neuere Versionen verfügbar sind (installierte Version → neueste Version). Einzelne Plugins lassen sich gezielt aktualisieren, oder alle auf einmal über **"Alle aktualisieren"** (sequentiell, um GitHub-Rate-Limits zu schonen). Bestehende Plugin-Einstellungen (`data.json`) bleiben beim Update erhalten.

Slatebase prüft zusätzlich automatisch alle 24 Stunden im Hintergrund auf Updates und zeigt einen Hinweis, falls welche verfügbar sind.

---

## Kompatibilität

### Gut kompatibel

| Kategorie | Warum |
|-----------|-------|
| UI-Erweiterungen (Status Bar, Icons) | Nutzen CSS + DOM-APIs |
| Sidebar-Panels (Calendar, Outline) | Nutzen `registerView()` |
| Command-Plugins | Nutzen `addCommand()` |
| Markdown-Erweiterungen | Arbeiten mit DOM |

### Nicht kompatibel

| Ursache | Erklärung |
|---------|-----------|
| `isDesktopOnly: true` im Manifest | Plugin deklariert sich als Desktop-exklusiv |
| Node.js-Module (`fs`, `path`, `child_process`) | Im Browser nicht verfügbar |
| Electron-APIs | Desktop-Framework ohne Web-Äquivalent |
| Native Bindings (`better-sqlite3`) | Kompilierte Module |

### Kompatibilitäts-Level

Slatebase zeigt nach Installation einen Level an:
- **Kompatibel** — Keine bekannten Einschränkungen
- **Eingeschränkt** — Einige APIs emuliert, Funktionsverlust möglich
- **Inkompatibel** — Nicht unterstützte APIs, wird wahrscheinlich nicht funktionieren

---

## Getestete Plugins

Diese Plugins wurden getestet und funktionieren in Slatebase:

| Plugin | Kompatibilität | Hinweise |
|--------|---------------|----------|
| Calendar | Gut | Sidebar-Kalender, Daily-Note-Erstellung — ⚠️ seit ~2 Jahren kein Update mehr |
| Dataview | Gut | DQL-Queries funktionieren, DataviewJS eingeschränkt |
| Templater | Gut | Datums-/Datei-Funktionen, keine System-Commands |
| Kanban | Gut | Board-Ansicht, Drag & Drop |
| Excalidraw | Eingeschränkt | Zeichenwerkzeuge funktionieren, Libraries nicht |
| LiveSync | Eingeschränkt | Periodic/OneShot empfohlen, LiveSync-Modus Timeout-begrenzt |
| Tasks | Gut | Emoji-Signifikatoren, Query-Blöcke, wiederkehrende Aufgaben |
| Advanced Tables | Gut | Auto-Formatierung, Navigation, Sortierung, Formeln |
| Git | Gut | Commit/Push/Pull über HTTPS + PAT, kein SSH |
| Mind Map | Gut | Überschriften/Listen als interaktive Mindmap — ⚠️ Plugin selbst vermutlich kaputt (siehe Plugin-Guide) |
| Editing Toolbar | Gut | Fixe und schwebende Formatierungsleiste |
| Iconize | Eingeschränkt | Icon-Picker funktioniert, Icons im Dateibaum meist nicht sichtbar |

Siehe die einzelnen [[Fortgeschritten/Plugins/Calendar|Plugin-Guides]] für detaillierte Kompatibilitäts-Informationen.

> [!tip] Ausprobieren statt raten
> Auch "Eingeschränkt" kann funktionieren — die Analyse ist konservativ. Installiere und teste. Du kannst jederzeit deaktivieren.

---

## Fehlerbehandlung

| Problem | Lösung |
|---------|--------|
| Plugin lädt nicht | Browser-Konsole prüfen (F12), Plugin wird automatisch deaktiviert |
| Styles sehen falsch aus | CSS wird per `[data-plugin-id]` isoliert, bei Konflikten deaktivieren |
| App wird langsam | Plugin deaktivieren, Seite neu laden |
| "Umgebung nicht unterstützt" | Plugin ist Desktop-only, kein Workaround |

Slatebase hat einen 5-Sekunden-Timeout für die Plugin-Initialisierung.

---

## Aktivieren / Deaktivieren / Löschen

**Deaktivieren** entfernt: Commands, Views, CSS, Settings-Tabs, Ribbon-Icons. Das Plugin bleibt installiert.

**Löschen** entfernt alle Plugin-Dateien inkl. gespeicherter Einstellungen (unwiderruflich).

---

## Plugin-Einstellungen

Viele Plugins bringen eigene Settings mit:
1. Aktiviere das Plugin
2. In den Einstellungen erscheint ein neuer Plugin-Abschnitt
3. Einstellungen werden pro Vault in `data.json` gespeichert
4. Bleiben bei Plugin-Updates erhalten

---

## Technische Details

### Emulierte APIs

- `Plugin`-Lifecycle (`onload`, `onunload`)
- `Vault` (read, create, modify, delete, getAbstractFileByPath)
- `Workspace` (getLeaf, openLinkText, registerView)
- `addCommand()`, `addSettingTab()`, `addStatusBarItem()`
- `registerView()` für Sidebar und Tab-Views

### Sandbox-Isolation

- Vault-Zugriff nur auf aktiven Vault
- Storage pro Plugin und Vault getrennt
- Netzwerk nur auf erlaubte Domains
- Kein Zugriff auf andere Plugins oder Slatebase-Interna

---

## Plugin-Guides

Ausführliche Anleitungen mit Beispielen und Übungen für getestete Plugins:

| Plugin | Beschreibung | Guide |
|--------|--------------|-------|
| Calendar | Monatskalender + Daily Notes | [[Fortgeschritten/Plugins/Calendar]] |
| Dataview | Vault als abfragbare Datenbank | [[Fortgeschritten/Plugins/Dataview]] |
| Kanban | Visuelle Aufgaben-Boards | [[Fortgeschritten/Plugins/Kanban]] |
| Templater | Dynamische Vorlagen mit JavaScript | [[Fortgeschritten/Plugins/Templater]] |
| Excalidraw | Freihand-Zeichnungen und Diagramme | [[Fortgeschritten/Plugins/Excalidraw]] |
| LiveSync | Bidirektionale Vault-Synchronisation | [[Fortgeschritten/Plugins/LiveSync]] |
| Tasks | Aufgabenverwaltung mit Fälligkeiten und Prioritäten | [[Fortgeschritten/Plugins/Tasks]] |
| Advanced Tables | Tabellen-Editor mit Formeln | [[Fortgeschritten/Plugins/Advanced Tables]] |
| Git | Versionierung mit externem Remote-Repository | [[Fortgeschritten/Plugins/Git]] |
| Mind Map | Notizen als interaktive Mindmap darstellen | [[Fortgeschritten/Plugins/Mind Map]] |
| Editing Toolbar | Formatierungsleiste für den Editor | [[Fortgeschritten/Plugins/Editing Toolbar]] |
| Iconize | Individuelle Icons für Dateien und Ordner | [[Fortgeschritten/Plugins/Iconize]] |

### Praktische Übungen

- [[Praxis/Plugins/Übersicht]] — Übungsübersicht
- [[Praxis/Plugins/Kanban-Board erstellen]] — Kanban-Board aufbauen
- [[Praxis/Plugins/Dataview Queries]] — Dynamische Queries schreiben

---

## Verwandte Features

- [[Features/Command Palette]] — Plugin-Commands in der Palette
- [[Features/Einstellungen]] — Plugin-Verwaltung
- [[Fortgeschritten/Tastenkürzel anpassen]] — Plugin-Shortcuts konfigurieren
