# Design Document

## Ausgangslage (Code-Stand)

- `backend/src/shared-secrets/` verschlüsselt Secrets pro `(vaultId, moduleId, entryId)` (git-sync, mail-import). Schlüssel kommt aus `secret-key-manager.ts`.
- `backend/src/plugin/secret-store.ts` macht dasselbe pro `(vaultId, pluginId, secretId)`, Routen in `api/pluginRoutes.ts` (`/:pluginId/secrets`).
- `frontend/src/plugins/compat/obsidian-api-extensions.ts` (`SecretStorage`) hält Cache, eigene Verschlüsselung und einen localStorage-Fallback; `shims/app-shim.ts` erzeugt sie pro Plugin.
- `shared/appearance-file.ts` ist das Muster für `.obsidian/`-Dateien mit Lock.
- `_registry.json` (`IInstalledPluginStore`) bleibt.

## Keychain

**Backend:** neues Modul `backend/src/keychain/` mit `KeychainService` auf Basis von `ModuleSecretStore` mit festem `moduleId = 'keychain'`. Kein zweiter Verschlüsselungspfad. Secret-ID-Validierung im Service.

Routen unter `/api/vaults/:vaultId/keychain`:

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/` | IDs auflisten |
| GET | `/:secretId` | Wert (Schreibzugriff nötig) |
| PUT | `/:secretId` | setzen |
| DELETE | `/:secretId` | löschen |

Zugriffsprüfung wie in `vault-authorization-middleware`. Vault-Löschung räumt über den bestehenden Cleanup auf.

**Migration:** `keychain/legacy-migration.ts` nach dem Muster von `plugin/legacy-migration.ts`. Läuft beim Start pro Vault, entschlüsselt alte Plugin-Secrets, schreibt in die Keychain, löscht die alte Datei erst danach. Kollisionen laut Requirement 3.2. Danach werden `plugin/secret-store.ts`, die Routen und `IPluginSecretStore` entfernt.

**Frontend:** `SecretStorage` wird dünn: ein `KeychainClient`, kein Crypto, kein localStorage. Eine gemeinsame Instanz pro Vault statt pro Plugin (`app-shim` reicht sie durch). Cache und `Events` bleiben, damit `SecretComponent` weiter funktioniert.

**UI:** `KeychainSection.tsx` in `components/settings/`, Registry-Eintrag in Kategorie „Vault".

**Sicherheit:** Jedes aktive Plugin kann alle Einträge lesen (wie Obsidian). Das ist eine Ausweitung gegenüber heute (pro Plugin getrennt). Deshalb: Hinweis in der Berechtigungsanzeige und in `SECURITY-AUDIT.md`; Sandbox-Netzwerkrechte bleiben der Schutz gegen Abfluss.

## app.json

`backend/src/shared/app-config-file.ts`, Gegenstück zu `appearance-file.ts` (Lock pro Vault, Merge statt Überschreiben, ungültiges JSON bleibt unangetastet). Route `GET/PATCH /api/vaults/:vaultId/app-config` mit Zod-Schema für die bekannten Schlüssel, unbekannte werden durchgereicht.

Frontend: `VaultConfigContext` lädt die Werte einmal pro Vault. Die heute fest codierten Stellen lesen daraus (Fundstellen per Grep in Phase 1 sammeln: Neue-Notiz-Pfad, Anhangsordner, Link-Erzeugung, Editor-Breite, Standardansicht). `vault-shim.ts:762` `getConfig`/`setConfig` greift auf denselben Kontext zu.

UI: Sektion „Editor und Dateien" in „Vault" mit den Feldern aus Requirement 5.3.

**Task 0 (vor Code):** Schlüsselnamen, Wertebereiche und Standardwerte gegen Obsidians Doku und eine echte `app.json` prüfen. Keine Namen aus dem Gedächtnis.

## Weitere Vault_Files

Je Datei ein kleines Modul in `backend/src/obsidian-config/` (`bookmarks`, `hotkeys`, `templates`, `daily-notes`, `workspaces`, `graph`, `core-plugins`), alle über denselben Lock-/Merge-Helfer.

| Datei | Richtung | Ersetzt |
|---|---|---|
| `bookmarks.json` | lesen und schreiben | `favorites` in User-Preferences |
| `hotkeys.json` | lesen und schreiben | Hotkeys in User-Preferences |
| `templates.json`, `daily-notes.json` | lesen und schreiben | Slatebase-eigene Werte, falls vorhanden |
| `workspaces.json` | lesen und schreiben | `vaultSettings.workspaces` |
| `graph.json` | lesen | Startwerte der Graphansicht |
| `core-plugins.json` | lesen | nur Anzeige |

Formate werden pro Datei vor der Umsetzung geprüft (wie Task 0). Migration der User-Daten beim ersten Schreiben, ohne vorhandene Einträge zu überschreiben.

## Geltungsbereich (Punkt 5)

Schnitt: Was Obsidian in `app.json`/`appearance.json` hat, liegt im Vault. Persönliches bleibt pro User. Die Preferences-Datei hält danach nur noch Überlagerungen. Leserang: User-Wert vor Vault-Wert vor Standard. In der UI trägt jedes Feld ein Badge „Vault" oder „Nur ich".

**Risiko:** Bisher ändert ein User seine Ansicht nur für sich. Nach der Umstellung ändert ein Schreibberechtigter z. B. den Anhangsordner für alle. Deshalb nur schreibberechtigte Rollen, und die Felder zeigen den Geltungsbereich.

## Tests

Pro Phase: Backend-Unit (Service, Migration, Lock/Merge), Route-Tests mit Berechtigungen, Frontend-Komponenten inklusive axe (Timeout 30 s auf dem 2-Kern-Host), Plugin-Compat-Tests für `secretStorage` und `getConfig`. Vor dem Push zusätzlich Tests der Aufrufer geänderter Funktionen (z. B. `plugins/compat`).
