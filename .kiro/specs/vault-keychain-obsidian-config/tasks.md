# Implementation Plan: Vault-Schlüsselbund und Obsidian-Konfiguration

Pro Phase: Review (tsc, lint, neue und direkt betroffene Tests, Diff), dann Commit. Nach allen Phasen: Push, PR, CI grün (höchstens 3 Durchläufe). Keine wiederholten Voll-Läufe der Testsuite.

## Tasks

- [ ] 0. Formate prüfen (nur Recherche, Ergebnis als Notiz in `design.md`)
  - Schlüssel und Werte von `app.json` gegen Obsidian-Doku und eine echte Datei prüfen
  - Formate von `bookmarks.json`, `hotkeys.json`, `templates.json`, `daily-notes.json`, `workspaces.json`, `graph.json`, `core-plugins.json`
  - _Requirements: 5.2, 6_

- [ ] 1. Keychain-Backend
  - [ ] 1.1 `backend/src/keychain/` mit `KeychainService`, ID- und Größenvalidierung
  - [ ] 1.2 Routen `/api/vaults/:vaultId/keychain`, Berechtigungen, Vault-Cleanup
  - [ ] 1.3 Tests (Service, Routen, Berechtigungen)
  - _Requirements: 1_

- [ ] 2. Migration und Abbau der Plugin-Secrets
  - [ ] 2.1 `keychain/legacy-migration.ts` (Kollision, Normalisierung, idempotent) und Start-Hook in `index.ts`
  - [ ] 2.2 `plugin/secret-store.ts`, Plugin-Secret-Routen und Verweise entfernen
  - [ ] 2.3 Tests; `installed-plugin-store.test.ts`, `legacy-migration.test.ts`, `vault-authorization-middleware.test.ts` anpassen
  - _Requirements: 3_

- [ ] 3. Plugin-Shim und Keychain-UI
  - [ ] 3.1 `SecretStorage` auf `KeychainClient` umbauen (ohne Crypto, ohne localStorage), eine Instanz pro Vault
  - [ ] 3.2 Hinweis in der Plugin-Berechtigungsanzeige
  - [ ] 3.3 `KeychainSection.tsx`, Registry-Eintrag, axe-Test
  - [ ] 3.4 Plugin-Compat-Tests
  - _Requirements: 2, 4_

- [ ] 4. Checkpoint: Keychain komplett, danach ersten Commit-Block prüfen

- [ ] 5. app.json
  - [ ] 5.1 `shared/app-config-file.ts` und Route `app-config`, Tests
  - [ ] 5.2 `VaultConfigContext`; feste Werte im Code per Grep finden und umstellen
  - [ ] 5.3 `vault.getConfig()` / `setConfig()` im Shim
  - [ ] 5.4 UI-Sektion „Editor und Dateien"
  - [ ] 5.5 Einmalige Migration `.slatebase/config.json` → Obsidian-Dateien, `VaultConfigSection` auf die neue Quelle umstellen (benötigt die Formate von `templates.json` und `daily-notes.json` aus Task 0)
  - _Requirements: 5_

- [ ] 6. Weitere Vault_Files
  - [ ] 6.1 `obsidian-config/` mit gemeinsamem Lock-/Merge-Helfer
  - [ ] 6.2 `bookmarks.json`, danach `hotkeys.json` inklusive Migration aus User-Preferences
  - [ ] 6.3 `templates.json`, `daily-notes.json`
  - [ ] 6.4 `workspaces.json`
  - [ ] 6.5 `graph.json` und `core-plugins.json` (lesen)
  - _Requirements: 6_

- [ ] 7. Geltungsbereich
  - [ ] 7.1 Leserang User > Vault > Standard, Preferences nur noch als Überlagerung
  - [ ] 7.2 Badges „Vault" / „Nur ich" in den Einstellungen
  - _Requirements: 7_

- [ ] 8. Doku
  - [ ] 8.1 README, `AGENTS.md`, `.kiro/steering/structure.md`, `SECURITY-AUDIT.md`
  - _Requirements: 8.1_
