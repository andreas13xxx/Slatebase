# Requirements Document

## Introduction

Dieses Dokument beschreibt die Anforderungen für die CouchDB-basierte Vault-Synchronisation in Slatebase. Slatebase agiert als CouchDB-kompatibler Sync-Client, der Dokumente von einer CouchDB-Instanz (wie sie vom Obsidian-Plugin `vrtmrz/obsidian-livesync` verwendet wird) pullen und pushen kann. Der Vault-Besitzer konfiguriert die Synchronisation über eine Setup-URI oder manuelle Datenbankparameter. Die Synchronisation unterstützt manuelle und intervallbasierte Auslösung, bidirektionale und Read-Only-Modi, einen Analysemodus sowie eine Konflikterkennung mit benutzergesteuerter Auflösung.

## Glossary

- **Sync_Service**: Die Backend-Komponente, die die CouchDB-Replikation durchführt und den Sync-Zustand verwaltet
- **Sync_Client**: Die Frontend-Komponente, die das Synchronisations-Interface im Browser bereitstellt
- **CouchDB_Instanz**: Die entfernte CouchDB-Datenbank, die als Sync-Gegenstelle dient (kompatibel mit obsidian-livesync)
- **Setup_URI**: Eine URI im obsidian-livesync-Format, die alle Verbindungsparameter (Host, Datenbank, Credentials, Verschlüsselung) kodiert enthält
- **Sync_Konfiguration**: Die gespeicherte Verbindungskonfiguration eines Vaults zur CouchDB-Instanz (Endpoint, Datenbankname, Credentials, Modus, Intervall)
- **Sync_Log**: Ein persistentes Protokoll aller Sync-Operationen eines Vaults mit Zeitstempel, Status und Details
- **Sync_Modus**: Die Richtung der Synchronisation — bidirektional (Pull + Push) oder Read-Only (nur Pull)
- **Analysemodus**: Ein Modus, der nur die Unterschiede zwischen Vault und CouchDB anzeigt, ohne Änderungen vorzunehmen
- **Sync_Konflikt**: Ein Zustand, bei dem ein Dokument sowohl lokal als auch remote seit dem letzten Sync geändert wurde und die Änderungen nicht automatisch zusammengeführt werden können
- **Revision**: Die CouchDB-Revisionsnummer eines Dokuments (Format: `<sequence>-<hash>`)
- **Vault_Besitzer**: Der Benutzer mit `owner`-Berechtigung auf dem Vault, der als einziger die Sync-Konfiguration verwalten darf

## Requirements

### Requirement 1: Sync-Konfiguration erstellen

**User Story:** Als Vault-Besitzer möchte ich eine Synchronisation für meinen Vault konfigurieren können, damit mein Vault mit einer CouchDB-Instanz synchronisiert werden kann.

#### Acceptance Criteria

1. WHEN der Vault-Besitzer eine Setup-URI im obsidian-livesync-Format eingibt, THE Sync_Service SHALL die URI parsen und die enthaltenen Verbindungsparameter (Endpoint-URL, Datenbankname, Benutzername, Passwort, Verschlüsselungseinstellungen) extrahieren und als Sync-Konfiguration für den Vault speichern
2. WHEN der Vault-Besitzer die Datenbankverbindung manuell konfiguriert (Endpoint-URL, Datenbankname, Benutzername, Passwort), THE Sync_Service SHALL die Parameter validieren (URL-Format mit http:// oder https://, nicht-leerer Datenbankname) und als Sync-Konfiguration für den Vault speichern
3. WHEN eine Sync-Konfiguration gespeichert wird, THE Sync_Service SHALL einen Verbindungstest zur CouchDB-Instanz durchführen (Timeout: 10 Sekunden) und das Ergebnis (erreichbar/nicht erreichbar, Authentifizierung erfolgreich/fehlgeschlagen) zusammen mit der gespeicherten Konfiguration zurückgeben
4. IF der Verbindungstest beim Erstellen der Sync-Konfiguration fehlschlägt (CouchDB nicht erreichbar oder Authentifizierung fehlgeschlagen), THEN THE Sync_Service SHALL die Konfiguration dennoch speichern und in der Response das Testergebnis mit dem Fehlerstatus zurückgeben, sodass der Vault-Besitzer die Konfiguration später korrigieren kann
5. IF ein Benutzer ohne Owner-Berechtigung versucht eine Sync-Konfiguration zu erstellen, THEN THE Sync_Service SHALL den Request mit HTTP 403 und dem Fehlercode `ACCESS_DENIED` ablehnen
6. IF bereits eine Sync-Konfiguration für den Vault existiert, THEN THE Sync_Service SHALL den Request mit HTTP 409 und dem Fehlercode `SYNC_ALREADY_CONFIGURED` ablehnen
7. IF die Setup-URI ein ungültiges Format hat oder nicht geparst werden kann, THEN THE Sync_Service SHALL den Request mit HTTP 400 und dem Fehlercode `INVALID_SETUP_URI` ablehnen und eine Fehlerbeschreibung zurückgeben
8. IF die manuell eingegebene Endpoint-URL kein gültiges URL-Format hat oder der Datenbankname leer ist, THEN THE Sync_Service SHALL den Request mit HTTP 400 und dem Fehlercode `INVALID_SYNC_CONFIG` ablehnen
9. THE Sync_Service SHALL die Credentials (Benutzername, Passwort) verschlüsselt auf dem Dateisystem speichern und niemals in API-Responses oder Logs im Klartext ausgeben

### Requirement 2: Sync-Konfiguration verwalten

**User Story:** Als Vault-Besitzer möchte ich eine bestehende Sync-Konfiguration einsehen, deaktivieren und entfernen können, damit ich die Synchronisation flexibel steuern kann.

#### Acceptance Criteria

1. WHEN der Vault-Besitzer die Sync-Konfiguration abruft, THE Sync_Service SHALL die Konfiguration zurückgeben, die folgende Felder enthält: Endpoint-URL, Datenbankname, Benutzername (im Klartext), Passwort (maskiert: alle Zeichen durch `*` ersetzt außer den letzten 4 Zeichen; bei Passwörtern mit weniger als 4 Zeichen vollständig maskiert), Sync-Modus, Intervall (falls konfiguriert) und den aktuellen Status (`active` oder `disabled`)
2. WHEN der Vault-Besitzer die Sync-Konfiguration deaktiviert, THE Sync_Service SHALL den Status auf `disabled` setzen, eine aktuell laufende Synchronisation bis zum Abschluss weiterlaufen lassen, aber keine weiteren automatischen Syncs auslösen bis zur Reaktivierung
3. WHEN der Vault-Besitzer eine deaktivierte Sync-Konfiguration reaktiviert, THE Sync_Service SHALL den Status auf `active` setzen und bei konfiguriertem Intervall die automatische Synchronisation mit einem neuen Intervall-Zyklus ab dem Zeitpunkt der Reaktivierung wieder aufnehmen
4. WHEN der Vault-Besitzer die Sync-Konfiguration entfernt, THE Sync_Service SHALL die gesamte Konfiguration inklusive gespeicherter Credentials löschen, den Sync-Status des Vaults auf `unconfigured` zurücksetzen und das Sync-Log des Vaults beibehalten
5. IF ein Benutzer ohne Owner-Berechtigung versucht die Sync-Konfiguration zu verwalten, THEN THE Sync_Service SHALL den Request mit HTTP 403 und dem Fehlercode `ACCESS_DENIED` ablehnen
6. WHEN der Vault-Besitzer die Sync-Konfiguration aktualisiert (Endpoint, Credentials, Modus oder Intervall), THE Sync_Service SHALL die neuen Parameter validieren, einen Verbindungstest durchführen und bei Erfolg die Konfiguration atomar überschreiben
7. IF der Verbindungstest bei einer Konfigurationsaktualisierung fehlschlägt (CouchDB nicht erreichbar oder Authentifizierung fehlgeschlagen), THEN THE Sync_Service SHALL den Request mit HTTP 422 und dem Fehlercode `CONNECTION_TEST_FAILED` ablehnen und die bestehende Konfiguration unverändert beibehalten

### Requirement 3: Sync-Modus und Auslösung

**User Story:** Als Vault-Besitzer möchte ich festlegen können, ob der Sync manuell oder automatisch in Intervallen ausgelöst wird und ob er bidirektional oder nur lesend ist, damit ich die Synchronisation an meine Bedürfnisse anpassen kann.

#### Acceptance Criteria

1. THE Sync_Service SHALL als Standard-Sync-Auslösung `manual` und als Standard-Sync-Modus `bidirectional` verwenden, wenn bei der Konfiguration kein expliziter Wert für Auslösung oder Modus angegeben wird
2. WHEN der Vault-Besitzer ein Sync-Intervall konfiguriert (in Minuten, Minimum 5, Maximum 1440), THE Sync_Service SHALL die Synchronisation automatisch im konfigurierten Intervall auslösen
3. WHEN der Vault-Besitzer den Sync-Modus auf `readonly` setzt, THE Sync_Service SHALL nur Änderungen von der CouchDB-Instanz in den Vault laden (Pull) und keine lokalen Änderungen an die CouchDB senden
4. WHEN der Vault-Besitzer den Sync-Modus auf `bidirectional` setzt, THE Sync_Service SHALL sowohl Änderungen von der CouchDB in den Vault laden (Pull) als auch lokale Änderungen an die CouchDB senden (Push)
5. IF ein Sync-Intervall kleiner als 5 Minuten oder größer als 1440 Minuten angegeben wird, THEN THE Sync_Service SHALL den Request mit HTTP 400 und dem Fehlercode `INVALID_SYNC_INTERVAL` ablehnen
6. WHEN der Vault-Besitzer einen manuellen Sync auslöst, THE Sync_Service SHALL die Synchronisation sofort im aktuell konfigurierten Sync-Modus starten und den Intervall-Timer (falls konfiguriert) auf den vollen Intervallwert zurücksetzen
7. IF bereits eine Synchronisation für denselben Vault aktiv ist, THEN THE Sync_Service SHALL den neuen Request mit HTTP 409 und dem Fehlercode `SYNC_IN_PROGRESS` ablehnen
8. WHEN der Sync_Service nach einem Neustart startet, THE Sync_Service SHALL für alle Vaults mit konfiguriertem und aktivem Sync-Intervall die automatische Synchronisation wieder aufnehmen, wobei der erste Sync nach Ablauf des konfigurierten Intervalls ab dem Startzeitpunkt ausgelöst wird

### Requirement 4: Synchronisation durchführen

**User Story:** Als Vault-Besitzer möchte ich die Synchronisation zwischen meinem Vault und der CouchDB-Instanz durchführen können, damit meine Notizen auf dem aktuellen Stand sind.

#### Acceptance Criteria

1. WHEN eine Synchronisation gestartet wird, THE Sync_Service SHALL die CouchDB Changes-Feed-API verwenden, um geänderte Dokumente seit dem letzten Sync-Checkpoint zu ermitteln, wobei der HTTP-Request an die CouchDB mit einem Timeout von 30 Sekunden abgebrochen wird
2. WHEN neue oder geänderte Dokumente von der CouchDB empfangen werden, THE Sync_Service SHALL diese als Dateien in den Vault schreiben, wobei der Dokumentpfad aus den CouchDB-Dokument-Metadaten abgeleitet wird (kompatibel mit obsidian-livesync Pfadkonvention, einschließlich Chunk-Reassembly für fragmentierte Dokumente)
3. WHILE der Sync-Modus `bidirectional` ist, THE Sync_Service SHALL lokale Dateiänderungen seit dem letzten Sync-Checkpoint anhand des Datei-Änderungsdatums (mtime) ermitteln und als Dokumente an die CouchDB senden
4. WHEN eine Synchronisation erfolgreich abgeschlossen wird, THE Sync_Service SHALL den Sync-Checkpoint (CouchDB Sequence-Nummer) atomar auf dem Dateisystem aktualisieren und persistieren
5. IF die CouchDB-Instanz nicht innerhalb von 30 Sekunden antwortet oder die Verbindung abgelehnt wird, THEN THE Sync_Service SHALL die Synchronisation mit dem Status `connection_failed` abbrechen und den Fehler im Sync-Log protokollieren
6. IF die Authentifizierung bei der CouchDB fehlschlägt, THEN THE Sync_Service SHALL die Synchronisation mit dem Status `auth_failed` abbrechen und den Fehler im Sync-Log protokollieren
7. THE Sync_Service SHALL bei Schreiboperationen in den Vault atomare Writes verwenden (Temp-Datei → rename)
8. IF ein einzelnes Dokument nicht geschrieben werden kann (Berechtigungsfehler, ungültiger Pfad), THEN THE Sync_Service SHALL den Fehler für dieses Dokument im Sync-Log protokollieren und die Synchronisation der übrigen Dokumente fortsetzen
9. IF noch kein Sync-Checkpoint für den Vault existiert (erster Sync), THEN THE Sync_Service SHALL alle Dokumente aus der CouchDB-Datenbank abrufen (vollständiger Pull) und den initialen Checkpoint nach erfolgreichem Abschluss speichern
10. WHEN ein Dokument in der CouchDB als gelöscht markiert ist (`_deleted: true`) und vom Changes-Feed empfangen wird, THE Sync_Service SHALL die zugehörige lokale Datei aus dem Vault entfernen, sofern sie existiert, und die Löschung im Sync-Log protokollieren
11. IF eine lokale Datei gelöscht wurde (seit dem letzten Sync-Checkpoint nicht mehr vorhanden) und der Sync-Modus `bidirectional` ist, THEN THE Sync_Service SHALL das zugehörige Dokument in der CouchDB als gelöscht markieren (`_deleted: true`)

### Requirement 5: Sync-Log

**User Story:** Als Vault-Besitzer möchte ich ein Protokoll aller Sync-Operationen einsehen können, damit ich den Verlauf und eventuelle Probleme nachvollziehen kann.

#### Acceptance Criteria

1. WHEN eine Synchronisation gestartet wird, THE Sync_Service SHALL einen Log-Eintrag mit Zeitstempel (ISO 8601), Sync-Typ (manuell/intervall), Sync-Modus (bidirectional/readonly) und Status `started` erstellen
2. WHEN eine Synchronisation abgeschlossen wird, THE Sync_Service SHALL den Log-Eintrag mit dem Endstatus (success, partial_success, failed), der Anzahl gepullter Dokumente, der Anzahl gepushter Dokumente und der Dauer in Millisekunden aktualisieren
3. IF während einer Synchronisation Fehler auftreten, THEN THE Sync_Service SHALL für jeden Fehler einen Detail-Eintrag im Log erstellen, der den betroffenen Dokumentpfad, den Fehlertyp und eine Beschreibung enthält (maximal 500 Zeichen pro Beschreibung, maximal 100 Fehler-Einträge pro Sync-Operation)
4. WHEN der Vault-Besitzer das Sync-Log abruft, THE Sync_Service SHALL die Log-Einträge paginiert zurückgeben (Standard: 50 Einträge pro Seite, Maximum: 100 Einträge pro Seite, sortiert nach Zeitstempel absteigend) mit den Feldern: items (Array der Einträge), total (Gesamtanzahl), page, pageSize und totalPages
5. THE Sync_Service SHALL das Sync-Log pro Vault als separate Datei im Dateisystem speichern (Pfad: `data/sync/<vaultId>/sync-log.jsonl`, Append-Only JSONL-Format)
6. THE Sync_Service SHALL keine Credentials, Passwörter, Token-Werte oder Dokumentinhalte (weder vollständig noch teilweise) im Sync-Log speichern — Dokumente werden ausschließlich über ihren relativen Pfad referenziert
7. IF das Sync-Log mehr als 1000 Einträge enthält, THEN THE Sync_Service SHALL beim nächsten Schreibvorgang die ältesten Einträge entfernen, sodass maximal 1000 Einträge erhalten bleiben
8. IF die Sync-Log-Datei nicht lesbar oder korrupt ist, THEN THE Sync_Service SHALL eine leere paginierte Antwort zurückgeben (items: [], total: 0) und den Fehler über den Logger protokollieren, ohne den Abruf mit einem Fehler abzubrechen

### Requirement 6: Analysemodus

**User Story:** Als Vault-Besitzer möchte ich die Unterschiede zwischen meinem Vault und der CouchDB anzeigen lassen können, ohne dass Änderungen vorgenommen werden, damit ich vor einem Sync den Umfang der Änderungen einschätzen kann.

#### Acceptance Criteria

1. WHEN der Vault-Besitzer den Analysemodus startet, THE Sync_Service SHALL die CouchDB Changes-Feed-API abfragen und die Unterschiede zwischen Vault und CouchDB ermitteln, ohne Änderungen am Vault oder der CouchDB vorzunehmen
2. WHEN die Analyse abgeschlossen ist, THE Sync_Service SHALL eine Übersicht zurückgeben, die folgende Kategorien enthält: `remote_newer` (Dokument in CouchDB neuer), `local_newer` (lokale Datei neuer), `remote_only` (nur in CouchDB vorhanden), `local_only` (nur im Vault vorhanden), `conflict` (beide Seiten geändert), `identical` (keine Unterschiede)
3. WHEN die Analyse abgeschlossen ist, THE Sync_Service SHALL für jede Kategorie die Anzahl der betroffenen Dokumente und die Gesamtgröße in Bytes zurückgeben, wobei die gesamte Analyse innerhalb von 120 Sekunden abgeschlossen sein muss oder mit dem Status `analysis_timeout` abgebrochen wird
4. WHEN die Analyseergebnisse empfangen werden, THE Sync_Client SHALL die Ergebnisse als Übersicht mit Kategorie-Zählern und einer Detailliste anzeigen, wobei für jedes Dokument der Pfad, die Kategorie, die Revisionsnummer (remote), das Änderungsdatum (lokal und remote) und die Dateigröße (lokal und remote) dargestellt werden, und die Detailliste nach Kategorie filterbar ist
5. IF die CouchDB-Instanz nicht erreichbar ist oder die Authentifizierung fehlschlägt, THEN THE Sync_Service SHALL die Analyse abbrechen und einen Fehler mit dem entsprechenden Fehlercode (`CONNECTION_FAILED` oder `AUTH_FAILED`) und einer Beschreibung des Verbindungs- oder Authentifizierungsfehlers zurückgeben
6. IF keine aktive Sync-Konfiguration für den Vault existiert (nicht konfiguriert oder deaktiviert), THEN THE Sync_Service SHALL den Request mit HTTP 409 und dem Fehlercode `SYNC_NOT_CONFIGURED` ablehnen
7. IF bereits eine Analyse oder Synchronisation für denselben Vault aktiv ist, THEN THE Sync_Service SHALL den Request mit HTTP 409 und dem Fehlercode `SYNC_IN_PROGRESS` ablehnen

### Requirement 7: Konflikterkennung und -anzeige

**User Story:** Als Vault-Besitzer möchte ich bei Sync-Konflikten detaillierte Informationen über die Unterschiede zwischen lokaler und Remote-Version sehen, damit ich eine informierte Entscheidung zur Konfliktauflösung treffen kann.

#### Acceptance Criteria

1. WHEN während einer Synchronisation ein Konflikt erkannt wird (Dokument wurde sowohl lokal als auch remote seit dem letzten Sync geändert), THE Sync_Service SHALL das Dokument nicht automatisch überschreiben, sondern den Konflikt mit Status `conflict` markieren, die lokale und Remote-Revisionsinformation persistieren und die Synchronisation der übrigen Dokumente fortsetzen
2. WHEN Konflikte vorliegen, THE Sync_Client SHALL eine Konfliktliste anzeigen, die für jeden Konflikt den Dokumentpfad, die lokale Revisionsinformation (Änderungsdatum, Dateigröße) und die Remote-Revisionsinformation (Revisionsnummer, Änderungsdatum, Dateigröße) darstellt
3. THE Sync_Client SHALL für jeden Konflikt eine Empfehlung anzeigen, die auf dem Änderungsdatum basiert: die neuere Version wird als empfohlene Auflösung vorgeschlagen; IF beide Änderungsdaten identisch sind, THEN THE Sync_Client SHALL die Remote-Version als Empfehlung anzeigen
4. THE Sync_Client SHALL für jeden Konflikt die folgenden Auflösungsoptionen anbieten: „Remote-Version übernehmen" (CouchDB-Version überschreibt lokal), „Lokale Version behalten" (lokale Version wird an CouchDB gesendet, nur bei bidirektionalem Modus), „Überspringen" (Konflikt wird nicht aufgelöst und bleibt bestehen)
5. WHEN der Vault-Besitzer eine Konfliktauflösung wählt, THE Sync_Service SHALL die gewählte Aktion ausführen und bei Erfolg den Konflikt aus der Konfliktliste entfernen
6. IF der Sync-Modus `readonly` ist, THEN THE Sync_Client SHALL die Option „Lokale Version behalten" deaktiviert anzeigen, da im Read-Only-Modus keine Änderungen an die CouchDB gesendet werden
7. WHILE Konflikte ungelöst sind, THE Sync_Client SHALL die Anzahl offener Konflikte im Sync-Status-Bereich des Vaults anzeigen
8. IF die Konfliktauflösung fehlschlägt (CouchDB nicht erreichbar, Schreibfehler), THEN THE Sync_Service SHALL den Konflikt in der Konfliktliste belassen, den Fehlerstatus im Sync-Log protokollieren und eine Fehlermeldung an den Client zurückgeben, die den Grund des Fehlschlags beschreibt
9. WHEN eine neue Synchronisation gestartet wird und ungelöste Konflikte aus vorherigen Syncs existieren, THE Sync_Service SHALL die bestehenden ungelösten Konflikte beibehalten und nur für Dokumente neue Konflikte erkennen, die noch keinen ungelösten Konflikteintrag haben

### Requirement 8: End-to-End-Verschlüsselung (optional)

**User Story:** Als Vault-Besitzer möchte ich optional eine End-to-End-Verschlüsselung für die Synchronisation aktivieren können, damit meine Daten auf dem Transportweg und in der CouchDB verschlüsselt sind.

#### Acceptance Criteria

1. WHERE die E2E-Verschlüsselung aktiviert ist, THE Sync_Service SHALL Dokumente vor dem Senden an die CouchDB mit dem konfigurierten Passphrase verschlüsseln (kompatibel mit dem obsidian-livesync Verschlüsselungsformat, AES-GCM-basiert)
2. WHERE die E2E-Verschlüsselung aktiviert ist, THE Sync_Service SHALL empfangene Dokumente von der CouchDB mit dem konfigurierten Passphrase entschlüsseln, bevor sie in den Vault geschrieben werden
3. IF die Entschlüsselung eines Dokuments fehlschlägt (falsches Passphrase oder korrupte Daten), THEN THE Sync_Service SHALL das Dokument mit dem Status `decryption_failed` im Sync-Log protokollieren (inklusive Dokumentpfad und Fehlertyp) und die Synchronisation der übrigen Dokumente fortsetzen
4. IF die Verschlüsselung eines Dokuments vor dem Senden fehlschlägt, THEN THE Sync_Service SHALL das Dokument mit dem Status `encryption_failed` im Sync-Log protokollieren (inklusive Dokumentpfad und Fehlertyp), das Dokument nicht an die CouchDB senden und die Synchronisation der übrigen Dokumente fortsetzen
5. THE Sync_Service SHALL das Verschlüsselungs-Passphrase ausschließlich verschlüsselt auf dem Dateisystem speichern und niemals in API-Responses oder Logs ausgeben
6. THE Sync_Service SHALL das Verschlüsselungs-Passphrase bei der Konfiguration validieren: Mindestlänge 8 Zeichen, Maximallänge 256 Zeichen; bei Verstoß den Request mit HTTP 400 und dem Fehlercode `INVALID_PASSPHRASE` ablehnen
7. WHEN die E2E-Verschlüsselung nachträglich aktiviert wird, THE Sync_Client SHALL dem Vault-Besitzer einen Bestätigungsdialog anzeigen, der explizit darauf hinweist, dass bereits synchronisierte Dokumente in der CouchDB unverschlüsselt bleiben und nur neue Änderungen verschlüsselt werden; die Aktivierung wird erst nach expliziter Bestätigung durch den Vault-Besitzer durchgeführt
8. WHEN der Vault-Besitzer das Verschlüsselungs-Passphrase ändert, THE Sync_Client SHALL einen Bestätigungsdialog anzeigen, der darauf hinweist, dass bereits verschlüsselte Dokumente in der CouchDB mit dem alten Passphrase verschlüsselt bleiben und nur neue Änderungen das neue Passphrase verwenden; die Änderung wird erst nach expliziter Bestätigung durchgeführt

### Requirement 9: Zugriffskontrolle

**User Story:** Als Systemadministrator möchte ich sicherstellen, dass nur der Vault-Besitzer die Sync-Konfiguration verwalten und Synchronisationen auslösen kann, damit keine unbefugten Datenbankzugriffe stattfinden.

#### Acceptance Criteria

1. WHEN ein nicht-authentifizierter Request an einen Sync-Endpoint gesendet wird, THE Sync_Service SHALL den Request mit HTTP 401 und dem Fehlercode `UNAUTHORIZED` ablehnen, bevor eine Vault-Existenz- oder Berechtigungsprüfung stattfindet
2. WHEN der Vault-Besitzer (ermittelt über das `ownerId`-Feld der Vault-Registry) einen Sync-Endpoint aufruft, THE Sync_Service SHALL den Request verarbeiten und die angeforderte Operation (Konfiguration erstellen/ändern/deaktivieren/entfernen, manuelle Synchronisation, Analyse, Log-Abruf) ausführen
3. IF ein authentifizierter Benutzer ohne Owner-Berechtigung einen Sync-Endpoint aufruft, THEN THE Sync_Service SHALL den Request mit HTTP 403 und dem Fehlercode `ACCESS_DENIED` ablehnen
4. IF ein Benutzer einen Sync-Endpoint für ein Vault aufruft, das nicht existiert, THEN THE Sync_Service SHALL den Request mit HTTP 404 und dem Fehlercode `VAULT_NOT_FOUND` ablehnen
5. THE Sync_Service SHALL die Prüfungen in folgender Reihenfolge durchführen: Authentifizierung (401) → Vault-Existenz (404) → Owner-Berechtigung (403), sodass nicht-authentifizierte Requests keine Information über die Existenz von Vaults erhalten
6. IF ein authentifizierter Benutzer ohne Owner-Berechtigung das Sync-Log eines Vaults abruft, THEN THE Sync_Service SHALL den Request mit HTTP 403 und dem Fehlercode `ACCESS_DENIED` ablehnen
7. THE Sync_Service SHALL Benutzer mit der Rolle `admin` NICHT von der Owner-Prüfung ausnehmen — ausschließlich der Vault-Besitzer darf Sync-Operationen durchführen

### Requirement 10: Eingabevalidierung

**User Story:** Als Systemadministrator möchte ich sicherstellen, dass alle Sync-bezogenen Eingaben validiert werden, damit keine ungültigen oder schädlichen Daten verarbeitet werden.

#### Acceptance Criteria

1. THE Sync_Service SHALL alle eingehenden Requests mit Zod-Schemas validieren, insbesondere: Vault-ID (hexadezimaler String, exakt 12 Zeichen, nur Zeichen `a-f` und `0-9`), Endpoint-URL (gültiges URL-Format, maximal 2048 Zeichen), Datenbankname (nicht-leer, maximal 256 Zeichen, muss mit einem Kleinbuchstaben beginnen und darf nur die Zeichen `a-z`, `0-9`, `_`, `$`, `(`, `)`, `+`, `-`, `/` enthalten), Benutzername (nicht-leer, maximal 256 Zeichen), Passwort (nicht-leer, maximal 1024 Zeichen), Sync-Modus (nur die Werte `bidirectional` oder `readonly`)
2. IF ein Request ungültige oder fehlende Pflichtfelder enthält, THEN THE Sync_Service SHALL mit HTTP 400 und dem Fehlercode `VALIDATION_ERROR` einen strukturierten Fehler im Format `{ code, message, timestamp }` zurückgeben, wobei `message` den Feldnamen und den Grund der Ablehnung enthält
3. IF die Endpoint-URL ein anderes Protokoll als `http://` oder `https://` verwendet, THEN THE Sync_Service SHALL den Request mit HTTP 400 und dem Fehlercode `VALIDATION_ERROR` ablehnen, wobei `message` angibt, dass nur HTTP und HTTPS erlaubt sind
4. IF die Setup-URI Zeichen enthält, die nicht dem erwarteten Base64- oder URI-Format entsprechen, oder die URI-Länge 4096 Zeichen überschreitet, THEN THE Sync_Service SHALL den Request mit HTTP 400 und dem Fehlercode `INVALID_SETUP_URI` ablehnen
5. THE Sync_Service SHALL das Sync-Intervall als ganzzahligen Wert in Minuten validieren (Minimum 5, Maximum 1440); IF der Wert kein Integer ist oder außerhalb dieses Bereichs liegt, THEN THE Sync_Service SHALL den Request mit HTTP 400 und dem Fehlercode `INVALID_SYNC_INTERVAL` ablehnen
6. THE Sync_Service SHALL alle String-Eingaben vor der Validierung auf führende und abschließende Whitespace-Zeichen trimmen und Eingaben ablehnen, die nach dem Trimmen leer sind, sofern das Feld als Pflichtfeld definiert ist
