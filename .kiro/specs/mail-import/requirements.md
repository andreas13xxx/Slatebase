# Requirements Document

## Introduction

E-Mails aus einem IMAP-Postfach sollen als Markdown-Notizen mit Anhängen in einen Vault importiert werden können. Bisherige Obsidian-Community-Plugins für diesen Zweck scheitern im Browser-Plugin-Kompat-Layer, da sie Node-APIs (`net`/`tls`) benötigen, die dort nicht existieren. Mail-Import läuft daher serverseitig im Backend als eigenständiges, vaultspezifisch konfigurierbares Modul — unabhängig von der (noch unimplementierten) generischen Server-Side-Plugin-Sandbox-Spec, die IMAP-Import ursprünglich als Motivationsbeispiel nannte.

## Glossary

- **Mail_Import_Config**: Eine einzelne, vaultspezifische Konfiguration für ein IMAP-Postfach (Host, Zugangsdaten, Ordner, Zielordner im Vault, Intervall)
- **Import_Engine**: Die Komponente, die einen einzelnen Poll-Zyklus für eine Config ausführt (verbinden, neue Mails abrufen, konvertieren, schreiben)
- **Import_Scheduler**: Der Hintergrunddienst, der fällige, aktivierte Configs periodisch anstößt
- **lastSeenUid**: Die höchste bereits importierte IMAP-UID einer Config — verhindert Doppel-Import bei erneutem Poll

## Requirements

### Requirement 1: Vaultspezifische Konfiguration mehrerer Postfächer

**User Story:** Als Vault-Besitzer möchte ich mehrere IMAP-Postfächer pro Vault konfigurieren können, damit ich z.B. privates und geschäftliches Postfach in denselben oder unterschiedliche Vaults importieren kann.

#### Acceptance Criteria

1. THE Mail_Import_API SHALL pro Vault beliebig viele Mail_Import_Config-Einträge erlauben, bis zu einer Obergrenze von 20 pro Vault
2. THE Mail_Import_API SHALL für jede Config Host, Port, TLS-Flag, Benutzername, IMAP-Ordner (Default `INBOX`), Ziel-Ordner im Vault, Sync-Intervall in Minuten und einen Enabled-Status persistieren
3. THE Mail_Import_API SHALL das IMAP-Passwort getrennt von der übrigen Konfiguration verschlüsselt speichern und niemals im Klartext in einer API-Antwort zurückgeben

### Requirement 2: Mail-zu-Markdown-Konvertierung

**User Story:** Als Vault-Besitzer möchte ich, dass importierte Mails als lesbare Markdown-Notizen mit Metadaten erscheinen.

#### Acceptance Criteria

1. THE Import_Engine SHALL jede importierte Mail als eigene `.md`-Datei mit YAML-Frontmatter (from, to, subject, date, messageId) anlegen
2. WHEN eine Mail einen HTML-Body hat, THE Import_Engine SHALL diesen zu Markdown konvertieren
3. WHEN eine Mail keinen HTML-Body hat, THE Import_Engine SHALL den Plain-Text-Body verwenden
4. THE Import_Engine SHALL den Notiz-Dateinamen aus Datum und Betreff ableiten und bei Namenskollision eindeutig machen (analog zum bestehenden Upload-Modul)

### Requirement 3: Anhänge

**User Story:** Als Vault-Besitzer möchte ich, dass Mail-Anhänge mit in den Vault importiert und aus der Notiz heraus verlinkt werden.

#### Acceptance Criteria

1. THE Import_Engine SHALL echte Anhänge (Content-Disposition "attachment") in einen `attachments`-Unterordner des Ziel-Ordners schreiben
2. THE Import_Engine SHALL jeden Anhang aus der Notiz heraus per Obsidian-Wikilink-Embed (`![[dateiname]]`) verlinken, konsistent mit der bestehenden Paste-Upload-Konvention
3. THE Import_Engine SHALL bereits inline im HTML-Body eingebettete Bilder (Content-Disposition "inline", per `cid:` referenziert) NICHT zusätzlich als Anhangsdatei ablegen
4. WHEN eine Namenskollision auftritt (Notiz oder Anhang), THE Import_Engine SHALL die neue Datei unter einem eindeutigen Namen ablegen statt eine bestehende Datei zu überschreiben, UND SHALL die Kollision als Log-Meldung ausgeben

### Requirement 4: Ungelesene Mails, Ausfallsicherheit über den Gelesen-Status

**User Story:** Als Vault-Besitzer möchte ich, dass nur ungelesene Mails importiert werden und keine Mail doppelt importiert wird, auch wenn ein Poll-Lauf mittendrin fehlschlägt.

#### Acceptance Criteria

1. THE Import_Engine SHALL ausschließlich Mails ohne `\Seen`-Flag (ungelesen) aus dem konfigurierten Ordner abrufen — keine UID-basierte Nachverfolgung
2. THE Import_Engine SHALL eine Mail unmittelbar nach erfolgreichem Schreiben der Notiz (inkl. Anhänge) auf dem IMAP-Server als gelesen (`\Seen`) markieren, bevor die nächste Mail verarbeitet wird
3. WHEN eine einzelne Mail beim Verarbeiten fehlschlägt, THE Import_Engine SHALL diese Mail NICHT als gelesen markieren (sie bleibt für den nächsten Lauf vorgemerkt) UND SHALL mit den restlichen Mails des Laufs fortfahren, statt den gesamten Lauf abzubrechen
4. THE Import_Engine SHALL den Lauf als `error` protokollieren, wenn mindestens eine Mail fehlgeschlagen ist, mit der Anzahl erfolgreich importierter Mails und einer Stichprobe der Fehlermeldungen

### Requirement 5: Ausführung — Intervall und manueller Trigger

**User Story:** Als Vault-Besitzer möchte ich sowohl automatisches, periodisches Polling als auch einen manuellen "Jetzt importieren"-Trigger.

#### Acceptance Criteria

1. THE Import_Scheduler SHALL jede aktivierte Config gemäß ihrem konfigurierten Intervall automatisch pollen
2. THE Mail_Import_API SHALL einen Endpunkt zum sofortigen, manuellen Anstoßen einer einzelnen Config bereitstellen
3. THE Import_Engine SHALL pro Config höchstens einen Lauf gleichzeitig ausführen (manueller Trigger und Scheduler dürfen sich nicht überlappen)
4. THE Mail_Import_API SHALL den letzten Lauf-Status (Zeitpunkt, Ergebnis, Fehlermeldung, Anzahl importierter Mails) pro Config abrufbar machen

### Requirement 6: Feature-Toggle und Zugriffskontrolle

**User Story:** Als Administrator möchte ich Mail-Import serverweit an-/abschalten können, und als Vault-Besitzer möchte ich, dass nur berechtigte Benutzer die Konfiguration ändern können.

#### Acceptance Criteria

1. THE System SHALL Mail-Import hinter einem Feature-Toggle `mail-import` bereitstellen, standardmäßig aktiviert (ein Administrator kann es serverweit deaktivieren)
2. THE Mail_Import_API SHALL Lesezugriff auf Konfiguration/Status nur mit Vault-Leseberechtigung erlauben
3. THE Mail_Import_API SHALL Schreibzugriff (Anlegen, Ändern, Löschen, manueller Trigger) nur mit Vault-Schreibberechtigung erlauben
4. WHEN das Feature `mail-import` serverweit deaktiviert ist, THE Settings-UI SHALL den Navigationseintrag „Mail-Import" sichtbar, aber deaktiviert (disabled) mit einem Tooltip-Hinweis darstellen, und SHALL beim direkten Navigieren zur Sektion einen Hinweistext anzeigen, dass das Feature deaktiviert ist und sich der Benutzer an einen Administrator wenden soll — statt die Sektion vollständig auszublenden oder die API-Requests einfach mit 403 fehlschlagen zu lassen
