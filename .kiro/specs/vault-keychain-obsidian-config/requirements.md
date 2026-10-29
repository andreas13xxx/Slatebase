# Requirements Document

## Introduction

Zwei zusammenhängende Ziele:

1. **Vault-Schlüsselbund:** Ein benannter, verschlüsselter Secret-Speicher pro Vault mit UI in den Einstellungen. Er ersetzt die bisherigen Plugin-Secrets (`data/plugins/<vaultId>/<pluginId>/secrets.json`) und entspricht Obsidians „Keychain" (`app.secretStorage`, seit 1.11.4): vault-spezifisch, nicht im Vault gespeichert, Schlüssel plugin-übergreifend teilbar.
2. **Obsidian-Konfiguration:** Vault-Einstellungen, die bisher fest im Code stehen oder pro User gespeichert sind, werden konfigurierbar und aus den Obsidian-Dateien in `.obsidian/` gelesen und (wo sinnvoll) geschrieben.

`_registry.json` bleibt unverändert (Rechte, Freigabe, Kompatibilität; kein Obsidian-Gegenstück, wird von der Sandbox durchgesetzt).

## Glossary

- **Keychain**: Vault-spezifischer Secret-Speicher. Eintrag = `(vaultId, secretId) -> Wert`.
- **Secret_ID**: Name eines Eintrags. Kleinbuchstaben, Ziffern, Bindestriche (wie bei Obsidian).
- **App_Config**: `.obsidian/app.json` des Vaults.
- **Vault_File**: Datei unter `.obsidian/`, die Obsidian ebenfalls liest.

## Requirements

### Requirement 1: Keychain-Speicher

**User Story:** Als Benutzer möchte ich Zugangsdaten pro Vault an einer Stelle verwalten, damit mehrere Plugins denselben Schlüssel nutzen können.

#### Acceptance Criteria

1. THE Keychain SHALL Werte pro Vault AES-256-GCM-verschlüsselt unter `data/` ablegen, nie im Vault.
2. THE Keychain SHALL Secret_IDs auf `^[a-z0-9]+(-[a-z0-9]+)*$` mit höchstens 128 Zeichen und Werte auf höchstens 10 KB begrenzen.
3. WHEN ein Vault gelöscht wird, THE Keychain SHALL alle seine Einträge löschen.
4. THE Keychain SHALL den bestehenden Schlüssel-Manager aus `shared-secrets/` wiederverwenden, keinen eigenen.
5. THE API SHALL Werte nur an Benutzer mit Schreibzugriff auf den Vault ausgeben; die Liste (nur IDs) braucht Lesezugriff.

### Requirement 2: Plugin-API

**User Story:** Als Plugin-Autor möchte ich `app.secretStorage` wie in Obsidian nutzen.

#### Acceptance Criteria

1. THE Plugin-Shim SHALL `getSecret(id)`, `setSecret(id, value)` und `listSecrets()` auf die Keychain des aktuellen Vaults abbilden.
2. THE Plugin-Shim SHALL jedem aktivierten Plugin Zugriff auf alle Einträge geben (Obsidian-Verhalten) und dies in der Plugin-Berechtigungsanzeige ausweisen.
3. THE Frontend SHALL keine eigene Verschlüsselung und keinen localStorage-Fallback für Secrets mehr halten.

### Requirement 3: Migration der Plugin-Secrets

#### Acceptance Criteria

1. WHEN der Server startet und für einen Vault alte Plugin-Secrets existieren, THE Migration SHALL sie in die Keychain übernehmen und die alte Datei erst nach erfolgreichem Schreiben entfernen.
2. IF eine Secret_ID bereits mit anderem Wert existiert, THEN THE Migration SHALL den vorhandenen Wert behalten und den alten unter `<pluginId>-<secretId>` ablegen.
3. IF eine alte ID nicht dem neuen Format entspricht, THEN THE Migration SHALL sie normalisieren (Kleinbuchstaben, ungültige Zeichen zu Bindestrich) und das im Log vermerken.
4. THE Migration SHALL idempotent sein.
5. THE Server SHALL die Plugin-Secret-Routen und `plugin/secret-store.ts` nach der Migration entfernen.

### Requirement 4: Keychain-UI

#### Acceptance Criteria

1. THE Settings_Panel SHALL in der Kategorie „Vault" die Sektion „Schlüsselbund" anzeigen.
2. THE Sektion SHALL Einträge auflisten (nur ID, Werte maskiert), Anlegen, Ändern (Wert neu setzen), Löschen mit Bestätigung und Anzeigen des Wertes auf ausdrückliche Aktion erlauben.
3. THE Sektion SHALL ohne Schreibzugriff auf den Vault schreibgeschützt sein.
4. THE Sektion SHALL tastaturbedienbar sein und axe ohne Verstöße bestehen.

### Requirement 5: app.json lesen und schreiben

**User Story:** Als Benutzer möchte ich, dass Vault-Einstellungen aus Obsidian bei mir wirken und umgekehrt.

#### Acceptance Criteria

1. THE Server SHALL `.obsidian/app.json` nur über ein gemeinsames Modul lesen und schreiben (Vorbild `shared/appearance-file.ts`: Lock pro Vault, unbekannte Felder bleiben erhalten, ungültiges JSON wird nie überschrieben).
2. THE Schlüssel und ihre Werte SHALL vor der Umsetzung gegen die Obsidian-Dokumentation geprüft sein (Task 0).
3. THE App SHALL mindestens diese bisher festen Werte aus App_Config beziehen und in den Vault-Einstellungen anbieten: neue Notizen (`newFileLocation`, `newFileFolderPath`), Anhänge (`attachmentFolderPath`), Linkformat (`useMarkdownLinks`, `newLinkFormat`), Links beim Umbenennen aktualisieren (`alwaysUpdateLinks`), lesbare Zeilenlänge (`readableLineLength`), Standardansicht (`defaultViewMode`).
4. WHERE ein Schlüssel in der Datei fehlt, THE App SHALL den heutigen Standardwert verwenden.
5. THE Plugin-Shim `vault.getConfig()` / `setConfig()` SHALL dieselben Werte liefern und schreiben.
6. WHEN die Datei außerhalb geändert wird (Sync, Obsidian), THE App SHALL beim nächsten Laden den neuen Stand verwenden.

7. THE Obsidian-Dateien (`app.json`, `templates.json`, `daily-notes.json`) SHALL die Quelle der Wahrheit für Werte sein, die Obsidian kennt; `.slatebase/config.json` behält nur Slatebase-eigene Werte (z. B. `uniqueNoteDirectory`).
8. WHEN `.slatebase/config.json` Werte enthält, die Obsidian-Dateien abdecken, THE Migration SHALL sie einmalig in die Obsidian-Dateien übernehmen, ohne dort vorhandene Werte zu überschreiben, und die übernommenen Felder aus `config.json` entfernen.
9. THE Migration SHALL idempotent sein und `config.json` erst nach erfolgreichem Schreiben der Obsidian-Dateien ändern.

### Requirement 6: Weitere Vault_Files auswerten

#### Acceptance Criteria

1. THE App SHALL lesen: `core-plugins.json` (nur Anzeige, welche Kern-Funktionen Obsidian aktiv hat), `graph.json` (Filter und Gruppen als Startwerte der Graphansicht).
2. THE App SHALL lesen und schreiben: `bookmarks.json` (Lesezeichen), `hotkeys.json` (Tastenkürzel), `templates.json` und `daily-notes.json` (Ordner und Format), `workspaces.json` (benannte Layouts).
3. THE App SHALL `workspace.json` nicht auswerten (Geräte- und Sitzungszustand, wird auch nicht gesynct).
4. WHERE ein Vault_File fehlt, THE App SHALL bei der ersten Änderung eine Datei in Obsidians Format anlegen.
5. IF ein Eintrag ein Obsidian-Feature betrifft, das Slatebase nicht kennt, THEN THE App SHALL ihn unverändert erhalten.
6. THE Migration SHALL bestehende User-Daten (Favoriten, Hotkeys, Workspaces aus `data/users/...-preferences.json`) beim ersten Schreiben in die Vault_Files übernehmen, ohne Einträge zu überschreiben, die dort schon stehen.

### Requirement 7: Geltungsbereich der UI-Einstellungen

#### Acceptance Criteria

1. THE App SHALL Einstellungen, die Obsidian in `app.json` oder `appearance.json` führt, im Vault speichern (gelten für alle Benutzer des Vaults).
2. THE App SHALL rein persönliche Werte (Farbschema, Sprache, Seitenleistenbreite, zuletzt geöffnete Notiz) weiter pro User speichern.
3. WHERE ein User einen persönlichen Wert gesetzt hat, der einen Vault-Wert überlagert, THE App SHALL das in der UI kennzeichnen.
4. THE Settings_Panel SHALL für jeden Wert anzeigen, ob er vault- oder userweit gilt.

### Requirement 8: Qualität

#### Acceptance Criteria

1. THE Änderung SHALL README, `AGENTS.md`, `.kiro/steering/structure.md` und `SECURITY-AUDIT.md` aktualisieren.
2. THE Tests SHALL pro Phase neue und direkt betroffene Tests umfassen, plus Tests der Konsumenten geänderter Funktionen.
