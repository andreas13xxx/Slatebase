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

Schnitt (entschieden 2026-10-29): Gibt es eine Vault-Datei für einen Wert, liegt er nur dort, ohne User-Variante und ohne Überlagerung. Persönliches ohne Vault-Gegenstück bleibt pro User. `lineNumbers`, `readableLineLength` und `spellcheck` fallen aus den User-Preferences weg; die Werte kommen aus `app.json`, fehlt der Schlüssel, gilt der bisherige Slatebase-Standard. Reihenfolge: Vault-Wert vor Standard. Ein Leser ohne Schreibrecht kann diese Werte nicht mehr für sich allein umschalten.

**Risiko:** Bisher ändert ein User seine Ansicht nur für sich. Nach der Umstellung ändert ein Schreibberechtigter z. B. den Anhangsordner für alle. Deshalb nur schreibberechtigte Rollen, und die Felder zeigen den Geltungsbereich.

## Tests

Pro Phase: Backend-Unit (Service, Migration, Lock/Merge), Route-Tests mit Berechtigungen, Frontend-Komponenten inklusive axe (Timeout 30 s auf dem 2-Kern-Host), Plugin-Compat-Tests für `secretStorage` und `getConfig`. Vor dem Push zusätzlich Tests der Aufrufer geänderter Funktionen (z. B. `plugins/compat`).

## Task 0: Ergebnisse (Stand 2026-10-29)

Quelle: eine echte `app.json` aus einem öffentlichen Repo (fengstats/obsidian-config) und der Code. Die offizielle Doku wurde nicht erreicht; Wertebereiche, die nur aus Beispielen stammen, sind unten markiert.

**Korrektur zur Ausgangslage.** Mehrere Werte sind heute nicht fest im Code, sondern schon konfigurierbar:

- `.slatebase/config.json` (`backend/src/vault-config/`, UI `VaultConfigSection.tsx`) hält `templatesDirectory`, `dailyNotesDirectory`, `dailyNoteTemplateName`, `attachmentsDirectory`, `uniqueNoteDirectory`. Das ist das Gegenstück zu `templates.json`, `daily-notes.json` und `attachmentFolderPath`.
- `readableLineLength`, `lineNumbers`, `spellcheck`, `workspaces`, `graph` liegen als `UserVaultSettings` pro User und Vault in den Preferences. Die UI erreicht sie bewusst nur über Kontextmenü und Befehlspalette, nicht über das Settings-Panel.
- Wirklich fest (nur Defaults in `vault-shim.ts:762` `getConfig`): `newFileLocation`, `newLinkFormat`, `useMarkdownLinks`, `defaultViewMode`, `livePreview`, `strictLineBreaks`, `showFrontmatter`, `foldHeading`, `foldIndent`, `updateInternalLinks`. Link-Erzeugung liest `useMarkdownLinks`/`newLinkFormat` bereits über `getConfig` (`file-manager-shim.ts:136`).

**Folge für die Spec:**

- Requirement 5.3 gilt nur für die wirklich festen Werte plus `attachmentFolderPath`.
- `.slatebase/config.json` wird nicht entfernt, behält aber nur Slatebase-eigene Werte. Entschieden (2026-10-29): Obsidian-Dateien sind die Quelle der Wahrheit; `config.json` wird einmalig migriert (Requirement 5.7 bis 5.9). Die Migration schreibt `templates.json`, `daily-notes.json` und `app.json` (`attachmentFolderPath`), ohne vorhandene Werte zu überschreiben.
- `alwaysUpdateLinks` ist heute fest `true` und nicht abschaltbar (`FileManager.renameFile()`); ein Schalter bräuchte einen Eingriff im Backend.

**Bestätigte `app.json`-Schlüssel (echte Datei):**

| Schlüssel | Typ | Beispielwerte |
|---|---|---|
| `newFileLocation` | string | `"current"` (weitere: `"root"`, `"folder"`, aus Code/Beispiel, ungeprüft) |
| `newFileFolderPath` | string | `"00 Inbox"` |
| `attachmentFolderPath` | string | `"./attachments"`, `"./"` |
| `useMarkdownLinks` | boolean | `true` |
| `newLinkFormat` | string | `"relative"` (weitere: `"shortest"`, `"absolute"`) |
| `alwaysUpdateLinks` | boolean | `true` |
| `readableLineLength` | boolean | `true` |
| `defaultViewMode` | string | `"source"` (weiter: `"preview"`) |
| `livePreview`, `strictLineBreaks`, `showFrontmatter`, `foldHeading`, `foldIndent`, `spellcheck`, `showLineNumber` | boolean | |
| `trashOption` | string | `"local"` |
| `promptDelete` | boolean | |
| `tabSize` | number | `2` |

**Noch offen in Task 0:** Formate von `bookmarks.json`, `hotkeys.json`, `templates.json`, `daily-notes.json`, `workspaces.json`, `graph.json`, `core-plugins.json`; offizielle Wertebereiche. Diese Prüfung läuft vor Phase 6 beziehungsweise 5.

## Task 0: Formate der weiteren Dateien (Stand 2026-10-29)

Quelle: echte Dateien aus einem öffentlichen Repo (fengstats/obsidian-config) plus Suche. Obsidian dokumentiert keines dieser Formate; es sind interne Dateien, die Obsidian beim Schließen neu schreibt.

| Datei | Form | Stand |
|---|---|---|
| `hotkeys.json` | Objekt: Befehls-ID → Array von `{ "modifiers": ["Mod","Shift"], "key": "K" }`; leeres Array = ungebunden | belegt (echte Datei). Modifier laut Plugin-API: `Mod`, `Ctrl`, `Meta`, `Shift`, `Alt`; `Mod` = Cmd auf macOS, sonst Strg |
| `daily-notes.json` | `{ "folder": "2024", "format": "MM月/MM-DD ddd", "template": "template/diary", "autorun": false }` | belegt. `format` sind Moment-Token (Schrägstrich legt Unterordner an); `template` ist ein Vault-Pfad ohne `.md` |
| `templates.json` | `{ "folder": "template" }` | belegt für `folder`. Ein Datums- oder Zeitformat steht nicht in der Beispieldatei, ist also ungeprüft |
| `graph.json` | flach: `collapse-filter`, `search`, `showTags`, `showAttachments`, `hideUnresolved`, `showOrphans`, `collapse-color-groups`, `colorGroups` (Liste von `{query, color}`, Farbe laut Forum `{a, rgb}`), `collapse-display`, `showArrow`, `textFadeMultiplier`, `nodeSizeMultiplier`, `lineSizeMultiplier`, `collapse-forces`, `centerStrength`, `repelStrength`, `linkStrength`, `linkDistance`, `scale`, `close` | belegt, `colorGroups` nur aus Forenbeiträgen |
| `core-plugins.json` | Objekt: Kernplugin-Name → Boolean (`"file-explorer": true`) | belegt (neuere Obsidian-Versionen; ältere Versionen nutzten laut Erinnerung eine Namensliste, ungeprüft) |
| `bookmarks.json` | `{ "items": [...] }` | nur die äußere Hülle belegt; die Beispieldatei hatte keine Einträge. Form von Datei-, Ordner-, Such- und Gruppen-Einträgen ungeprüft |
| `workspaces.json` | Obsidian-intern, enthält ein Feld `active` | nicht belegt, kein öffentlicher Zugriff auf die Struktur |

**Folgen für den Umfang:**

- `workspaces.json`: Slatebases Workspaces sind opake Pane-Bäume des eigenen Editors und haben nichts mit Obsidians Layout-Format gemeinsam. In Obsidians Datei geschrieben könnten sie dort Fehler oder Datenverlust auslösen. Nicht umsetzen.
- `daily-notes.json`: Slatebase benennt Tagesnotizen fest nach `YYYY-MM-DD.md`. Ein anderes `format` aus der Datei kann nicht umgesetzt werden; nur `folder` und `template` sind abbildbar. Beim Schreiben setzt Slatebase `format` auf `YYYY-MM-DD`, falls der Schlüssel fehlt, und lässt einen vorhandenen Wert unangetastet.
- `template` in `daily-notes.json` ist ein Vault-Pfad, Slatebases `dailyNoteTemplateName` nur ein Dateiname im Vorlagenordner. Abbildung: `template = <Vorlagenordner>/<Name ohne .md>`; liegt die Vorlage aus der Datei außerhalb des Vorlagenordners, kann Slatebase sie nicht auswählen.
- `hotkeys.json`: Slatebases Befehls-IDs (`slatebase:...`) sind nicht die von Obsidian. Eigene IDs in Obsidians Datei zu schreiben ist unerprobt.
