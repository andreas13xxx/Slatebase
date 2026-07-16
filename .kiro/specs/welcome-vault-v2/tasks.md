# Tasks — Welcome Vault v2

## Phase 1: Backend — API-Endpoint für nachträgliches Hinzufügen

### Task 1.1: Welcome-Vault-Route erstellen
- [ ] Neue Datei `backend/src/api/welcomeVaultRoutes.ts` erstellen
- [ ] Route `POST /api/v1/welcome-vault` implementieren:
  - authMiddleware + csrfMiddleware anwenden
  - User-ID und `preferredLanguage` aus Session/User-Profil lesen
  - Namens-Deduplication implementieren (Suffix `(2)`, `(3)`, ... bei Kollision)
  - `welcomeVaultService.createWelcomeVault(userId, language)` aufrufen
  - Bei deaktiviertem Feature-Toggle: 403 mit `{ code: "FEATURE_DISABLED", message, timestamp }`
  - Erfolg: 201 mit `{ vaultId, vaultName }`
  - Fehler: 500 mit Standard-Error-Format
  - Link-Index-Rebuild fire-and-forget nach Erfolg triggern
- [ ] Rate-Limiting hinzufügen: Max 3 Aufrufe pro Stunde pro User (In-Memory Map)
- [ ] Route in `backend/src/index.ts` registrieren (Composition Root)

### Task 1.2: WelcomeVaultService-Anpassung
- [ ] In `welcomeVaultRoutes.ts`: Namens-Deduplication als Hilfsfunktion (`deduplicateVaultName`)
  - Bestehende Vault-Namen des Users über VaultService abfragen
  - Falls Name existiert: Suffix `(2)` bis `(99)` versuchen, dann Timestamp-Fallback
- [ ] Sicherstellen dass `createWelcomeVault` mit dem deduplizierten Namen aufgerufen wird (ggf. neuen Parameter `overrideName?: string` oder den Namen vorab im VaultService prüfen)

### Task 1.3: Tests für Welcome-Vault-Route
- [ ] Integration-Tests in `backend/src/api/welcomeVaultRoutes.test.ts`:
  - Erfolgreiche Erstellung (201, korrekte Response)
  - Feature-Toggle deaktiviert → 403
  - Namens-Deduplication (wenn "Willkommen" bereits existiert → "Willkommen (2)")
  - Unauthentifizierter Request → 401
  - Fehlender CSRF-Token → 403
  - Rate-Limit-Überschreitung → 429

---

## Phase 2: Frontend — UI für nachträgliches Hinzufügen

### Task 2.1: IApiClient erweitern
- [ ] `createWelcomeVault()` Methode in `IApiClient` Interface hinzufügen
- [ ] Implementierung in `ApiClient`: `POST /api/v1/welcome-vault`, Response-Typ `{ vaultId: string; vaultName: string }`

### Task 2.2: Settings-Button
- [ ] In der Konto-Sektion der Settings einen Button "Anleitungs-Vault erstellen" hinzufügen
- [ ] Beschreibungstext unter dem Button (was er tut)
- [ ] Loading-State während Request
- [ ] Erfolg: Toast-Benachrichtigung mit Vault-Namen, Vault-Tree refreshen (dispatch `REFRESH_VAULT_TREES`)
- [ ] Fehler: Toast mit passender Fehlermeldung (Feature disabled / generischer Fehler)
- [ ] CSS-Styling mit Design Tokens (kein Inline-Style)

### Task 2.3: Command Palette Integration
- [ ] Neuer Built-in-Command `create-welcome-vault` in `CommandPaletteContainer.tsx`
- [ ] Kategorie: `vault`
- [ ] Name: `t('commands.createWelcomeVault')` — "Anleitungs-Vault erstellen" / "Create tutorial vault"
- [ ] Execute: selbe Logik wie Settings-Button (Toast + Tree-Refresh)

### Task 2.4: i18n-Strings
- [ ] Deutsche Strings in `de.ts` hinzufügen (settings.account.createWelcomeVault, etc.)
- [ ] Englische Strings in `en.ts` hinzufügen (identische Struktur)
- [ ] Strings für Toast-Nachrichten (Erfolg, Fehler, Feature disabled)
- [ ] Command-Palette-Label

---

## Phase 3: Template-Inhalte — Grundlagen & Features (DE)

### Task 3.1: Ordnerstruktur anlegen
- [ ] Bestehenden Inhalt von `data/templates/welcome-vault/` sichern/entfernen
- [ ] Neue Ordnerstruktur erstellen:
  ```
  Grundlagen/
  Features/
  Fortgeschritten/
  Praxis/
  Screenshots/
  Vorlagen/
  ```
- [ ] `_meta.md` mit Version 1.0.0 und Datum erstellen
- [ ] `Start hier.md` neu schreiben: Übersicht aller Bereiche, gruppierte Wikilinks, Callout mit Tipp

### Task 3.2: Grundlagen-Guides schreiben (DE)
- [ ] `Grundlagen/Erste Schritte.md` — Inhaltsverzeichnis + Empfohlene Reihenfolge
- [ ] `Grundlagen/Markdown Syntax.md` — Headings, Formatierung, Listen, Tabellen, Code-Blöcke, Horizontale Linien (mit Beispielen)
- [ ] `Grundlagen/Navigation und Tabs.md` — Tabs öffnen/schließen, Split-View, Tab-Reihenfolge, aktive Datei
- [ ] `Grundlagen/Datei-Explorer.md` — Erstellen, Umbenennen, Verschieben, DnD, Kontextmenü, Favoriten
- [ ] `Grundlagen/Editor und Viewer.md` — Edit/View-Modi, Toolbar-Funktionen, Auto-Save, Line Numbers, Undo/Redo

### Task 3.3: Feature-Guides schreiben (DE)
- [ ] `Features/Übersicht.md` — Inhaltsverzeichnis aller Feature-Guides
- [ ] `Features/Wikilinks.md` — Syntax, Pfade, Aliase, Heading-Links, Block-Referenzen, Auto-Resolve
- [ ] `Features/Embeds.md` — Bilder, PDFs, Notizen, Größenangaben (`|400`), Inline-PDF
- [ ] `Features/Callouts.md` — Alle Typen (tip, warning, info, note, danger, quote, bug, example, abstract, success, question, failure), faltbare Callouts
- [ ] `Features/Tags und Properties.md` — Tag-Syntax, verschachtelte Tags, Frontmatter YAML, Properties im Context Panel
- [ ] `Features/Suche und Ersetzen.md` — Volltextsuche, Regex, Multi-Vault, Kontext-Zeilen, Replace
- [ ] `Features/Knowledge Graph.md` — Was der Graph zeigt, Navigation, Zoom/Pan, Konfiguration (Farben, Layout), Tag-/Property-Nodes
- [ ] `Features/Context Panel.md` — Outline, Forward-Links, Backlinks, Tags, Properties, Splits, Tab-Reihenfolge
- [ ] `Features/Mermaid Diagramme.md` — Flowchart, Sequenz, Gantt, Pie, Class, State (jeweils ein Beispiel)
- [ ] `Features/Vorlagen und Daily Notes.md` — Template-Verzeichnis, Platzhalter (date/time/title), Daily Note per Shortcut/Button
- [ ] `Features/Papierkorb und Versionen.md` — Soft-Delete, Restore, Retention, Dateiversionen, Inline-Diff, Cleanup
- [ ] `Features/Canvas.md` — Text-/File-/Link-/Group-Nodes, Edges, Zoom/Pan, Minimap, Source-View, Toolbar
- [ ] `Features/Command Palette.md` — Ctrl+P, Befehlssuche, Keyboard-Navigation, Kategorien
- [ ] `Features/Vault-Verwaltung.md` — Erstellen, Löschen, Teilen (Lesen/Schreiben), Transfer, Statistiken
- [ ] `Features/Einstellungen.md` — Konto, Darstellung, Vault-Konfiguration, Tastenkürzel, Feature-Toggles (Admin)
- [ ] `Features/Chat.md` — Konversationen erstellen, Nachrichten, Unread-Badge, Archivieren, Verlassen
- [ ] `Features/Sync.md` — CouchDB-Setup, Setup-URI, Manuell, E2E-Verschlüsselung, Konflikte (⚠️ experimentell)

### Task 3.4: Fortgeschritten-Guides schreiben (DE)
- [ ] `Fortgeschritten/Übersicht.md` — Inhaltsverzeichnis
- [ ] `Fortgeschritten/Regex Suche.md` — Regex-Patterns, Character Classes, Capture Groups, Lookahead
- [ ] `Fortgeschritten/Canvas Workflows.md` — Brainstorming, Projektplanung, Mindmaps, File-Node-Verlinkung
- [ ] `Fortgeschritten/Tastenkürzel anpassen.md` — Settings → Keybindings, Aufnahme, Konflikterkennung, Mod-Key
- [ ] `Fortgeschritten/Vault Sync einrichten.md` — CouchDB-Installation, Setup-URI, Troubleshooting, Konflikte
- [ ] `Fortgeschritten/MCP Context Server.md` — Was ist MCP, Token erstellen, AI-Clients konfigurieren
- [ ] `Fortgeschritten/Obsidian Plugins.md` — Installation via ZIP, kompatible Plugins, Einschränkungen, Fehler

### Task 3.5: Praxis-Übungen schreiben (DE)
- [ ] `Praxis/Übersicht.md` — Inhaltsverzeichnis mit Schwierigkeitsgrad
- [ ] `Praxis/Übung 1 - Erste Notiz.md` — Datei erstellen, Markdown formatieren, speichern
- [ ] `Praxis/Übung 2 - Verlinkung.md` — Wikilinks erstellen, Backlinks prüfen, Graph erkunden
- [ ] `Praxis/Übung 3 - Projekt organisieren.md` — Ordner anlegen, Tags vergeben, Template nutzen
- [ ] `Praxis/Übung 4 - Suche meistern.md` — Volltextsuche, Regex, Ersetzen in mehreren Dateien
- [ ] `Praxis/Übung 5 - Canvas erstellen.md` — Brainstorming-Board mit Text- und File-Nodes, Edges
- [ ] `Praxis/Beispielprojekt/Projektplan.md` — Realistischer Projektplan mit Callouts/Tags
- [ ] `Praxis/Beispielprojekt/Meeting-Notizen.md` — Meeting-Vorlage ausgefüllt
- [ ] `Praxis/Beispielprojekt/Recherche.md` — Notiz mit Embeds, Links, Quellenangaben

### Task 3.6: Vorlagen erstellen (DE)
- [ ] `Vorlagen/Tägliche Notiz.md` — Template mit `{{date}}`, `{{time}}` Platzhaltern
- [ ] `Vorlagen/Meeting-Protokoll.md` — Datum, Teilnehmer, Agenda, Ergebnisse, TODOs
- [ ] `Vorlagen/Projektübersicht.md` — Projektziele, Status, Meilensteine, Team
- [ ] `Vorlagen/Leseliste.md` — Titel, Autor, Status, Notizen, Bewertung

---

## Phase 4: Template-Inhalte — Englische Variante

### Task 4.1: Ordnerstruktur EN anlegen
- [ ] Bestehenden Inhalt von `data/templates/welcome-vault-en/` sichern/entfernen
- [ ] Neue Ordnerstruktur (englische Benennungen):
  ```
  Basics/
  Features/
  Advanced/
  Practice/
  Screenshots/
  Templates/
  ```
- [ ] `_meta.md`, `Start here.md` erstellen

### Task 4.2: Grundlagen-Guides übersetzen (EN)
- [ ] `Basics/Getting Started.md`
- [ ] `Basics/Markdown Syntax.md`
- [ ] `Basics/Navigation and Tabs.md`
- [ ] `Basics/File Explorer.md`
- [ ] `Basics/Editor and Viewer.md`

### Task 4.3: Feature-Guides übersetzen (EN)
- [ ] Alle 17 Feature-Guides aus `Features/` übersetzen (identische Struktur, englische Inhalte)
- [ ] Dateinamen anpassen (z.B. "Suche und Ersetzen" → "Search and Replace")

### Task 4.4: Fortgeschritten-Guides übersetzen (EN)
- [ ] Alle 7 Guides aus `Advanced/` übersetzen
- [ ] Dateinamen anpassen

### Task 4.5: Praxis-Übungen übersetzen (EN)
- [ ] Alle 5 Übungen + 3 Beispielprojekt-Dateien übersetzen
- [ ] Dateinamen anpassen (z.B. "Übung 1" → "Exercise 1")

### Task 4.6: Vorlagen übersetzen (EN)
- [ ] Alle 4 Vorlagen-Dateien übersetzen
- [ ] Dateinamen anpassen ("Daily Note", "Meeting Notes", "Project Overview", "Reading List")

---

## Phase 5: Screenshots erstellen

### Task 5.1: Screenshots aufnehmen
- [ ] Slatebase mit realistischen Beispieldaten starten (Dark Mode)
- [ ] Screenshots aufnehmen (800px Breite, PNG):
  - `gesamtansicht.png` — 3-Panel-Layout vollständig
  - `datei-explorer.png` — Explorer mit expandierten Ordnern
  - `datei-explorer-kontextmenu.png` — Rechtsklick-Menü
  - `editor-toolbar.png` — Editor mit sichtbarer Toolbar
  - `viewer-formatiert.png` — Gerenderte Markdown-Ansicht
  - `tabs-mehrere.png` — Tab-Leiste mit 3+ Tabs
  - `knowledge-graph.png` — Graph mit verknüpften Nodes
  - `context-panel.png` — Panel mit Outline + Links
  - `suche-ergebnisse.png` — Suchpanel mit Treffern
  - `settings-panel.png` — Settings-Overlay
  - `canvas-nodes.png` — Canvas mit verschiedenen Node-Typen
  - `command-palette.png` — Palette mit Ergebnissen
  - `mermaid-diagramm.png` — Gerendertes Flowchart
  - `callout-typen.png` — Mehrere Callout-Typen
  - `dark-mode.png` — Gesamtansicht Dark
  - `light-mode.png` — Gesamtansicht Light
  - `wikilink-autocomplete.png` — Link-Eingabe (falls vorhanden)
  - `papierkorb.png` — Trash-Ansicht
  - `version-diff.png` — Versions-Diff-Ansicht
  - `sync-status.png` — Sync-Panel
  - `chat-ansicht.png` — Chat mit Nachrichten
  - `template-auswahl.png` — Template-Selector-Modal
- [ ] Screenshots in `data/templates/welcome-vault/Screenshots/` ablegen
- [ ] Screenshots in `data/templates/welcome-vault-en/Screenshots/` ablegen (identisch oder übersetzte Variante)

### Task 5.2: Screenshots in Guides einbetten
- [ ] Alle Feature-Guides mit passenden `![[Screenshots/dateiname.png]]` Embeds versehen
- [ ] Bildunterschriften als kursiver Text unter jedem Embed
- [ ] Prüfen dass alle Embeds auflösen (korrekte Pfade)

---

## Phase 6: Qualitätssicherung

### Task 6.1: Konsistenz-Check
- [ ] Alle Wikilinks in beiden Vault-Varianten prüfen (keine Broken Links)
- [ ] Tags konsistent verwenden (#grundlagen, #features, #fortgeschritten, #praxis)
- [ ] Callout-Typen korrekt (`> [!tip]`, `> [!todo]` für Übungen, `> [!warning]` für experimentelle Features)
- [ ] Frontmatter in `_meta.md` valide
- [ ] Keine Markdown-Syntax-Fehler

### Task 6.2: Inhalts-Review
- [ ] Alle Guides auf Vollständigkeit prüfen (deckt alle Acceptance Criteria aus Requirements ab?)
- [ ] Screenshots referenziert und vorhanden
- [ ] Interaktive Übungen sind "safe" (zerstören nichts im Vault)
- [ ] Sprachkonsistenz (DE komplett Deutsch, EN komplett Englisch)
- [ ] Vor/Zurück-Links und Querverweise stimmig

### Task 6.3: Integrations-Test
- [ ] Backend starten, neuen User anlegen → Welcome Vault wird korrekt erstellt
- [ ] Alle Dateien vorhanden, Screenshots laden
- [ ] `POST /api/v1/welcome-vault` manuell testen (Postman/curl)
- [ ] Namens-Deduplication testen (2x aufrufen → "Willkommen (2)")
- [ ] Frontend: Settings-Button testen, Toast erscheint, Vault im Explorer sichtbar
- [ ] Frontend: Command Palette "Anleitungs-Vault erstellen" testen

---

## Zusammenfassung

| Phase | Aufwand (geschätzt) | Abhängigkeiten |
|-------|--------------------:|----------------|
| Phase 1: Backend API | ~4h | — |
| Phase 2: Frontend UI | ~3h | Phase 1 |
| Phase 3: DE-Inhalte | ~12–16h | — (parallel zu Phase 1+2) |
| Phase 4: EN-Inhalte | ~8–12h | Phase 3 (Übersetzung) |
| Phase 5: Screenshots | ~4–6h | Phase 3 (Inhalte müssen stehen) |
| Phase 6: QA | ~3–4h | Phase 1–5 |
| **Gesamt** | **~34–45h** | |

