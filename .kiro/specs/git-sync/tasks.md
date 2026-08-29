# Implementation Plan: Git-Sync

## Overview

Serverseitiges Git-Sync-Modul: natives `git`-Binary via `execFile`, Credentials verschlüsselt im gemeinsamen `shared-secrets`-Store, Konfiguration/Status pro Vault, periodischer Scheduler + manueller Trigger. Phase 1 (dieser Stand) deckt Backend + REST-API vollständig ab; eine Vault-Settings-UI ist als Phase 2 vorgesehen.

## Tasks

- [x] 1. Gemeinsamer Baustein: Modul-Secret-Store
  - [x] 1.1 Erstelle `backend/src/shared-secrets/secret-key-manager.ts` (`ModuleSecretKeyManager`, eigener Schlüssel/Env-Var, getrennt von Plugin-Secrets)
  - [x] 1.2 Erstelle `backend/src/shared-secrets/secret-store.ts` (`ModuleSecretStore`, generalisiert auf `(vaultId, moduleId, entryId)`)
  - [x] 1.3 Erstelle `backend/src/shared-secrets/secret-store.test.ts` mit Rundtrip-, Persistenz- und Größenlimit-Tests
  - _Requirements: 2.1_

- [x] 2. Git-Sync Datenmodell und Validierung
  - [x] 2.1 Erstelle `backend/src/git-sync/types.ts`, `errors.ts`, `validation.ts`
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 3. Persistenz
  - [x] 3.1 Erstelle `backend/src/git-sync/config-store.ts` (Branch + Remote-Liste pro Vault, Limit 20)
  - [x] 3.2 Erstelle `backend/src/git-sync/status-store.ts` (letzter Lauf-Status pro Remote)
  - [x] 3.3 Erstelle `backend/src/git-sync/config-store.test.ts`
  - _Requirements: 1.1, 1.2, 1.3, 5.4_

- [x] 4. Git-CLI-Wrapper
  - [x] 4.1 Erstelle `backend/src/git-sync/git-cli.ts` (execFile-Wrapper, GIT_ASKPASS-Mechanismus, SSH-Key-Handling mit persistentem known_hosts, Konflikterkennung via `status --porcelain`)
  - [x] 4.2 Erstelle `backend/src/git-sync/git-cli.test.ts` (Integrations-Tests gegen lokale Bare-Repos)
  - _Requirements: 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2_

- [x] 5. Sync-Engine
  - [x] 5.1 Erstelle `backend/src/git-sync/sync-engine.ts` (Orchestrierung: Init, `.gitignore`, Commit, Fetch/Merge/Push, pro-Vault-Lock, Status-Aufzeichnung)
  - [x] 5.2 Erstelle `backend/src/git-sync/sync-engine.test.ts`
  - _Requirements: 3.1, 3.2, 3.3, 3.5, 4.1, 4.2, 4.3, 5.3_

- [x] 6. Scheduler
  - [x] 6.1 Erstelle `backend/src/git-sync/git-sync-scheduler.ts` (Tick-basierte Fälligkeitsprüfung, Fehler-Isolation)
  - [x] 6.2 Erstelle `backend/src/git-sync/git-sync-scheduler.test.ts`
  - _Requirements: 5.1_

- [x] 7. REST-API
  - [x] 7.1 Erstelle `backend/src/api/gitSyncRoutes.ts` (CRUD, Branch-Update, manueller Trigger, Status; Zugriffskontrolle via `checkReadAccess`/`checkWriteAccess`)
  - _Requirements: 1.4, 5.2, 5.4, 6.2, 6.3_

- [x] 8. Verdrahtung
  - [x] 8.1 Feature-Toggle `git-sync` registrieren (default aus) und Routen-Präfixe damit schützen
  - [x] 8.2 Stores/Engine/Scheduler in `backend/src/index.ts` instanziieren, Scheduler bei Server-Start/-Stop starten/stoppen
  - [x] 8.3 `git` + `openssh-client` im Production-Docker-Image installieren (nicht purgen)
  - _Requirements: 6.1_

- [x] 9. Checkpoint — Backend vollständig, alle Tests grün

- [x] 10. Frontend: Vault-Settings-UI (Phase 2)
  - [x] 10.1 `GitSyncSection.tsx`: Liste der Remotes (Status-Badge, Sync-jetzt-/Bearbeiten-/Entfernen-Aktionen), Formular für Anlegen/Bearbeiten (HTTPS-Token vs. SSH-Key), Branch-Einstellung
  - [x] 10.2 Registrierung in `settingsRegistry.ts` (`category: 'vault'`) und `SettingsContent.tsx`
  - [x] 10.3 Beschriftungen als direkte deutsche Strings umgesetzt (konsistent mit den anderen, zuletzt hinzugefügten Vault-Settings-Sections wie `CssSnippetsSection`/`SnippetManager`, die ebenfalls kein i18n-Dictionary verwenden — kein `gitSync.*`-i18n-Namespace nötig)
  - [x] 10.4 Feature-Toggle-Default auf `defaultEnabled: true` gestellt (Requirement 6.1) und Feature-gated UI ergänzt (Requirement 6.4): `ISettingsSectionDef.feature`, `SettingsNavList` deaktiviert den Nav-Eintrag mit Tooltip-Hinweis wenn das Feature aus ist, `SettingsContent` zeigt eine geteilte `FeatureDisabledHint`-Komponente (auch von `App.tsx`s Legacy-Tab-Router wiederverwendet, dessen lokale Kopie dafür entfernt wurde) statt der eigentlichen Sektion

- [x] 11. Fixes aus Live-Tests
  - [x] 11.1 `git init --initial-branch` benötigt Git ≥ 2.28 und schlug auf älteren Git-Versionen fehl; `GitCli.init()` nutzt jetzt `git init` + `git symbolic-ref HEAD refs/heads/<branch>` (funktioniert mit jeder Git-Version)
  - [x] 11.2 Push auf einen frischen/leeren Vault ohne committen Inhalt schlug mit "src refspec ... does not match any" fehl, da `refs/heads/<branch>` ohne ersten Commit nicht existiert; `GitCli.hasCommits()` ergänzt, `GitSyncEngine` überspringt den Push (Ergebnis `success`), wenn der Branch noch keinen Commit hat

- [x] 12. Kritischer Fix aus Live-Test: `isRepo()` erkannte fälschlich das äußere Projekt-Repo
  - [x] 12.1 **Vorfall:** `GitCli.isRepo()` nutzte `git rev-parse --is-inside-work-tree`, das auch dann `true` liefert, wenn `cwd` nur *innerhalb* eines beliebigen Repos liegt (Elternverzeichnis-Suche). Da `backend/data/vaults/<vaultId>/` innerhalb des Slatebase-Projekt-Checkouts liegt, hielt die Engine das Projekt-Repo für "bereits initialisiert", rief nie `init()` auf und führte `configureIdentity`/`remoteAddOrSetUrl`/`commitAll`/`push` gegen das **äußere Projekt-Repo** aus — 5 "Slatebase Sync"-Commits landeten direkt auf `master`, inkl. eines zusätzlichen Fremd-Remotes in `.git/config`. Vault-Inhalte selbst waren nicht betroffen (`backend/data/` ist im Projekt `.gitignore`t), aber Quellcode-Änderungen schon. Keiner der Commits wurde gepusht (SSH-Fehler verhinderte es zufällig).
  - [x] 12.2 **Bereinigung:** Die 5 Commits per `git reset --mixed` vom Projekt-`master` entfernt (Inhalt bleibt als unkommittierte Änderungen erhalten), den fälschlich angelegten Remote aus `.git/config` entfernt.
  - [x] 12.3 **Fix:** `isRepo(cwd)` prüft jetzt direkt auf Existenz von `<cwd>/.git`, statt auf einen beliebigen Vorfahren-Repo zu prüfen — garantiert, dass `init()` immer ein eigenes, isoliertes Repo genau am Vault-Pfad anlegt, unabhängig davon ob der Vault-Ordner zufällig innerhalb eines anderen Repos liegt.
  - [x] 12.4 Regressionstest ergänzt, der genau dieses Szenario nachbildet: äußeres Repo mit Commit, darin verschachtelter (nicht initialisierter) Vault-Ordner — prüft, dass `isRepo` dafür `false` liefert und ein Commit im Vault-Ordner das äußere Repo nicht berührt.

- [x] 13. Fix aus Live-Test: SSH-Key ohne PEM-Rahmung → irreführender Fehler "error in libcrypto: unsupported"
  - [x] 13.1 **Vorfall:** Ein SSH-Key, dessen `-----BEGIN .../-----END ...`-Rahmung beim Kopieren verloren ging (nur der base64-Rumpf wurde eingefügt), scheiterte beim Push mit dem irreführenden, low-level OpenSSL-Fehler `error in libcrypto: unsupported` statt einer klaren Meldung.
  - [x] 13.2 **Fix (Validierung):** `validation.ts` prüft jetzt per `.refine()`, dass ein `ssh-key`-Credential beide Rahmungszeilen enthält (`looksLikeFramedPrivateKey`), mit klarer Fehlermeldung. `validation.test.ts` ergänzt (Create/Update, framed/unframed, https-token unberührt).
  - [x] 13.3 **Fix (Frontend):** `GitSyncSection.tsx` prüft dieselbe Bedingung client-seitig vor dem Absenden, Feldhinweis nennt beide Rahmungszeilen explizit.
  - [x] 13.4 **Erweiterung (Schlüsselgenerierung):** `backend/src/git-sync/ssh-keygen.ts` (`SshKeyGenerator`, Wrapper um `ssh-keygen`) — `generateKeyPair()` erzeugt ein neues ed25519-Schlüsselpaar serverseitig (eliminiert die gesamte Fehlerklasse aus 13.1, da der private Schlüssel nie von Hand kopiert werden muss), `derivePublicKey()` leitet den öffentlichen Schlüssel aus einem beliebigen privaten Schlüssel ab. Neuer Endpunkt `POST /vaults/:vaultId/git-sync/generate-ssh-key` (zustandslos). `GitSyncRemoteConfig.publicKey` wird bei jedem Create/Update mit `authMethod: 'ssh-key'` server-seitig via `derivePublicKey()` gesetzt (auch für von Hand eingefügte Schlüssel) und in der UI dauerhaft mit Kopieren-Button angezeigt (Remote-Liste + Formular, inkl. "Schlüsselpaar generieren"-Button). `ssh-keygen.test.ts` ergänzt (Integrationstest gegen echtes Binary), `config-store.test.ts` um publicKey-Persistenz/Migration-Fallback ergänzt.
  - _Requirements: 1.4, 2.2, 2.3_

- [x] 14. Konfliktbehandlung robuster gemacht + mehr Erfolgs-Info
  - [x] 14.1 **Vorfall/Lücke:** Der Scheduler prüfte bei der Fälligkeit nur das Intervall, nicht den letzten Status — ein Remote mit ungelöstem Konflikt wurde beim nächsten fälligen Tick trotzdem erneut angefasst. Da `commitAll()` bedingungslos `git add -A` + Commit macht, hätte das die Datei **mit den rohen Konfliktmarkern als Inhalt** committet und gepusht, sobald der Nutzer sie nicht rechtzeitig bereinigt hatte — ein automatisches "Scheinlösen" des Konflikts.
  - [x] 14.2 **Fix (Scheduler):** `GitSyncScheduler.isDue()` liefert `false`, solange der letzte Status eines Remotes `conflict` ist — unabhängig vom verstrichenen Intervall. Ein manueller "Jetzt synchronisieren"-Klick (umgeht `isDue`) bleibt der einzige Weg, es nach der Lösung erneut zu versuchen.
  - [x] 14.3 **Fix (Sicherheitsnetz gegen Fehlauflösung):** `GitSyncEngine` prüft zu Beginn jedes Laufs, ob aus einem vorherigen Lauf noch als konfliktbehaftet markierte Dateien existieren (`conflictedFiles()`), und liest deren Inhalt: enthalten sie noch Git-Konfliktmarker (`<<<<<<<`/`>>>>>>>`), wird der Lauf sofort mit demselben `conflict`-Ergebnis abgebrochen, ohne zu committen/pushen. Eine nicht mehr existierende Datei gilt als gelöst (z.B. durch Löschen aufgelöst). Das greift sowohl bei automatischen als auch bei manuellen Läufen.
  - [x] 14.4 **Erweiterung (Erfolgs-Info):** `GitSyncRemoteStatus`/`GitSyncRunOutcome` haben jetzt `lastPulledFiles`/`lastPushedFiles` bzw. `pulledFiles`/`pushedFiles` (Dateianzahl aus `git diff --name-only` zwischen HEAD vor/nach lokalem Commit bzw. vor/nach Merge; `null`/nicht gesetzt bei error/conflict). `GitCli` um `getHead()` und `diffNameOnly()` ergänzt (Diff gegen den leeren Baum `4b825dc642cb6eb9a060e54bf8d69288fbee4904` für den allerersten Commit). UI zeigt bei Erfolg "X Datei(en) geholt, Y Datei(en) gepusht" an.
  - _Requirements: 4.1, 4.2, 5.3_

## Notes

- Phase 1 (Tasks 1–9) und Phase 2 (Task 10) sind vollständig umgesetzt und getestet; Tasks 11–14 beheben Robustheitslücken, die erst bei echten Vaults/Git-Versionen/verschachtelten Repos/Live-Nutzung sichtbar wurden. Task 12 war ein aktiver Vorfall mit echten Auswirkungen auf das Projekt-Repo, siehe 12.1–12.2.
- Kein PBT — Unit-/Integrationstests mit konkreten Edge Cases, passend zur Projektkonvention.
