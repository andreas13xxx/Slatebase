# Implementation Plan: app.json-Kompatibilität

Spec zuerst. Pro Phase: Review (tsc, lint, neue und direkt betroffene Tests, Diff), dann Commit, danach die Doku der Phase aktualisieren. Nach allen Phasen: Push, PR, CI grün (höchstens 3 Durchläufe), Sage-Review, alle Funde beheben; Merge entscheidet Andreas. Keine wiederholten Voll-Läufe der Testsuite.

## Tasks

- [x] 0. Verifikation (nur Recherche, Ergebnis in `design.md` und `docs/app-json.md`)
  - [x] 0.1 Schlüssel, Typen, Enum-Werte und Defaults gegen echte Dateien, `obsidian.d.ts` und Obsidian-Hilfe prüfen; Tabelle "Ungesichert" im Design abarbeiten
  - [x] 0.2 Format von `userIgnoreFilters` und `trashOption` klären
  - [x] 0.3 Bestandsaufnahme der übrigen `.obsidian/`-Dateien: was liest/schreibt Slatebase schon
  - [x] 0.4 Plugin-Größen: Obsidian-Limits und Release-Assets der größten Community-Plugins messen
  - [x] 0.5 `workspaces.json`: Form belegen und prüfen, ob unbekannte Felder Obsidians Rundreise überleben
  - [x] 0.6 `types.json`, `bookmarks.json`, `appearance.json`: Formate und Typnamen mit echten Dateien belegen
  - _Requirements: 1, 2, 3, 9, 10, 12, 13, 16_

- [x] 1. Referenzdoku
  - [ ] 1.1 `docs/app-json.md` (Schlüssel, Typ, Werte, Default, Status, Quelle)
  - [ ] 1.2 Verweise aus README, AGENTS.md, structure.md; Kommentar in `app-config.ts`
  - _Requirements: 1_

- [x] 2. Schema, Store und Defaults
  - [ ] 2.1 `KeySpec`-Tabelle, Zod-Schema und Store daraus ableiten; Paritätstest Backend/Frontend
  - [ ] 2.2 Enum-Werte korrigieren, Typprüfung statt `typeof`
  - [ ] 2.3 Defaults auf Obsidian_Default; Entscheidung zum offenen Punkt der Migration vorab
  - [ ] 2.4 Pass-Through-Pfad in der Route für unbekannte Schlüssel
  - _Requirements: 2, 3, 5.1, 5.3_

- [x] 3. Migration der Defaults
  - [ ] 3.1 `migrateAppConfigDefaults()`, Marker pro Vault, Start-Hook
  - [ ] 3.2 `vault:change` nach dem Schreiben, Tests (Slatebase-Vault, Obsidian-Vault, idempotent, schreibgeschützt, kein Objekt)
  - _Requirements: 4_

- [ ] 4. Funktion hinter vorhandenen toten Schlüsseln
  - [ ] 4.1 `newFileLocation`/`newFileFolderPath`
  - [ ] 4.2 `defaultViewMode`
  - [ ] 4.3 `strictLineBreaks`
  - [ ] 4.4 `showFrontmatter`/`propertiesInDocument`
  - [ ] 4.5 `foldHeading`/`foldIndent`
  - [x] 4.6 `alwaysUpdateLinks` abschaltbar (Routen, Shim, Tests); `getConfig("updateInternalLinks")` folgt dem Wert
  - _Requirements: 6.1–6.6, 6.13, 7.3_

- [ ] 5. Neue Schlüssel mit Funktion
  - [ ] 5.1 Editor: `useTab`/`tabSize`, `autoPair*`, `showInlineTitle`, `smartIndentList`, `showIndentGuide`, `rightToLeft`
  - [ ] 5.2 Dateien: `userIgnoreFilters`, `showUnsupportedFiles`, `trashOption`/`promptDelete`
  - [ ] 5.3 `spellcheckLanguages`
  - [ ] 5.4 Nicht umsetzbare Schlüssel als Pass-Through dokumentieren (`vimMode`, `nativeMenus`, `mobilePullAction`)
  - _Requirements: 5, 6.7–6.13_

- [ ] 6. Einstellungs-UI
  - [ ] 6.1 `EditorFilesSection.tsx` erweitern oder in Unterabschnitte teilen
  - [ ] 6.2 Palette-Befehle für Schalter, i18n de/en, axe-Test
  - _Requirements: 5.2_

- [x] 7. Plugin-API
  - [x] 7.1 `vault.setConfig()`, Event `config-changed`
  - [x] 7.2 Tests in `plugins/compat/`
  - _Requirements: 7_

- [x] 8. Diagnose und gemeinsame Bausteine
  - [ ] 8.1 `deviation-reporter.ts` (Server) und `console.warn`-Hilfe (Client); Schemas von `app.json` melden darüber (unbekannter Schlüssel, Enum, Typ, Struktur); Pass-Through-Schlüssel ausnehmen
  - [x] 8.2 `obsidian-config-file.ts` um `types.json` erweitert; appearance.json nutzt weiter den Lock von `appearance-file.ts`, den auch Theme- und Snippet-Dienst haben (ein Lock pro Datei, kein Zusammenführen nötig)
  - [ ] 8.3 Gemeinsamer Migrations-Hook `migrateUserDataToVaultFiles()` mit Marker je Datei und Vault
  - [ ] 8.4 Tests (Deduplizierung, Kürzung, keine Notizinhalte im Log)
  - _Requirements: 8, 18_

- [x] 9. appearance.json (Abweichung: keine Migration der Hell/Dunkel-Wahl pro User; das Basis-Theme des Vaults gilt nur für Nutzer auf „System“)
  - [x] 9.1 Format prüfen (Task 0), Schema, Service, Route, Store
  - [x] 9.2 `AppearanceLifecycle`: CSS-Variablen, `theme-dark`/`theme-light`, `system`; Akzentfarbe als HSL
  - [x] 9.3 `AppearanceSection.tsx`: Basis-Theme, Akzentfarbe, Schriftgrößen, drei Schriftarten, sofortige Wirkung, gesperrt ohne Schreibzugriff
  - [ ] 9.4 Migration der bisherigen Hell/Dunkel-Wahl; Tests (inklusive axe)
  - _Requirements: 9_

- [x] 10. Plugin-Limits
  - [ ] 10.1 Messung: Obsidian-Verhalten und Größen verbreiteter Community-Plugins (Task 0.4)
  - [ ] 10.2 `plugin/limits.ts` als einzige Quelle; Werte anheben; Fehlermeldung mit Limit, Größe, Datei
  - [ ] 10.3 Grenzfalltests in Installer, Store und Validierung
  - _Requirements: 10_

- [x] 11. Tagesnotizen
  - [ ] 11.1 Formatierer mit Moment-Token-Teilmenge; vorhandenen Moment-Shim in `install-globals.ts` prüfen und wiederverwenden
  - [ ] 11.2 Tagesnotiz-Befehl, Unterordner, Pfadprüfung, vorhandene Notiz finden
  - [ ] 11.3 Einstellung `format` mit Vorschau in `VaultConfigSection.tsx`; `autorun`
  - [ ] 11.4 Plugin-API (Calendar, Daily Notes Interface) auf denselben Formatierer
  - _Requirements: 11_

- [ ] 12. Workspaces vault-weit
  - [ ] 12.1 Format von `workspaces.json` belegen, inklusive Rundreise durch Obsidian (Task 0.5)
  - [ ] 12.2 Konverter Pane-Baum ↔ Obsidian-Layout, Tests mit echten Layouts
  - [ ] 12.3 Service, Route, Store; UI auf vault-weite Datei umstellen; Schreibrechte
  - [ ] 12.4 Migration der Workspaces pro User, Entfernen aus `vaultSettings`
  - _Requirements: 12_

- [ ] 13. Lesezeichen
  - [ ] 13.1 Eintragsformate belegen (Task 0, echte Datei mit Einträgen)
  - [ ] 13.2 Service und Route, Baum aus Gruppen, Limit aufheben
  - [ ] 13.3 `favoritesStore` auf Baum und Datei umstellen, Gruppen-UI, Pfadnachführung serverseitig
  - [ ] 13.4 Migration; Tests inklusive unbekannter Eintragstypen
  - _Requirements: 13_

- [ ] 14. Tastenkürzel
  - [ ] 14.1 Abgleich Obsidian-Kernbefehle ↔ Slatebase (`docs/hotkeys.md`)
  - [ ] 14.2 Fehlende Befehle umsetzen, nach Aufwand in Gruppen, jede Gruppe ein Commit
  - [ ] 14.3 `hotkeys.json` Service, Route, Store; ID-Aliase; `app.hotkeyManager` spiegelt die Datei
  - [ ] 14.4 `KeybindingsSection.tsx`: alle Befehle, Suche, Konflikte, Zurücksetzen
  - [ ] 14.5 Migration der Belegungen pro User; Tests
  - _Requirements: 14_

- [ ] 15. Graph
  - [ ] 15.1 Schema für `graph.json`, Service, Route, Store, Farbformat `{a, rgb}`
  - [ ] 15.2 `GraphView` liest und schreibt (gedrosselt), nicht unterstützte Optionen als Pass-Through
  - [ ] 15.3 Migration; Tests
  - _Requirements: 15_

- [x] 16. Eigenschaftstypen
  - [ ] 16.1 Format und Typnamen belegen (Task 0.6)
  - [ ] 16.2 `PropertyTypeStore` auf `types.json`; Limit anheben; reservierte Schlüssel behalten
  - [ ] 16.3 Migration aus `.slatebase/property-types.json`; Neuladen bei `vault:change`; Tests
  - _Requirements: 16_

- [ ] 17. Kernplugins
  - Zurückgestellt: eigene Spec.
  - _Requirements: 17_

- [x] 17a. Git-Sync (kann vor Task 12 umgesetzt werden, da `workspaces.json` sonst nicht synchronisiert wird)
  - [ ] 17a.1 `MANAGED_GITIGNORE_LINES`: `.obsidian/workspace*.json` auf `.obsidian/workspace.json` einschränken; Ausnahmen für neue `.slatebase/`-Dateien ergänzen, `property-types.json` nach Task 16 entfernen
  - [ ] 17a.2 Tests: Muster gegen alle Dateien dieser Spec; Aktualisierung eines alten Blocks; bisher ignorierte `workspaces.json` wird beim nächsten Lauf committet
  - [ ] 17a.3 Konfliktfall: JSON mit Konfliktmarkierungen wird nicht überschrieben, Warnung erscheint, Konfliktmeldung des Sync nennt die Datei
  - [ ] 17a.4 Doku: Git-Sync-Abschnitt in `structure.md`, README/Doku des Sync, Hinweis auf LiveSync
  - _Requirements: 19_

- [x] 17b. Automatische Konfliktauflösung im Git-Sync (nach 17a)
  - [ ] 17b.1 `git-sync/config-merge.ts`: Dreiwege-Merge auf Schlüsselebene (Regeln: verschiedene Schlüssel kombinieren, Löschung respektieren, gleicher Schlüssel: neuerer Commit gewinnt mit Console-Warnung)
  - [ ] 17b.2 Listenregeln für `bookmarks.json` und `hotkeys.json`; Ganzdatei-Regel für Workspaces und Graph-Farbgruppen
  - [ ] 17b.3 Einbindung in `sync-engine.ts`: Stände per `git show :1/:2/:3` lesen, schreiben, `git add`, Merge-Commit abschließen; Rückfall auf bisheriges Verhalten bei Fehlern und anderen Dateien
  - [ ] 17b.4 Tests mit echten Git-Repositories (ein Konflikt je Regel, gemischt mit nicht auflösbarem Konflikt, ungültiges JSON)
  - [ ] 17b.5 Doku: Sync-Abschnitt in `structure.md`, README
  - _Requirements: 19.5, 20_

- [ ] 18. Abschluss
  - [ ] 18.1 Doku final: `docs/app-json.md`, `docs/hotkeys.md`, README, AGENTS.md, structure.md, `VAULT-ROUTE-AUTHORIZATION.md`, CHANGELOG
  - [ ] 18.2 Push, PR, CI, Sage-Review
