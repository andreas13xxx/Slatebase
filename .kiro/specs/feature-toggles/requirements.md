# Requirements Document

## Introduction

Feature-Toggles ermöglichen es Administratoren, einzelne Serverfunktionalitäten zentral an- und abzuschalten. Die Toggles werden in der Serverkonfiguration definiert (mit Defaults), können über Umgebungsvariablen überschrieben werden und sind zur Laufzeit über das Admin-Panel steuerbar. Ziel ist eine einheitliche Stelle, an der alle schaltbaren Features konfiguriert werden — inklusive Migration des bestehenden `mcp.enabled`-Flags in das neue System.

## Glossary

- **Feature_Toggle_Service**: Die Backend-Komponente, die den aktuellen Status aller Feature-Toggles verwaltet und Abfragen beantwortet.
- **Admin_Panel**: Die Frontend-Verwaltungsoberfläche für Administratoren.
- **Toggle_Middleware**: Eine Hono-Middleware, die Requests an deaktivierte Features mit einem HTTP-Fehler ablehnt.
- **Feature_Registry**: Die zentrale Datenstruktur, die alle registrierten Features mit ihrem Namen, Default-Status und aktuellen Status enthält.
- **Hot_Toggle**: Eine Statusänderung, die ohne Serverneustart wirksam wird.
- **Cold_Toggle**: Eine Statusänderung, die einen Serverneustart erfordert.

## Requirements

### Requirement 1: Feature-Toggle-Konfiguration in der Serverkonfiguration

**User Story:** Als Administrator möchte ich Feature-Toggles in der Serverkonfiguration definieren, sodass ich beim Deployment festlegen kann, welche Features aktiv sind.

#### Acceptance Criteria

1. THE Feature_Toggle_Service SHALL eine `features`-Sektion in `default.json` bereitstellen, die jeden Toggle als Objekt mit `enabled: boolean` speichert.
2. WHEN die Konfiguration geladen wird, THE Feature_Toggle_Service SHALL für `vault-sync` den Defaultwert `false` verwenden.
3. WHEN die Konfiguration geladen wird, THE Feature_Toggle_Service SHALL für `obsidian-plugin-compat` den Defaultwert `false` verwenden.
4. WHEN die Konfiguration geladen wird, THE Feature_Toggle_Service SHALL für `chat` den Defaultwert `true` verwenden.
5. WHEN die Konfiguration geladen wird, THE Feature_Toggle_Service SHALL für `mcp` den Defaultwert `true` verwenden.
6. WHEN die Konfiguration geladen wird, THE Feature_Toggle_Service SHALL für `knowledge-graph` den Defaultwert `true` verwenden.
6. WHEN eine Umgebungsvariable `SLATEBASE_FEATURE_<NAME>` gesetzt ist, THE Feature_Toggle_Service SHALL den Toggle-Namen auf den Env-Var-Suffix abbilden, indem Bindestriche durch Unterstriche ersetzt und alle Zeichen in Großbuchstaben konvertiert werden (z.B. `vault-sync` → `SLATEBASE_FEATURE_VAULT_SYNC`), und den Wert aus der Umgebungsvariable anstelle des Konfigurationswertes verwenden.
7. THE Feature_Toggle_Service SHALL die Umgebungsvariablen case-insensitiv interpretieren, wobei `true`/`1` als aktiviert und `false`/`0` als deaktiviert gelten.
8. IF eine Umgebungsvariable `SLATEBASE_FEATURE_<NAME>` einen Wert enthält, der nicht in der Menge `{true, false, 1, 0}` (case-insensitiv) liegt, THEN THE Feature_Toggle_Service SHALL den Wert ignorieren und den Konfigurationswert aus `default.json` beibehalten.
9. THE Feature_Toggle_Service SHALL eine Methode `isEnabled(featureName: string): boolean` bereitstellen, über die andere Module den aktuellen Status eines Feature-Toggles abfragen können, wobei ein unbekannter Feature-Name `false` zurückgibt.

### Requirement 2: Laufzeit-Abfrage des Feature-Status

**User Story:** Als Entwickler möchte ich den Status eines Feature-Toggles zur Laufzeit abfragen können, sodass ich Codepfade bedingt ausführen kann.

#### Acceptance Criteria

1. THE Feature_Toggle_Service SHALL eine Methode `isEnabled(featureName: string): boolean` bereitstellen, wobei `featureName` zwischen 1 und 128 Zeichen lang sein muss und nur alphanumerische Zeichen, Bindestriche und Unterstriche enthalten darf.
2. IF ein `featureName` abgefragt wird, das nicht als Toggle registriert ist, leer ist, nur Whitespace enthält oder nicht dem erlaubten Format entspricht, THEN THE Feature_Toggle_Service SHALL `false` zurückgeben, ohne einen Fehler zu werfen.
3. THE Feature_Toggle_Service SHALL ein `IFeatureToggleService`-Interface exponieren, das von allen konsumierenden Modulen verwendet wird.
4. THE Feature_Toggle_Service SHALL den Rückgabewert von `isEnabled` synchron und innerhalb von 1 ms liefern.

### Requirement 3: API-Routen-Schutz durch Toggle-Middleware

**User Story:** Als Benutzer möchte ich eine klare Fehlermeldung erhalten, wenn ein deaktiviertes Feature angesprochen wird, sodass ich verstehe warum die Funktion nicht verfügbar ist.

#### Acceptance Criteria

1. WHEN ein Request an eine Route eines deaktivierten Features eingeht, THE Toggle_Middleware SHALL mit HTTP 403 antworten und einen JSON-Body im Standard-API-Fehlerformat (`{ code, message, timestamp }`) zurückgeben, wobei `code` den Wert `FEATURE_DISABLED` hat und `message` den Feature-Namen enthält.
2. WHEN ein Feature aktiviert ist, THE Toggle_Middleware SHALL den Request ohne Änderung an Headern, Body oder Hono-Context an den nächsten Handler weiterleiten.
3. THE Toggle_Middleware SHALL als Factory-Funktion `createFeatureGuard(featureName: string)` bereitgestellt werden, die eine Hono-Middleware zurückgibt.
4. IF der an `createFeatureGuard` übergebene `featureName` im Feature_Toggle_Service nicht registriert ist, THEN THE Toggle_Middleware SHALL den Request blockieren (gleiches Verhalten wie bei deaktiviertem Feature).

### Requirement 4: Scheduler- und Hintergrundprozess-Steuerung

**User Story:** Als Administrator möchte ich, dass deaktivierte Features keine Hintergrundprozesse ausführen, sodass keine unnötigen Ressourcen verbraucht werden.

#### Acceptance Criteria

1. WHILE das Feature `vault-sync` deaktiviert ist, THE Feature_Toggle_Service SHALL verhindern, dass der Sync-Scheduler neue Sync-Zyklen startet.
2. WHEN ein Feature zur Laufzeit deaktiviert wird, THE Feature_Toggle_Service SHALL laufende Scheduler für dieses Feature innerhalb von 5 Sekunden nach der Statusänderung stoppen.
3. WHEN ein Feature zur Laufzeit aktiviert wird, THE Feature_Toggle_Service SHALL die zugehörigen Scheduler gemäß der gespeicherten Konfiguration erneut starten.
4. IF ein Sync-Zyklus zum Zeitpunkt der Deaktivierung bereits läuft, THEN THE Feature_Toggle_Service SHALL den laufenden Zyklus zu Ende führen lassen, aber keinen neuen Zyklus starten.

### Requirement 5: Hot-Toggle über Admin-API

**User Story:** Als Administrator möchte ich Feature-Toggles zur Laufzeit ändern können, ohne den Server neu starten zu müssen.

#### Acceptance Criteria

1. THE Admin_Panel SHALL einen API-Endpunkt `GET /admin/features` bereitstellen, der alle Feature-Toggles als JSON-Array zurückgibt, wobei jeder Eintrag den Feature-Namen, den aktuellen `enabled`-Status und den Toggle-Typ (`hot` oder `cold`) enthält.
2. THE Admin_Panel SHALL einen API-Endpunkt `PUT /admin/features/:featureName` bereitstellen, der einen JSON-Body mit dem Feld `enabled: boolean` entgegennimmt und bei Erfolg den aktualisierten Toggle-Eintrag mit Feature-Name und neuem Status zurückgibt.
3. WHEN ein Toggle über die API geändert wird, THE Feature_Toggle_Service SHALL die Änderung innerhalb derselben Request-Verarbeitung (ohne Neustart) wirksam machen, sodass nachfolgende Requests den neuen Status verwenden.
4. WHEN ein Toggle geändert wird, THE Feature_Toggle_Service SHALL einen Audit-Log-Eintrag erstellen, der die userId des Administrators, den Feature-Namen, den alten und neuen `enabled`-Wert sowie den Zeitstempel enthält.
5. WHEN ein nicht-registrierter Feature-Name über die API angesprochen wird, THE Feature_Toggle_Service SHALL mit HTTP 404 und dem Fehlercode `FEATURE_NOT_FOUND` antworten.
6. IF der PUT-Body kein gültiges JSON mit dem Feld `enabled` vom Typ `boolean` enthält, THEN THE Admin_Panel SHALL mit HTTP 400 und dem Fehlercode `VALIDATION_ERROR` antworten.
7. IF ein nicht-authentifizierter Benutzer den Endpunkt aufruft, THEN THE Admin_Panel SHALL mit HTTP 401 antworten.
8. IF ein authentifizierter Benutzer ohne Admin-Rolle den Endpunkt aufruft, THEN THE Admin_Panel SHALL mit HTTP 403 antworten.

### Requirement 6: Frontend-Integration im Admin-Panel

**User Story:** Als Administrator möchte ich Feature-Toggles über eine grafische Oberfläche steuern, sodass ich keine API-Calls manuell absetzen muss.

#### Acceptance Criteria

1. THE Admin_Panel SHALL eine Sektion "Feature-Toggles" auf der Admin-Konfigurationsseite anzeigen.
2. THE Admin_Panel SHALL für jeden registrierten Toggle einen Toggle-Switch mit Feature-Name und aktuellem Status anzeigen.
3. WHEN ein Toggle-Switch betätigt wird, THE Admin_Panel SHALL den neuen Status an die API senden und bei erfolgreicher Antwort den Switch-Zustand auf den neuen Wert setzen.
4. IF ein API-Fehler bei der Statusänderung auftritt, THEN THE Admin_Panel SHALL den Switch auf den vorherigen Zustand zurücksetzen und eine Fehlermeldung mit dem vom Server zurückgegebenen Fehlertext anzeigen, die sichtbar bleibt bis der Benutzer eine weitere Aktion ausführt oder die Meldung schließt.
5. THE Admin_Panel SHALL deaktivierte Features mit reduzierter Deckkraft (opacity) des gesamten Toggle-Eintrags darstellen, sodass der Zustand "deaktiviert" ohne Ablesen des Switch-Status erkennbar ist.
6. WHILE die Toggle-Liste vom Server geladen wird, THE Admin_Panel SHALL einen Ladeindikator anstelle der Toggle-Liste anzeigen.
7. IF das initiale Laden der Toggle-Liste fehlschlägt, THEN THE Admin_Panel SHALL eine Fehlermeldung mit Retry-Möglichkeit anzeigen.
8. WHEN ein Toggle als Cold_Toggle registriert ist, THE Admin_Panel SHALL neben dem Toggle-Switch einen Hinweis anzeigen, dass ein Serverneustart erforderlich ist, damit die Änderung wirksam wird.

### Requirement 7: Frontend-UI-Anpassung bei deaktivierten Features

**User Story:** Als Benutzer möchte ich UI-Elemente deaktivierter Features nicht sehen, sodass die Oberfläche übersichtlich bleibt.

#### Acceptance Criteria

1. WHEN das Feature `chat` deaktiviert ist, THE Frontend SHALL den Chat-Button in der Sidebar ausblenden.
2. WHEN das Feature `vault-sync` deaktiviert ist, THE Frontend SHALL die Sync-Konfigurationsseite und den Sync-Status-Button ausblenden.
3. WHEN das Feature `mcp` deaktiviert ist, THE Frontend SHALL die MCP-Token-Verwaltung ausblenden.
4. WHEN das Feature `obsidian-plugin-compat` deaktiviert ist, THE Frontend SHALL die Plugin-Verwaltungsseite und den Command-Palette-Shortcut ausblenden.
5. WHEN das Feature `knowledge-graph` deaktiviert ist, THE Frontend SHALL den Graph-Button in der Toolbar und den Graph-Tab ausblenden.
6. THE Frontend SHALL den Feature-Status beim Login über einen API-Endpunkt `GET /api/v1/features` abfragen, der für alle authentifizierten Benutzer zugänglich ist.
7. IF ein Benutzer eine URL eines deaktivierten Features direkt aufruft, THEN THE Frontend SHALL zur Startseite weiterleiten oder einen Hinweis anzeigen, dass das Feature nicht verfügbar ist.

### Requirement 8: Entfernung des bestehenden mcp.enabled

**User Story:** Als Entwickler möchte ich, dass das bestehende `mcp.enabled`-Flag komplett entfernt und durch das neue Toggle-System ersetzt wird, sodass es eine einzige, konsistente Konfigurationsquelle gibt.

#### Acceptance Criteria

1. THE Feature_Toggle_Service SHALL das Feld `mcp.enabled` aus `config/default.json` entfernen und stattdessen ausschließlich `features.mcp.enabled` verwenden.
2. THE Feature_Toggle_Service SHALL die Umgebungsvariable `SLATEBASE_MCP_ENABLED` nicht mehr auswerten; der MCP-Toggle wird ausschließlich über `SLATEBASE_FEATURE_MCP` gesteuert.
3. THE Feature_Toggle_Service SHALL alle Code-Stellen, die bisher `mcp.enabled` aus der Konfiguration lesen, auf die neue `isEnabled('mcp')`-Methode umstellen.
4. THE Feature_Toggle_Service SHALL das `mcp`-Objekt in der Serverkonfiguration auf die verbleibenden MCP-spezifischen Einstellungen (`maxFileSize`, `rateLimit`, `maxTokensPerUser`) reduzieren, ohne das `enabled`-Feld.
5. IF nach dem Update eine Konfigurationsdatei noch das Feld `mcp.enabled` enthält, THEN THE Feature_Toggle_Service SHALL das Feld beim Laden ignorieren (kein Fehler, kein Fallback).

### Requirement 9: Erweiterbarkeit für zukünftige Features

**User Story:** Als Entwickler möchte ich neue Features einfach als Toggle registrieren können, sodass bei zukünftigen Erweiterungen konsistent entschieden wird ob sie schaltbar sind.

#### Acceptance Criteria

1. THE Feature_Registry SHALL eine Registrierung neuer Toggles mit den Pflichtfeldern Name (String, 1–64 Zeichen), Beschreibung (String, 1–256 Zeichen), Default-Wert (Boolean) und Toggle-Typ (Hot_Toggle oder Cold_Toggle) ermöglichen.
2. IF bei der Registrierung der Feature-Name bereits existiert oder nicht dem Format `[a-z][a-z0-9-]{0,63}` (1–64 Zeichen, beginnend mit Kleinbuchstabe) entspricht, THEN THE Feature_Registry SHALL die Registrierung ablehnen und eine Fehlermeldung zurückgeben, die den Ablehnungsgrund angibt.
3. THE Feature_Registry SHALL jede Registrierung mit einer Angabe versehen, ob das Feature ein Hot_Toggle (Änderung wirkt sofort ohne Neustart) oder ein Cold_Toggle (Änderung wirkt erst nach Neustart) ist.
4. WHEN ein Cold_Toggle über die API geändert wird, THE Feature_Toggle_Service SHALL in der API-Antwort ein Feld `restartRequired: true` setzen, das anzeigt, dass ein Neustart erforderlich ist, damit die Änderung wirksam wird.
5. WHEN ein Hot_Toggle über die API geändert wird, THE Feature_Toggle_Service SHALL den neuen Wert sofort ohne Neustart anwenden und in der API-Antwort `restartRequired: false` setzen.
