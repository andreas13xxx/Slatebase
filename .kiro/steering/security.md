# Slatebase — Sicherheitsrichtlinien

## Path Traversal

- **Immer** `validateFilePath()` verwenden bevor auf Vault-Dateien zugegriffen wird
- Neue Endpoints die Dateipfade entgegennehmen: Path-Traversal-Test als erstes schreiben
- Null-Bytes, absolute Pfade und `..`-Sequenzen werden abgelehnt

## Input-Validierung

- Alle externen Eingaben mit Zod validieren **bevor** sie an Business-Logik weitergegeben werden
- Validierung im Controller-Layer (API), nicht im Business-Layer
- Keine unvalidierten Query-Parameter oder Body-Felder durchreichen
- Maximale Längen für Strings definieren (Vault-Name: 128 Zeichen, Dateipfade: sinnvolles Limit)

## Secrets & Credentials

- Keine Secrets in Logs ausgeben (Pino structured logging: sensible Felder ausschließen)
- Keine Secrets in API-Responses leaken
- `.env`-Dateien niemals committen (`.gitignore` prüfen)
- Env-Vars mit `SLATEBASE_`-Prefix für Konfiguration

## CORS

- Explizite `allowedOrigins` aus Config — niemals `*` verwenden
- Nur benötigte HTTP-Methods erlauben
- Bei neuen Endpoints prüfen ob zusätzliche Methods in CORS-Config nötig sind

## Filesystem

- Atomare Schreiboperationen (Temp-Datei → rename)
- Keine `eval()` oder dynamische Code-Ausführung mit User-Input
- File-Size-Limits enforced bevor Dateien vollständig gelesen werden
- Symlinks nicht folgen (oder explizit prüfen ob Ziel innerhalb Vault liegt)

## Dependencies

- Keine Packages mit bekannten Vulnerabilities installieren
- `npm audit` regelmäßig prüfen
- Bei neuen Dependencies: Paket-Reputation prüfen (Downloads, Maintainer, letzte Updates)

## Authentifizierung & Sessions

- **Opake Tokens** — kein JWT, serverseitige Session-Verwaltung
- Token-Generierung: `crypto.randomBytes(64).toString('hex')` (128 Zeichen)
- CSRF-Token pro Session: `crypto.randomBytes(32).toString('hex')` (64 Zeichen)
- CSRF-Token bei allen zustandsändernden Anfragen (POST, PUT, DELETE) prüfen via `X-CSRF-Token`-Header
- Session-Gültigkeit: 24 Stunden, danach automatisch ungültig
- Rate-Limiting: In-Memory (`Map<username, RateLimitEntry>`), kein Persist nötig — Reset bei Neustart akzeptabel
- Login-Fehler: Immer identische Antwort (kein Unterschied ob Username oder Passwort falsch)
- Passwort-Hashing: argon2id (memory-hard, Timing-Attack-resistent)
- **Niemals** Passwörter oder Token-Werte in Logs oder API-Responses

## Sync-Credentials

- Sync-Credentials (CouchDB-Benutzername, Passwort, E2E-Passphrase) werden mit AES-256-GCM verschlüsselt auf dem Dateisystem gespeichert
- Verschlüsselungs-Secret: `SLATEBASE_SYNC_SECRET` Env-Var (min 32 Zeichen)
- Wenn nicht gesetzt: Random-Secret bei jedem Start → verschlüsselte Credentials überleben Neustarts nicht
- Passwort in API-Responses immer maskiert (alle `*` außer letzte 4 Zeichen; bei < 4 Zeichen vollständig maskiert)
- Sync-Log enthält niemals Credentials oder Dokumentinhalte — nur relative Pfade
- Nur Vault-Besitzer darf Sync konfigurieren — Admin-Rolle hat keinen Bypass

## Audit-Logging

- Append-Only JSONL-Dateien unter `data/audit/YYYY-MM-DD.jsonl`
- Nur `fs.appendFile` — kein Überschreiben, kein Löschen
- Keine sensiblen Daten in Audit-Einträgen (keine Passwörter, keine Token-Werte)
- Pflichtfelder: Zeitstempel (ISO 8601), Benutzer-ID, Aktionstyp, Ziel, IP-Adresse, Erfolg/Fehlschlag

## Error Messages

- Interne Fehlerdetails (Stack Traces, Dateipfade) nicht an den Client senden
- Generische Fehlermeldungen für 500er-Responses
- Detaillierte Fehler nur im Server-Log (Pino)
