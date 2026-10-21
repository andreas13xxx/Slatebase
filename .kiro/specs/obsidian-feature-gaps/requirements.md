# Obsidian Feature Gaps — Requirements

Ergebnis des Abgleichs der Obsidian-Hilfeseiten (obsidian.md/de/help, 179 Seiten) gegen
Slatebases implementierte Features (Stand 2026-10-21). Hier stehen nur die Lücken, die
Andreas zur Umsetzung freigegeben hat. Entscheidungen des Abgleichs:

- **Outgoing Links** und **Random Note** sind bereits vorhanden (nur Doku war unvollständig,
  in `product.md` ergänzt) — nicht Teil dieser Spec.
- **Multi-Cursor**: Grundlage vorhanden (CM6 `allowMultipleSelections`, Obsidian-Compat-Commands
  `add-cursor-above`/`add-cursor-below`), aber die native CM6-Interaktion fehlt — siehe R7.
- **Importer**: KEIN Plugin-Weg in Slatebase. Es gibt nur einen generischen Datei-/Ordner-Import
  (`backend/src/import/`), keinen Format-Konverter. Der Fremdformat-Importer bleibt als
  **Prio 6** im `implementation-plan.md` (eigener Track) — nicht hier dupliziert.

## Pflicht-Features (zur Umsetzung vorgesehen)

### R1 — Aliases ✅ ERLEDIGT (Branch feature/obsidian-feature-gaps)
→ **Vollständige Spec: `.kiro/specs/aliases/`** (requirements + design + tasks).
- Umgesetzt: Backend-Route `GET /vaults/:vaultId/aliases` (über `getPropertyValues('aliases')`
  + `getFilesByProperty`), `IApiClient.getVaultAliases`, `state/aliasStore.ts` (Map +
  Original-casing-Entries, `vault:change`-Invalidierung, Vault-Wechsel-Lifecycle in `App.tsx`),
  Resolver-Erweiterung (`resolveWikilinkTargetWithAlternatives` optionaler `aliasMap`-Parameter,
  Alias-Pass NUR nach erfolglosem Namens-/Pfad-Pass), Verdrahtung in ViewMode + Live-Preview-Click,
  Quick-Switcher-Alias-Treffer („Alias → Datei", dedupliziert gegen Namenstreffer).
- Wikilink-Resolver (`frontend/src/plugins/link-resolver.ts`) matcht jetzt gegen Aliase.
- Der Quick Switcher (Ctrl+O) zeigt Alias-Treffer, sichtbar als „Alias → Datei".
- Aliase werden bereits im Property-Editor gespeichert (Listen-Typ); Auflösung + Switcher-Index
  sind jetzt implementiert. Reservierter Property-Key `aliases` (`RESERVED_PROPERTY_KEYS`).
- Offener Folgeschritt (bewusst außerhalb Scope): Alias-Anzeige im Explorer-Titel, Alias-Pass
  in Backlinks/Unlinked-Mentions, `[[`-Autovervollständigung. (Der QuickSwitcher wurde bei der
  Gelegenheit vollständig auf i18n umgestellt — neuer `quickSwitcher`-Namespace in de.ts + en.ts.)

### R2 — Workspaces (benannte Layouts)
→ **Vollständige Spec: `.kiro/specs/workspaces/`** (requirements + design + tasks).
- Als Benutzer möchte ich das aktuelle Panel-/Pane-Layout als benannten Workspace speichern und
  zwischen mehreren Workspaces umschalten.
- Baut auf dem vorhandenen Split-Panes-Pane-Baum + Persistenz auf (`state/paneTreeState.ts`,
  `workspaceStore.ts`). Heute wird genau EIN Layout pro Vault persistiert.
- Entspricht dem zurückgestellten Rest von Track G im `implementation-plan.md`.

### R3 — Unique Note / Zettelkasten-Prefix
- Als Benutzer möchte ich per Command eine neue Notiz mit einem Zeitstempel-Prefix
  (z. B. `YYYYMMDDHHmmss`) an einem konfigurierbaren Zielort anlegen.
- Baut auf dem vorhandenen Template-/Daily-Note-Mechanismus auf (`state/dailyNoteService.ts`,
  `template-service.ts`), nur anderes Benennungsschema + Zielordner-Config.

### R4 — Web Viewer (eingebettete Webseiten)
- Als Benutzer möchte ich eine URL als Tab-Inhalt öffnen und `![](url)` als eingebettete Webseite
  rendern.
- Canvas kann bereits Link-Nodes mit iframe (`LinkNodeRenderer.tsx`); hier als allgemeiner
  Viewer-Tab. Sicherheitsrahmen: CSP `frame-src 'self' https:` ist bereits gesetzt.

### R5 — Bases List-View
- Als Benutzer möchte ich einen `.base` zusätzlich als flache Listen-Ansicht (`type: list`) sehen.
- Dritter eingebauter View-Typ neben `table`/`cards`. `BUILT_IN_VIEW_TYPES` in `BasesView.tsx`
  erweitern; nutzt dieselbe Query-Pipeline.

### R6 — Bases Map-View (Geo)
- Als Benutzer möchte ich `.base`-Zeilen mit Geo-Koordinaten-Properties auf einer Karte sehen
  (`type: map`).
- Größter der Pflicht-Posten; braucht eine Lat/Lon-Property-Konvention.
- **Karten-Bibliothek entschieden (Andreas, 2026-10-21): Leaflet + react-leaflet.** Begründung:
  BSD-2-Lizenz (kein proprietäres Mapbox GL v2), ~42 KB Bundle (DOM/Canvas, keine GPU nötig),
  Raster-Tiles + einfache Marker decken den „Notiz-Pins auf einer Karte"-Use-Case vollständig ab;
  MapLibre GL (Vektor/3D/WebGL, ~800 KB) wäre Overkill. Dependency-Regeln (`tech.md`) beachten:
  gepinnt, Lizenz dokumentiert, `npm audit`.
- **Tile-Quelle als Betreiber-Config (Default deaktiviert).** Jeder Kachel-Request sendet die IP
  des Nutzers an den Tile-Server — ein fest verdrahteter externer Server (OSM-Public, Carto,
  Mapbox) wäre ein stiller Privacy-Leak und bei OSM zusätzlich ein Fair-Use-Verstoß bei mehreren
  Nutzern. Die Tile-URL ist daher Server-Config (leer/deaktiviert per Default; der Betreiber trägt
  seinen eigenen oder einen erlaubten Tile-Server ein), analog zu `SLATEBASE_PROXY_ALLOWED_ORIGINS`
  und dem Whisper-Backend. Ohne konfigurierte Tile-URL ist die Map-View inaktiv/ausgeblendet.

## Multi-Cursor (Teil-Gap, Verifizierung + Vervollständigung)

### R7 — Native Multi-Cursor-Interaktion ✅ ERLEDIGT (Branch feature/obsidian-feature-gaps)
- Vorhanden: CM6-Mehrfachselektion aktiv, Compat-Commands add-cursor-above/below.
- Umgesetzt in `CodeMirrorEditor.tsx`: `drawSelection()` (zeichnet sekundäre Cursor sichtbar),
  `rectangularSelection()` + `EditorView.clickAddsSelectionRange` (Alt+Klick setzt Cursor an
  beliebiger Stelle), `Mod-d` → `selectNextOccurrence` (nächstes Vorkommen zur Selektion). Nur
  dieser eine Suchbefehl gebunden, nicht das ganze `searchKeymap` (Kollision mit Slatebase-Suche).

## Optionale Features (eingeplant, niedrige Priorität)

### O1 — Format Converter
- Obsidian↔anderes Markdown-Flavor als eigenes Werkzeug. Überschneidet sich teilweise mit dem
  Fremdformat-Importer (Prio 6); gemeinsam prüfen.

### O2 — Präsentationsmodus / Slides
- `---`-getrennte Folien als Vollbild-Präsentation. Nische.

### O3 — Audio Recorder (Audiodekoder)
- Reine Audioaufnahme als Datei-Anhang (ohne Transkription). Slatebase hat bereits
  Voice-Transkription (Whisper) — der Recorder-Teil (`MediaRecorder` → Anhang) ließe sich aus
  `editor/dictation/dictation-recorder.ts` ableiten, da die Aufnahme-Infrastruktur schon existiert.

## Bewusst NICHT aufgenommen

- **Pop-out Windows**: Browser-App-Architektur schließt native Multi-Fenster aus; Split-Panes
  decken den Zweck ab.
- Kommerzielle Obsidian-Cloud-Dienste (Sync/Publish/Teams/Catalyst/Payment/Web Clipper, native
  Mobile) — bewusst anders gelöst (self-hosted, git-sync, LiveSync, Web-first, Multi-User).

## Nächster Schritt

Diese Datei ist eine Backlog-Skizze, keine fertige Spec. Vor der Umsetzung je Feature:
Design-Dokument (insb. R6 Map-Library-Entscheidung) und Task-Liste erstellen. Priorisierung
gegenüber den bestehenden Prio-1–8-Posten im `implementation-plan.md` ist offen.
