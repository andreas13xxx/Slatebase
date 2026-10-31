# Requirements Document

## Introduction

`.obsidian/app.json` ist Obsidians Haupt-Konfigurationsdatei eines Vaults. Slatebase kennt heute 15 Schlüssel; davon wirken nur 5 im UI (`attachmentFolderPath`, `readableLineLength`, `showLineNumber`, `spellcheck`, `livePreview`), 3 nur über die Plugin-API und 7 sind gespeichert ohne Funktion. Weitere Obsidian-Schlüssel fehlen, Enum-Werte sind nicht gegen Obsidian geprüft, und einzelne Defaults weichen ab.

Ziele:

1. Dokumentieren, was über `app.json` bekannt ist (Obsidian dokumentiert die Datei nicht offiziell).
2. Enum-Werte, Typen und Defaults an Obsidian angleichen.
3. Fehlende Schlüssel konfigurierbar machen und die dahinterliegende Funktion umsetzen.
4. Abweichungen echter Obsidian-Dateien von diesen Annahmen in der Console melden (Requirement 8).
5. Die übrigen Dateien in `.obsidian/` angleichen: `appearance.json`, Plugin-Größenlimits, `daily-notes.json`, `workspaces.json`, `bookmarks.json`, `hotkeys.json`, `graph.json`, `types.json` (Requirements 9 bis 16). `core-plugins.json` bleibt einer eigenen Spec vorbehalten (Requirement 17).

Diese Spec ersetzt die Zurückstellungen aus `vault-keychain-obsidian-config` (Tasks 6.2, 6.4, 6.5) und die Entscheidung, `format` in `daily-notes.json` nicht umzusetzen.

Grundlage: Eine echte Obsidian-Datei (Beleg, dass Obsidian nur Werte schreibt, die vom Default abweichen):

```json
{
  "attachmentFolderPath": "11 Anhänge",
  "alwaysUpdateLinks": true,
  "readableLineLength": false,
  "mobilePullAction": "graph:open",
  "showLineNumber": true
}
```

## Glossary

- **App_Config**: `.obsidian/app.json` des Vaults.
- **Obsidian_Default**: Wert, den Obsidian verwendet, wenn der Schlüssel in der Datei fehlt.
- **Slatebase_Default**: Bisheriger Wert in `DEFAULT_APP_CONFIG`.
- **Pass-Through-Key**: Schlüssel, den Slatebase erhält und über `vault.getConfig()` bereitstellt, ohne eine eigene Funktion dahinter zu haben.

## Requirements

### Requirement 1: Verifizierte Referenz

**User Story:** Als Entwickler möchte ich nachlesen, welche Schlüssel, Typen, Werte und Defaults `app.json` hat und was Slatebase damit macht.

#### Acceptance Criteria

1. THE Dokumentation SHALL `docs/app-json.md` enthalten: je Schlüssel Typ, erlaubte Werte, Obsidian_Default, Wirkung in Slatebase, Status (wirkt / nur Plugin-API / nicht unterstützt) und Quelle.
2. THE Dokumentation SHALL unbestätigte Angaben als "unverifiziert" kennzeichnen.
3. THE Kommentar in `app-config.ts` SHALL auf die Referenz verweisen und keine Aussage enthalten, die der Referenz widerspricht.
4. THE Dokumentation SHALL aus `README.md`, `AGENTS.md` und `.kiro/steering/structure.md` verlinkt sein.

### Requirement 2: Enum-Werte und Typen

**User Story:** Als Obsidian-Nutzer möchte ich, dass Werte, die Obsidian schreibt, in Slatebase nicht abgelehnt oder falsch gedeutet werden.

#### Acceptance Criteria

1. THE Schema SHALL für jeden Enum-Schlüssel genau die Werte akzeptieren, die Obsidian schreibt.
2. WHEN die Datei einen Wert enthält, den das Schema nicht kennt, THE Store SHALL den Obsidian_Default verwenden und die Datei unverändert lassen.
3. THE Store SHALL Typen pro Schlüssel prüfen (Boolean, String, String-Array, Enum), nicht nur `typeof`.
4. THE Schema SHALL String-Arrays (z. B. `userIgnoreFilters`) und Enum-Strings mit Längengrenzen akzeptieren.

### Requirement 3: Defaults wie in Obsidian

**User Story:** Als Nutzer, der einen Vault zwischen Obsidian und Slatebase teilt, möchte ich in beiden dasselbe Verhalten sehen, wenn ein Schlüssel fehlt.

#### Acceptance Criteria

1. THE `DEFAULT_APP_CONFIG` SHALL für jeden Schlüssel den Obsidian_Default enthalten.
2. WHERE Slatebase_Default und Obsidian_Default sich unterscheiden (mindestens `alwaysUpdateLinks`, `spellcheck`), THE Referenz SHALL die Abweichung und ihre Migration nennen.
3. THE Obsidian_Default SHALL aus der Referenz (Requirement 1) stammen; unbestätigte Defaults SHALL unverändert bleiben und markiert werden.

### Requirement 4: Migration bestehender Vaults

**User Story:** Als Betreiber möchte ich, dass die Umstellung der Defaults das Verhalten bestehender Vaults nicht ungewollt ändert und sofort greift.

#### Acceptance Criteria

1. WHEN der Server startet, THE Migration SHALL einmalig je Vault die Schlüssel, deren Default sich ändert, mit dem bisherigen Slatebase_Default in `app.json` festschreiben, sofern der Vault keine von Obsidian geschriebene Datei besitzt (kein `app.json` vorhanden oder Marker `.slatebase/` vorhanden).
2. THE Migration SHALL bestehende Werte in der Datei nie überschreiben und unbekannte Schlüssel erhalten.
3. THE Migration SHALL idempotent sein und ihren Abschluss pro Vault markieren.
4. WHEN die Migration die Datei schreibt, THE Server SHALL `vault:change` veröffentlichen, damit offene Clients ohne Neuladen den neuen Stand haben.
5. IF der Vault schreibgeschützt oder die Datei kein JSON-Objekt ist, THEN THE Migration SHALL ihn überspringen, protokollieren und beim nächsten Start erneut versuchen.

### Requirement 5: Neue Schlüssel konfigurierbar

**User Story:** Als Nutzer möchte ich Obsidian-Einstellungen, die in der Datei stehen können, in den Slatebase-Einstellungen sehen und ändern.

#### Acceptance Criteria

1. THE Schema und der Store SHALL die in der Referenz als bestätigt geführten, bisher fehlenden Schlüssel aufnehmen (Kandidaten: `showUnsupportedFiles`, `trashOption`, `promptDelete`, `userIgnoreFilters`, `autoConvertHtml`, `tabSize`, `useTab`, `autoPairBrackets`, `autoPairMarkdown`, `smartIndentList`, `showIndentGuide`, `showInlineTitle`, `rightToLeft`, `spellcheckLanguages`, `propertiesInDocument`, `showRibbon`, `showViewHeader`, `mobilePullAction`).
2. THE Einstellungen SHALL jeden aufgenommenen Schlüssel mit passendem Steuerelement anbieten; Änderungen speichern sofort und sind ohne Schreibzugriff gesperrt.
3. WHEN ein Schlüssel auf `null` gesetzt wird, THE Server SHALL ihn aus der Datei entfernen (Verhalten wie bisher).
4. THE Schlüssel, die in Slatebase keine Funktion haben können (`nativeMenus`, `mobilePullAction`, `vimMode` bis zu einem eigenen Spec), SHALL als Pass-Through-Key erhalten bleiben, in der Referenz als "nicht unterstützt" stehen und in den Einstellungen nicht erscheinen.

### Requirement 6: Funktion hinter bisher toten Schlüsseln

**User Story:** Als Nutzer erwarte ich, dass ein Schalter, den ich setze, auch wirkt.

#### Acceptance Criteria

1. WHERE `newFileLocation` und `newFileFolderPath` gesetzt sind, THE Anwendung SHALL neue Notizen im Vault-Root, im aktuellen Ordner oder im festen Ordner anlegen.
2. WHERE `defaultViewMode` gesetzt ist, THE Anwendung SHALL neue Tabs im Bearbeiten- oder Lesemodus öffnen.
3. WHERE `strictLineBreaks` gesetzt ist, THE Lesemodus SHALL einfache Zeilenumbrüche als Umbruch darstellen.
4. WHERE `showFrontmatter` bzw. `propertiesInDocument` gesetzt ist, THE Anwendung SHALL Properties im Dokument zeigen, ausblenden oder als Quelltext zeigen.
5. WHERE `foldHeading` bzw. `foldIndent` abgeschaltet ist, THE Editor SHALL die Fold-Markierungen nicht anbieten.
6. WHERE `alwaysUpdateLinks` abgeschaltet ist, THE Server SHALL beim Umbenennen oder Verschieben keine Links in anderen Notizen umschreiben (bisher läuft das immer).
7. WHERE `useTab` und `tabSize` gesetzt sind, THE Editor SHALL die Einrückung entsprechend einfügen und darstellen.
8. WHERE `autoPairBrackets` bzw. `autoPairMarkdown` abgeschaltet ist, THE Editor SHALL Klammern und Markdown-Zeichen nicht automatisch schließen.
9. WHERE `showInlineTitle` gesetzt ist, THE Editor SHALL den Dateinamen als Titel über dem Inhalt zeigen.
10. WHERE `userIgnoreFilters` gesetzt ist, THE Suche, der Graph und die Dateiliste SHALL passende Pfade ausschließen.
11. WHERE `trashOption` und `promptDelete` gesetzt sind, THE Löschen SHALL entsprechend in den Papierkorb, nach `.trash/` oder endgültig löschen und vorher nachfragen oder nicht.
12. WHERE `showUnsupportedFiles` gesetzt ist, THE Dateiliste SHALL Dateien ohne Viewer zeigen oder ausblenden.
13. EACH Funktion SHALL wirken, sobald sich `app.json` ändert, auch durch ein externes Schreiben (ohne Neuladen).

### Requirement 7: Plugin-API

**User Story:** Als Plugin-Autor möchte ich `vault.getConfig()` und `vault.setConfig()` wie in Obsidian nutzen.

#### Acceptance Criteria

1. THE Shim SHALL `vault.setConfig(key, value)` in `app.json` schreiben (Pass-Through-Keys eingeschlossen) und bei fehlendem Schreibzugriff ablehnen.
2. WHEN sich `app.json` ändert, THE Shim SHALL das Event `config-changed` auslösen.
3. THE `getConfig("updateInternalLinks")` SHALL dem Wert von `alwaysUpdateLinks` folgen statt fest `true` zu sein.

### Requirement 8: Diagnose bei Abweichungen von den Annahmen

**User Story:** Als Entwickler möchte ich erfahren, wenn eine echte Obsidian-Datei etwas enthält, das Slatebase nicht erwartet, damit ich die Annahmen dieser Spec korrigieren kann.

#### Acceptance Criteria

1. WHEN eine Konfigurationsdatei unter `.obsidian/` gelesen wird (`app.json`, `appearance.json`, `daily-notes.json`, `workspaces.json`, `bookmarks.json`, `hotkeys.json`, `graph.json`, `types.json`), THE Server SHALL jede Abweichung von den Annahmen als Warnung in die Server-Console schreiben: unbekannter Schlüssel, Wert außerhalb des erlaubten Enums, falscher Typ, unbekannter Eintragstyp, unerwartete Struktur.
2. THE Meldung SHALL Vault-ID, Datei, Schlüssel (Pfad im JSON) und den gefundenen Wert (gekürzt auf 80 Zeichen, ohne Inhalte aus Notizen) nennen.
3. THE Server SHALL dieselbe Abweichung je Vault, Datei und Schlüssel höchstens einmal pro Prozesslauf melden und bei geänderter Datei erneut.
4. THE Browser-Client SHALL dieselben Abweichungen beim Laden des Stores per `console.warn` melden, wenn der Server sie nicht schon gemeldet hat (z. B. bei Werten, die der Client selbst verwirft).
5. THE Meldungen SHALL nur loggen; die Datei bleibt unverändert, und die Funktion fällt auf den Default zurück.
6. THE bekannte Pass-Through-Schlüssel (Requirement 5.4) SHALL keine Warnung auslösen.

### Requirement 9: appearance.json

**User Story:** Als Nutzer möchte ich Schriftarten, Akzentfarbe und das Basis-Theme (hell/dunkel) pro Vault einstellen und mit Obsidian teilen.

#### Acceptance Criteria

1. THE Server SHALL die Schlüssel aus `appearance.json` (Kandidaten, laut Task 0 zu bestätigen: `theme` mit `system|obsidian|moonstone`, `accentColor`, `baseFontSize`, `interfaceFontFamily`, `textFontFamily`, `monospaceFontFamily`, `translucency`, `showViewHeader`, `nativeMenus`) lesen und schreiben; `cssTheme` und `enabledCssSnippets` bleiben wie heute beim Theme- und Snippet-Dienst.
2. THE Einstellungen SHALL Basis-Theme, Akzentfarbe, Schriftgrößen und die drei Schriftarten anbieten; Änderungen wirken sofort ohne Neuladen und auch bei externer Änderung der Datei.
3. THE Anwendung SHALL die Werte als CSS-Variablen setzen, die Obsidian-Themes und Snippets erwarten (`--accent-h/s/l`, `--font-interface`, `--font-text`, `--font-monospace`, `--font-text-size`), und das Basis-Theme als Klasse `theme-dark`/`theme-light` setzen.
4. WHERE `theme` den Wert `system` hat, THE Anwendung SHALL das Betriebssystem-Schema verfolgen.
5. THE bisherige Hell/Dunkel-Wahl und weitere Darstellungswerte pro User SHALL einmalig in `appearance.json` übernommen werden, wo ein Gegenstück existiert und der Schlüssel fehlt; danach SHALL es keine zweite Quelle geben.
6. WHEN der Nutzer keinen Schreibzugriff auf den Vault hat, THE Einstellungen SHALL gesperrt sein, und die Anwendung SHALL die Datei trotzdem anwenden.
7. THE Schriftarten SHALL nur als Namensliste (kein URL-Laden) akzeptiert und auf 256 Zeichen begrenzt werden.

### Requirement 10: Dateigrößen-Limits für Plugins

**User Story:** Als Nutzer möchte ich jedes Plugin installieren können, das auch unter Obsidian läuft.

#### Acceptance Criteria

1. THE Task 0 SHALL feststellen, ob Obsidian für `main.js`, `styles.css`, `manifest.json`, Plugin-Daten (`data.json`) und die Gesamtgröße eines Plugins Limits hat, und welche Größen verbreitete Community-Plugins erreichen (Release-Assets aus dem Community-Verzeichnis).
2. WHERE ein Community-Plugin die heutigen Limits überschreitet (ZIP 10 MB, entpackt 20 MB, Einzeldatei 10 MB, Einstellungen 1 MB), THE Limits SHALL so angehoben werden, dass dieses Plugin installierbar ist, mit einer Obergrenze als Schutz vor Missbrauch.
3. THE neue Limits SHALL an einer Stelle definiert sein (heute in `plugin-installer.ts`, `installed-plugin-store.ts` und `validation.ts` dupliziert) und in der Doku stehen.
4. THE Fehlermeldung bei Überschreitung SHALL das Limit, die tatsächliche Größe und den Dateinamen nennen.
5. THE Tests SHALL Grenzfälle (genau am Limit, 1 Byte darüber) für jede Stelle abdecken.

### Requirement 11: Tagesnotizen (daily-notes.json)

**User Story:** Als Nutzer möchte ich das Datumsformat meiner Tagesnotizen wie in Obsidian festlegen.

#### Acceptance Criteria

1. THE Einstellungen SHALL `format` aus `daily-notes.json` bearbeitbar machen, mit Vorschau des heutigen Namens.
2. THE Anwendung SHALL Tagesnotizen nach `format` benennen und ablegen; ein Schrägstrich im Format legt Unterordner an (`YYYY/MM/YYYY-MM-DD`). Ohne `format` gilt `YYYY-MM-DD`.
3. THE Formatierer SHALL die Moment.js-Token unterstützen, die Obsidian-Nutzer verwenden (Jahr, Monat, Tag, Wochentag, ISO-Woche, Quartal, Escape in `[...]`), in der Sprache der Oberfläche; nicht unterstützte Token SHALL als Warnung (Requirement 8) und als Fehlermeldung in der Vorschau erscheinen.
4. THE Anwendung SHALL ein Format ablehnen, das einen ungültigen Dateinamen oder einen Pfad außerhalb des Ordners ergibt (`..`, absolute Pfade, `\`).
5. THE bestehende Tagesnotizen mit anderem Format SHALL erkannt (Heute-Befehl öffnet vorhandene Notiz) und nicht umbenannt werden.
6. THE Plugin-API (Daily Notes Interface, Calendar-Plugin) SHALL dasselbe Format verwenden.
7. THE `autorun` SHALL wie in Obsidian beim Öffnen des Vaults die heutige Notiz anlegen und öffnen, falls es noch nicht umgesetzt ist.

### Requirement 12: Workspaces vault-weit

**User Story:** Als Nutzer möchte ich gespeicherte Layouts wie in Obsidian für alle Nutzer eines Vaults teilen.

#### Acceptance Criteria

1. THE gespeicherten Workspaces (heute `vaultSettings.workspaces` pro User) SHALL in `.obsidian/workspaces.json` liegen und für alle Nutzer des Vaults gelten.
2. THE Dateiformat SHALL Obsidians Format folgen (Objekt mit `workspaces` Name → Layout und `active`); Task 0 SHALL die genaue Form belegen.
3. THE Server SHALL Slatebase-Pane-Bäume in Obsidians Layoutform übersetzen und zurück; Elemente ohne Gegenstück (z. B. Slatebase-eigene Panels) SHALL beim Übersetzen verlustarm behandelt und gemeldet werden (Requirement 8).
4. WHEN eine Datei ein Layout enthält, das Slatebase nicht vollständig abbilden kann, THE Anwendung SHALL das Laden mit dem abbildbaren Teil durchführen und den Rest in der Datei unangetastet lassen.
5. THE Anlegen, Überschreiben, Umbenennen und Löschen eines Workspaces SHALL Schreibzugriff auf den Vault erfordern; Laden braucht Lesezugriff.
6. THE bestehende Workspaces pro User SHALL einmalig in die Datei migriert werden (Namenskollision: später geänderter gewinnt, der andere erhält ein Suffix); danach werden die User-Preference-Felder entfernt.
7. THE "aktiver Workspace" (`active`) SHALL vault-weit gelten und nicht jeden Nutzer zum Wechseln zwingen: das Laden eines Workspaces wirkt nur lokal, `active` wird nur beim Speichern gesetzt.
8. THE `workspace.json` (aktuelles Layout mit offenen Tabs) SHALL pro User bleiben und nicht geschrieben werden, weil mehrere Nutzer gleichzeitig offene Tabs haben.

### Requirement 13: Lesezeichen (bookmarks.json)

**User Story:** Als Obsidian-Nutzer möchte ich meine Lesezeichen im Vault behalten.

#### Acceptance Criteria

1. THE Lesezeichen (heute pro Vault in `favoritesStore`, Server-Preferences, höchstens 50) SHALL in `.obsidian/bookmarks.json` liegen, vault-weit.
2. THE Format SHALL Obsidians `{ "items": [...] }` mit den Eintragstypen `file`, `folder`, `search`, `group`, `graph`, `url`, `heading`/`block` (über `subpath`) folgen; Task 0 SHALL die Felder (`type`, `path`, `title`, `subpath`, `query`, `items`, `ctime`) belegen.
3. THE Gruppen SHALL verschachtelte Einträge abbilden; die Oberfläche SHALL Gruppen anlegen, umbenennen und Einträge zwischen ihnen verschieben können.
4. THE Typen ohne Funktion in Slatebase (z. B. `graph`) SHALL erhalten bleiben und in der Liste sichtbar, aber nicht öffnbar sein; die Warnung folgt Requirement 8.
5. THE Limit von 50 Einträgen SHALL entfallen oder auf einen Schutzwert (z. B. 5000) steigen.
6. WHEN eine Datei umbenannt oder gelöscht wird, THE Server SHALL den Pfad im Lesezeichen nachführen (heute im Client).
7. THE bestehende Lesezeichen SHALL einmalig migriert werden (vorhandene Einträge der Datei gewinnen); danach gibt es keine zweite Quelle.
8. WHEN `bookmarks.json` extern geändert wird, THE Oberfläche SHALL sich ohne Neuladen aktualisieren.

### Requirement 14: Tastenkürzel (hotkeys.json)

**User Story:** Als Obsidian-Nutzer möchte ich meine Tastenkürzel behalten und alle Befehle belegen können.

#### Acceptance Criteria

1. THE Server SHALL `.obsidian/hotkeys.json` (Befehls-ID → Liste `{modifiers, key}`) lesen und schreiben; ein leeres Array bedeutet "ungebunden".
2. THE Befehle SHALL, wo ein Obsidian-Kernbefehl existiert, dessen ID verwenden (`editor:toggle-bold`, `app:open-settings`, `workspace:split-vertical`, …); Slatebase-eigene Befehle behalten `slatebase:`-IDs und werden in die Datei geschrieben, wenn sie belegt werden.
3. THE Task 0 SHALL die Kernbefehle von Obsidian gegen die vorhandenen Befehle abgleichen; THE fehlenden Befehle SHALL umgesetzt werden, soweit sie in Slatebase einen Sinn haben, die übrigen SHALL in der Doku als "nicht unterstützt" stehen.
4. THE Tastenkürzel-Einstellungen (`KeybindingsSection`) SHALL alle Befehle auflisten, suchen, belegen, löschen, auf Standard zurücksetzen und Konflikte anzeigen.
5. THE Standardbelegungen SHALL Obsidians Standard entsprechen, wo kein Browser-Konflikt besteht; Abweichungen stehen in der Doku.
6. THE Plugin-Befehle SHALL über `hotkeys.json` belegbar sein, und `app.hotkeyManager` SHALL die Datei widerspiegeln.
7. THE bestehende Belegungen pro User SHALL einmalig migriert werden (Datei gewinnt); danach gibt es nur die Vault-Datei.
8. WHEN `hotkeys.json` extern geändert wird, THE Anwendung SHALL die Belegung ohne Neuladen übernehmen.

### Requirement 15: Graph (graph.json)

**User Story:** Als Nutzer möchte ich die Graph-Einstellungen vault-weit und mit Obsidian teilen.

#### Acceptance Criteria

1. THE Graph-Einstellungen (heute pro User und Vault) SHALL in `.obsidian/graph.json` liegen und vault-weit gelten.
2. THE Server SHALL die Schlüssel `search`, `showTags`, `showAttachments`, `hideUnresolved`, `showOrphans`, `colorGroups`, `showArrow`, `textFadeMultiplier`, `nodeSizeMultiplier`, `lineSizeMultiplier`, `centerStrength`, `repelStrength`, `linkStrength`, `linkDistance`, `scale` und die `collapse-*`-Flags lesen und schreiben; unbekannte Schlüssel bleiben erhalten.
3. THE Graphansicht SHALL die Werte beim Öffnen anwenden und Änderungen zurückschreiben (verzögert, höchstens eine Schreibung pro Sekunde).
4. THE `colorGroups` SHALL das Obsidian-Farbformat (`{a, rgb}`) lesen und schreiben.
5. THE bestehenden Werte pro User SHALL einmalig migriert werden (Datei gewinnt).
6. WHEN der Nutzer keinen Schreibzugriff hat, THE Graph SHALL Änderungen nur lokal in der Sitzung halten und darauf hinweisen.

### Requirement 16: Eigenschaftstypen (types.json)

**User Story:** Als Obsidian-Nutzer möchte ich meine Eigenschaftstypen übernehmen.

#### Acceptance Criteria

1. THE Server SHALL `.obsidian/types.json` (`{ "types": { "<name>": "<typ>" } }`) lesen und schreiben; Task 0 SHALL das Format und die Typnamen (`text`, `number`, `checkbox`, `date`, `datetime`, `multitext`, `aliases`, `tags`) belegen.
2. THE Typnamen in Slatebases Typsystem SHALL auf Obsidians Namen abgebildet werden; Typen ohne Gegenstück SHALL erhalten bleiben.
3. THE `.slatebase/property-types.json` SHALL einmalig nach `types.json` migriert werden (Datei gewinnt) und danach nicht mehr verwendet werden.
4. THE Limit von 200 Einträgen SHALL entfallen oder auf einen Schutzwert steigen; die reservierten Schlüssel `tags` und `aliases` SHALL bleiben.
5. WHEN `types.json` extern geändert wird, THE Oberfläche SHALL die Typen ohne Neuladen aktualisieren.

### Requirement 17: Kernplugins (core-plugins.json) — zurückgestellt

**User Story:** Als Nutzer möchte ich Kernplugins wie in Obsidian ein- und ausschalten.

#### Acceptance Criteria

1. THE Umsetzung SHALL in einer eigenen Spec folgen; diese Spec SHALL nur die Ausgangslage festhalten (heute: Datei wird gelesen, nur Anzeige).
2. THE `core-plugins.json` SHALL bis dahin von keiner Funktion dieser Spec verändert werden.

### Requirement 18: Gemeinsame Anforderungen an die weiteren Dateien

#### Acceptance Criteria

1. EACH Datei SHALL über den gemeinsamen Lock-/Merge-Helfer (`shared/obsidian-config-file.ts`) gelesen und geschrieben werden: unbekannte Schlüssel bleiben, eine Datei, die kein JSON-Objekt ist, wird nie überschrieben.
2. EACH Datei SHALL bei `vault:change` ohne Neuladen übernommen werden (auch bei externer Änderung durch Obsidian oder Sync).
3. EACH Migration (pro User → Vault-Datei) SHALL dem Muster aus Requirement 4 folgen: einmalig, idempotent, Marker pro Vault, vorhandene Dateiwerte gewinnen, Entfernen der alten Quelle erst nach erfolgreichem Schreiben.
4. EACH Schreibzugriff SHALL Schreibrecht auf den Vault erfordern; die Routen SHALL in `VAULT-ROUTE-AUTHORIZATION.md` stehen.
5. THE Sync (Git-Sync, LiveSync) SHALL die Dateien wie andere Vault-Dateien behandeln; Konflikte SHALL nicht zu verlorenen Schlüsseln führen (Details: Requirement 19).

### Requirement 19: Git-Sync

**User Story:** Als Nutzer möchte ich, dass die vault-weiten Dateien per Git-Sync auf alle Geräte kommen, die nutzerbezogenen nicht.

#### Acceptance Criteria

1. THE verwaltete `.gitignore`-Liste in `backend/src/git-sync/sync-engine.ts` SHALL für jede Datei dieser Spec festlegen, ob sie synchronisiert wird: `app.json`, `appearance.json`, `daily-notes.json`, `bookmarks.json`, `hotkeys.json`, `graph.json`, `types.json` und `workspaces.json` werden synchronisiert; `workspace.json` (aktuelles Layout pro Nutzer) nicht.
2. THE Ausschlussmuster `.obsidian/workspace*.json` SHALL so geändert werden, dass es nur `workspace.json` trifft, weil es heute auch `workspaces.json` ausschließt und die vault-weiten Workspaces sonst nie synchronisiert würden.
3. THE Ausnahmen für Dateien in `.slatebase/` SHALL um neue vault-weite Dateien dieser Spec ergänzt werden (z. B. `workspace-extras.json`, falls Task 0.5 sie nötig macht) und um nicht mehr benötigte bereinigt werden (`property-types.json` nach der Migration nach `types.json`).
4. WHEN die verwaltete Liste sich ändert, THE Sync SHALL den verwalteten `.gitignore`-Block bei bestehenden Einrichtungen beim nächsten Lauf aktualisieren (Mechanismus existiert: `applyManagedGitignoreBlock`) und bereits ignorierte, jetzt synchronisierte Dateien beim nächsten Commit aufnehmen.
5. WHEN ein Merge in einer dieser JSON-Dateien einen Konflikt erzeugt, THE Sync SHALL ihn automatisch auflösen (Requirement 20); gelingt das nicht, THE Anwendung SHALL die Datei mit Konfliktmarkierungen als ungültiges JSON behandeln: nie überschreiben, Warnung nach Requirement 8, Funktion fällt auf den Default zurück, und die bestehende Konfliktbehandlung des Sync SHALL die Datei als Konfliktdatei melden.
6. WHEN die Migration (Requirement 4 und 18.3) Dateien schreibt, THE Sync SHALL sie beim nächsten Lauf wie jede andere Änderung übertragen; die Marker der Migration liegen unter `data/` und werden nicht synchronisiert, damit jede Instanz selbst migriert und die Schreibung idempotent bleibt.
7. THE Tests SHALL das verwaltete `.gitignore`-Muster gegen alle Dateien dieser Spec prüfen (synchronisiert / ausgeschlossen) und die Aktualisierung eines alten Blocks abdecken.
8. THE Doku SHALL festhalten, dass das Plugin obsidian-livesync diese Dateien unabhängig vom Git-Sync überträgt (siehe `.kiro/steering/livesync-format.md`).

### Requirement 20: Automatische Konfliktauflösung im Git-Sync

**User Story:** Als Nutzer möchte ich, dass Konflikte in den Konfigurationsdateien den Sync nicht blockieren.

#### Acceptance Criteria

1. WHEN ein Git-Merge Konflikte in Dateien aus der Liste dieser Spec (`.obsidian/{app,appearance,daily-notes,bookmarks,hotkeys,graph,types,workspaces}.json`) erzeugt, THE Sync SHALL deren drei Stände (Basis, lokal, entfernt) lesen, auf Schlüsselebene dreifach zusammenführen, das Ergebnis schreiben und der Index hinzufügen.
2. WHEN beide Seiten verschiedene Schlüssel ändern, THE Ergebnis SHALL beide Änderungen enthalten; WHEN eine Seite einen Schlüssel löscht und die andere ihn nicht ändert, SHALL er gelöscht bleiben.
3. WHEN beide Seiten denselben Schlüssel verschieden ändern, THE Ergebnis SHALL den Wert des neueren Commits verwenden; die Entscheidung SHALL als Warnung in die Console gehen (Requirement 8) mit Datei, Schlüssel und beiden Werten.
4. THE Listen in `bookmarks.json` und `hotkeys.json` SHALL vereinigt werden, wobei Einträge über Pfad/Titel bzw. Befehls-ID erkannt werden und eine einseitige Löschung bestehen bleibt.
5. THE Layouts in `workspaces.json` und Farbgruppen in `graph.json` SHALL nicht innerhalb eines Layouts gemischt werden; je Workspace bzw. je Datei gewinnt der neuere Stand.
6. IF eine der drei Fassungen kein gültiges JSON-Objekt ist oder die Datei nicht in der Liste steht, THEN THE Sync SHALL den Konflikt unverändert lassen und wie bisher melden.
7. WHEN alle Konflikte eines Merges automatisch aufgelöst sind, THE Sync SHALL den Merge-Commit abschließen und den Lauf normal fortsetzen; bleiben Konflikte in anderen Dateien, SHALL der Lauf wie bisher als Konflikt enden.
8. THE aufgelöste Datei SHALL die Schlüsselreihenfolge und Einrückung (2 Leerzeichen) wie Obsidian schreiben, damit künftige Merges keine Scheinkonflikte erzeugen.
9. THE Auflösung SHALL idempotent und ohne Datenverlust sein: schlägt das Schreiben fehl, bleibt der Konflikt wie er war.
10. THE Tests SHALL echte Git-Repositories mit je einem Konfliktfall pro Regel (2 bis 7) verwenden.
