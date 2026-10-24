# Style Settings — Spike (2026-10-21)

Frage: Läuft das Community-Plugin **Style Settings** in Slatebase, und was würde es für Themes bringen? Style Settings ist
der größte noch offene Hebel für strukturlastige Themes: Bei Minimal liegen 1328 von 2954 Klassen-Treffern hinter Schaltern,
die dieses Plugin setzt (`obsidian-themes-structure`, Design §1).

## Wie Style Settings arbeitet (aus dem Bundle `main.js` v1.0.9)

| Schritt | Mechanismus | Slatebase |
|---|---|---|
| Einstellungen finden | liest **`document.styleSheets`** und darin die `@settings`-Kommentarblöcke (YAML) aus dem `ownerNode`-Text; kein `app.customCss` | `ThemeInjector` legt das Theme als `<style data-slatebase-theme>` ins `<head>`: der Block steht dort. **Funktioniert** |
| Neu einlesen | auf `workspace.on('css-change')` | `plugin-event-bridge.ts` löst `css-change` bei Theme-Wechsel hell/dunkel aus. Ob auch beim Wechsel/Entfernen des Vault-Themes und bei Snippets: **nicht geprüft** |
| Klassen-Schalter, Auswahl | `document.body.classList.add(id)` | wirkt, soweit Slatebase das Element hat (siehe Messung) |
| Variablen | `<style id="css-settings-manager">` im `<head>` mit `body.css-settings-manager { --var: wert }` | **Funktioniert** (siehe unten) |
| Einstellungsseite | `PluginSettingTab.display()` baut einen Komponentenbaum über `addChild(...)` | **Leer** — Fehler in der Kompatibilitätsschicht |

## Befund 1: Die Einstellungsseite bleibt leer (Fehler der Kompat-Schicht)

Mit Minimal als aktivem Theme parst das Plugin die drei Blöcke korrekt (`Minimal`, `Minimal Cards`,
`Minimal Advanced Settings`; ohne Fehler), aber der Dialog „Einstellungen: Style Settings" zeigt nur Suchfeld, Import und
Export, keine Abschnitte.

**Ursache:** `PluginLoader` ruft `instance.onload()` direkt auf (`plugin-loader.ts` ~Zeile 247), nicht `instance.load()`.
Dadurch bleibt `Component._loaded` des Plugins `false` (`install-globals.ts` ~Zeile 811, `load()` setzt es). Slatebases
`addChild` lädt Kinder nur, `if (this._loaded)` (~Zeile 852). Style Settings hängt seinen Markup-Baum per
`plugin.addChild(new SettingsMarkup(...))` ein; der wird nie geladen, damit lädt auch keiner seiner Abschnitte. In
echtem Obsidian setzt `plugin.load()` `_loaded` vor `onload()`.

**Beleg:** `plugin._loaded === false`; nach einem manuellen `settingsMarkup.load()` und `rerender()` erscheint der komplette
Minimal-Baum (Abschnitte „Interface colors", „Accent color", „Blockquotes", „Callouts", „Headings", „Sidebars" …, 35 Zeilen,
„Headings" klappt in „Level 1–6 Headings" auf).

**Betrifft nicht nur Style Settings:** Jedes Plugin, das nach `onload()` per `addChild` Komponenten einhängt (Settings-Tabs,
Views, Markup-Bäume), bekommt sie nicht geladen. Das ist ein allgemeiner Fehler in der Plugin-Kompatibilität.

**Fix (klein):** `_loaded` vor `onload()` setzen (in `PluginLoader` über `Component.load()` bzw. eine interne
Markierung), damit `addChild` während und nach `onload()` die Kinder lädt, wie Obsidian. Dazu ein Test: Plugin, das in
`onload()` und später per `addChild` ein Kind hinzufügt, bekommt `onload` des Kindes aufgerufen.

**Umgesetzt (2026-10-21):** `PluginLoader` ruft vor `onload()` `markLoaded()` auf (`b28ffbc`, 4 Tests; drei schlagen ohne den
Fix fehl). Danach zeigte die Live-Prüfung aber weiter „No style settings found" (**Befund 1b**, unten).

### Befund 1b: `display()` lief vor dem Einhängen des Containers

Slatebase rief `tab.display()` auf, bevor `tab.containerEl` im Dialog hing (`PluginManagementPage` hängt ihn erst danach
ein). Obsidian hängt zuerst ein. Style Settings' `setSettings()` rendert nur, `if (containerEl.parentNode)`, der erste
Aufruf blieb deshalb leer. Auch das betrifft jedes Plugin, dessen Tab Elemente nur im Dokument aufbaut.

**Umgesetzt (`0f40aa2`):** `mountSettingTab()` und `waitForElement()` (`plugins/compat/setting-tab-mount.ts`, 5 Tests):
Container einhängen, dann `display()`; `PluginManagementPage` nutzt beides.

**Live bestätigt:** Die Seite rendert sofort (Suchfeld, „Minimal", „Minimal Cards", „Minimal Advanced Settings"), bis hinunter
zu „Tables" mit fünf Schaltern. „Row lines" und „Striped rows" setzen per Klick `row-lines` und `row-alt` auf `<body>`;
die Werte bleiben nach einem Neuladen erhalten (damals `data/plugins/<vaultId>/obsidian-style-settings/data.json`, inzwischen `<vault>/.obsidian/plugins/obsidian-style-settings/data.json`; gilt für alle
Nutzer des Vaults).

## Befund 2: Variablen wirken (Ende zu Ende)

`settingsManager.setSetting('minimal-style', 'h1-size', '3em')` erzeugt `body.css-settings-manager { --h1-size: 3em; }`,
die Überschrift 1 im Live-Preview-Editor springt von **18 px auf 48 px**. Die Stufe-1-Brücke (`--h1-size` → Slatebase) greift
also auch für Werte aus Style Settings. Minimal deklariert **173 Variablen-Einstellungen** (92 themed-color, 31 text,
22 select, 21 slider, 7 number).

## Befund 3: Klassen-Schalter wirken nur dort, wo Slatebase das Element hat

`probe-toggle-effect.js` setzt jede Klasse der Minimal-Einstellungen (79: Schalter und Auswahloptionen, 64 messbar, 15 sind
schon gesetzt) auf `<body>` und vergleicht die berechneten Stile aller Elemente, mit geöffneter Notiz (Live Preview,
589 Elemente; Überschriften 1–6, Zitat, Callout, Code, Aufgaben, Tabelle):

| | Anzahl |
|---|---|
| Klassen mit sichtbarer Wirkung | **11 von 64 (17 %)** |
| davon Tabellen (`maximize-tables`, `table-lines`, `row-alt`, `table-numbers`, `row-hover`) | 5 |
| davon Überschriften-Zeilen (`h1-l` … `h6-l`) | 6 |
| ohne Wirkung | 53 |

Ohne geöffnete Notiz: 0 von 64. Die Wirkung hängt also an den Editor-Klassen aus `obsidian-themes-structure` (Phase 1/2);
die 53 ohne Wirkung brauchen Elemente, die Slatebase nicht oder anders baut (Callout-Widgets, Einbettungen, PDF,
Seitenleisten-Struktur, Ribbon, Tab-Leiste, Dataview, Lesemodus), oder Zustände, die die Messung nicht herstellt.

## Katalog-Auswertung (`scan-settings.py`)

Vollscan über den Katalog (`scan-settings.py`, nur `raw.githubusercontent.com`, 3 parallele Anfragen): 833 Themes mit
`theme.css` ausgewertet (85 ohne abrufbare Datei).

| | Anzahl |
|---|---|
| Themes mit `@settings`-Block | **350 von 833 (42 %)** |
| davon vollständig lesbar (YAML ohne Fehler) | 319 |
| mit mindestens 10 Einstellungen | 185 |
| mit mindestens 50 Einstellungen | 50 |
| mit Klassen-Schaltern oder -Auswahl | 291 |
| nur Variablen, keine Klassen | 28 |

Einstellungstypen über alle Themes: `class-toggle` 2675, `heading` 1961, `variable-text` 1757, `variable-themed-color` 1684,
`variable-number-slider` 1170, `class-select` 1014, `variable-color` 680, `variable-select` 453, `variable-number` 391,
`info-text` 171. Größte Einstellungsmengen: Ethereal 1198, Blue Topaz 632, Lifein 315, Primidian 302, Maple 287.

Grenze der Zählung: Der Scan liest die YAML-Blöcke mit PyYAML; 41 Themes enthalten Blöcke, die er nicht lesen kann (Tabs, `?`
in Werten), obwohl das Plugin (js-yaml) sie liest. Die Zahl „mit `@settings`-Block" (350) ist deshalb verlässlich, die
Detailzahlen darunter sind es für diese 41 nicht.

**Heißt:** Fast jedes zweite Katalog-Theme bringt Einstellungen für Style Settings mit, und die meisten davon (291 von 319)
arbeiten mit Klassen. Ohne das Plugin fehlen diese Optionen, mit dem Plugin wirken die Variablen voll und die Klassen so
weit, wie Slatebase die Struktur hat (Befund 3).

## Einschätzung

1. **Machbar ohne Eigenbau.** Das Plugin läuft in Slatebase; es fehlen ein Kompat-Fehler (Befund 1) und möglicherweise ein
   `css-change` beim Vault-Theme-Wechsel. Ein eigener Style-Settings-Ersatz ist nicht nötig, und Slatebase müsste das
   YAML-/Einstellungsformat nicht selbst implementieren.
2. **Der Nutzen ist begrenzt.** Variablen-Einstellungen (Farben, Größen, Schriften: der größte Teil bei Minimal) wirken voll;
   Klassen-Schalter nur bei rund einem Sechstel (Tabellen, Überschriften), solange Slatebase die Struktur nicht nachbaut.
3. **Die Fixes waren ohnehin fällig** (Befund 1 und 1b betreffen alle Plugins) und sind umgesetzt.

## Offene Punkte

- ~~`css-change` beim Wechsel/Entfernen des Vault-Themes und bei Snippets~~ **Erledigt (2026-10-21):** Die Injektoren melden
  Änderungen über `CSS_CHANGE_EVENT`, die Event-Brücke leitet sie als `css-change` weiter (zusammengefasst, ohne Ereignis bei
  unverändertem CSS). Live bestätigt mit Style Settings: Things → Abschnitt „Things Theme", Minimal → die drei
  Minimal-Abschnitte, Standard → keine Abschnitte. Style Settings löst nach dem Setzen seiner Variablen selbst ein
  `css-change` aus; das schleift nicht, weil die Brücke Workspace-Ereignisse nicht zurück in Fensterereignisse übersetzt.
- Persistenz: Style Settings speichert seine Werte über `saveData` (pro Vault, `plugins/<vaultId>/…/data.json`). Gilt für
  alle Nutzer des Vaults, wie das Theme selbst; das ist stimmig, sollte aber so dokumentiert werden.
- Das Plugin ist über den Plugin-Store installierbar. Soll die Themes-Seite darauf hinweisen (Theme hat `@settings` →
  „Dieses Theme bietet Einstellungen: Plugin Style Settings installieren")?
- `PLUGIN-COMPAT.md` führt Style Settings als „Voll kompatibel" nach **statischer Analyse**. Mit den beiden Fixes live
  bestätigt (Einstellungsseite, Klassen, Variablen, Persistenz); Eintrag auf „Live getestet" anpassen.
- Minimal hat ein eigenes Plugin **Minimal Theme Settings** (`obsidian-minimal-settings`, 1,7 Mio. Downloads, im Plugin-
  Katalog). Nicht geprüft.
