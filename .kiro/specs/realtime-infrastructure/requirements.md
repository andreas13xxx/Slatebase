# Requirements Document

## Introduction

Server-Sent Events (SSE) als Push-Kanal für Echtzeit-Updates. Ersetzt das bisherige Polling (30s-Intervall im Chat, Visibility-Change-Refresh) durch eine effiziente, HTTP-basierte Server→Client-Push-Verbindung. SSE wurde statt WebSocket gewählt: einfacher (HTTP-basiert, kein Upgrade), Nginx-kompatibel ohne Extra-Konfiguration, ausreichend für unidirektionalen Server→Client-Push. Der Client sendet weiterhin per REST.

## Glossary

- **SSE_Endpoint**: Der HTTP-Endpoint (`GET /api/v1/events`) der einen persistenten `text/event-stream`-Response-Stream bereitstellt
- **EventSource_Client**: Die Frontend-Komponente die eine `EventSource`-Verbindung zum SSE_Endpoint aufbaut und verwaltet
- **Event_Bus**: Die Backend-Komponente die Events von Services entgegennimmt und an verbundene SSE-Clients weiterleitet
- **Connection_Manager**: Die Backend-Komponente die aktive SSE-Verbindungen pro Benutzer verwaltet (Registrierung, Heartbeat, Cleanup)
- **Toast_Notification**: Eine temporäre UI-Benachrichtigung (Overlay am unteren rechten Bildschirmrand) die Server-Events visualisiert
- **Heartbeat**: Ein periodisches Keep-Alive-Signal vom Server an den Client zur Verbindungsüberwachung
- **Presence_Service**: Die Backend-Komponente die den Online-Status der Benutzer basierend auf aktiven SSE-Verbindungen verwaltet
- **Realtime_Provider**: Der React Context Provider der den EventSource_Client kapselt und Events an die bestehenden State-Provider weiterleitet
- **Feature_Toggle_Service**: Der bestehende Service zur Laufzeit-Aktivierung/-Deaktivierung von Features

## Requirements

### Requirement 1: SSE-Endpoint mit Session-Authentifizierung

**User Story:** Als authentifizierter Benutzer möchte ich eine persistente SSE-Verbindung zum Server aufbauen, damit ich Echtzeit-Updates empfangen kann.

#### Acceptance Criteria

1. WHEN ein authentifizierter Benutzer eine GET-Anfrage an den SSE_Endpoint sendet, THE SSE_Endpoint SHALL einen Response mit Content-Type `text/event-stream`, Header `Cache-Control: no-cache`, Header `Connection: keep-alive` und HTTP-Status 200 zurückgeben
2. WHEN ein nicht-authentifizierter Benutzer eine GET-Anfrage an den SSE_Endpoint sendet, THE SSE_Endpoint SHALL einen HTTP-Status 401 zurückgeben und keine Verbindung aufbauen
3. IF ein Benutzer mit gesperrtem Account eine aktive SSE-Verbindung hat, THEN THE Connection_Manager SHALL die Verbindung innerhalb von 30 Sekunden schließen
4. THE SSE_Endpoint SHALL das Session-Token aus dem `Authorization`-Header (Format `Bearer <token>`) oder dem `token`-Query-Parameter akzeptieren
5. WHEN die Session des Benutzers ungültig wird (Logout, Ablauf, Admin-Invalidierung), THE Connection_Manager SHALL die zugehörige SSE-Verbindung innerhalb von 30 Sekunden schließen
6. THE SSE_Endpoint SHALL durch den Feature_Toggle_Service hinter dem Feature-Toggle `realtime` geschützt sein
7. IF das Feature `realtime` deaktiviert ist, THEN THE SSE_Endpoint SHALL HTTP-Status 403 mit dem Fehlercode `FEATURE_DISABLED` zurückgeben
8. WHILE eine SSE-Verbindung aktiv ist, THE SSE_Endpoint SHALL alle 30 Sekunden einen Heartbeat-Kommentar (`:heartbeat\n\n`) senden, um die Verbindung offen zu halten und tote Verbindungen erkennen zu können
9. WHEN ein Client die SSE-Verbindung mit einem `Last-Event-ID`-Header wiederherstellt, THE SSE_Endpoint SHALL nur Events senden, die nach der angegebenen Event-ID erzeugt wurden
10. IF ein Benutzer mehr als 3 gleichzeitige SSE-Verbindungen hat, THEN THE SSE_Endpoint SHALL die älteste bestehende Verbindung schließen bevor die neue Verbindung akzeptiert wird

### Requirement 2: Connection-Management

**User Story:** Als System möchte ich aktive SSE-Verbindungen effizient verwalten, damit Ressourcen geschont werden und Verbindungsabbrüche erkannt werden.

#### Acceptance Criteria

1. THE Connection_Manager SHALL maximal 3 gleichzeitige SSE-Verbindungen pro Benutzer zulassen
2. WHEN ein Benutzer eine vierte SSE-Verbindung aufbaut, THE Connection_Manager SHALL die älteste Verbindung des Benutzers schließen und dem betroffenen Client ein SSE-Close-Event senden bevor die Verbindung getrennt wird
3. THE Connection_Manager SHALL alle 30 Sekunden ein Heartbeat-Comment (`:heartbeat\n\n`) an alle verbundenen Clients senden
4. WHEN ein Client innerhalb von 90 Sekunden kein erfolgreiches Write auf den Socket zulässt (TCP-Level-Erkennung via `close`- oder `error`-Event des Sockets), THE Connection_Manager SHALL die Verbindung aus der aktiven Liste entfernen und den Benutzer als offline markieren falls es die letzte Verbindung war
5. THE Connection_Manager SHALL beim Schließen einer Verbindung alle zugehörigen Ressourcen freigeben (Event-Listener, Timer, Referenzen im Connection-Store)
6. WHEN der Server heruntergefahren wird (SIGTERM/SIGINT), THE Connection_Manager SHALL allen verbundenen Clients ein SSE-Event mit Typ `server:shutdown` senden und danach alle Verbindungen schließen
7. THE Connection_Manager SHALL die Gesamtzahl gleichzeitiger Verbindungen auf einen konfigurierbaren Wert begrenzen (Standard: 1000, konfigurierbar über `SLATEBASE_SSE_MAX_CONNECTIONS`)
8. IF die maximale Verbindungsanzahl erreicht ist, THEN THE SSE_Endpoint SHALL HTTP-Status 503 mit `Retry-After: 30` Header zurückgeben

### Requirement 3: Event-Bus und Event-Typen

**User Story:** Als Entwickler möchte ich einen zentralen Event-Bus haben, damit Backend-Services Events an verbundene Clients publizieren können.

#### Acceptance Criteria

1. THE Event_Bus SHALL folgende Event-Typen unterstützen: `chat:message`, `chat:unread`, `presence:update`, `vault:change`, `sync:conflict`, `notification:toast`
2. WHEN ein Service ein Event auf dem Event_Bus publiziert, THE Event_Bus SHALL das Event nur an Benutzer weiterleiten die eine aktive SSE-Verbindung haben UND für dieses Event berechtigt sind (Konversations-Teilnehmer für Chat-Events, Vault-Zugriff für Vault-Events, Vault-Besitzer für Sync-Events)
3. THE Event_Bus SHALL jedes Event als SSE-Nachricht im Format `event: <type>\nid: <monoton-steigende-ID>\ndata: <JSON mit type, payload, timestamp als ISO-8601>\n\n` serialisieren
4. WHEN der ChatService eine neue Nachricht erstellt, THE Event_Bus SHALL ein `chat:message`-Event mit Payload `{conversationId, messageId, senderId, senderName, content, timestamp}` an alle Teilnehmer der Konversation senden die eine aktive SSE-Verbindung haben
5. WHEN sich der Unread-Count eines Benutzers ändert, THE Event_Bus SHALL ein `chat:unread`-Event mit Payload `{totalUnread}` an den betroffenen Benutzer senden
6. WHEN ein Benutzer eine SSE-Verbindung aufbaut oder seine letzte Verbindung verliert, THE Event_Bus SHALL ein `presence:update`-Event mit Payload `{userId, username, status: 'online'|'offline'}` an alle Benutzer senden die eine gemeinsame nicht-archivierte Konversation mit dem betroffenen Benutzer haben
7. WHEN eine Vault-Datei gespeichert, gelöscht oder umbenannt wird, THE Event_Bus SHALL ein `vault:change`-Event mit Payload `{vaultId, action: 'saved'|'deleted'|'renamed', path, userId, username}` an alle Benutzer senden die Zugriff auf den betroffenen Vault haben (exklusive des auslösenden Benutzers)
8. WHEN ein Sync-Konflikt erkannt wird, THE Event_Bus SHALL ein `sync:conflict`-Event mit Payload `{vaultId, path}` an den Vault-Besitzer senden
9. THE Event_Bus SHALL Events pro Benutzer pro Event-Typ auf maximal 10 pro Sekunde drosseln, wobei bei Überschreitung ältere Events desselben Typs verworfen und nur das neueste behalten wird

### Requirement 4: Frontend EventSource-Client mit Reconnect-Logik

**User Story:** Als Benutzer möchte ich dass die Echtzeit-Verbindung automatisch wiederhergestellt wird, damit ich nach kurzen Netzwerkunterbrechungen weiterhin Updates erhalte.

#### Acceptance Criteria

1. WHEN der Benutzer authentifiziert ist und das Feature `realtime` aktiviert ist, THE EventSource_Client SHALL beim Mounting der Hauptanwendung eine SSE-Verbindung zu `/api/v1/events?token=<session-token>` aufbauen und den Verbindungsstatus auf `connecting` setzen
2. WHEN die SSE-Verbindung unterbrochen wird, THE EventSource_Client SHALL nach einer exponentiellen Backoff-Strategie erneut verbinden (Initial: 1s, Maximum: 60s, Faktor: 2, Jitter: ±500ms) und den Verbindungsstatus auf `connecting` setzen
3. WHEN der EventSource_Client nach 5 aufeinanderfolgenden Reconnect-Versuchen keine Verbindung herstellen kann, THE EventSource_Client SHALL in den Polling-Fallback-Modus wechseln (Intervall: 30s) und den Verbindungsstatus auf `fallback` setzen
4. WHEN die SSE-Verbindung erfolgreich wiederhergestellt wird, THE EventSource_Client SHALL den Reconnect-Zähler auf 0 zurücksetzen und den Verbindungsstatus auf `connected` setzen
5. WHEN der Browser-Tab unsichtbar wird (Page Visibility API), THE EventSource_Client SHALL einen 5-Minuten-Timer starten und die Verbindung schließen wenn der Tab nach Ablauf des Timers weiterhin unsichtbar ist
6. WHEN der Browser-Tab wieder sichtbar wird und der 5-Minuten-Timer noch läuft, THE EventSource_Client SHALL den Timer abbrechen und die bestehende Verbindung beibehalten
7. WHEN der Browser-Tab wieder sichtbar wird und die Verbindung bereits geschlossen wurde, THE EventSource_Client SHALL die Verbindung innerhalb von 1 Sekunde wiederherstellen
8. THE EventSource_Client SHALL den Verbindungsstatus als React-State über Context bereitstellen mit den Werten: `connected`, `connecting`, `disconnected`, `fallback`
9. WHEN der Benutzer sich abmeldet, THE EventSource_Client SHALL die SSE-Verbindung synchron vor dem Entfernen des Auth-Tokens schließen und den Verbindungsstatus auf `disconnected` setzen
10. WHEN die SSE-Verbindung wiederhergestellt wird, THE EventSource_Client SHALL den `Last-Event-ID`-Header mit der zuletzt empfangenen Event-ID senden, damit der Server verpasste Events nachliefern kann
11. IF der Server auf einen Reconnect-Versuch mit HTTP 401 oder HTTP 403 antwortet, THEN THE EventSource_Client SHALL die Reconnect-Versuche abbrechen, den Verbindungsstatus auf `disconnected` setzen und keine weiteren automatischen Verbindungsversuche unternehmen

### Requirement 5: State-Integration (Polling-Ersatz)

**User Story:** Als Benutzer möchte ich Chat-Nachrichten, Unread-Counts und Vault-Änderungen sofort sehen, ohne auf Polling-Intervalle warten zu müssen.

#### Acceptance Criteria

1. WHEN ein `chat:message`-Event empfangen wird und die betroffene Konversation (identifiziert durch `conversationId` im Event-Payload) aktuell angezeigt wird (`currentConversation === conversationId`), THE Realtime_Provider SHALL die vollständige Nachricht (id, conversationId, senderId, content, timestamp) in das `messages`-Array des Chat-State einfügen
2. WHEN ein `chat:message`-Event empfangen wird und die betroffene Konversation nicht aktuell angezeigt wird, THE Realtime_Provider SHALL den `lastMessagePreview` (gekürzt auf maximal 100 Zeichen mit Ellipsis) und `lastMessageTimestamp` der betroffenen Konversation im Chat-State aktualisieren und die Konversation an den Anfang der Liste verschieben
3. WHEN ein `chat:unread`-Event empfangen wird, THE Realtime_Provider SHALL den `globalUnreadCount` im Chat-State auf den im Event-Payload enthaltenen absoluten Gesamtwert setzen
4. WHILE die SSE-Verbindung aktiv ist (Status `connected`), THE Realtime_Provider SHALL das bestehende 30-Sekunden-Polling für den Chat deaktivieren
5. WHILE die SSE-Verbindung aktiv ist (Status `connected`), THE Realtime_Provider SHALL den Visibility-Change-Refresh-Handler für die Konversationsliste deaktivieren
6. WHEN ein `vault:change`-Event empfangen wird, THE Realtime_Provider SHALL den Directory-Tree des betroffenen Vaults über die bestehende API (`GET /vaults/:vaultId/tree`) neu laden und per `VAULT_TREE_LOADED`-Action im App-State aktualisieren
7. WHEN die SSE-Verbindung in den Fallback-Modus wechselt, THE Realtime_Provider SHALL das bestehende Polling-Verhalten (30-Sekunden-Intervall und Visibility-Change-Handler) innerhalb von 1 Sekunde reaktivieren
8. IF das Neuladen des Directory-Trees nach einem `vault:change`-Event fehlschlägt, THEN THE Realtime_Provider SHALL den Fehler im Log protokollieren und den bestehenden Tree-State unverändert beibehalten
9. WHEN ein `chat:message`-Event für eine Konversation empfangen wird, die bereits die identische Nachrichten-ID im State enthält, THE Realtime_Provider SHALL das Duplikat verwerfen und den State nicht verändern

### Requirement 6: Toast-Notification-Komponente

**User Story:** Als Benutzer möchte ich über wichtige Server-Events visuell benachrichtigt werden, damit ich nichts verpasse auch wenn ich nicht im betroffenen Bereich der Anwendung bin.

#### Acceptance Criteria

1. WHEN ein `notification:toast`-Event empfangen wird, THE Toast_Notification SHALL eine Benachrichtigung mit `position: fixed` am unteren rechten Bildschirmrand (16px Abstand) anzeigen
2. THE Toast_Notification SHALL folgende Varianten unterstützen: `info` (blau), `success` (grün), `warning` (gelb), `error` (rot), wobei die Farben über CSS-Custom-Properties-Tokens definiert werden
3. THE Toast_Notification SHALL nach 5 Sekunden automatisch mit einer CSS-Fade-Out-Animation (Dauer: 300ms) ausgeblendet und aus dem DOM entfernt werden
4. THE Toast_Notification SHALL einen Schließen-Button (Lucide X-Icon, 14px) anbieten, der die Benachrichtigung sofort mit derselben Fade-Out-Animation entfernt
5. WHEN mehrere Toasts gleichzeitig angezeigt werden, THE Toast_Notification SHALL diese vertikal gestapelt darstellen (maximal 5 gleichzeitig sichtbar), wobei bei Überschreitung des Limits der älteste Toast entfernt wird
6. WHEN eine neue Chat-Nachricht empfangen wird, IF der Benutzer sich nicht auf der Chat-Seite befindet, THEN THE Realtime_Provider SHALL ein Toast vom Typ `info` mit dem Absendernamen und einer Nachrichtenvorschau (maximal 100 Zeichen mit „…") auslösen
7. WHEN ein Sync-Konflikt erkannt wird, THE Realtime_Provider SHALL ein Toast vom Typ `warning` mit dem betroffenen Dateinamen (maximal 50 Zeichen mit „…") auslösen
8. WHEN eine Vault-Datei durch einen anderen Benutzer geändert wird, THE Realtime_Provider SHALL ein Toast vom Typ `info` mit dem Benutzernamen und dem Dateinamen auslösen
9. THE Toast_Notification SHALL eigene Design-Tokens (je Variante: `--toast-<variant>-bg`, `--toast-<variant>-border`, `--toast-<variant>-icon`) in allen drei Blöcken (`:root`, `:root[data-theme="dark"]`, `@media (prefers-color-scheme: dark)`) definieren und verwenden

### Requirement 7: Online-Status (Presence) im Chat

**User Story:** Als Benutzer möchte ich sehen welche anderen Benutzer gerade online sind, damit ich weiß ob ich eine sofortige Antwort im Chat erwarten kann.

#### Acceptance Criteria

1. WHEN ein Benutzer eine aktive SSE-Verbindung hat, THE Presence_Service SHALL den Benutzer als `online` markieren
2. WHEN die letzte SSE-Verbindung eines Benutzers geschlossen wird, THE Presence_Service SHALL einen 60-Sekunden-Grace-Period-Timer starten; IF der Benutzer innerhalb dieser 60 Sekunden eine neue SSE-Verbindung aufbaut, THEN THE Presence_Service SHALL den Timer abbrechen und den Benutzer weiterhin als `online` führen; IF der Timer abläuft ohne neue Verbindung, THEN THE Presence_Service SHALL den Benutzer als `offline` markieren
3. WHEN ein `presence:update`-Event empfangen wird, THE Realtime_Provider SHALL den Online-Status des betroffenen Benutzers (identifiziert durch `userId`) im State aktualisieren
4. WHILE ein Benutzer als `online` markiert ist, THE Konversationsliste SHALL einen grünen Punkt-Indikator (8px Durchmesser) neben dem Benutzernamen jedes online-Teilnehmers anzeigen (bei Gruppen-Konversationen pro Teilnehmer)
5. THE Presence_Service SHALL den Online-Status nur an Benutzer senden die mindestens eine gemeinsame nicht-archivierte Konversation mit dem betroffenen Benutzer haben (Privacy-Schutz)
6. THE SSE_Endpoint SHALL bei Verbindungsaufbau ein initiales Event mit Typ `presence:init` und Payload `{onlineUsers: [{userId, username}]}` senden, das alle für den verbundenen Benutzer sichtbaren Online-Benutzer enthält

### Requirement 8: Graceful Degradation (Fallback auf Polling)

**User Story:** Als Benutzer möchte ich die Anwendung auch bei fehlgeschlagener SSE-Verbindung vollständig nutzen können, damit Netzwerkprobleme meine Arbeit nicht blockieren.

#### Acceptance Criteria

1. WHILE der EventSource_Client im Status `fallback` ist, THE Realtime_Provider SHALL das 30-Sekunden-Polling für Chat-Unread-Counts reaktivieren
2. WHILE der EventSource_Client im Status `fallback` ist, THE Realtime_Provider SHALL den Visibility-Change-Refresh-Handler für die Konversationsliste reaktivieren
3. IF das Feature `realtime` deaktiviert ist, THEN THE Realtime_Provider SHALL ausschließlich die bestehende Polling-Logik verwenden und keinen SSE-Verbindungsversuch unternehmen
4. WHEN der EventSource_Client vom Status `fallback` zurück zu `connected` wechselt, THE Realtime_Provider SHALL das Polling wieder deaktivieren und einen einmaligen Full-Refresh der Chat-Unread-Counts und der Konversationsliste auslösen
5. THE Anwendung SHALL ohne SSE-Verbindung vollständig funktionsfähig bleiben (alle Features über REST-Endpoints nutzbar)
6. IF der Full-Refresh nach Reconnect fehlschlägt, THEN THE Realtime_Provider SHALL den Fehler im Log protokollieren und das Polling für weitere 30 Sekunden beibehalten bevor ein erneuter Versuch unternommen wird

### Requirement 9: Feature-Toggle-Integration

**User Story:** Als Administrator möchte ich die Echtzeit-Funktionalität per Feature-Toggle aktivieren oder deaktivieren können, damit ich sie kontrolliert einführen und bei Problemen abschalten kann.

#### Acceptance Criteria

1. THE Feature_Toggle_Service SHALL einen neuen Toggle `realtime` mit dem Standardwert `false` und dem Typ `hot` registrieren
2. WHEN der Toggle `realtime` deaktiviert wird, THE Connection_Manager SHALL allen verbundenen Clients ein SSE-Event mit Typ `server:feature-disabled` senden und danach alle aktiven SSE-Verbindungen innerhalb von 10 Sekunden schließen
3. WHEN der Toggle `realtime` aktiviert wird und das Frontend den Feature-State per `GET /features` abruft, THE Frontend SHALL die SSE-Verbindung automatisch aufbauen
4. THE SSE_Endpoint SHALL durch `createFeatureGuard('realtime')` geschützt sein, sodass Verbindungsversuche bei deaktiviertem Toggle mit HTTP 403 und dem Code `FEATURE_DISABLED` abgelehnt werden
5. IF der Toggle `realtime` aktiviert ist, THEN THE Frontend SHALL den Verbindungsstatus-Indikator anzeigen
6. IF der Toggle `realtime` deaktiviert ist, THEN THE Frontend SHALL den Verbindungsstatus-Indikator ausblenden und keinen SSE-Verbindungsversuch unternehmen

### Requirement 10: Performance und Ressourcen-Management

**User Story:** Als Systemadministrator möchte ich dass die SSE-Infrastruktur ressourcenschonend arbeitet, damit der Server auch bei vielen gleichzeitigen Benutzern stabil bleibt.

#### Acceptance Criteria

1. THE Connection_Manager SHALL pro aktive Verbindung maximal 2 KB Arbeitsspeicher für Metadaten verwenden (userId, connectionId, connectedAt, lastEventId — exklusive OS-Level TCP-Buffer)
2. THE Event_Bus SHALL Events die an denselben Benutzer innerhalb von 100ms gesendet werden zu einem Batch zusammenfassen (maximal 20 Events pro Batch)
3. WHEN mehr als 50 Events pro Sekunde für einen einzelnen Benutzer anfallen, THE Event_Bus SHALL ältere Events desselben Typs verwerfen und nur das neueste pro Typ behalten
4. THE Connection_Manager SHALL getrennte Verbindungen (geschlossener Socket erkannt durch `close`- oder `error`-Event) innerhalb von 5 Sekunden aus der aktiven Verbindungsliste entfernen und zugehörige Ressourcen freigeben
5. THE Event_Bus SHALL keine Events an Verbindungen senden die als `draining` markiert sind (Verbindung wird geschlossen)
6. WHILE der Server mehr als 80% des konfigurierten Connection-Limits erreicht hat, THE Connection_Manager SHALL neue Verbindungen mit HTTP-Status 503 und `Retry-After: 30` Header ablehnen
7. THE SSE_Endpoint SHALL den Header `X-Accel-Buffering: no` setzen um Nginx-Kompatibilität ohne zusätzliche Serverkonfiguration sicherzustellen
