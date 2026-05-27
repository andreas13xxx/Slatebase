# Requirements Document

## Introduction

Dieses Dokument beschreibt die Anforderungen für zwei Erweiterungen des bestehenden Chat-Systems in Slatebase: (1) die Möglichkeit, eine Konversation zu verlassen, und (2) einen Ungelesen-Indikator, der sowohl global am Chat-Button als auch pro Konversation in der Konversationsliste angezeigt wird. Beide Features bauen auf der bestehenden Chat-Infrastruktur auf (REST-API, Filesystem-Persistenz, ChatProvider-Pattern).

## Glossary

- **Chat_Service**: Die Backend-Komponente, die Chat-Nachrichten und Konversationen verwaltet, persistiert und ausliefert
- **Chat_Client**: Die Frontend-Komponente, die das Chat-Interface im Browser bereitstellt
- **Konversation**: Ein logischer Container für Nachrichten zwischen zwei oder mehr Teilnehmern
- **Teilnehmer**: Ein authentifizierter Benutzer, der einer Konversation zugeordnet ist
- **Unread_Store**: Die Backend-Komponente, die Ungelesen-Zähler pro Benutzer und Konversation persistent verwaltet
- **Archivierte_Konversation**: Eine Konversation, in der nur noch ein Teilnehmer verbleibt und die keine neuen Nachrichten empfangen kann
- **Ungelesen_Zähler**: Die Anzahl der Nachrichten in einer Konversation, die ein Benutzer noch nicht gelesen hat
- **Globaler_Badge**: Ein numerischer Indikator am Chat-Button in der SidebarToolbar, der die Gesamtzahl ungelesener Nachrichten über alle Konversationen anzeigt
- **ConfirmModal**: Die bestehende wiederverwendbare Bestätigungsdialog-Komponente im Frontend

## Requirements

### Requirement 1: Konversation verlassen

**User Story:** Als authentifizierter Benutzer möchte ich eine Konversation verlassen können, damit ich Konversationen, die mich nicht mehr betreffen, aus meiner Liste entfernen kann.

#### Acceptance Criteria

1. WHEN ein authentifizierter Benutzer eine Konversation verlässt und die Konversation danach noch mindestens zwei Teilnehmer hat, THE Chat_Service SHALL den Benutzer aus der Teilnehmerliste der Konversation entfernen und die aktualisierte Konversation persistieren
2. WHEN ein authentifizierter Benutzer eine Konversation verlässt und die Konversation danach nur noch einen Teilnehmer hat, THE Chat_Service SHALL den Benutzer aus der Teilnehmerliste entfernen und die Konversation als archiviert markieren
3. WHEN ein Benutzer eine Konversation erfolgreich verlassen hat, THE Chat_Service SHALL die Konversation aus der Konversationsliste des Benutzers entfernen
4. IF ein Benutzer versucht, eine Konversation zu verlassen, in der der Benutzer kein Teilnehmer ist, THEN THE Chat_Service SHALL den Request mit HTTP 403 ablehnen
5. IF ein Benutzer versucht, eine nicht existierende Konversation zu verlassen, THEN THE Chat_Service SHALL den Request mit HTTP 404 ablehnen

### Requirement 2: Archivierte Konversation (Read-Only)

**User Story:** Als letzter verbleibender Teilnehmer einer Konversation möchte ich den bisherigen Nachrichtenverlauf weiterhin lesen können, damit keine Informationen verloren gehen.

#### Acceptance Criteria

1. WHILE eine Konversation archiviert ist, THE Chat_Service SHALL dem verbleibenden Teilnehmer weiterhin Lesezugriff auf alle bestehenden Nachrichten der Konversation gewähren
2. WHILE eine Konversation archiviert ist, THE Chat_Service SHALL das Senden neuer Nachrichten an die Konversation mit HTTP 403 und dem Fehlercode `CONVERSATION_ARCHIVED` ablehnen
3. WHILE eine Konversation archiviert ist, THE Chat_Service SHALL die Konversation in der Konversationsliste des verbleibenden Teilnehmers mit einem Archiv-Status kennzeichnen
4. THE Chat_Service SHALL den Archiv-Status einer Konversation im Konversations-Metadaten-Feld `archived` als Boolean persistieren

### Requirement 3: Bestätigungsdialog beim Verlassen

**User Story:** Als Benutzer möchte ich vor dem Verlassen einer Konversation eine Bestätigung erhalten, damit ich nicht versehentlich eine Konversation verlasse.

#### Acceptance Criteria

1. WHEN ein Benutzer die Aktion "Konversation verlassen" auslöst, THE Chat_Client SHALL einen ConfirmModal-Dialog anzeigen, bevor die Verlassen-Aktion an den Server gesendet wird
2. THE Chat_Client SHALL im ConfirmModal eine Warnmeldung anzeigen, die den Benutzer darüber informiert, dass die Konversation nach dem Verlassen nicht mehr in der Konversationsliste sichtbar sein wird
3. WHEN der Benutzer den ConfirmModal-Dialog bestätigt, THE Chat_Client SHALL die Verlassen-Aktion an den Chat_Service senden
4. WHEN der Benutzer den ConfirmModal-Dialog abbricht, THE Chat_Client SHALL keine Aktion an den Server senden und den Dialog schließen

### Requirement 4: API-Endpoint für Konversation verlassen

**User Story:** Als Systemarchitekt möchte ich einen dedizierten API-Endpoint für das Verlassen einer Konversation bereitstellen, damit die Aktion klar von anderen Konversationsoperationen getrennt ist.

#### Acceptance Criteria

1. THE Chat_Service SHALL einen DELETE-Endpoint unter `/api/v1/chat/conversations/:conversationId/participants/me` bereitstellen, der den authentifizierten Benutzer aus der Konversation entfernt
2. WHEN der DELETE-Endpoint erfolgreich ausgeführt wird, THE Chat_Service SHALL mit HTTP 204 (No Content) antworten
3. THE Chat_Service SHALL die Konversations-ID im Endpoint mit dem bestehenden hexId24-Schema validieren
4. IF der Request ohne gültige Authentifizierung erfolgt, THEN THE Chat_Service SHALL den Request mit HTTP 401 ablehnen
5. WHILE der Benutzer-Account gesperrt ist, THE Chat_Service SHALL den Request mit HTTP 403 und dem Fehlercode `ACCOUNT_SUSPENDED` ablehnen

### Requirement 5: Ungelesen-Zähler pro Konversation

**User Story:** Als authentifizierter Benutzer möchte ich sehen, wie viele ungelesene Nachrichten in jeder Konversation vorhanden sind, damit ich priorisieren kann, welche Konversation ich zuerst öffne.

#### Acceptance Criteria

1. WHEN eine neue Nachricht in einer Konversation persistiert wird, THE Unread_Store SHALL den Ungelesen-Zähler für alle Teilnehmer der Konversation außer dem Absender um 1 erhöhen
2. WHEN ein Benutzer die Nachrichten einer Konversation abruft, THE Unread_Store SHALL den Ungelesen-Zähler des Benutzers für diese Konversation auf 0 zurücksetzen
3. THE Unread_Store SHALL den Ungelesen-Zähler pro Benutzer und Konversation als JSON-Datei im Dateisystem persistieren
4. WHEN der Server neu gestartet wird, THE Unread_Store SHALL alle persistierten Ungelesen-Zähler aus dem Dateisystem laden, sodass die Zähler unmittelbar über die API abrufbar sind
5. THE Chat_Service SHALL den Ungelesen-Zähler pro Konversation im Response der Konversationsliste als Feld `unreadCount` zurückgeben

### Requirement 6: Globaler Ungelesen-Badge

**User Story:** Als authentifizierter Benutzer möchte ich am Chat-Button in der Sidebar sehen, ob ungelesene Nachrichten vorhanden sind, damit ich auch ohne den Chat zu öffnen über neue Nachrichten informiert bin.

#### Acceptance Criteria

1. THE Chat_Service SHALL einen GET-Endpoint unter `/api/v1/chat/unread/total` bereitstellen, der die Gesamtzahl ungelesener Nachrichten über alle Konversationen des authentifizierten Benutzers zurückgibt
2. WHEN der Benutzer den Ungelesen-Total-Endpoint aufruft, THE Chat_Service SHALL die Summe aller Ungelesen-Zähler des Benutzers über alle aktiven Konversationen berechnen und als `{ total: number }` zurückgeben
3. THE Chat_Client SHALL am Chat-Button in der SidebarToolbar einen numerischen Badge anzeigen, wenn die Gesamtzahl ungelesener Nachrichten größer als 0 ist
4. WHEN die Gesamtzahl ungelesener Nachrichten 0 ist, THE Chat_Client SHALL den Badge am Chat-Button ausblenden
5. THE Chat_Client SHALL den globalen Ungelesen-Zähler per Polling alle 30 Sekunden vom Server abrufen

### Requirement 7: Ungelesen-Indikator in der Konversationsliste

**User Story:** Als authentifizierter Benutzer möchte ich in der Konversationsliste auf einen Blick erkennen, welche Konversationen ungelesene Nachrichten enthalten, damit ich schnell die relevanten Konversationen finden kann.

#### Acceptance Criteria

1. THE Chat_Client SHALL in der Konversationsliste für jede Konversation mit einem Ungelesen-Zähler größer als 0 einen visuellen Indikator anzeigen
2. THE Chat_Client SHALL den Ungelesen-Zähler als numerischen Wert neben dem Konversationseintrag anzeigen
3. WHEN ein Benutzer eine Konversation öffnet, THE Chat_Client SHALL den Ungelesen-Indikator für diese Konversation sofort auf 0 setzen (optimistisches Update)
4. WHEN die Konversationsliste vom Server geladen wird, THE Chat_Client SHALL die Ungelesen-Zähler aus dem `unreadCount`-Feld der Konversationseinträge übernehmen

### Requirement 8: Ungelesen-Persistenz

**User Story:** Als Benutzer möchte ich, dass meine Ungelesen-Zähler auch nach einem Server-Neustart erhalten bleiben, damit ich keine Nachrichten übersehe.

#### Acceptance Criteria

1. THE Unread_Store SHALL die Ungelesen-Daten als JSON-Datei unter `data/chat/unread/<userId>.json` persistieren
2. WHEN ein Ungelesen-Zähler aktualisiert wird, THE Unread_Store SHALL die Änderung mit atomaren Schreiboperationen (Temp-Datei → rename) persistieren
3. WHEN der Server startet, THE Unread_Store SHALL alle Ungelesen-Dateien aus dem Dateisystem laden und einen In-Memory-Index aufbauen
4. IF beim Server-Start eine Ungelesen-Datei nicht lesbar oder korrupt ist, THEN THE Unread_Store SHALL die betroffene Datei überspringen, einen Fehler loggen und alle übrigen Dateien normal laden

### Requirement 9: Konversation-verlassen und Ungelesen-Integration

**User Story:** Als Benutzer möchte ich, dass beim Verlassen einer Konversation auch meine Ungelesen-Zähler bereinigt werden, damit keine verwaisten Daten entstehen.

#### Acceptance Criteria

1. WHEN ein Benutzer eine Konversation verlässt, THE Unread_Store SHALL den Ungelesen-Zähler des Benutzers für diese Konversation entfernen
2. WHEN ein Benutzer eine Konversation verlässt, THE Chat_Client SHALL den globalen Ungelesen-Badge sofort aktualisieren, um die entfernten ungelesenen Nachrichten abzuziehen
3. WHEN eine Konversation archiviert wird, THE Unread_Store SHALL den Ungelesen-Zähler des verbleibenden Teilnehmers für diese Konversation beibehalten

