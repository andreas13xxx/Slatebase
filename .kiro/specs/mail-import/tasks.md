# Implementation Plan: Mail-Import

## Overview

Serverseitiges Mail-Import-Modul: `imapflow` + `mailparser` + `turndown`, Passwort verschlüsselt im gemeinsamen `shared-secrets`-Store (siehe git-sync-Spec), Konfiguration/Status pro Vault, periodischer Scheduler + manueller Trigger. Phase 1 (dieser Stand) deckt Backend + REST-API vollständig ab; eine Vault-Settings-UI ist als Phase 2 vorgesehen.

## Tasks

- [x] 1. Mail-Import Datenmodell und Validierung
  - [x] 1.1 Erstelle `backend/src/mail-import/types.ts`, `errors.ts`, `validation.ts`
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Persistenz
  - [x] 2.1 Erstelle `backend/src/mail-import/config-store.ts` (Config-Liste pro Vault, Limit 20)
  - [x] 2.2 Erstelle `backend/src/mail-import/status-store.ts`
  - [x] 2.3 Erstelle `backend/src/mail-import/config-store.test.ts`
  - _Requirements: 1.1, 1.2, 4.1, 4.2, 5.4_

- [x] 3. IMAP-Client
  - [x] 3.1 Erstelle `backend/src/mail-import/imap-client.ts` (`imapflow`-Wrapper: ungelesene Nachrichten auflisten, einzeln abrufen, als gelesen markieren)
  - _Requirements: 4.1_

- [x] 4. Mail-zu-Markdown-Konvertierung
  - [x] 4.1 Erstelle `backend/src/mail-import/mail-to-markdown.ts` (`mailparser` + `turndown`, YAML-Frontmatter, Inline-vs-Attachment-Filterung über `contentDisposition`)
  - [x] 4.2 Erstelle `backend/src/mail-import/mail-to-markdown.test.ts`
  - _Requirements: 2.1, 2.2, 2.3, 3.3_

- [x] 5. Note-Writer
  - [x] 5.1 Erstelle `backend/src/mail-import/note-writer.ts` (Notiz + Anhänge schreiben, Wikilink-Embeds, Vault-Baum-Refresh; wiederverwendet `generateUniqueFilename` aus dem Upload-Modul)
  - [x] 5.2 Erstelle `backend/src/mail-import/note-writer.test.ts`
  - _Requirements: 2.4, 3.1, 3.2, 3.4_

- [x] 6. Import-Engine
  - [x] 6.1 Erstelle `backend/src/mail-import/import-engine.ts` (Orchestrierung: Passwort laden, ungelesene Mails auflisten, pro Mail konvertieren+schreiben+als gelesen markieren mit Fehlerisolation, pro-Config-Lock)
  - [x] 6.2 Erstelle `backend/src/mail-import/import-engine.test.ts`
  - _Requirements: 4.2, 4.3, 5.3_

- [x] 7. Scheduler
  - [x] 7.1 Erstelle `backend/src/mail-import/mail-import-scheduler.ts` (Tick-basierte Fälligkeitsprüfung, Fehler-Isolation)
  - [x] 7.2 Erstelle `backend/src/mail-import/mail-import-scheduler.test.ts`
  - _Requirements: 5.1_

- [x] 8. REST-API
  - [x] 8.1 Erstelle `backend/src/api/mailImportRoutes.ts` (CRUD, manueller Trigger, Status; Zugriffskontrolle via `checkReadAccess`/`checkWriteAccess`)
  - _Requirements: 1.3, 5.2, 5.4, 6.2, 6.3_

- [x] 9. Verdrahtung
  - [x] 9.1 Feature-Toggle `mail-import` registrieren (default aus) und Routen-Präfixe damit schützen
  - [x] 9.2 Stores/Engine/Scheduler in `backend/src/index.ts` instanziieren, Scheduler bei Server-Start/-Stop starten/stoppen
  - [x] 9.3 `imapflow`, `mailparser`, `turndown` als Abhängigkeiten ergänzen
  - _Requirements: 6.1_

- [x] 10. Checkpoint — Backend vollständig, alle Tests grün

- [x] 11. Frontend: Vault-Settings-UI (Phase 2)
  - [x] 11.1 `MailImportSection.tsx`: Liste der Postfach-Configs (Status-Badge, Import-jetzt-/Bearbeiten-/Entfernen-Aktionen), Formular für Anlegen/Bearbeiten
  - [x] 11.2 Registrierung in `settingsRegistry.ts` (`category: 'vault'`) und `SettingsContent.tsx`
  - [x] 11.3 Beschriftungen als direkte deutsche Strings umgesetzt (konsistent mit den anderen, zuletzt hinzugefügten Vault-Settings-Sections wie `CssSnippetsSection`/`SnippetManager`, die ebenfalls kein i18n-Dictionary verwenden — kein `mailImport.*`-i18n-Namespace nötig)
  - [x] 11.4 Feature-Toggle-Default auf `defaultEnabled: true` gestellt (Requirement 6.1) und Feature-gated UI ergänzt (Requirement 6.4) — geteilte Implementierung mit git-sync, siehe `.kiro/specs/git-sync/tasks.md` Task 10.4

- [x] 12. Überarbeitung: ungelesene Mails statt UID-Watermark, Kollisions-Logging
  - [x] 12.1 Dedup von lokalem `lastSeenUid`-Feld auf IMAP-eigenen `\Seen`-Status umgestellt: `IImapClient.connect()` liefert eine `IImapConnection` (`listUnseenUids`, `fetchMessage`, `markAsRead`, `close`) statt einer einzelnen `fetchNewMessages(sinceUid)`-Methode
  - [x] 12.2 `MailImportEngine` markiert jede Mail erst nach erfolgreichem Schreiben als gelesen und isoliert Fehler pro Mail (Rest des Batches läuft weiter, fehlgeschlagene Mail bleibt ungelesen für Retry)
  - [x] 12.3 `lastSeenUid`-Feld aus `MailImportConfig` entfernt (Backend + Frontend-Typ), `MailImportConfigStore.updateLastSeenUid()` entfernt
  - [x] 12.4 `MailNoteWriter` loggt Namenskollisionen (Notiz und Anhänge) über `logger.warn`, Kollisionsschutz selbst unverändert (nie überschreiben)
  - [x] 12.5 Tests, Requirements (4.1–4.4) und Design-Dokument entsprechend aktualisiert; Welcome-Vault-Doku (DE+EN) beschreibt jetzt "nur ungelesene Mails" + Warnhinweis zum manuellen Gelesen-Markieren in anderen Clients

- [x] 13. Fix aus Live-Test: irreführende IMAP-Fehlermeldung
  - [x] 13.1 `imapflow` wirft praktisch jeden vom Server abgelehnten Befehl (u.a. fehlgeschlagenen Login) als generischen `Error('Command failed')` mit dem eigentlichen Grund in `error.responseText`; `imap-client.ts` liest jetzt `responseText` aus, bevor auf `.message` zurückgefallen wird

- [x] 14. Feature: IMAP-Ordnerbaum durchsuchen (statt Pfad raten)
  - [x] 14.1 `ImapClient.listMailboxTree(account)` nutzt `imapflow`s `listTree()`, liefert die echten IMAP-Pfade als `MailboxTreeNode[]` (Hierarchie-Trenner wie `.`/`/` sind damit kein Rätsel mehr)
  - [x] 14.2 Neuer Endpunkt `GET /vaults/:vaultId/mail-import/:configId/mailbox-tree` (nutzt das bereits gespeicherte Passwort)
  - [x] 14.3 `MailImportSection.tsx`: "Durchsuchen"-Button beim Bearbeiten eines gespeicherten Postfachs, klickbarer Baum füllt das IMAP-Ordner-Feld mit dem exakten Pfad

- [x] 15. Fix aus Live-Test: `SEARCH UNSEEN` liefert falsche (leere) Ergebnisse auf einem realen Konto
  - [x] 15.1 Diagnose an einem echten Konto (Strato) ergab: `STATUS <mailbox>` meldet korrekt `unseen: 2`, eine direkte `FETCH 1:* FLAGS` bestätigt, dass beide Nachrichten kein `\Seen`-Flag tragen — aber `SEARCH UNSEEN` liefert trotzdem ein leeres Ergebnis. Server-seitige Inkonsistenz bei diesem Anbieter, kein hypothetischer Fall.
  - [x] 15.2 `listUnseenUids()` verlässt sich nicht mehr auf `SEARCH UNSEEN`: stattdessen werden alle Nachrichten per `FETCH 1:* {uid, flags}` gelesen und client-seitig nach fehlendem `\Seen`-Flag gefiltert — unabhängig davon, ob der Server SEARCH-Kriterien korrekt auswertet
  - [x] 15.3 Regressionstest ergänzt, der genau dieses Szenario nachbildet (STATUS/FETCH stimmen überein, SEARCH würde lügen)

- [x] 16. Erweiterung: mehr Erfolgs-Info (gefunden vs. importiert)
  - [x] 16.1 `MailImportRunStatus`/`MailImportRunOutcome` haben jetzt zusätzlich `lastFoundCount`/`foundCount` (Anzahl der in diesem Lauf gefundenen ungelesenen Mails, vor eventuellen Einzel-Fehlern) neben dem bereits vorhandenen `lastImportedCount`/`importedCount` (erfolgreich importiert)
  - [x] 16.2 `MailImportSection.tsx` zeigt bei Erfolg "X von Y Mail(s) importiert" bzw. "Keine neuen Mails" statt nur der reinen Importzahl
  - _Requirements: 4.2, 5.3_

## Notes

- Phase 1 (Tasks 1–10) und Phase 2 (Task 11) sind vollständig umgesetzt und getestet; Tasks 12–16 sind Überarbeitungen/Fixes nach Live-Test-Feedback mit einem echten Postfach.
- Kein PBT — Unit-/Integrationstests mit konkreten Edge Cases, passend zur Projektkonvention.
