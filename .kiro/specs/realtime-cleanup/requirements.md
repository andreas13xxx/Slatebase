# Requirements Document

## Introduction

Die Realtime-Infrastruktur (SSE) ist stabil und produktionsreif. Der Feature-Toggle `realtime` sowie alle Polling-Fallback-Mechanismen sollen entfernt werden. SSE wird zur einzigen Methode für Server→Client-Push. Das vereinfacht den Code, entfernt tote Pfade und reduziert die Komplexität im Frontend-State.

## Glossary

- **Realtime_Toggle**: Der bestehende Feature-Toggle `realtime` der SSE aktiviert/deaktiviert
- **Polling_Fallback**: Die Logik die bei fehlgeschlagener SSE-Verbindung auf 30s-Polling zurückfällt
- **EventSource_Client**: Die Frontend-Komponente die die SSE-Verbindung verwaltet
- **Reconnect_Logik**: Die bestehende Exponential-Backoff-Strategie bei Verbindungsabbrüchen (bleibt erhalten)

## Requirements

### Requirement 1: Feature-Toggle entfernen

**User Story:** Als Entwickler möchte ich den Feature-Toggle `realtime` entfernen, damit der Code einfacher wird und keine toten Pfade mehr existieren.

#### Acceptance Criteria

1. THE Feature_Toggle_Service SHALL den Toggle `realtime` aus der Feature-Registry entfernen
2. THE SSE_Endpoint SHALL den `createFeatureGuard('realtime')`-Check entfernen und immer verfügbar sein (nur Session-Auth bleibt)
3. THE Frontend SHALL die Prüfung `isEnabled('realtime')` vor dem SSE-Verbindungsaufbau entfernen — SSE wird immer aufgebaut wenn der Nutzer authentifiziert ist
4. THE Admin-UI SHALL den Toggle `realtime` nicht mehr in der Feature-Toggle-Liste anzeigen
5. IF bestehende Konfigurationsdateien den Toggle `realtime` enthalten, THEN THE Feature_Toggle_Service SHALL diesen Eintrag ignorieren (keine Migration nötig, kein Fehler)

### Requirement 2: Polling-Fallback entfernen

**User Story:** Als Entwickler möchte ich den Polling-Fallback entfernen, damit nur noch ein Code-Pfad für Echtzeit-Updates existiert.

#### Acceptance Criteria

1. THE EventSource_Client SHALL den Status `fallback` aus dem Verbindungsstatus-Enum entfernen — verbleibende Status: `connected`, `connecting`, `disconnected`
2. THE EventSource_Client SHALL bei fehlgeschlagenen Reconnect-Versuchen (nach 5 Versuchen) im Status `disconnected` bleiben und periodisch (alle 60s) einen erneuten Verbindungsversuch unternehmen statt auf Polling zu wechseln
3. THE Realtime_Provider SHALL die gesamte Polling-Logik entfernen: 30-Sekunden-Chat-Polling, Visibility-Change-Refresh-Handler für Konversationslisten
4. THE Realtime_Provider SHALL den Code-Pfad "Polling reaktivieren bei Fallback" und "Polling deaktivieren bei Connected" entfernen
5. WHEN die SSE-Verbindung unterbrochen ist (Status `disconnected`), THE Frontend SHALL einen visuellen Hinweis anzeigen (z.B. Banner oder Badge) der dem Nutzer signalisiert dass Echtzeit-Updates aktuell nicht verfügbar sind
6. WHEN die SSE-Verbindung nach einer Unterbrechung wiederhergestellt wird, THE EventSource_Client SHALL einen Full-Refresh auslösen (Chat-Unread, Konversationsliste, offene Vault-Trees) um verpasste Updates nachzuholen

### Requirement 3: Code-Bereinigung

**User Story:** Als Entwickler möchte ich allen toten Code der mit dem Toggle und Fallback zusammenhängt entfernen, damit die Codebasis sauber bleibt.

#### Acceptance Criteria

1. THE Backend SHALL das `server:feature-disabled`-Event entfernen (da der Toggle nicht mehr existiert)
2. THE Frontend SHALL die Event-Handler für `server:feature-disabled` entfernen
3. THE Frontend SHALL die bedingte Anzeige des Verbindungsstatus-Indikators (nur wenn Toggle aktiv) entfernen — der Indikator wird immer angezeigt
4. THE Realtime_Provider SHALL die Logik zur bedingten SSE-Verbindung (basierend auf Feature-State) entfernen
5. ALL Tests die den Fallback-Modus oder den Feature-Toggle-Schutz des SSE-Endpoints testen SHALL entfernt oder auf die neue Logik (immer aktiv, Retry statt Fallback) angepasst werden
