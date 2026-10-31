# Design Document: app.json-Kompatibilität

## Überblick

Änderungen liegen in vorhandenen Modulen:

- Backend: `backend/src/obsidian-config/app-config.ts` (Schema, Service), `legacy-migration.ts`-Muster für die neue Default-Migration, Start-Hook in `index.ts`.
- Frontend: `state/vaultAppConfigStore.ts` (Typen, Defaults, Merge), `components/settings/EditorFilesSection.tsx` (UI), Konsumenten je Funktion (Editor, Dateiliste, Suche, Graph, Lösch-Flow), `plugins/compat/shims/vault-shim.ts` (`getConfig`/`setConfig`/`config-changed`).
- Docs: `docs/app-json.md` (neu).

## Gesicherte Befunde

- **Obsidian schreibt nur Abweichungen vom Default.** Die Beispieldatei enthält `alwaysUpdateLinks: true`, `readableLineLength: false`, `showLineNumber: true`. Daraus folgt: Obsidian_Default für `alwaysUpdateLinks` = `false`, für `readableLineLength` = `true`, für `showLineNumber` = `false`.
- `attachmentFolderPath` kann ein fester Ordnername sein (`"11 Anhänge"`, ohne führenden `/`). Die Modi in `attachmentPath.ts` müssen diese Form weiter lesen.
- `mobilePullAction` (`"graph:open"`) ist eine Command-ID, nur auf Mobilgeräten relevant: Pass-Through-Key.
- Die Datei enthält keinen Hinweis auf `spellcheck`, `newLinkFormat` usw.; die Datei beweist die Defaults dieser Schlüssel nicht.

## Ungesichert (Task 0 klärt)

Die folgende Liste stammt aus Wissen über Obsidian-Dateien, nicht aus einer offiziellen Quelle (die Websuche hat keine ergeben; Hinweise: [Obsidian-Genesis](https://github.com/Chris1320/Obsidian-Genesis/commit/2846312c5ae4a437ccb39662c7f67c58f35a31f6), [MkDocs-Template](https://cxplonka.github.io/obsidian-sandbox-mkdocs/best-practices/)). Jeder Eintrag wird gegen echte Dateien, `obsidian.d.ts` oder die Obsidian-Hilfe geprüft, bevor er ins Schema kommt.

| Schlüssel | Vermuteter Typ / Werte | Vermuteter Default |
|---|---|---|
| `showUnsupportedFiles` | boolean | false |
| `trashOption` | `system` \| `local` \| `none` | `system` |
| `promptDelete` | boolean | true |
| `userIgnoreFilters` | string[] | fehlt |
| `autoConvertHtml` | boolean | false |
| `tabSize` | number | 4 |
| `useTab` | boolean | true |
| `autoPairBrackets` | boolean | true |
| `autoPairMarkdown` | boolean | true |
| `smartIndentList` | boolean | true |
| `showIndentGuide` | boolean | true |
| `showInlineTitle` | boolean | true |
| `rightToLeft` | boolean | false |
| `spellcheckLanguages` | string[] | fehlt |
| `propertiesInDocument` | `visible` \| `hidden` \| `source` | `visible` |
| `showRibbon`, `showViewHeader` | boolean | true / false |
| `vimMode`, `nativeMenus`, `mobilePullAction` | boolean / boolean / string | Pass-Through |

## Datenmodell

Der Store bekommt statt `typeof`-Vergleich pro Schlüssel eine Beschreibung:

```ts
type KeySpec =
  | { kind: 'boolean'; default: boolean }
  | { kind: 'number'; default: number; min: number; max: number }
  | { kind: 'string'; default: string }
  | { kind: 'enum'; values: readonly string[]; default: string }
  | { kind: 'string[]'; default: string[] }
```

Schema (Zod) und Store leiten Typ, Validierung und Default aus **einer** Tabelle ab, damit Backend und Frontend nicht auseinanderlaufen (gemeinsame Definition in `shared-contracts`, falls der Aufwand vertretbar ist; sonst zwei Tabellen mit einem Paritätstest).

Ein Wert in der Datei, der nicht zum `KeySpec` passt, wirkt wie ein fehlender Schlüssel (Obsidian_Default) und wird nicht verändert.

## Migration der Defaults

Betroffen: Schlüssel, deren Slatebase_Default vom Obsidian_Default abweicht (`alwaysUpdateLinks`: bisher `true`, Obsidian `false`; `spellcheck`: laut Code-Kommentar bisher `true`; weitere folgen aus Task 0).

- Neue Funktion `migrateAppConfigDefaults()` im Muster von `legacy-migration.ts`, aufgerufen beim Serverstart.
- Je Vault: wenn Marker `data/vaults/<vaultId>/app-config-defaults.done` fehlt und der Vault Slatebase-eigen ist (kein `app.json` vorhanden oder `.slatebase/` vorhanden), werden die betroffenen Schlüssel mit dem alten Wert in `app.json` geschrieben, sofern der Schlüssel fehlt. Danach Marker setzen.
- Vaults mit einer von Obsidian geschriebenen Datei (Datei vorhanden, kein `.slatebase/`) bekommen nichts festgeschrieben: dort bedeutet ein fehlender Schlüssel Obsidian-Verhalten.
- Wirkung sofort: Der Schreibvorgang veröffentlicht `vault:change` für `.obsidian/app.json`; `AppConfigLifecycle` lädt neu.

**Offener Punkt:** Die Erkennung "Slatebase-eigener Vault" ist eine Heuristik. Alternative: für alle Vaults festschreiben (ändert Obsidian-Vaults dauerhaft in der Datei). Entscheidung vor Task 2.

## Funktionen

| Schlüssel | Umsetzung |
|---|---|
| `newFileLocation`/`newFileFolderPath` | Ort der neuen Notiz im Neu-Flow (UI, Palette, Plugin-API) |
| `defaultViewMode` | Startmodus beim Öffnen eines Tabs; Wechsel pro Tab bleibt möglich |
| `strictLineBreaks` | Markdown-Renderer: Soft-Breaks als `<br>` |
| `showFrontmatter`/`propertiesInDocument` | Properties-Block im Dokument zeigen/verbergen/als Quelltext |
| `foldHeading`/`foldIndent` | CodeMirror-`foldGutter`/Fold-Dienste ein- oder ausschalten |
| `alwaysUpdateLinks` | Serverseitig bei Rename/Move; `false` = Link-Umschreiben überspringen. Der Client sendet das Flag mit der Operation; die Aufrufe der Rename-/Move-Routen und der Shim (`FileManager.renameFile`) lesen es |
| `useTab`/`tabSize` | CodeMirror `indentUnit` und `tabSize` |
| `autoPair*` | `closeBrackets` und Markdown-Paarung ein/aus |
| `showInlineTitle` | Titel-Widget über dem Editor |
| `userIgnoreFilters` | Präfix- oder Regex-Filter (Format in Task 0 klären) in Dateiliste, Suche, Graph |
| `trashOption`/`promptDelete` | Lösch-Flow: Papierkorb, `.trash/` oder endgültig; Nachfrage ein/aus |
| `showUnsupportedFiles` | Filter in der Dateiliste |

Pro Schlüssel ein Hook nach dem Muster `useLineNumbers.ts` (dünner Wrapper um den Store).

## Plugin-Shim

- `setConfig(key, value)`: `PATCH /app-config` für bekannte Schlüssel; Pass-Through-Keys brauchen eine Route-Erweiterung. Die Route lässt bisher unbekannte Schlüssel nicht zu (`.strict()`), also bekommt sie einen kontrollierten Pfad für Pass-Through-Keys (Name-Muster, Größe, JSON-Wert).
- `config-changed`: im Store bei `apply()` ausgelöst.
- `updateInternalLinks`: folgt `alwaysUpdateLinks`.

## Fehlerbehandlung

- Kein Schreibzugriff: Änderung wird zurückgerollt, wie bisher.
- Datei kein JSON-Objekt: 409 `APP_CONFIG_INVALID`, nichts wird überschrieben.
- Ungültiger Wert in der Datei: Default, Datei bleibt.

## Tests

- Schema und `KeySpec`: gültig/ungültig je Typ, Parität Backend/Frontend.
- Store: Defaults, Merge, Rollback, Generation-Zähler.
- Migration: Slatebase-Vault, Obsidian-Vault, schon migriert, schreibgeschützt, kein Objekt.
- Je Funktion ein Verhaltenstest; Konsumententests in `plugins/compat/` mitlaufen lassen (Lektion PR #287).
- axe-Test für neue Einstellungs-Abschnitte (Timeout 30 s auf dem Host).

## Diagnose (Requirement 8)

Ein kleiner Dienst `obsidian-config/deviation-reporter.ts`: `report(vaultId, file, jsonPath, found, reason)` schreibt über den bestehenden `logger` eine Warnung, dedupliziert über einen Set aus `vaultId|file|path|reason` (wird geleert, wenn sich die Datei ändert). Die Schemas aller Dateien melden über ihn, statt still zu verwerfen. Das Frontend hat dasselbe als `console.warn`-Hilfsfunktion für Werte, die der Store verwirft. Gelogt wird nie der Inhalt von Notizen, nur Konfigurationswerte, gekürzt auf 80 Zeichen.

Format: `[obsidian-config] vault=<id> file=app.json path=newLinkFormat unexpected enum value "foo" (expected shortest|relative|absolute)`.

## Gemeinsame Bausteine

- `shared/obsidian-config-file.ts`: `ObsidianConfigFile` wird um `appearance.json`, `bookmarks.json`, `hotkeys.json`, `graph.json`, `types.json`, `workspaces.json` erweitert. `appearance-file.ts` hat eine eigene Lock-Logik (Mutex für Theme-Dienst); beide werden zusammengeführt, damit eine Datei nur einen Lock hat.
- Pro Datei ein Modul in `backend/src/obsidian-config/` mit Zod-Schema, Service und Route (`/api/vaults/:vaultId/<datei>`), Frontend-Store nach dem Muster `vaultAppConfigStore` (Generation-Zähler, optimistische Schreibung mit Rollback, Neuladen bei `vault:change`).
- Migrationen laufen in einem gemeinsamen Start-Hook `migrateUserDataToVaultFiles()`, Marker je Datei und Vault.

## appearance.json (Requirement 9)

Bekannt ist heute: `cssTheme` und `enabledCssSnippets` (Theme- und Snippet-Dienst). Neu: Schlüssel (laut Wissen, Task 0 prüft) `theme` (`obsidian` = dunkel, `moonstone` = hell, `system`), `accentColor` (Hex), `baseFontSize` (Zahl), `interfaceFontFamily`, `textFontFamily`, `monospaceFontFamily`, `translucency`, `showViewHeader`, `nativeMenus`.

Umsetzung: `ThemeLifecycle.tsx` wird zu einem `AppearanceLifecycle`, der zusätzlich zu Theme und Snippets die CSS-Variablen auf `document.documentElement` setzt. Die Akzentfarbe wird in HSL zerlegt (`--accent-h/s/l`), weil Obsidian-Themes diese Variablen erwarten. Das Basis-Theme setzt `theme-dark`/`theme-light` am `body`; die heutige Hell/Dunkel-Wahl wird migriert. UI: `AppearanceSection.tsx` (heute: Statusleiste) bekommt die Steuerelemente.

## Plugin-Limits (Requirement 10)

Heute: ZIP 10 MB, entpackt 20 MB (`plugin-installer.ts`), Einzeldatei 10 MB (`installed-plugin-store.ts`, `validation.ts`), Einstellungen 1 MB. Obsidian selbst begrenzt `main.js` nach bisherigem Wissen nicht; dies ist unverifiziert. Task 0.4 misst die Release-Assets der größten Community-Plugins (Community-Verzeichnis `community-plugins.json`, GitHub-Releases) und ermittelt daraus die neuen Werte. Die Konstanten wandern in `plugin/limits.ts`. Offen: ob die Obergrenze konfigurierbar sein soll (Umgebungsvariable) — Vorschlag: ja, mit Standardwert aus der Messung.

## Tagesnotizen (Requirement 11)

`note-config.ts` liest und schreibt `daily-notes.json` bereits (`folder`, `template`); `format` wird bisher mit `YYYY-MM-DD` geschrieben und nicht ausgewertet. Neu: ein Formatierer `dateFormat(date, format, locale)` mit der Moment-Token-Teilmenge (`YYYY YY MMMM MMM MM M DD D dddd ddd d ww W Q`, `[escape]`, Trennzeichen). Er läuft im Frontend (Tagesnotiz-Befehl, Kalender-Plugin über `window.moment`, falls vorhanden — `install-globals.ts` hat bereits einen Moment-Shim, der geprüft und ggf. verwendet wird, damit es nur einen Formatierer gibt) und im Server für `autorun`. Der Name ergibt Unterordner und Dateiname; Prüfung auf Pfadausbruch vor dem Anlegen. Bestehende Notizen werden über den berechneten Pfad gefunden.

## Workspaces (Requirement 12)

Heute: benannte Layout-Schnappschüsse (`ef089c6`) in `vaultSettings.workspaces` pro User. Obsidians `workspaces.json` hat (laut Task-0-Notiz der Vorgänger-Spec, nicht belegt) die Form `{ "workspaces": { "<name>": <layout> }, "active": "<name>" }` mit Obsidians Layoutbaum (`main`/`left`/`right`, `split`/`tabs`/`leaf`, `state.type`, `state.state.file`).

Entscheidung dieser Spec: Slatebase **schreibt Obsidians Layoutform**, über einen Konverter `workspace-layout-converter.ts` (Pane-Baum ↔ Obsidian-Layout). Verlustbehaftet sind Slatebase-eigene Panel-Typen und Zustände; sie kommen in das Layout als Blatt mit unbekanntem Typ nicht hinein, sondern in eine Slatebase-eigene Ergänzung, die Obsidian möglicherweise beim Schreiben verwirft. Deshalb Risiko: **Obsidian könnte Zusatzfelder entfernen**. Task 0.5 prüft, ob unbekannte Felder in `workspaces.json` die Obsidian-Rundreise überleben; wenn nein, liegen die Slatebase-Zusätze in `.slatebase/workspace-extras.json` je Workspace-Name.

`workspace.json` (aktuelles Layout) bleibt pro User, weil mehrere Nutzer gleichzeitig verschiedene Tabs offen haben; Obsidians Datei bleibt davon unberührt.

## Lesezeichen (Requirement 13)

Heute: `favoritesStore` (4 Typen: file, heading, block, search; Limit 50; Server-Preferences). Obsidian-Form (Task 0 belegt): `{ "items": [ { "type": "file", "path": "...", "title": "..." }, { "type": "group", "title": "...", "items": [...] }, ... ] }` mit `subpath` (`#Heading`, `#^block`) und `query` für Suchen. Der Store wird auf einen Baum umgestellt; Pfadnachführung (Rename/Delete) wandert in den Server, damit sie ohne offene Clients wirkt. Unbekannte Eintragstypen werden als undurchsichtige Knoten erhalten.

## Tastenkürzel (Requirement 14)

Zuerst ein Abgleich: Obsidians Kernbefehle (ID, Name, Standardkürzel) gegen `core-commands*.ts` und `command-registry.ts`; Ergebnis ist eine Tabelle in `docs/hotkeys.md` mit den Spalten "Obsidian-ID", "Slatebase-Befehl", "Status" (vorhanden / fehlt / nicht sinnvoll). Fehlende Befehle werden umgesetzt, nach Aufwand sortiert. Die Eigen-IDs `slatebase:*` bleiben; wo ein Obsidian-Befehl denselben Zweck hat, wird die Obsidian-ID die führende und die alte ID ein Alias (für Plugins und gespeicherte Belegungen). `KeybindingsSection.tsx` hat heute eine eigene Speicherung pro User; sie liest und schreibt `hotkeys.json`. Modifier-Namen: `Mod`, `Ctrl`, `Meta`, `Shift`, `Alt`.

## Graph (Requirement 15)

Der Graph-Zustand (heute `vaultSettings.graph` pro User) wird auf `graph.json` umgestellt. Obsidian speichert in der Datei auch Filter, Darstellungs- und Kräfte-Optionen; Slatebases `GraphView` unterstützt nicht alle (z. B. Gruppen-Farben nach Suchanfrage). Nicht unterstützte Optionen bleiben als Pass-Through erhalten. Schreibrate begrenzt, damit das Ziehen von Reglern die Datei nicht flutet.

## Eigenschaftstypen (Requirement 16)

Heute: `.slatebase/property-types.json` (`PropertyTypeStore`, 200 Einträge). Obsidian: `.obsidian/types.json` mit `{ "types": { "<name>": "<typ>" } }`. Mapping der Typnamen in Task 0.6; Migration einmalig, danach nutzt `PropertyTypeStore` die Obsidian-Datei als einzige Quelle.

## Kernplugins (Requirement 17)

Nicht Teil der Umsetzung. Ausgangslage: `core-plugins.json` wird nur angezeigt.

## Git-Sync (Requirement 19)

Ist-Stand (`backend/src/git-sync/sync-engine.ts`): Der verwaltete `.gitignore`-Block schließt `.slatebase/*` aus mit Ausnahmen für `config.json`, `property-types.json`, `spellcheck-words.json`, und schließt `.obsidian/workspace*.json` aus. `.obsidian/` selbst wird synchronisiert.

Folgen für diese Spec:

| Datei | Verhalten heute | Nötige Änderung |
|---|---|---|
| `app.json`, `appearance.json`, `daily-notes.json`, `bookmarks.json`, `hotkeys.json`, `graph.json`, `types.json` | synchronisiert | keine |
| `workspace.json` | ausgeschlossen (richtig, pro Nutzer) | keine |
| `workspaces.json` | **ausgeschlossen**, weil `workspace*.json` es mit trifft | Muster auf `.obsidian/workspace.json` einschränken, sonst sind vault-weite Workspaces nur lokal |
| `.slatebase/property-types.json` | synchronisiert | nach Migration auf `types.json` aus der Ausnahmeliste entfernen (die Altdatei bleibt bis dahin erhalten) |
| `.slatebase/workspace-extras.json` (nur falls Task 0.5 sie nötig macht) | ausgeschlossen durch `.slatebase/*` | Ausnahme ergänzen |

Mechanismus: `applyManagedGitignoreBlock` ersetzt den verwalteten Block bei jedem Lauf (`ensureGitignore`), eine geänderte Liste erreicht bestehende Einrichtungen also ohne Eingriff. Bereits ignorierte Dateien, die nun synchronisiert werden, nimmt der nächste `commitAll()` auf. Ein Gegenstück für bereits getrackte Dateien, die nun ausgeschlossen werden, ist nicht nötig, weil dieser Fall nicht eintritt (es wird nur freigegeben).

Konflikte: Git merged JSON zeilenweise. Zwei Geräte, die dieselbe Datei ändern (z. B. `hotkeys.json`, `bookmarks.json`), können Konfliktmarkierungen erzeugen; die Datei ist dann kein gültiges JSON. Das deckt die bestehende Regel ab (ungültiges JSON bleibt unangetastet, `APP_CONFIG_INVALID`-Verhalten) plus die Warnung aus Requirement 8. Sync-Konfliktmeldung und Hinweis in der UI kommen aus der vorhandenen Konfliktbehandlung (`hasConflictMarkers`). Eine Nachbesserung, die die Auflösung auf Schlüsselebene erledigt (JSON-Merge-Treiber), ist ausdrücklich nicht Teil dieser Spec.

Die Migrationsmarker liegen unter `data/` (nicht im Vault), damit jede Instanz einmal migriert; die geschriebenen Dateien wandern danach über den Sync. Treffen zwei Instanzen mit unterschiedlichen Altwerten aufeinander, entscheidet der Git-Merge; dies ist ein bekannter Randfall.

LiveSync (Plugin `obsidian-livesync`) arbeitet unabhängig und überträgt `.obsidian/` selbst; keine Änderung nötig, nur Dokumentation.

## Risiken

- Obsidian schreibt diese Dateien beim Schließen neu und kann unbekannte Felder verwerfen. Für Slatebase-Zusätze gilt deshalb: nur in der Datei, wenn Task 0 zeigt, dass sie überleben; sonst in `.slatebase/`.
- Formate wie `bookmarks.json`, `workspaces.json` sind nicht öffentlich dokumentiert. Task 0 braucht echte Dateien mit Einträgen; die Beispiele des Nutzers sind die verlässlichste Quelle.
- Mehrere Quellen gleichzeitig (Obsidian und Slatebase schreiben dieselbe Datei) erfordern den gemeinsamen Lock und Neuladen bei `vault:change`.
- Eine Migration, die pro User Werte in eine Vault-Datei zusammenführt, muss deterministisch sein, sonst hängt das Ergebnis von der Reihenfolge der Nutzer ab.
