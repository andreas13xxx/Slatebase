# Requirements Document

## Introduction

Der MCP Context Server ist das namensgebende Kern-Feature von Slatebase ("Knowledge-Context-Server"). Er ermöglicht KI-Assistenten (Claude, GPT, Cursor, etc.) den Zugriff auf Vault-Inhalte über das standardisierte Model Context Protocol (MCP). Benutzer können ihre Wissensbasis als Kontext für KI-Konversationen bereitstellen, wobei die bestehende Zugriffskontrolle (Ownership + Sharing-Berechtigungen) vollständig respektiert wird.

Der MCP-Server wird als HTTP-basierter Transport (Streamable HTTP) in den bestehenden Hono-Server integriert und nutzt die vorhandene Session-Authentifizierung. Er exponiert Vault-Inhalte als MCP-Resources und bietet MCP-Tools für Suche und Navigation.

## Glossary

- **MCP_Server**: Das Backend-Modul das den Model Context Protocol Server implementiert und MCP-Clients Zugriff auf Vault-Inhalte gewährt.
- **MCP_Client**: Ein externer KI-Assistent oder Tool (z.B. Claude Desktop, Cursor, Continue) der sich über das Model Context Protocol mit dem MCP_Server verbindet.
- **MCP_Session**: Eine authentifizierte Verbindung zwischen einem MCP_Client und dem MCP_Server, gebunden an eine Slatebase-Benutzersession.
- **MCP_Resource**: Eine über das MCP-Protokoll exponierte Vault-Datei oder Verzeichnisstruktur, adressierbar über eine URI.
- **MCP_Tool**: Eine über das MCP-Protokoll exponierte Funktion die der MCP_Client aufrufen kann (z.B. Volltextsuche, Datei-Listing).
- **Streamable_HTTP_Transport**: Der HTTP-basierte MCP-Transportmechanismus der Request/Response und Server-Sent Events (SSE) für Streaming kombiniert.
- **VaultAccessControlService**: Der bestehende Service der Ownership- und Sharing-Berechtigungen für Vault-Zugriffe prüft.
- **API_Token**: Ein langlebiger, opaker Authentifizierungs-Token speziell für MCP-Clients, der unabhängig von Browser-Sessions funktioniert.

## Requirements

### Requirement 1: MCP-Server-Initialisierung und Transport

**User Story:** Als Slatebase-Administrator möchte ich, dass der MCP-Server beim Backend-Start automatisch verfügbar ist, damit KI-Assistenten sich ohne manuelle Konfiguration verbinden können.

#### Acceptance Criteria

1. WHEN das Slatebase-Backend startet, THE MCP_Server SHALL sich als Streamable-HTTP-Transport unter dem Pfad `/api/v1/mcp` registrieren.
2. THE MCP_Server SHALL die MCP-Protokollversion 2024-11-05 oder neuer implementieren.
3. WHEN ein MCP_Client eine `initialize`-Anfrage sendet, THE MCP_Server SHALL innerhalb von 5 Sekunden mit den Server-Capabilities (resources, tools) und Server-Informationen (Name: "slatebase-mcp", Version: aktuelle Backend-Version aus package.json) antworten.
4. WHILE der MCP_Server aktiv ist, THE MCP_Server SHALL mindestens 10 gleichzeitige Verbindungen von verschiedenen MCP_Clients unterstützen.
5. IF ein MCP_Client eine syntaktisch ungültige JSON-Nachricht sendet, THEN THE MCP_Server SHALL mit einem JSON-RPC Parse-Error (Code -32700) antworten.
6. IF ein MCP_Client eine JSON-RPC-Nachricht mit ungültiger Struktur (fehlendes `method`-Feld, falscher `jsonrpc`-Wert) sendet, THEN THE MCP_Server SHALL mit einem JSON-RPC Invalid-Request-Error (Code -32600) antworten.
7. IF ein MCP_Client eine Anfrage mit ungültigen oder fehlenden Parametern sendet, THEN THE MCP_Server SHALL mit einem JSON-RPC Invalid-Params-Error (Code -32602) antworten.
8. WHEN ein MCP_Client eine Anfrage ohne gültiges Authentifizierungs-Token sendet, THE MCP_Server SHALL die Verbindung mit einem HTTP-401-Status ablehnen, ohne MCP-Capabilities preiszugeben.
9. WHERE die MCP-Funktionalität per Konfigurationsoption `mcp.enabled` (Default: `true`) deaktiviert ist, THE MCP_Server SHALL keine HTTP-Routen unter `/api/v1/mcp` registrieren und keine Hintergrundprozesse oder In-Memory-Strukturen für MCP-Sessions anlegen.

---

### Requirement 2: Authentifizierung für MCP-Clients

**User Story:** Als Benutzer möchte ich API-Tokens für MCP-Clients erstellen können, damit KI-Assistenten sicher auf meine Vaults zugreifen können ohne meine Browser-Session zu teilen.

#### Acceptance Criteria

1. WHEN ein authentifizierter Benutzer einen API-Token erstellt, THE MCP_Server SHALL einen opaken Token (128 Zeichen, hex-encoded) mit einem vom Benutzer gewählten Ablaufdatum zwischen 1 und 365 Tagen (Standard: 90 Tage) generieren.
2. THE MCP_Server SHALL API-Tokens als `Authorization: Bearer <token>`-Header in MCP-HTTP-Anfragen akzeptieren.
3. WHEN ein MCP_Client eine Anfrage ohne Authorization-Header, mit fehlerhaftem Header-Format oder mit unbekanntem Token sendet, THE MCP_Server SHALL mit HTTP 401 antworten.
4. WHEN ein API-Token abgelaufen oder widerrufen ist, THE MCP_Server SHALL alle nachfolgenden Anfragen mit diesem Token mit HTTP 401 ablehnen.
5. IF ein Benutzer bereits 10 aktive API-Tokens besitzt, THEN THE MCP_Server SHALL die Erstellung eines weiteren Tokens mit HTTP 409 ablehnen und eine Fehlermeldung zurückgeben, die das erreichte Limit angibt.
6. WHEN ein Benutzer einen API-Token erstellt, THE MCP_Server SHALL den Token-Namen (1–64 Zeichen), Erstellungszeitpunkt und Ablaufdatum persistieren.
7. THE MCP_Server SHALL den vollständigen Token-Wert ausschließlich bei der Erstellung einmalig zurückgeben und danach nur noch maskiert anzeigen (letzte 4 Zeichen sichtbar, Rest durch Asterisken ersetzt).
8. WHEN ein Benutzer seinen Account löscht, THE MCP_Server SHALL alle zugehörigen API-Tokens invalidieren.
9. WHEN ein Administrator einen Benutzer sperrt, THE MCP_Server SHALL alle API-Tokens des gesperrten Benutzers innerhalb derselben Operation invalidieren.
10. WHEN ein Benutzer einen seiner API-Tokens widerruft, THE MCP_Server SHALL den Token sofort invalidieren und aus der Liste aktiver Tokens entfernen.

---

### Requirement 3: Vault-Zugriffskontrolle über MCP

**User Story:** Als Benutzer möchte ich, dass MCP-Clients nur auf die Vaults zugreifen können die mir gehören oder mit mir geteilt wurden, damit meine Zugriffskontrolle auch für KI-Assistenten gilt.

#### Acceptance Criteria

1. WHEN ein MCP_Client eine Resource abruft oder ein Tool aufruft das einen Vault-Zugriff erfordert, THE MCP_Server SHALL die Vault-Berechtigung des authentifizierten Benutzers über den VaultAccessControlService prüfen und die Operation nur bei gültiger Berechtigung ausführen.
2. WHILE ein Benutzer nur Lese-Berechtigung für einen Vault hat, THE MCP_Server SHALL ausschließlich lesende Operationen (Resource-Lesen, Suche, Metadaten-Abruf) für diesen Vault erlauben und schreibende Operationen (Datei-Speichern, Löschen, Umbenennen, Verschieben) ablehnen.
3. IF ein MCP_Client auf einen Vault zugreift für den der Benutzer keine Berechtigung hat, THEN THE MCP_Server SHALL einen MCP-Fehler mit Code -32001 ("Access denied") zurückgeben und die angeforderte Operation nicht ausführen.
4. WHEN eine Vault-Freigabe widerrufen wird, THE MCP_Server SHALL nachfolgende Zugriffe auf diesen Vault durch den betroffenen Benutzer innerhalb von 5 Sekunden ablehnen.
5. THE MCP_Server SHALL bei der Resource-Auflistung nur Vaults anzeigen auf die der authentifizierte Benutzer Zugriff hat.
6. IF der VaultAccessControlService bei einer Berechtigungsprüfung einen internen Fehler zurückgibt, THEN THE MCP_Server SHALL die angeforderte Operation ablehnen und einen MCP-Fehler mit Code -32603 ("Internal error") zurückgeben.

---

### Requirement 4: MCP-Resources — Vault-Inhalte exponieren

**User Story:** Als KI-Assistent-Benutzer möchte ich, dass meine Vault-Dateien als MCP-Resources verfügbar sind, damit der KI-Assistent den Inhalt meiner Notizen als Kontext verwenden kann.

#### Acceptance Criteria

1. THE MCP_Server SHALL jeden zugänglichen Vault als Resource-Gruppe mit dem URI-Schema `vault://<vaultId>/` exponieren.
2. WHEN ein MCP_Client `resources/list` aufruft, THE MCP_Server SHALL alle zugänglichen Vaults mit Name und Vault-ID als Beschreibung auflisten.
3. WHEN ein MCP_Client `resources/read` mit einer Vault-Datei-URI aufruft, THE MCP_Server SHALL den Pfad-Anteil der URI mit `validateFilePath()` gegen Path-Traversal validieren und den Dateiinhalt als Text-Content zurückgeben.
4. THE MCP_Server SHALL Markdown-Dateien (.md) mit dem MIME-Type `text/markdown` und andere Textdateien mit `text/plain` kennzeichnen.
5. IF ein MCP_Client eine Resource-URI für eine nicht existierende Datei anfragt, THEN THE MCP_Server SHALL einen MCP-Fehler mit Code -32002 ("Resource not found") zurückgeben.
6. IF ein MCP_Client eine Resource-URI für eine Binärdatei anfragt, THEN THE MCP_Server SHALL einen MCP-Fehler mit Code -32003 ("Binary files not supported") zurückgeben.
7. WHEN ein MCP_Client `resources/templates/list` aufruft, THE MCP_Server SHALL ein URI-Template `vault://{vaultId}/{path}` für den Zugriff auf beliebige Vault-Dateien bereitstellen.
8. IF die angefragte Datei die konfigurierte maximale Dateigröße (`maxFileSize`, Standard: 5 MB) überschreitet, THEN THE MCP_Server SHALL einen MCP-Fehler mit Code -32004 ("File too large") zurückgeben.
9. IF ein MCP_Client eine Resource-URI mit einem ungültigen Pfad (Path-Traversal, Null-Bytes, absoluter Pfad) anfragt, THEN THE MCP_Server SHALL einen MCP-Fehler mit Code -32602 ("Invalid params") zurückgeben.

---

### Requirement 5: MCP-Resources — Verzeichnisstruktur

**User Story:** Als KI-Assistent-Benutzer möchte ich die Verzeichnisstruktur meiner Vaults über MCP einsehen können, damit der KI-Assistent weiß welche Dateien verfügbar sind.

#### Acceptance Criteria

1. WHEN ein MCP_Client `resources/read` mit einer Vault-Root-URI (`vault://<vaultId>/`) aufruft, THE MCP_Server SHALL die Verzeichnisstruktur als JSON-formatierte Baumdarstellung mit MIME-Type `application/json` zurückgeben.
2. THE MCP_Server SHALL die Verzeichnisstruktur mit Dateinamen, Dateityp (Datei/Ordner), relativen Pfaden und Dateigrößen (in Bytes) bereitstellen, wobei Einträge nach Verzeichnisse-zuerst und dann case-insensitiv alphabetisch sortiert sind.
3. THE MCP_Server SHALL die konfigurierte maximale Verzeichnistiefe (`maxDirectoryDepth`, Standard: 50) bei der Baumdarstellung respektieren und für Verzeichnisse unterhalb der maximalen Tiefe nur die Anzahl direkter Kinder (`itemCount`) ohne weitere Rekursion angeben.
4. IF ein MCP_Client `resources/read` mit einer Vault-Root-URI für einen nicht existierenden Vault oder einen Vault ohne Zugriffsberechtigung aufruft, THEN THE MCP_Server SHALL einen MCP-Fehler mit Code -32001 ("Access denied") zurückgeben.
5. WHEN ein MCP_Client `resources/read` mit einer Vault-Root-URI für einen leeren Vault aufruft, THE MCP_Server SHALL eine gültige JSON-Baumdarstellung mit einem Root-Verzeichnis-Knoten und einer leeren Kinderliste zurückgeben.

---

### Requirement 6: MCP-Tool — Volltextsuche

**User Story:** Als KI-Assistent-Benutzer möchte ich über MCP in meinen Vault-Inhalten suchen können, damit der KI-Assistent relevante Notizen finden kann ohne alle Dateien einzeln lesen zu müssen.

#### Acceptance Criteria

1. THE MCP_Server SHALL ein Tool `search_vault` mit den Parametern `vaultId` (string, required), `query` (string, required, 1–500 Zeichen) und `maxResults` (number, optional, Standard: 20, Bereich: 1–100) bereitstellen.
2. WHEN ein MCP_Client das Tool `search_vault` aufruft, THE MCP_Server SHALL eine case-insensitive Textsuche über alle Textdateien im angegebenen Vault durchführen und die Suche innerhalb von 30 Sekunden abschließen oder abbrechen.
3. THE MCP_Server SHALL für jeden Treffer den Dateipfad, den Dateinamen und einen Kontext-Ausschnitt (maximal 200 Zeichen gesamt, zentriert um den ersten Treffer in der Datei) zurückgeben.
4. THE MCP_Server SHALL die Suchergebnisse nach Relevanz (Anzahl Treffer pro Datei, absteigend) sortieren und bei keinen Treffern eine leere Ergebnisliste zurückgeben.
5. IF der angegebene Vault nicht existiert oder der Benutzer keinen Zugriff hat, THEN THE MCP_Server SHALL einen MCP-Fehler mit Code -32001 ("Access denied") zurückgeben.
6. IF der `query`-Parameter leer ist, nur Whitespace enthält oder die maximale Länge von 500 Zeichen überschreitet, THEN THE MCP_Server SHALL einen MCP-Fehler mit Code -32602 ("Invalid params") zurückgeben.
7. THE MCP_Server SHALL Binärdateien (Dateien die innerhalb der ersten 8192 Bytes Null-Bytes enthalten) und Dateien größer als 10 MB von der Suche ausschließen.
8. THE MCP_Server SHALL die Suche auf maximal 1000 Dateien pro Vault begrenzen, wobei Dateien alphabetisch nach Pfad ausgewählt werden, um Ressourcenerschöpfung zu verhindern.

---

### Requirement 7: MCP-Tool — Vault-Übersicht

**User Story:** Als KI-Assistent-Benutzer möchte ich eine kompakte Übersicht über meine Vaults abrufen können, damit der KI-Assistent schnell den verfügbaren Kontext einschätzen kann.

#### Acceptance Criteria

1. THE MCP_Server SHALL ein Tool `list_vaults` ohne erforderliche Parameter bereitstellen.
2. WHEN ein MCP_Client das Tool `list_vaults` aufruft, THE MCP_Server SHALL alle zugänglichen Vaults mit ID, Name, Berechtigung (owner/read/write) und Gesamtanzahl der Dateien (Dateien aller Typen, rekursiv gezählt) zurückgeben. IF der Benutzer keinen Zugriff auf Vaults hat, THEN THE MCP_Server SHALL eine leere Liste zurückgeben.
3. THE MCP_Server SHALL ein Tool `get_vault_structure` mit dem Parameter `vaultId` (string, required) bereitstellen.
4. WHEN ein MCP_Client das Tool `get_vault_structure` aufruft, THE MCP_Server SHALL die Verzeichnisstruktur des Vaults als JSON-Baumdarstellung zurückgeben, die pro Eintrag den Dateinamen, den Typ (Datei oder Ordner), den relativen Pfad und bei Dateien die Größe in Bytes enthält. THE MCP_Server SHALL dabei die konfigurierte maximale Verzeichnistiefe (`maxDirectoryDepth`) respektieren.
5. IF der angegebene Vault nicht existiert oder der Benutzer keinen Zugriff hat, THEN THE MCP_Server SHALL einen MCP-Fehler mit Code -32001 ("Access denied") zurückgeben.
6. IF der angegebene Vault keine Dateien enthält, THEN THE MCP_Server SHALL eine leere Baumstruktur (leeres JSON-Array) zurückgeben.

---

### Requirement 8: MCP-Tool — Datei lesen

**User Story:** Als KI-Assistent-Benutzer möchte ich einzelne Dateien über MCP-Tools lesen können, damit der KI-Assistent gezielt Notizen als Kontext laden kann.

#### Acceptance Criteria

1. THE MCP_Server SHALL ein Tool `read_file` mit den Parametern `vaultId` (string, required) und `path` (string, required) bereitstellen.
2. WHEN ein MCP_Client das Tool `read_file` mit einem gültigen `vaultId` und `path` aufruft und die Datei kleiner oder gleich dem konfigurierten `maxFileSize`-Wert (Standard: 5.242.880 Bytes) ist, THE MCP_Server SHALL den vollständigen Textinhalt der Datei als UTF-8-String zurückgeben.
3. THE MCP_Server SHALL den Dateipfad mit `validateFilePath()` gegen Path-Traversal-Angriffe validieren.
4. IF der Dateipfad die Path-Traversal-Validierung nicht besteht, THEN THE MCP_Server SHALL einen MCP-Fehler mit Code -32003 ("Invalid file path") zurückgeben.
5. IF die angegebene `vaultId` keinem registrierten Vault entspricht, THEN THE MCP_Server SHALL einen MCP-Fehler mit Code -32001 ("Vault not found") zurückgeben.
6. IF die angegebene Datei nicht existiert, THEN THE MCP_Server SHALL einen MCP-Fehler mit Code -32002 ("Resource not found") zurückgeben.
7. IF die angegebene Datei eine Binärdatei ist (Null-Byte in den ersten 8.192 Bytes erkannt), THEN THE MCP_Server SHALL einen MCP-Fehler mit Code -32003 ("Binary files not supported") zurückgeben.
8. IF die Dateigröße den konfigurierten `maxFileSize`-Wert überschreitet, THEN THE MCP_Server SHALL einen MCP-Fehler mit Code -32004 ("File too large") zurückgeben.

---

### Requirement 9: API-Token-Verwaltung

**User Story:** Als Benutzer möchte ich meine API-Tokens über die Web-Oberfläche verwalten können, damit ich den Zugriff von KI-Assistenten kontrollieren und bei Bedarf widerrufen kann.

#### Acceptance Criteria

1. WHEN ein Benutzer die Token-Verwaltung aufruft, THE MCP_Server SHALL alle Tokens des Benutzers mit Name, Erstellungsdatum, Ablaufdatum, letzter Nutzung und Status (aktiv/abgelaufen) anzeigen.
2. WHEN ein Benutzer einen neuen Token erstellt, THE MCP_Server SHALL den Token-Namen (1–64 Zeichen, eindeutig pro Benutzer) und die gewünschte Gültigkeit (7–365 Tage) entgegennehmen und den generierten Token-Wert einmalig anzeigen.
3. IF der Token-Name leer ist, mehr als 64 Zeichen enthält oder bereits für diesen Benutzer existiert, THEN THE MCP_Server SHALL die Erstellung ablehnen und eine Fehlermeldung mit dem spezifischen Ablehnungsgrund anzeigen.
4. WHEN ein Benutzer einen Token widerruft, THE MCP_Server SHALL den Token sofort invalidieren, sodass nachfolgende API-Anfragen mit diesem Token abgelehnt werden.
5. IF ein Benutzer versucht einen bereits widerrufenen oder nicht existierenden Token zu widerrufen, THEN THE MCP_Server SHALL eine Fehlermeldung anzeigen, die auf den ungültigen Widerruf hinweist.
6. THE MCP_Server SHALL bei jeder erfolgreichen Token-Nutzung den Zeitstempel der letzten Nutzung aktualisieren.
7. THE MCP_Server SHALL abgelaufene Tokens bei der Auflistung als "abgelaufen" kennzeichnen aber nicht automatisch löschen.
8. WHEN ein Benutzer einen Token erstellt oder widerruft, THE MCP_Server SHALL die Aktion im Audit-Log protokollieren.

---

### Requirement 10: Konfiguration und Betrieb

**User Story:** Als Administrator möchte ich den MCP-Server konfigurieren können, damit ich Ressourcenverbrauch und Zugriff kontrollieren kann.

#### Acceptance Criteria

1. THE MCP_Server SHALL über die Konfigurationsvariable `SLATEBASE_MCP_ENABLED` (Standard: true) aktivierbar und deaktivierbar sein.
2. IF `SLATEBASE_MCP_ENABLED` auf false gesetzt ist, THEN THE MCP_Server SHALL alle eingehenden MCP-Anfragen mit einem JSON-RPC Error (Code -32600, "MCP disabled") ablehnen, ohne die Anfrage weiterzuverarbeiten.
3. THE MCP_Server SHALL über die Konfigurationsvariable `SLATEBASE_MCP_MAX_FILE_SIZE` eine separate maximale Dateigröße in Bytes für MCP-Reads erlauben (Standard: Wert aus `maxFileSize` der Server-Config, 5242880 Bytes).
4. IF eine angeforderte Datei die konfigurierte `SLATEBASE_MCP_MAX_FILE_SIZE` überschreitet, THEN THE MCP_Server SHALL die Anfrage mit einem JSON-RPC Error ablehnen, der die maximale erlaubte Größe angibt.
5. THE MCP_Server SHALL über die Konfigurationsvariable `SLATEBASE_MCP_RATE_LIMIT` die maximale Anzahl MCP-Anfragen pro Minute pro Token konfigurierbar machen (Standard: 60, Minimum: 1).
6. IF ein MCP_Client die konfigurierte Anzahl an Anfragen innerhalb eines gleitenden 60-Sekunden-Fensters überschreitet, THEN THE MCP_Server SHALL weitere Anfragen mit HTTP 429 und einem `Retry-After`-Header (verbleibende Sekunden bis Fenster-Reset) ablehnen.
7. THE MCP_Server SHALL alle MCP-Zugriffe (Tool-Aufrufe, Resource-Reads) mit Benutzer-ID, Token-ID, Aktion und Vault-ID im strukturierten Log (Pino) protokollieren.
8. IF der MCP_Server einen internen Fehler bei der Verarbeitung einer MCP-Anfrage hat, THEN THE MCP_Server SHALL einen JSON-RPC Internal Error (Code -32603) zurückgeben ohne interne Details preiszugeben.

---

### Requirement 11: MCP-Server-Metadaten für Verzeichnis-Listing

**User Story:** Als Slatebase-Entwickler möchte ich, dass der MCP-Server standardkonforme Metadaten bereitstellt, damit er im MCP-Verzeichnis gelistet werden kann und KI-Tools ihn automatisch erkennen.

#### Acceptance Criteria

1. THE MCP_Server SHALL im `initialize`-Response den Server-Namen "slatebase-mcp", eine Versionsnummer im Format MAJOR.MINOR.PATCH (SemVer 2.0.0) und die Beschreibung "Knowledge-Context-Server for Markdown vaults" bereitstellen.
2. THE MCP_Server SHALL im `initialize`-Response die Capabilities `resources` (mit `listChanged: false`) und `tools` (mit `listChanged: false`) deklarieren, wobei die deklarierten Capabilities den tatsächlich registrierten Resource- und Tool-Handlern entsprechen müssen.
3. THE MCP_Server SHALL unter dem Pfad `/.well-known/mcp.json` einen öffentlich zugänglichen Endpoint (ohne Authentifizierung) bereitstellen, der mit HTTP 200 und Content-Type `application/json` antwortet.
4. THE MCP_Server SHALL im `/.well-known/mcp.json`-Response die Felder `endpoint` (relative URL des MCP-Transports: "/api/v1/mcp"), `authentication` (Objekt mit `type`: "bearer" und `token_url`: relative URL zur Token-Erstellung) und `capabilities` (Array der unterstützten Capability-Namen: ["resources", "tools"]) bereitstellen.
5. IF die MCP-Funktionalität per Konfiguration deaktiviert ist, THEN THE MCP_Server SHALL auf Anfragen an `/.well-known/mcp.json` mit HTTP 404 antworten.

---

### Requirement 12: Token-Persistenz und Speicherung

**User Story:** Als Benutzer möchte ich, dass meine API-Tokens Server-Neustarts überleben, damit KI-Assistenten nach einem Neustart weiterhin funktionieren.

#### Acceptance Criteria

1. THE MCP_Server SHALL API-Tokens als einzelne JSON-Dateien unter `data/mcp/tokens/<tokenId>.json` persistieren, wobei jede Datei den Token-Hash, die zugehörige userId, den Token-Namen, den Erstellungszeitpunkt, das Ablaufdatum und den Widerrufsstatus enthält.
2. THE MCP_Server SHALL den Token-Hash (SHA-256) statt des Klartext-Tokens speichern.
3. WHEN der MCP_Server startet, THE MCP_Server SHALL einen In-Memory-Index aller nicht-widerrufenen Token-Hashes aus den persistierten Dateien laden, sodass die Token-Validierung per Hash-Lookup ohne Dateisystemzugriff erfolgt.
4. WHEN ein Token erstellt oder widerrufen wird, THE MCP_Server SHALL die Änderung atomar (Temp-Datei → Rename) auf das Dateisystem schreiben.
5. WHEN ein Token widerrufen wird, THE MCP_Server SHALL die Token-Datei mit dem aktualisierten Widerrufsstatus überschreiben und den Hash aus dem In-Memory-Index entfernen.
6. THE MCP_Server SHALL pro Benutzer einen Index (`data/mcp/tokens/_by-user/<userId>.json`) pflegen, der die tokenIds des Benutzers enthält, sodass die Auflistung ohne Scan aller Token-Dateien erfolgt.
7. IF beim Start eine Token-Datei nicht als gültiges JSON gelesen werden kann, THEN THE MCP_Server SHALL diese Datei überspringen, eine Warnung loggen und die verbleibenden Token-Dateien weiter laden.
8. WHEN ein Token erstellt oder widerrufen wird, THE MCP_Server SHALL den zugehörigen Benutzer-Index (`_by-user/<userId>.json`) ebenfalls atomar aktualisieren.
