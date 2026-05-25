# Requirements Document

## Introduction

Dieses Dokument beschreibt die Anforderungen für die Vault-Synchronisation in Slatebase. Benutzer sollen ein Vault (eigenes oder mit ihnen geteiltes) mit einem Verzeichnis auf dem lokalen Server-Dateisystem synchronisieren können. Der Prozess ist zweistufig: Zuerst wird ein Vergleich durchgeführt und dem Benutzer präsentiert (Statistik + Detailliste), dann entscheidet der Benutzer pro Datei über die gewünschte Aktion. Änderungen werden erst nach expliziter Bestätigung umgesetzt.

## Glossary

- **Sync_Service**: Die Backend-Komponente, die den Vergleich zwischen Vault und lokalem Verzeichnis durchführt und Synchronisationsaktionen ausführt
- **Sync_Client**: Die Frontend-Komponente, die das Synchronisations-Interface im Browser bereitstellt
- **Lokales_Verzeichnis**: Ein Verzeichnis auf dem Server-Dateisystem, das als Synchronisationsziel dient
- **Vergleichsergebnis**: Das Resultat des Dateivergleichs zwischen Vault und lokalem Verzeichnis, bestehend aus Statistik und Differenzliste
- **Differenz_Eintrag**: Ein einzelner Unterschied zwischen Vault und lokalem Verzeichnis mit Metadaten (Typ, Zeitstempel, Pfad)
- **Sync_Aktion**: Die vom Benutzer gewählte Operation für einen Differenz-Eintrag (importieren, exportieren, löschen, überschreiben, mergen)
- **Sync_Plan**: Die Gesamtheit aller vom Benutzer festgelegten Aktionen für alle Differenz-Einträge vor der Ausführung

## Requirements

### Requirement 1: Zugriffskontrolle

**User Story:** Als Systemadministrator möchte ich sicherstellen, dass nur berechtigte Benutzer eine Vault-Synchronisation durchführen können, damit keine unbefugten Dateizugriffe stattfinden.

#### Acceptance Criteria

1. WHEN ein nicht-authentifizierter Request an einen Sync-Endpoint gesendet wird, THE Sync_Service SHALL den Request mit HTTP 401 und dem Fehlercode `UNAUTHORIZED` ablehnen
2. WHEN ein authentifizierter Benutzer eine Synchronisation für ein Vault anfordert, dessen Besitzer er ist, THE Sync_Service SHALL den Zugriff gewähren und den Vergleich starten
3. WHEN ein authentifizierter Benutzer eine Synchronisation für ein Vault anfordert, das mit ihm geteilt wurde und er Schreibberechtigung besitzt, THE Sync_Service SHALL den Zugriff gewähren und den Vergleich starten
4. IF ein Benutzer eine Synchronisation für ein Vault anfordert, auf das er keinen Zugriff hat, THEN THE Sync_Service SHALL den Request mit HTTP 403 und dem Fehlercode `ACCESS_DENIED` ablehnen
5. IF ein Benutzer mit Nur-Lese-Berechtigung eine Synchronisation anfordert, THEN THE Sync_Service SHALL den Request mit HTTP 403 und dem Fehlercode `ACCESS_DENIED` ablehnen, da Synchronisation Schreibzugriff erfordert
6. IF ein Benutzer eine Synchronisation für ein Vault anfordert, das nicht existiert, THEN THE Sync_Service SHALL den Request mit HTTP 404 und dem Fehlercode `VAULT_NOT_FOUND` ablehnen

### Requirement 2: Pfadvalidierung des lokalen Verzeichnisses

**User Story:** Als Systemadministrator möchte ich sicherstellen, dass nur erlaubte Verzeichnisse als Synchronisationsziel verwendet werden können, damit keine Path-Traversal-Angriffe möglich sind.

#### Acceptance Criteria

1. THE Sync_Service SHALL den angegebenen lokalen Pfad normalisieren (Auflösung von `.`-Segmenten, redundanten Separatoren) und gegen die konfigurierte Liste erlaubter Basispfade prüfen, bevor ein Vergleich gestartet wird
2. IF der angegebene Pfad Path-Traversal-Sequenzen (`..`), Null-Bytes oder absolute Pfade außerhalb der erlaubten Basispfade enthält, THEN THE Sync_Service SHALL den Request mit HTTP 400 und dem Fehlercode `INVALID_PATH` ablehnen
3. IF der angegebene Pfad nicht existiert oder kein Verzeichnis ist, THEN THE Sync_Service SHALL den Request mit HTTP 400 und dem Fehlercode `INVALID_PATH` ablehnen und eine Fehlermeldung zurückgeben, die angibt ob der Pfad nicht existiert oder kein Verzeichnis ist
4. IF der angegebene Pfad Symlinks enthält, die nach vollständiger Auflösung (realpath) auf ein Ziel außerhalb der erlaubten Basispfade zeigen, THEN THE Sync_Service SHALL den Request mit HTTP 400 und dem Fehlercode `INVALID_PATH` ablehnen
5. THE Sync_Service SHALL die erlaubten Basispfade aus der Server-Konfiguration lesen (Konfigurationsschlüssel `allowedSyncPaths`, Array von absoluten Pfaden, mindestens 1 und maximal 50 Einträge)
6. IF der angegebene Pfad leer ist, nur Whitespace enthält oder eine Länge von mehr als 4096 Zeichen hat, THEN THE Sync_Service SHALL den Request mit HTTP 400 und dem Fehlercode `INVALID_PATH` ablehnen
7. IF die Konfiguration `allowedSyncPaths` leer ist oder keinen gültigen absoluten Pfad enthält, THEN THE Sync_Service SHALL beim Start eine Warnung loggen und alle Pfadvalidierungen mit HTTP 400 und dem Fehlercode `INVALID_PATH` ablehnen bis eine gültige Konfiguration vorliegt

### Requirement 3: Vergleich durchführen

**User Story:** Als Benutzer möchte ich einen Vergleich zwischen meinem Vault und einem lokalen Verzeichnis starten können, damit ich sehe welche Unterschiede bestehen.

#### Acceptance Criteria

1. WHEN ein Benutzer einen Vergleich zwischen einem Vault und einem lokalen Verzeichnis anfordert, THE Sync_Service SHALL alle Dateien in beiden Quellen rekursiv bis zu einer maximalen Verzeichnistiefe von 50 Ebenen auflisten und paarweise anhand ihres relativen Pfades (case-sensitive) vergleichen
2. THE Sync_Service SHALL jede Datei in eine der folgenden Kategorien einordnen: `identical` (Inhalt identisch), `modified` (Datei existiert in beiden Quellen mit unterschiedlichem Inhalt), `local_only` (Datei existiert nur im lokalen Verzeichnis), `vault_only` (Datei existiert nur im Vault)
3. THE Sync_Service SHALL den Vergleich anhand des Dateiinhalts (Byte-Vergleich oder Hash) durchführen, nicht anhand des Zeitstempels allein
4. THE Sync_Service SHALL für jede Datei im Vergleichsergebnis den relativen Pfad, die Kategorie, die Dateigröße in Bytes in beiden Quellen (sofern vorhanden) und den letzten Änderungszeitpunkt in beiden Quellen (ISO 8601) zurückgeben
5. IF das Vault oder das lokale Verzeichnis leer ist, THEN THE Sync_Service SHALL den Vergleich trotzdem durchführen und alle Dateien der nicht-leeren Quelle als `vault_only` bzw. `local_only` kategorisieren
6. THE Sync_Service SHALL Unterverzeichnisse rekursiv durchlaufen, die relative Pfadstruktur beibehalten und symbolische Links nicht folgen sondern überspringen
7. IF eine Datei im lokalen Verzeichnis nicht lesbar ist (Berechtigungsfehler), THEN THE Sync_Service SHALL diese Datei im Vergleichsergebnis mit dem Status `error` und einer Fehlerbeschreibung aufnehmen, den Vergleich für die übrigen Dateien fortsetzen
8. IF die angegebene Vault-ID nicht existiert oder das lokale Verzeichnis nicht existiert, THEN THE Sync_Service SHALL den Vergleich abbrechen und eine Fehlerantwort zurückgeben, die angibt welche Quelle nicht gefunden wurde
9. IF eine Datei im Vault nicht lesbar ist, THEN THE Sync_Service SHALL diese Datei im Vergleichsergebnis mit dem Status `error` und einer Fehlerbeschreibung aufnehmen, den Vergleich für die übrigen Dateien fortsetzen

### Requirement 4: Statistik-Übersicht

**User Story:** Als Benutzer möchte ich eine Zusammenfassung der Unterschiede sehen, damit ich schnell einen Überblick über den Synchronisationsstatus bekomme.

#### Acceptance Criteria

1. WHEN ein Vergleich abgeschlossen ist, THE Sync_Service SHALL eine Statistik zurückgeben, die die Anzahl der Dateien pro Kategorie enthält: `identical`, `modified`, `local_only`, `vault_only`, `error`
2. WHEN ein Vergleich abgeschlossen ist, THE Sync_Service SHALL in der Statistik zusätzlich die Gesamtanzahl verglichener Dateien und die Gesamtgröße der Unterschiede in Bytes (Summe der Dateigrößen aller nicht-identischen Dateien) angeben
3. WHEN ein Vergleich abgeschlossen ist, THE Sync_Client SHALL die Statistik als erste Ansicht anzeigen, wobei die Detailliste erst nach expliziter Benutzerinteraktion (z.B. Klick auf eine Kategorie oder einen „Details anzeigen"-Bereich) sichtbar wird
4. IF der Vergleich fehlschlägt bevor Ergebnisse vorliegen, THEN THE Sync_Service SHALL eine Fehlerantwort zurückgeben, die auf den Grund des Fehlschlags hinweist, und keine Statistik-Daten liefern

### Requirement 5: Detaillierte Differenzliste

**User Story:** Als Benutzer möchte ich eine detaillierte Liste aller Unterschiede sehen, damit ich für jede Datei eine informierte Entscheidung treffen kann.

#### Acceptance Criteria

1. WHEN ein Vergleich abgeschlossen ist und mindestens ein Differenz-Eintrag mit einer Kategorie ungleich `identical` existiert, THE Sync_Client SHALL eine sortierbare und filterbare Liste aller nicht-identischen Differenz-Einträge anzeigen, initial sortiert nach Kategorie aufsteigend und innerhalb gleicher Kategorie nach relativem Pfad alphabetisch aufsteigend
2. THE Sync_Client SHALL für jeden Differenz-Eintrag den relativen Pfad, die Kategorie (farblich kodiert), die Dateigröße beider Versionen und den letzten Änderungszeitpunkt beider Versionen anzeigen, wobei für Dateien die nur in einer Quelle existieren (`local_only`, `vault_only`) die fehlende Version mit einem Platzhalter (z.B. „—") dargestellt wird
3. THE Sync_Client SHALL die Differenzliste nach Kategorie filterbar machen mit den Optionen: `modified`, `local_only`, `vault_only`, `error` und `skipped`, wobei mehrere Filter gleichzeitig aktiv sein können
4. THE Sync_Client SHALL die Differenzliste nach Pfad, Kategorie oder Änderungszeitpunkt sortierbar machen, wobei jede Spalte zwischen aufsteigender und absteigender Sortierung umschaltbar ist
5. WHEN die Differenzliste mehr als 100 Einträge enthält, THE Sync_Client SHALL die Liste paginiert mit maximal 100 Einträgen pro Seite oder virtualisiert darstellen
6. IF der Vergleich keine Differenz-Einträge mit einer Kategorie ungleich `identical` ergibt, THEN THE Sync_Client SHALL anstelle der Differenzliste eine Meldung anzeigen, die darauf hinweist dass Vault und lokales Verzeichnis identisch sind

### Requirement 6: Datei-Diff anzeigen

**User Story:** Als Benutzer möchte ich die inhaltlichen Unterschiede zwischen der Vault-Version und der lokalen Version einer Datei sehen können, damit ich entscheiden kann welche Version ich behalten möchte.

#### Acceptance Criteria

1. WHEN ein Benutzer für einen Differenz-Eintrag der Kategorie `modified` die Diff-Ansicht anfordert, THE Sync_Service SHALL den Inhalt beider Dateiversionen zurückgeben, wobei die Vault-Version und die lokale Version jeweils eindeutig als solche gekennzeichnet sind
2. WHEN der Sync_Client den Inhalt beider Dateiversionen vom Sync_Service empfängt, THE Sync_Client SHALL die Unterschiede zwischen beiden Versionen in einer Side-by-Side- oder Unified-Diff-Ansicht darstellen, wobei hinzugefügte, entfernte und geänderte Zeilen jeweils durch eine eigene, visuell unterscheidbare Farbe hervorgehoben werden und die Vault-Seite sowie die lokale Seite beschriftet sind
3. IF eine der beiden Dateiversionen eine Binärdatei ist, THEN THE Sync_Client SHALL anstelle des Diffs eine Meldung anzeigen, dass ein Binärvergleich nicht möglich ist, und die Dateigrößen beider Versionen darstellen
4. IF eine der beiden Dateiversionen größer als 1 MB ist, THEN THE Sync_Service SHALL den Diff-Inhalt auf die ersten 1 MB der betroffenen Version begrenzen und in der Response ein Kennzeichen mitliefern, das den Client darüber informiert, dass der Inhalt abgeschnitten wurde
5. IF beim Abrufen einer der beiden Dateiversionen ein Fehler auftritt (Datei nicht mehr vorhanden oder nicht lesbar), THEN THE Sync_Service SHALL eine Fehlerantwort zurückgeben, die angibt welche Version nicht abgerufen werden konnte

### Requirement 7: Aktionsauswahl pro Datei

**User Story:** Als Benutzer möchte ich für jede unterschiedliche Datei entscheiden können, was passieren soll, damit ich volle Kontrolle über die Synchronisation habe.

#### Acceptance Criteria

1. THE Sync_Client SHALL für jeden Differenz-Eintrag eine Aktionsauswahl bereitstellen mit den folgenden Optionen abhängig von der Kategorie:
   - `modified`: Vault überschreibt lokal, Lokal überschreibt Vault, Zusammenführen (Merge), Ignorieren
   - `local_only`: In Vault importieren, Lokal löschen, Ignorieren
   - `vault_only`: Lokal exportieren, Im Vault löschen, Ignorieren
2. IF die Kategorie `modified` ist und die Datei als binär erkannt wird, THEN THE Sync_Client SHALL die Option "Zusammenführen (Merge)" deaktiviert anzeigen und nicht als Standard-Aktion vorauswählen
3. WHEN die Kategorie `modified` ist und die lokale Datei einen neueren Änderungszeitpunkt hat als die Vault-Datei, THE Sync_Client SHALL als Standard-Aktion "Lokal überschreibt Vault" vorauswählen
4. WHEN die Kategorie `modified` ist und die Vault-Datei einen neueren Änderungszeitpunkt hat als die lokale Datei, THE Sync_Client SHALL als Standard-Aktion "Vault überschreibt lokal" vorauswählen
5. WHEN die Kategorie `modified` ist und beide Änderungszeitpunkte identisch sind, THE Sync_Client SHALL als Standard-Aktion "Ignorieren" vorauswählen
6. WHEN die Kategorie `local_only` ist, THE Sync_Client SHALL als Standard-Aktion "In Vault importieren" vorauswählen
7. WHEN die Kategorie `vault_only` ist, THE Sync_Client SHALL als Standard-Aktion "Lokal exportieren" vorauswählen
8. THE Sync_Client SHALL eine Möglichkeit bieten, die Aktion für alle Einträge einer Kategorie gleichzeitig zu setzen (Bulk-Aktion), wobei eine Bulk-Aktion alle individuell oder per Standard gesetzten Aktionen der betroffenen Kategorie überschreibt
9. WHEN der Benutzer nach einer Bulk-Aktion die Aktion eines einzelnen Eintrags manuell ändert, THE Sync_Client SHALL nur diesen einzelnen Eintrag aktualisieren und die übrigen Einträge der Kategorie unverändert lassen

### Requirement 8: Bestätigung und Ausführung

**User Story:** Als Benutzer möchte ich vor der Ausführung eine Zusammenfassung der geplanten Aktionen sehen und diese explizit bestätigen müssen, damit keine unbeabsichtigten Änderungen vorgenommen werden.

#### Acceptance Criteria

1. WHEN der Benutzer die Synchronisation starten möchte, THE Sync_Client SHALL eine Bestätigungsansicht anzeigen, die alle geplanten Aktionen zusammenfasst (Anzahl Imports, Exports, Überschreibungen, Löschungen, Ignorierte) sowie die Gesamtanzahl betroffener Dateien
2. WHEN der Benutzer die Bestätigung erteilt, THE Sync_Service SHALL den Sync-Plan validieren und alle Aktionen in der Reihenfolge Löschungen → Überschreibungen → Imports/Exports ausführen
3. IF eine einzelne Aktion fehlschlägt, THEN THE Sync_Service SHALL den Fehler für diese Datei protokollieren, die Ausführung der übrigen Aktionen fortsetzen und am Ende einen Bericht mit allen Erfolgen und Fehlern zurückgeben
4. WHEN der Benutzer die Bestätigung erteilt, THE Sync_Service SHALL vor der Ausführung jeder Datei-Aktion prüfen, ob sich der Zeitstempel der betroffenen Datei seit dem Vergleich geändert hat, und bei Abweichung die betroffene Aktion mit dem Status `conflict` markieren und nicht ausführen
5. IF mindestens eine Aktion den Status `conflict` erhält, THEN THE Sync_Service SHALL die konfliktfreien Aktionen ausführen, die Konflikte im Ausführungsbericht auflisten und der Sync_Client SHALL dem Benutzer die Möglichkeit bieten, für die Konflikte einen neuen Vergleich und eine erneute Aktionsauswahl durchzuführen
6. WHEN alle Aktionen ausgeführt sind, THE Sync_Service SHALL einen Ausführungsbericht zurückgeben, der pro Aktion den Status (erfolgreich, fehlgeschlagen, übersprungen, Konflikt) und bei Fehlern eine Fehlerbeschreibung enthält
7. THE Sync_Service SHALL bei Schreiboperationen ins Vault atomare Writes verwenden (Temp-Datei → rename)
8. THE Sync_Service SHALL bei Schreiboperationen ins lokale Verzeichnis atomare Writes verwenden (Temp-Datei → rename)
9. IF der Benutzer die Bestätigung nicht erteilt (Abbruch), THEN THE Sync_Service SHALL keine Änderungen am Vault oder lokalen Verzeichnis vornehmen
10. IF der Sync-Plan ausschließlich Aktionen vom Typ "Ignorieren" enthält, THEN THE Sync_Service SHALL keine Dateisystem-Operationen ausführen und einen Ausführungsbericht mit dem Status `übersprungen` für alle Einträge zurückgeben
11. IF bereits eine Synchronisation für dasselbe Vault aktiv ist, THEN THE Sync_Service SHALL den neuen Request mit HTTP 409 und dem Fehlercode `SYNC_IN_PROGRESS` ablehnen

### Requirement 9: Merge-Funktionalität

**User Story:** Als Benutzer möchte ich bei modifizierten Textdateien die Möglichkeit haben, Änderungen zusammenzuführen, damit ich Inhalte aus beiden Versionen behalten kann.

#### Acceptance Criteria

1. WHEN der Benutzer für eine modifizierte Textdatei die Aktion "Zusammenführen" wählt, THE Sync_Client SHALL einen Editor anzeigen, der die lokale Version und die Vault-Version nebeneinander darstellt sowie einen editierbaren Bereich für den zusammengeführten Inhalt bereitstellt
2. WHEN der Benutzer den zusammengeführten Inhalt bestätigt, THE Sync_Client SHALL den Inhalt als neue Version sowohl im Vault als auch im lokalen Verzeichnis speichern
3. IF die Datei eine Binärdatei ist (ermittelt durch Null-Byte-Erkennung in den ersten 8192 Bytes), THEN THE Sync_Client SHALL die Merge-Option nicht anbieten
4. IF der Benutzer die Merge-Aktion abbricht, THEN THE Sync_Client SHALL beide Dateiversionen unverändert beibehalten und den Editor schließen
5. IF das Speichern des zusammengeführten Inhalts in einem der beiden Ziele (Vault oder lokales Verzeichnis) fehlschlägt, THEN THE Sync_Client SHALL eine Fehlermeldung anzeigen, die das fehlgeschlagene Ziel benennt, und den zusammengeführten Inhalt im Editor beibehalten, damit der Benutzer den Speichervorgang erneut versuchen kann

### Requirement 10: Eingabevalidierung

**User Story:** Als Systemadministrator möchte ich sicherstellen, dass alle Sync-Eingaben validiert werden, damit keine ungültigen Daten verarbeitet werden.

#### Acceptance Criteria

1. THE Sync_Service SHALL alle eingehenden Requests mit Zod-Schemas validieren, insbesondere Vault-ID (hexadezimaler String, exakt 12 Zeichen), lokaler Pfad (nicht-leerer String, maximal 4096 Zeichen) und Aktionsliste (Array mit mindestens 1 und maximal 10000 Einträgen)
2. IF ein Request ungültige oder fehlende Pflichtfelder enthält, THEN THE Sync_Service SHALL mit HTTP 400 einen strukturierten Fehler im Format `{ code, message, timestamp }` zurückgeben, wobei `message` das erste fehlgeschlagene Feld benennt
3. THE Sync_Service SHALL die Aktionsliste im Sync-Plan validieren: jede Aktion muss einen relativen Dateipfad (nicht-leer, maximal 4096 Zeichen, keine Path-Traversal-Sequenzen) und einen Aktionstyp aus der Menge (`import_to_vault`, `export_to_local`, `overwrite_vault`, `overwrite_local`, `delete_local`, `delete_vault`, `merge`, `ignore`) enthalten
4. IF eine Aktion im Sync-Plan auf eine Datei verweist, die nicht im Vergleichsergebnis enthalten war, THEN THE Sync_Service SHALL den gesamten Sync-Plan mit HTTP 400 und dem Fehlercode `INVALID_SYNC_PLAN` ablehnen und in `message` den betroffenen Dateipfad angeben
5. IF eine Aktion im Sync-Plan einen Aktionstyp enthält, der für die Kategorie des Differenz-Eintrags nicht zulässig ist, THEN THE Sync_Service SHALL den gesamten Sync-Plan mit HTTP 400 und dem Fehlercode `INVALID_SYNC_PLAN` ablehnen und in `message` den betroffenen Dateipfad und den unzulässigen Aktionstyp angeben

### Requirement 11: Audit-Logging

**User Story:** Als Systemadministrator möchte ich nachvollziehen können, welche Synchronisationen durchgeführt wurden, damit ich bei Problemen die Ursache finden kann.

#### Acceptance Criteria

1. WHEN eine Synchronisation erfolgreich abgeschlossen wird, THE Sync_Service SHALL einen Audit-Eintrag mit Aktionstyp `SYNC_SUCCESS`, Benutzer-ID, Vault-ID als Target, Anzahl der ausgeführten Aktionen im Details-Feld und ISO-8601-Zeitstempel erstellen
2. WHEN eine Synchronisation mit Fehlern abgeschlossen wird, THE Sync_Service SHALL einen Audit-Eintrag mit Aktionstyp `SYNC_FAILED`, Benutzer-ID, Vault-ID als Target und einem Details-Feld erstellen, das die fehlgeschlagenen Aktionstypen mit zugehörigen Fehlerbeschreibungen enthält (maximal 500 Zeichen pro Beschreibung)
3. THE Sync_Service SHALL keine Dateiinhalte oder absolute Dateipfade des lokalen Verzeichnisses im Audit-Log speichern, sondern nur vault-relative Pfade und Aktionstypen
4. IF das Schreiben eines Audit-Eintrags während der Synchronisation fehlschlägt, THEN THE Sync_Service SHALL die Synchronisation dennoch fortsetzen und den Audit-Fehler über den Logger protokollieren

### Requirement 12: Größen- und Mengenbegrenzungen

**User Story:** Als Systemadministrator möchte ich Limits für die Synchronisation definieren können, damit das System nicht durch übermäßig große Operationen überlastet wird.

#### Acceptance Criteria

1. THE Sync_Service SHALL die maximale Anzahl vergleichbarer Dateien aus der Server-Konfiguration lesen (Konfigurationsschlüssel `maxSyncFiles`, Standard: 10000)
2. IF die Gesamtanzahl der Dateien in Vault und lokalem Verzeichnis zusammen das konfigurierte Limit überschreitet, THEN THE Sync_Service SHALL den Vergleich mit HTTP 413, dem Fehlercode `SYNC_LIMIT_EXCEEDED` und einem Response-Body im Format `{ code, message, timestamp }` ablehnen, wobei `message` die aktuelle Dateianzahl und das konfigurierte Limit benennt
3. THE Sync_Service SHALL die maximale Dateigröße für den Diff-Vergleich aus der Server-Konfiguration lesen (Konfigurationsschlüssel `maxSyncFileSize`, Standard: 50 MB)
4. IF eine einzelne Datei die konfigurierte maximale Dateigröße überschreitet, THEN THE Sync_Service SHALL diese Datei im Vergleichsergebnis mit dem Status `skipped`, dem Grund `file_too_large` und der tatsächlichen Dateigröße in Bytes aufnehmen und den Vergleich für die übrigen Dateien fortsetzen
5. IF der konfigurierte Wert für `maxSyncFiles` kleiner als 1 oder der konfigurierte Wert für `maxSyncFileSize` kleiner als 1 Byte ist, THEN THE Sync_Service SHALL beim Start einen Fehler loggen und den jeweiligen Standardwert (10000 bzw. 50 MB) verwenden
