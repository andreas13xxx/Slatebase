# Implementation Plan: Vault-Schlüsselbund und Obsidian-Konfiguration

Pro Phase: Review (tsc, lint, neue und direkt betroffene Tests, Diff), dann Commit. Nach allen Phasen: Push, PR, CI grün (höchstens 3 Durchläufe). Keine wiederholten Voll-Läufe der Testsuite.

## Tasks

- [x] 0. Formate prüfen (nur Recherche, Ergebnis als Notiz in `design.md`)
  - Schlüssel und Werte von `app.json` gegen Obsidian-Doku und eine echte Datei prüfen
  - Formate von `bookmarks.json`, `hotkeys.json`, `templates.json`, `daily-notes.json`, `workspaces.json`, `graph.json`, `core-plugins.json`
  - _Requirements: 5.2, 6_

- [x] 1. Keychain-Backend
  - [x] 1.1 `backend/src/keychain/` mit `KeychainService`, ID- und Größenvalidierung
  - [x] 1.2 Routen `/api/vaults/:vaultId/keychain`, Berechtigungen, Vault-Cleanup
  - [x] 1.3 Tests (Service, Routen, Berechtigungen)
  - _Requirements: 1_

- [x] 2. Migration und Abbau der Plugin-Secrets
  - [x] 2.1 `keychain/legacy-migration.ts` (Kollision, Normalisierung, idempotent) und Start-Hook in `index.ts`
  - [x] 2.2 `plugin/secret-store.ts`, Plugin-Secret-Routen und Verweise entfernen
  - [x] 2.3 Tests; `installed-plugin-store.test.ts`, `legacy-migration.test.ts`, `vault-authorization-middleware.test.ts` anpassen
  - _Requirements: 3_

- [x] 3. Plugin-Shim und Keychain-UI
  - [x] 3.1 `SecretStorage` auf `KeychainClient` umbauen (ohne Crypto, ohne localStorage), eine Instanz pro Vault
  - [x] 3.2 Hinweis in der Plugin-Berechtigungsanzeige
  - [x] 3.3 `KeychainSection.tsx`, Registry-Eintrag, axe-Test
  - [x] 3.4 Plugin-Compat-Tests
  - _Requirements: 2, 4_

- [x] 4. Checkpoint: Keychain komplett

- [x] 5. app.json
  - [x] 5.1 `shared/obsidian-config-file.ts`, `obsidian-config/app-config.ts` und Route `app-config`, Tests
  - [x] 5.2 `vaultAppConfigStore` + `AppConfigLifecycle`; Anhangsordner, Zeilennummern, Zeilenlänge, Rechtschreibprüfung lesen daraus. Linkformat, neue-Notiz-Ort und Ansichtsmodus setzt der Editor nicht um (eigene Spec)
  - [x] 5.3 `vault.getConfig()` liest app.json (`setConfig` gibt es im Shim nicht und ist in Obsidian nicht öffentlich)
  - [x] 5.4 UI-Sektion „Editor und Dateien" (Anhänge, Zeilenlänge, Zeilennummern, Rechtschreibprüfung)
  - [x] 5.5 Einmalige Migration `.slatebase/config.json` → `app.json` (`attachmentFolderPath`), Anhangsordner aus `app.json` lesen; Vorlagen und Tagesnotizen folgen in 6.3, sobald die Formate von `templates.json` und `daily-notes.json` geprüft sind
  - [x] 5.6 `lineNumbers`, `readableLineLength`, `spellcheck` aus den User-Preferences entfernen, Hooks lesen `app.json`
  - _Requirements: 5_

- [x] 6. Weitere Vault_Files (Teilumfang, siehe Einträge)
  - [x] 6.1 `shared/obsidian-config-file.ts` und `obsidian-config/` mit gemeinsamem Lock-/Merge-Helfer
  - [-] 6.2 `bookmarks.json`, `hotkeys.json`: nicht umgesetzt (Bookmark-Format ohne echte Datei mit Einträgen unbekannt; Slatebase-Befehls-IDs sind nicht Obsidians)
  - [x] 6.3 `templates.json`, `daily-notes.json` (inklusive Migration aus `config.json`; `VaultConfig.dailyNoteTemplate` ist jetzt ein Vault-Pfad)
  - [-] 6.4 `workspaces.json`: nicht umsetzen (Slatebase-Pane-Bäume sind nicht Obsidians Layout-Format)
  - [-] 6.5 `graph.json` und `core-plugins.json`: zurückgestellt (kleiner Nutzen)
  - _Requirements: 6_

- [x] 7. Geltungsbereich
  - [x] 7.1 User-Preferences auf Werte ohne Vault-Gegenstück beschränkt (`lineNumbers`, `readableLineLength`, `spellcheck` entfernt in 5.6)
  - [x] 7.2 Ablehnung mit Meldung für Leser ohne Schreibrecht (Toasts bei Umschaltern, gesperrte Felder in „Editor und Dateien")
  - _Requirements: 7_

- [x] 8. Doku
  - [x] 8.1 README, `AGENTS.md`, `.kiro/steering/structure.md`, `SECURITY-AUDIT.md`
  - _Requirements: 8.1_
