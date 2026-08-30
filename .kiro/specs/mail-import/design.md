# Design Document: Mail-Import

## Overview

Mail-Import pollt ein oder mehrere IMAP-Postfächer pro Vault und schreibt neue Mails als Markdown-Notizen mit Anhängen in den Vault. Läuft serverseitig im Backend (nicht als Obsidian-Plugin im Browser-Kompat-Layer), da IMAP-Zugriff Node-TLS-Sockets benötigt. Nutzt denselben Scheduler-Zuschnitt und denselben verschlüsselten Credential-Store wie Git-Sync (`shared-secrets`).

**Kernprinzipien:**
- Dedup läuft über den IMAP-eigenen `\Seen`-Status, nicht über einen lokal gespeicherten UID-Watermark: importiert werden nur aktuell ungelesene Mails, und eine Mail wird erst nach erfolgreichem Schreiben als gelesen markiert — kein separater Zähler, keine Drift zwischen Slatebase-Zustand und Postfach-Zustand
- Pro-Mail-Fehlerisolation: eine fehlschlagende Mail bleibt ungelesen (wird beim nächsten Lauf erneut versucht) und bricht nicht den gesamten Lauf ab — der Rest des Batches wird trotzdem verarbeitet
- Kein neues Attachment-Ordner-Konzept: reuse der bestehenden `generateUniqueFilename` + Temp-Datei-dann-Rename-Schreibkonvention aus dem Upload-Modul
- Wikilink-Embeds (`![[dateiname]]`) statt relativer Markdown-Links, konsistent mit der bestehenden Paste-Upload-Konvention im Editor
- Namenskollisionen werden aufgelöst (nie überschrieben) UND als Log-Meldung ausgegeben — ein stiller Rename sieht sonst wie verlorener Inhalt aus

## Architecture

### Neue Dateien

| Pfad | Verantwortung |
|------|---------------|
| `backend/src/mail-import/types.ts` | Datenmodelle: `MailImportConfig`, `MailImportRunStatus` |
| `backend/src/mail-import/errors.ts` | `MailImportConfigNotFoundError`, `MailImportConfigLimitExceededError`, `ImapConnectionError` |
| `backend/src/mail-import/validation.ts` | Zod-Schemas für Create/Update |
| `backend/src/mail-import/config-store.ts` | `MailImportConfigStore` — Config-Liste pro Vault |
| `backend/src/mail-import/status-store.ts` | `MailImportStatusStore` — letzter Lauf-Status pro Config |
| `backend/src/mail-import/imap-client.ts` | `ImapClient` — Wrapper um `imapflow`; liefert eine `IImapConnection` (ungelesene UIDs auflisten, eine Nachricht abrufen, als gelesen markieren, schließen) |
| `backend/src/mail-import/mail-to-markdown.ts` | `convertMailToMarkdown` — `mailparser` + `turndown`, Frontmatter-Erzeugung |
| `backend/src/mail-import/note-writer.ts` | `MailNoteWriter` — schreibt Notiz + Anhänge in den Vault, aktualisiert den Vault-Baum |
| `backend/src/mail-import/import-engine.ts` | `MailImportEngine` — ein Poll-Zyklus pro Config |
| `backend/src/mail-import/mail-import-scheduler.ts` | `MailImportScheduler` — periodischer Tick |
| `backend/src/api/mailImportRoutes.ts` | REST-Endpunkte (CRUD, manueller Trigger, Status) |

### Datenfluss

```
Scheduler-Tick (60s) ──▶ fällige, aktivierte Configs ermitteln
                              │
                              ▼
                MailImportEngine.runOne(vaultId, configId)
                              │
              Passwort aus ModuleSecretStore
                              │
                   ImapClient.connect(...) → IImapConnection
                              │
                   connection.listUnseenUids()
                              │
        ┌─────────────────────┴─────────────────────┐
        ▼ pro UID, aufsteigend                        │
  connection.fetchMessage(uid)                        │
        │                                              │
  convertMailToMarkdown ──▶ MailNoteWriter.writeMail   │
        │                                              │
        └──▶ connection.markAsRead(uid) ◀──────────────┘
       (nur bei Erfolg; Fehler → Mail bleibt ungelesen,
        Fehler wird gesammelt, Batch läuft weiter)
                              │
                    connection.close()
```

## Components and Interfaces

```typescript
// backend/src/mail-import/types.ts
export interface MailImportConfig {
  id: string
  vaultId: string
  name: string
  host: string
  port: number
  secure: boolean
  username: string
  mailbox: string        // Default 'INBOX'
  targetFolder: string   // vault-relativ, '' = Vault-Wurzel
  intervalMinutes: number
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface MailImportRunStatus {
  configId: string
  lastRunAt: string | null
  lastResult: 'success' | 'error' | null
  lastError: string | null
  /** In diesem Lauf gefundene ungelesene Mails, vor eventuellen Einzel-Fehlern. */
  lastFoundCount: number
  lastImportedCount: number
}
```

```typescript
// backend/src/mail-import/imap-client.ts

/** One open, authenticated IMAP session against a single mailbox. */
export interface IImapConnection {
  /** UIDs of currently-unseen messages in the mailbox, ascending (oldest first). */
  listUnseenUids(): Promise<number[]>
  /** Fetches one message's raw RFC822 source by UID. */
  fetchMessage(uid: number): Promise<Buffer>
  /** Marks one message \Seen. Call only after it has been fully imported. */
  markAsRead(uid: number): Promise<void>
  /** Closes the mailbox lock and logs out. */
  close(): Promise<void>
}

export interface IImapClient {
  /** Connects and authenticates, then opens `config.mailbox`. */
  connect(config: ImapConnectionConfig): Promise<IImapConnection>
  /** Connects and authenticates, then returns the account's full mailbox folder tree — lets the UI offer a folder picker instead of the user guessing hierarchy separators/prefixes. */
  listMailboxTree(account: ImapAccountConfig): Promise<MailboxTreeNode[]>
}
```

Primitive statt einer einzigen "hol alles"-Methode, analog zum `IGitCli`-Zuschnitt in der git-sync-Spec: `MailImportEngine` orchestriert (holt Nachricht, schreibt Notiz, markiert erst danach gelesen), `ImapClient` kapselt nur die `imapflow`-Details — das hält die Engine testbar ohne einen echten IMAP-Server und macht die Reihenfolge "erst schreiben, dann als gelesen markieren" explizit statt implizit in einer Bulk-Methode versteckt.

### Mail-zu-Markdown-Konvertierung

- `mailparser.simpleParser(raw)` extrahiert Header, HTML-/Text-Body und Anhänge
- HTML-Body → Markdown via `turndown` (Standardkonfiguration); ohne HTML-Body wird der Plain-Text-Body übernommen
- YAML-Frontmatter-Werte werden als doppelt-gequotete Skalare escaped (`"` → `\"`, `\` → `\\`)
- **Wichtig:** `mailparser`s `attachment.related`-Feld ist auch bei erfolgreich per `cid:` eingebetteten Bildern `undefined` — das zuverlässige Filterkriterium für "bereits im Body eingebettet, kein separater Anhang nötig" ist `contentDisposition !== 'inline'`

### Anhänge und Namenskollisionen

`MailNoteWriter` schreibt Anhänge einer Mail nach `<targetFolder>/<notizbasisname>/` — einem eigenen Unterordner pro Mail, benannt nach dem (bereits kollisionsfrei aufgelösten) Notiznamen ohne `.md`-Endung. Dadurch landen die Anhänge verschiedener Mails nie im selben Ordner. `generateUniqueFilename` (aus dem Upload-Modul) wird weiterhin für Namenskollisionen *innerhalb* einer Mail (mehrere gleichnamige Anhänge) verwendet, und die Anhänge werden im Notiztext als `![[dateiname]]` verlinkt (bloßer Dateiname, kein Pfad — konsistent mit der Wikilink-Embed-Erzeugung bei Paste-Uploads im Editor). Tritt dabei eine Namenskollision auf (Notiz oder Anhang), wird zusätzlich `logger.warn(...)` mit gewünschtem und tatsächlich geschriebenem Namen aufgerufen — der Kollisionsschutz selbst bleibt identisch zum Upload-Modul (nie überschreiben), nur eben mit sichtbarer Log-Meldung statt stillem Rename.

### Duplikatschutz

Kein lokaler Zähler: `connection.listUnseenUids()` fragt bei jedem Lauf frisch die aktuell ungelesenen Nachrichten des Servers ab — **implementiert über `FETCH 1:* {uid, flags}` + clientseitiger Filterung auf fehlendes `\Seen`-Flag, nicht über `SEARCH UNSEEN`**. Grund: an einem echten Konto (Strato) lieferte `SEARCH UNSEEN` ein leeres Ergebnis, obwohl `STATUS` korrekt `unseen: 2` meldete und eine direkte `FETCH`-Abfrage bestätigte, dass beide Nachrichten kein `\Seen` trugen — eine reale Server-Inkonsistenz. Die flag-basierte Filterung hängt nur davon ab, dass der Server Flags korrekt meldet (das stimmte), nicht davon, dass er SEARCH-Kriterien korrekt auswertet. `connection.markAsRead(uid)` wird **erst nach** erfolgreichem `MailNoteWriter.writeMail()` aufgerufen — schlägt das Schreiben (oder das Konvertieren) einer Mail fehl, bleibt sie ungelesen und taucht beim nächsten Lauf erneut in `listUnseenUids()` auf. Andere Mails im selben Batch sind davon unabhängig: ihr Erfolg/Fehlschlag wird pro UID einzeln behandelt (try/catch pro Iteration in `MailImportEngine`), sodass eine kaputte Mail nicht den ganzen Lauf blockiert.

## Data Models

Persistenz-Layout (server-seitig, außerhalb des Vault-Ordners):

```
data/mail-import/config/<vaultId>.json   → MailImportConfig[]
data/mail-import/status/<vaultId>.json   → { [configId]: MailImportRunStatus }
data/module-secrets/<vaultId>/mail-import/secrets.json   → verschlüsselte IMAP-Passwörter
```

Notiz- und Anhangs-Ablage im Vault:

```
<targetFolder>/<YYYY-MM-DD HHmm> <Betreff-Slug>.md
<targetFolder>/<YYYY-MM-DD HHmm> <Betreff-Slug>/<dateiname>
```

## Error Handling

| Fehlerfall | HTTP-Status | Code | Behandlung |
|------------|-------------|------|------------|
| Config nicht gefunden | 404 | `MAIL_IMPORT_CONFIG_NOT_FOUND` | Standard API-Error |
| Config-Limit erreicht (20) | 409 | `MAIL_IMPORT_CONFIG_LIMIT_EXCEEDED` | Standard API-Error |
| IMAP-Verbindung/Login fehlgeschlagen | — | `IMAP_CONNECTION_FAILED` | Lauf als `error` protokolliert |
| Kein Passwort gespeichert | — | — | Lauf als `error` protokolliert, keine Verbindung aufgebaut |
| Einzelne Mail schlägt fehl | — | — | Mail bleibt ungelesen (Retry nächster Lauf), restlicher Batch läuft weiter, Lauf am Ende als `error` mit `importedCount` + Fehler-Stichprobe protokolliert |
| Namenskollision bei Notiz/Anhang | — | — | Datei unter eindeutigem Namen geschrieben (nie überschrieben), zusätzlich `logger.warn(...)` |
| Feature deaktiviert | 403 | `FEATURE_DISABLED` | `createFeatureGuard('mail-import', ...)` |

## Testing Strategy

- **`mail-to-markdown.test.ts`**: Frontmatter-Extraktion, HTML→Markdown, Text-Fallback, Anhangsfilterung (inline vs. attachment), Escaping von Sonderzeichen
- **`note-writer.test.ts`** (echtes Dateisystem, Temp-Vault via `VaultReader`/`VaultManager`): Notiz-Schreiben in Zielordner/Wurzel, Dateinamen-Deduplizierung inkl. `logger.warn`-Aufruf bei Kollision, Anhangs-Schreiben + Wikilink-Embed, Deduplizierung von Anhangsnamen inkl. Log-Aufruf, Sanitizing unsicherer Zeichen im Betreff
- **`imap-client.test.ts`** (Unit, `imapflow` gemockt): `responseText` statt generischem "Command failed" durchgereicht, ungelesene UIDs aufsteigend sortiert, `false`-Rückgabe (keine Treffer) als leere Liste behandelt, Fetch/Mark-as-read/Close rufen die richtigen `imapflow`-Methoden mit den richtigen Argumenten auf
- **`import-engine.test.ts`** (Unit, `IImapClient`/`IMailNoteWriter` gemockt): erfolgreicher Import markiert jede Mail sofort nach dem Schreiben als gelesen, eine fehlschlagende Mail bleibt ungelesen während der Rest des Batches weiterläuft, Verbindung wird auch bei Fehlern immer geschlossen, fehlendes Passwort ohne IMAP-Verbindungsversuch, unbekannte Config wirft
- **`config-store.test.ts`**: CRUD, Mandantentrennung pro Vault, Limit-Durchsetzung
- **`mail-import-scheduler.test.ts`**: Fälligkeits-Logik, disabled-Filter, Fehler-Isolation pro Config
