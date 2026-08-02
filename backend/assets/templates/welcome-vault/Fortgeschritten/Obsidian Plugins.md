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

### ZIP-Datei beschaffen

Eine gültige ZIP enthält mindestens:
- `manifest.json` — Plugin-Metadaten (ID, Name, Version)
- `main.js` — Plugin-Code (JavaScript-Bundle)
- `styles.css` — Optionale Styles

Quellen: GitHub Releases des Plugins oder `.obsidian/plugins/<id>/` aus einer bestehenden Installation.

### Upload und Aktivierung

1. Öffne **Einstellungen → Vault → Plugins**
2. Klicke **"Plugin installieren"** → ZIP auswählen oder per Drag & Drop
3. Slatebase validiert Manifest und prüft Kompatibilität
4. Nach Installation: **Aktivierungs-Toggle** einschalten
5. Plugin wird geladen, Commands registriert, Styles injiziert

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

## Verwandte Features

- [[Features/Command Palette]] — Plugin-Commands in der Palette
- [[Features/Einstellungen]] — Plugin-Verwaltung
- [[Fortgeschritten/Tastenkürzel anpassen]] — Plugin-Shortcuts konfigurieren
