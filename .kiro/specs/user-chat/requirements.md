# Requirements Document

## Introduction

Dieses Dokument beschreibt die Anforderungen für ein Chat-System in Slatebase. Authentifizierte Benutzer sollen miteinander kommunizieren können. Der Fokus liegt auf einem minimalen Kern (Persistenz, Auth-Integration, sinnvolle Einschränkungen), während erweiterte Funktionen als optionale Erweiterungen definiert werden.

## Glossary

- **Chat_Service**: Die Backend-Komponente, die Chat-Nachrichten verwaltet, persistiert und ausliefert
- **Chat_Client**: Die Frontend-Komponente, die das Chat-Interface im Browser bereitstellt
- **Nachricht**: Ein einzelner Chat-Eintrag bestehend aus Absender, Inhalt, Zeitstempel und Konversations-Zuordnung
- **Konversation**: Ein logischer Container für Nachrichten zwischen zwei oder mehr Teilnehmern
- **Teilnehmer**: Ein authentifizierter Benutzer, der einer Konversation zugeordnet ist
- **Rate_Limiter**: Die Komponente, die die Häufigkeit von Nachrichtenversand pro Benutzer begrenzt

## Requirements

### Requirement 1: Authentifizierungspflicht

**User Story:** Als Systemadministrator möchte ich sicherstellen, dass nur authentifizierte Benutzer chatten können, damit keine unbefugten Zugriffe auf das Chat-System erfolgen.

#### Acceptance Criteria

1. WHEN ein Request ohne Authorization-Header oder mit ungültigem/abgelaufenem Token an einen Chat-Endpoint gesendet wird, THE Chat_Service SHALL den Request mit HTTP 401 und einem Response-Body im Format `{ code, message, timestamp }` ablehnen
2. WHEN ein authentifizierter Benutzer einen Chat-Endpoint aufruft, THE Chat_Service SHALL die Benutzer-ID aus der serverseitigen Session extrahieren und als Absender der Nachricht setzen, unabhängig von einer im Request-Body mitgesendeten Absender-ID
3. WHILE ein Benutzer-Account gesperrt ist, THE Chat_Service SHALL alle Chat-Requests dieses Benutzers mit HTTP 403 und dem Fehlercode `ACCOUNT_SUSPENDED` ablehnen, auch wenn eine gültige Session existiert
4. IF ein Client eine Absender-ID im Request-Body sendet, die von der Session-Benutzer-ID abweicht, THEN THE Chat_Service SHALL die clientseitige Absender-ID ignorieren und ausschließlich die Benutzer-ID aus der Session verwenden

### Requirement 2: Nachrichten senden

**User Story:** Als authentifizierter Benutzer möchte ich Nachrichten an andere Benutzer senden können, damit ich mit ihnen kommunizieren kann.

#### Acceptance Criteria

1. WHEN ein Benutzer eine Nachricht an eine existierende Konversation sendet, THE Chat_Service SHALL die Nachricht mit Absender-ID, Inhalt und ISO-8601-Zeitstempel persistieren und die persistierte Nachricht einschließlich der zugewiesenen Nachrichten-ID in der Erfolgsantwort zurückgeben
2. WHEN ein Benutzer eine Nachricht sendet, THE Chat_Service SHALL die Nachricht mit einer systemweit eindeutigen Nachrichten-ID versehen
3. IF der Nachrichteninhalt leer ist oder nur Whitespace enthält, THEN THE Chat_Service SHALL den Request ablehnen und eine Fehlerantwort zurückgeben, die auf ungültigen Nachrichteninhalt hinweist
4. IF der Nachrichteninhalt die maximale Länge von 4000 Zeichen überschreitet, THEN THE Chat_Service SHALL den Request ablehnen und eine Fehlerantwort zurückgeben, die auf die Überschreitung der maximalen Länge hinweist
5. IF der Absender kein Teilnehmer der Ziel-Konversation ist, THEN THE Chat_Service SHALL den Request mit HTTP 403 ablehnen
6. IF die Ziel-Konversation nicht existiert, THEN THE Chat_Service SHALL den Request mit HTTP 404 ablehnen
7. IF der Absender nicht authentifiziert ist, THEN THE Chat_Service SHALL den Request mit HTTP 401 ablehnen

### Requirement 3: Nachrichten abrufen

**User Story:** Als authentifizierter Benutzer möchte ich Nachrichten aus meinen Konversationen abrufen können, damit ich den Chatverlauf lesen kann.

#### Acceptance Criteria

1. WHEN ein Benutzer Nachrichten einer Konversation abruft, THE Chat_Service SHALL die Nachrichten aufsteigend nach timestamp sortiert zurückgeben (älteste zuerst)
2. WHEN ein Benutzer Nachrichten abruft, THE Chat_Service SHALL die Ergebnisse paginiert ausliefern mit einer Standard-Seitengröße von 50 Nachrichten und einer maximalen Seitengröße von 50 Nachrichten pro Seite
3. IF der Benutzer kein Teilnehmer der angefragten Konversation ist, THEN THE Chat_Service SHALL den Request mit HTTP 403 ablehnen
4. THE Chat_Service SHALL für jede Nachricht die Felder id, senderId, content, timestamp (ISO 8601 Format) und conversationId zurückgeben
5. IF die angefragte Konversation nicht existiert, THEN THE Chat_Service SHALL den Request mit HTTP 404 ablehnen
6. WHEN ein Benutzer Nachrichten einer Konversation ohne Nachrichten abruft, THE Chat_Service SHALL eine leere Liste mit Paginierungs-Metadaten zurückgeben

### Requirement 4: Konversationen erstellen

**User Story:** Als authentifizierter Benutzer möchte ich eine neue Konversation mit anderen Benutzern starten können, damit ich mit ihnen kommunizieren kann.

#### Acceptance Criteria

1. WHEN ein authentifizierter Benutzer eine neue Konversation erstellt und alle Teilnehmer gültig sind, THE Chat_Service SHALL eine eindeutige Konversations-ID generieren, die Konversation persistieren und dem Aufrufer die Konversations-ID sowie die Liste der Teilnehmer zurückgeben
2. WHEN ein Benutzer eine Konversation erstellt, THE Chat_Service SHALL den Ersteller automatisch als Teilnehmer hinzufügen
3. IF ein angegebener Teilnehmer nicht als Benutzer existiert, THEN THE Chat_Service SHALL den Request mit einem Validierungsfehler ablehnen, der angibt welcher Teilnehmer nicht gefunden wurde
4. IF ein angegebener Teilnehmer gesperrt ist, THEN THE Chat_Service SHALL den Request mit einem Validierungsfehler ablehnen, der angibt welcher Teilnehmer gesperrt ist
5. IF die Anzahl der Teilnehmer (inklusive Ersteller) 50 überschreitet, THEN THE Chat_Service SHALL den Request mit einem Validierungsfehler ablehnen
6. IF weniger als 2 Teilnehmer (inklusive Ersteller) angegeben werden, THEN THE Chat_Service SHALL den Request mit einem Validierungsfehler ablehnen
7. IF die Teilnehmerliste doppelte Benutzer-IDs enthält, THEN THE Chat_Service SHALL die Duplikate ignorieren und nur eindeutige Teilnehmer zur Konversation hinzufügen
8. IF der Ersteller sich selbst in der Teilnehmerliste angibt, THEN THE Chat_Service SHALL den Ersteller nicht doppelt als Teilnehmer hinzufügen
9. IF der Benutzer nicht authentifiziert ist, THEN THE Chat_Service SHALL den Request mit einem Authentifizierungsfehler ablehnen

### Requirement 5: Konversationen auflisten

**User Story:** Als authentifizierter Benutzer möchte ich meine Konversationen sehen können, damit ich einen Überblick über meine Chats habe.

#### Acceptance Criteria

1. WHEN ein authentifizierter Benutzer seine Konversationen abruft, THE Chat_Service SHALL nur Konversationen zurückgeben, in denen der Benutzer Teilnehmer ist, sortiert nach dem Zeitstempel der letzten Nachricht absteigend, mit maximal 50 Konversationen pro Seite
2. THE Chat_Service SHALL für jede Konversation die Felder id, participants, lastMessageTimestamp und lastMessagePreview zurückgeben, wobei lastMessagePreview maximal 100 Zeichen der letzten Textnachricht enthält und bei Überschreitung abgeschnitten wird
3. IF der Benutzer keine Konversationen hat, THEN THE Chat_Service SHALL eine leere Liste zurückgeben
4. IF die Anfrage ohne gültige Authentifizierung erfolgt, THEN THE Chat_Service SHALL die Anfrage mit einer Fehlermeldung ablehnen, die auf fehlende Authentifizierung hinweist

### Requirement 6: Persistenz

**User Story:** Als Benutzer möchte ich, dass meine Chat-Nachrichten dauerhaft gespeichert werden, damit ich den Verlauf auch nach einem Server-Neustart lesen kann.

#### Acceptance Criteria

1. WHEN eine Nachricht oder Konversation erstellt wird, THE Chat_Service SHALL die Daten synchron im Dateisystem persistieren, bevor die erfolgreiche API-Response an den Client gesendet wird
2. THE Chat_Service SHALL atomare Schreiboperationen verwenden (Temp-Datei → rename), um Datenverlust bei Crashes zu verhindern
3. WHEN der Server neu gestartet wird, THE Chat_Service SHALL alle persistierten Konversationen und Nachrichten aus dem Dateisystem laden, sodass sie unmittelbar über die API abrufbar sind
4. THE Chat_Service SHALL pro Konversation eine separate Metadaten-Datei (Teilnehmer, Erstellungszeitpunkt) und eine separate Nachrichten-Datei führen
5. IF beim Server-Start eine persistierte Datei nicht lesbar oder korrupt ist, THEN THE Chat_Service SHALL die betroffene Konversation überspringen, einen Fehler loggen und alle übrigen Konversationen normal laden

### Requirement 7: Rate-Limiting

**User Story:** Als Systemadministrator möchte ich die Nachrichtenfrequenz begrenzen, damit einzelne Benutzer das System nicht durch Massenversand überlasten.

#### Acceptance Criteria

1. WHEN ein Benutzer die 31. Nachricht innerhalb eines gleitenden 60-Sekunden-Fensters sendet, THE Rate_Limiter SHALL diese und alle weiteren Nachrichten mit HTTP 429 ablehnen, bis das Fenster abgelaufen ist
2. THE Rate_Limiter SHALL das Rate-Limit pro Benutzer unabhängig in-memory verwalten, sodass das Senden eines Benutzers keinen Einfluss auf die Zähler anderer Benutzer hat
3. WHEN das 60-Sekunden-Zeitfenster seit der ersten gezählten Nachricht abgelaufen ist, THE Rate_Limiter SHALL den Zähler für den betroffenen Benutzer auf 0 zurücksetzen und neue Nachrichten wieder zulassen
4. IF eine Nachricht mit HTTP 429 abgelehnt wird, THEN THE Rate_Limiter SHALL in der Response einen Retry-After-Header mit der verbleibenden Wartezeit in ganzen Sekunden (aufgerundet) zurückgeben

### Requirement 8: Eingabevalidierung

**User Story:** Als Systemadministrator möchte ich sicherstellen, dass alle Chat-Eingaben validiert werden, damit keine ungültigen oder schädlichen Daten ins System gelangen.

#### Acceptance Criteria

1. THE Chat_Service SHALL alle eingehenden Nachrichten-Inhalte mit Zod-Schemas validieren, wobei der Nachrichtentext zwischen 1 und 4000 Zeichen lang sein muss
2. THE Chat_Service SHALL Konversations-IDs als hexadezimale Strings mit exakt 24 Zeichen und Nachrichten-IDs als hexadezimale Strings mit exakt 24 Zeichen validieren
3. IF ein Request ungültige oder fehlende Pflichtfelder enthält, THEN THE Chat_Service SHALL mit HTTP-Status 400 einen strukturierten Fehler im Format `{ code, message, timestamp }` zurückgeben, wobei `message` das erste fehlgeschlagene Feld benennt
4. IF ein Request eine ID enthält, die nicht dem hexadezimalen Format oder der erwarteten Länge entspricht, THEN THE Chat_Service SHALL mit HTTP-Status 400 einen strukturierten Fehler im Format `{ code, message, timestamp }` zurückgeben

## Optionale Erweiterungen

### Requirement 9: Echtzeit-Zustellung (Optional — WebSocket)

**User Story:** Als Benutzer möchte ich neue Nachrichten in Echtzeit empfangen, damit ich nicht manuell aktualisieren muss.

#### Acceptance Criteria

1. WHERE die WebSocket-Erweiterung aktiviert ist, WHEN eine neue Nachricht in einer Konversation persistiert wird, THE Chat_Service SHALL die Nachricht über eine WebSocket-Verbindung an alle verbundenen Teilnehmer der Konversation senden
2. WHERE die WebSocket-Erweiterung aktiviert ist, THE Chat_Service SHALL WebSocket-Verbindungen nur für authentifizierte Benutzer akzeptieren
3. WHERE die WebSocket-Erweiterung aktiviert ist, IF eine WebSocket-Verbindung unterbrochen wird, THEN THE Chat_Client SHALL automatisch einen Reconnect-Versuch starten und verpasste Nachrichten nachladen

### Requirement 10: Polling-basierte Aktualisierung (Optional — Alternative zu WebSocket)

**User Story:** Als Benutzer möchte ich neue Nachrichten zeitnah sehen, auch wenn keine WebSocket-Verbindung verfügbar ist.

#### Acceptance Criteria

1. WHERE die Polling-Erweiterung aktiviert ist, THE Chat_Client SHALL in konfigurierbaren Intervallen (Standard: 5 Sekunden) nach neuen Nachrichten fragen
2. WHERE die Polling-Erweiterung aktiviert ist, WHEN der Chat_Client nach neuen Nachrichten fragt, THE Chat_Service SHALL nur Nachrichten zurückgeben, die nach dem zuletzt bekannten Zeitstempel erstellt wurden
3. WHERE die Polling-Erweiterung aktiviert ist, WHILE keine Konversation geöffnet ist, THE Chat_Client SHALL das Polling-Intervall auf 30 Sekunden erhöhen

### Requirement 11: Chat-Typen (Optional — 1:1 und Gruppen)

**User Story:** Als Benutzer möchte ich zwischen Einzelchats und Gruppenchats unterscheiden können, damit ich die passende Kommunikationsform wählen kann.

#### Acceptance Criteria

1. WHERE die Chat-Typen-Erweiterung aktiviert ist, THE Chat_Service SHALL Konversationen mit dem Typ `direct` (genau 2 Teilnehmer) oder `group` (3–50 Teilnehmer) erstellen
2. WHERE die Chat-Typen-Erweiterung aktiviert ist, WHEN ein Benutzer eine Direct-Konversation mit einem anderen Benutzer erstellt und bereits eine existiert, THE Chat_Service SHALL die existierende Konversation zurückgeben
3. WHERE die Chat-Typen-Erweiterung aktiviert ist, THE Chat_Service SHALL bei Gruppen-Konversationen einen optionalen Gruppennamen (maximal 100 Zeichen) unterstützen

### Requirement 12: Vault-basierte Chaträume (Optional)

**User Story:** Als Benutzer möchte ich in einem Vault-Kontext mit anderen Vault-Teilnehmern chatten können, damit die Kommunikation thematisch gebündelt ist.

#### Acceptance Criteria

1. WHERE die Vault-Chat-Erweiterung aktiviert ist, WHEN ein Vault mit anderen Benutzern geteilt wird, THE Chat_Service SHALL automatisch eine Konversation für alle Vault-Teilnehmer erstellen
2. WHERE die Vault-Chat-Erweiterung aktiviert ist, WHEN ein Benutzer Zugriff auf einen Vault verliert, THE Chat_Service SHALL den Benutzer aus der zugehörigen Vault-Konversation entfernen
3. WHERE die Vault-Chat-Erweiterung aktiviert ist, THE Chat_Service SHALL Vault-Konversationen mit einer Referenz auf die Vault-ID verknüpfen

### Requirement 13: Nachrichteninhalt-Erweiterungen (Optional — Markdown und Dateien)

**User Story:** Als Benutzer möchte ich Nachrichten mit Formatierung und Dateiverweisen senden können, damit ich Inhalte besser strukturieren kann.

#### Acceptance Criteria

1. WHERE die Markdown-Erweiterung aktiviert ist, THE Chat_Client SHALL Nachrichteninhalte als Markdown rendern
2. WHERE die Dateianhang-Erweiterung aktiviert ist, WHEN ein Benutzer eine Datei an eine Nachricht anhängt, THE Chat_Service SHALL die Datei im Chat-Speicherbereich persistieren und eine Referenz in der Nachricht speichern
3. WHERE die Vault-Link-Erweiterung aktiviert ist, THE Chat_Client SHALL Verweise auf Vault-Dateien im Format `[[vault:vaultId/path]]` als klickbare Links rendern

### Requirement 14: Aufbewahrung und Löschung (Optional)

**User Story:** Als Benutzer möchte ich Nachrichten löschen können, und als Administrator möchte ich Aufbewahrungsrichtlinien definieren können.

#### Acceptance Criteria

1. WHERE die Lösch-Erweiterung aktiviert ist, WHEN ein Benutzer eine eigene Nachricht löscht, THE Chat_Service SHALL den Nachrichteninhalt durch einen Platzhalter ersetzen und das Löschdatum speichern
2. WHERE die Aufbewahrungs-Erweiterung aktiviert ist, THE Chat_Service SHALL Nachrichten, die älter als die konfigurierte Aufbewahrungsfrist sind, automatisch entfernen
3. WHERE die Lösch-Erweiterung aktiviert ist, THE Chat_Service SHALL gelöschte Nachrichten im Audit-Log protokollieren

### Requirement 15: Benachrichtigungen (Optional)

**User Story:** Als Benutzer möchte ich über neue Nachrichten informiert werden, damit ich keine wichtigen Mitteilungen verpasse.

#### Acceptance Criteria

1. WHERE die Ungelesen-Erweiterung aktiviert ist, THE Chat_Service SHALL pro Benutzer und Konversation einen Zähler ungelesener Nachrichten führen
2. WHERE die Ungelesen-Erweiterung aktiviert ist, WHEN ein Benutzer eine Konversation öffnet, THE Chat_Client SHALL den Ungelesen-Zähler für diese Konversation auf null setzen
3. WHERE die Browser-Benachrichtigungs-Erweiterung aktiviert ist, WHEN eine neue Nachricht eintrifft und der Chat nicht im Fokus ist, THE Chat_Client SHALL eine Browser-Notification anzeigen
4. WHERE die Tipp-Indikator-Erweiterung aktiviert ist, WHILE ein Benutzer in einer Konversation tippt, THE Chat_Client SHALL den anderen Teilnehmern einen Tipp-Indikator anzeigen

### Requirement 16: Gesperrte Benutzer und Chat-Verlauf (Optional)

**User Story:** Als Administrator möchte ich entscheiden können, ob gesperrte Benutzer ihren Chat-Verlauf noch lesen dürfen.

#### Acceptance Criteria

1. WHERE die Lesezugriff-für-Gesperrte-Erweiterung aktiviert ist, WHILE ein Benutzer-Account gesperrt ist, THE Chat_Service SHALL Lesezugriff auf bestehende Konversationen erlauben
2. WHERE die Lesezugriff-für-Gesperrte-Erweiterung aktiviert ist, WHILE ein Benutzer-Account gesperrt ist, THE Chat_Service SHALL das Senden neuer Nachrichten weiterhin blockieren
