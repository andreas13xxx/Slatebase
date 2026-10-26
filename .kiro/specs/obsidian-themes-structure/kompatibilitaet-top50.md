# Theme-Kompatibilität der 50 meistgeladenen Obsidian-Themes

Stand: 2026-10-26, Slatebase v0.65.0. Die Prüfung selbst hat nichts geändert; die daraus abgeleiteten Korrekturen stehen im Abschnitt „Was daraus umgesetzt wurde".

## Vorgehen

1. **Auswahl:** Download-Zahlen aus `releases.obsidian.md/stats/theme`, verknüpft mit `community-css-themes.json` (Katalog) über den Namen. Die 50 meistgeladenen Themes (Rang 1: Minimal mit 2,72 Mio., Rang 50: Dark Moss mit 68 Tsd.).
2. **Statische Prüfung (alle 50):** `manifest.json` und `theme.css` von `raw.githubusercontent.com/<repo>/HEAD/` geladen. Geprüft wurden: Dateien vorhanden, Größe gegen das 3-MB-Limit, Manifest und Theme-ID, Style-Settings-Block, externe Hosts, gesetzte Variablen und Klassen-Abdeckung mit `measure-selectors.py` (siehe oben im Ordner; „erreichbar" = ohne Regeln hinter Style-Settings-Schaltern).
3. **Sichtprüfung (Top 10):** Isolierte Slatebase-Instanz (leeres Datenverzeichnis, eigener Test-Vault, Themes unter `.obsidian/themes/<Name>/`, Auswahl über `cssTheme` in `.obsidian/appearance.json`), Screenshot in Chromium bei 1440 × 900 mit einer Test-Notiz (Überschriften H1–H6, Listen, Aufgaben, Zitat, Callout, Code, Tabelle, Eigenschaften).

## Ergebnis auf einen Blick

| Gruppe | Anzahl | Themes |
|---|---|---|
| Nur `obsidian.css`, vom Store bisher nicht installierbar (jetzt über den Fallback möglich) | 9 | Atom, Dracula for Obsidian, Everforest, Notation, Ono Sendai, Pink Topaz, Obuntu, Golden Topaz, Yin and Yang |
| Zu groß (über 3 MB, damaliges Limit) | 1 | Willemstad (5,3 MB), passt unter das neue Limit von 6 MB |
| Variablengetrieben, statisch gut kompatibel | 16 | Things, Obsidian Nord, Wasp, Typewriter, Obsidian gruvbox, Tokyo Night, GitHub Theme, Cybertron, Solarized, Typomagical, Dracula Official, Material Gruvbox, Obsidianotion, Sodalite, Flexoki, Dark Moss |
| Teilweise: Farben und Schriften greifen, Struktur nur teils | 10 | Obsidianite, Shimmering Focus, Catppuccin, Terminal, Encore, PLN, Royal Velvet, Red Graphite, LYT Mode, Maple |
| Eingeschränkt: Look hängt stark an Obsidians DOM-Klassen | 14 | Minimal, AnuPpuccin, Blue Topaz, ITS Theme, Primary, Prism, Border, Sanctum, Cupertino, Shiba Inu, Cyber Glow, Ukiyo, Baseline, Retroma |

Die Gruppen 3 bis 5 sind eine **Faustregel nach Zahl der Klassen-Treffer** (bis 300 = variablengetrieben, bis 1500 = teilweise, darüber = eingeschränkt), keine Messung der sichtbaren Wirkung. Die Sichtprüfung der Top 10 hat sie teilweise widerlegt (siehe unten).

## Befunde der statischen Prüfung

- **`obsidian.css` statt `theme.css`:** Der alte Dateiname eines Themes. Der Store holte nur `theme.css` und `manifest.json`, bei diesen 9 Repos antwortet beides mit 404. Nur Yin and Yang trägt im Katalog `legacy: true`, die anderen acht nicht. Inhaltlich ist die Datei normales Theme-CSS (Atom wurde in der Sichtprüfung als manuell eingesetzte `theme.css` getestet und funktioniert). Der Import-Tab nahm schon vorher jede `.css`-Datei an. Der Store hat jetzt den Fallback (siehe unten).
- **Größe:** Nur Willemstad (5,3 MB) überschritt das damalige 3-MB-Limit. Das Limit steht jetzt bei 6 MB.
- **Manifest:** Bei allen 41 Themes mit `theme.css` gültig, Name gleich Katalogname, Theme-ID gültig.
- **Externe Ressourcen:** Blue Topaz (`cdn.dribbble.com`), Willemstad und Encore (`images.unsplash.com`), nur Bilder. Die Content-Security-Policy erlaubt `https:` für Bilder, also kein Blocker.
- **Style Settings:** 32 von 50 Themes haben einen `@settings`-Block. Bei den 14 „eingeschränkten" Themes hängt ein großer Teil der Regeln an Body-Schaltern, die nur das Plugin setzt (Minimal 1328, Blue Topaz 5068, AnuPpuccin 1829 gesperrte Treffer). Ohne das Plugin greifen sie nie.
- **Fehlende Klassen:** Bei den großen Themes fehlen 40 bis 70 % der erreichbaren Klassen in Slatebase. Das passt zur Messung in dieser Spec (Phase 0): Der Großteil davon hat im Spike keine sichtbare Wirkung.

## Befunde der Sichtprüfung (Top 10, nur heller Modus)

| Rang | Theme | Eindruck |
|---|---|---|
| 1 | Minimal | Gut: Farben, Überschriften, Tabellen und Breite greifen |
| 2 | Things | Gut: blaue Überschriften, Trennlinie unter H2, Checkboxen, Code-Block |
| 3 | AnuPpuccin | Gut: Monospace-Schrift, grüne Überschriften |
| 4 | Blue Topaz | **Layoutfehler, behoben (siehe unten):** Der Absatz zerfiel, jedes Inline-Element stand in einer eigenen Zeile. Farben und Datei-Icons stimmten |
| 5 | Obsidian Nord | Gut: orange Überschriften und Links |
| 6 | Atom | Gut (als manuell eingesetzte `theme.css`): blaue Überschriften, schlichte Darstellung |
| 7 | Obsidianite | **Auffällig, vermutlich theme-eigen:** Das Zitat wird zerrissen, jede Zeile ein eigener dunkler Balken mit Verlauf. Statusleiste halb durchsichtig, die Markierung (`==text==`) fast unleserlich |
| 8 | Wasp | Gut: rote Überschriften, warmer Hintergrund, orange Akzentleisten |
| 9 | Typewriter | Gut: beiger Hintergrund, grüne Überschriften; Zitat mit etwas größerem Zeilenabstand |
| 10 | ITS Theme | Gut, aber fremdartig: Datei-Icon-Set, Gliederung mit Rauten und Unterstreichungen werden übernommen; Blockzitat mit Abstand |

Abweichungen von der statischen Einteilung: Blue Topaz („eingeschränkt") und Obsidianite („teilweise") hatten sichtbare Fehler, die die Klassenzählung nicht anzeigt. Minimal und ITS Theme sind trotz vieler fehlender Klassen brauchbar.

### Ursachen der beiden Auffälligkeiten (im laufenden DOM untersucht)

- **Blue Topaz:** Die Theme-Regel `body:not(.obsidian-default-image) .markdown-source-view.mod-cm6 img:not([class*="emoji"]) { display: block }` (Spezifität 0,4,2) trifft auch CodeMirrors unsichtbare `img.cm-widgetBuffer`. Deren eigenes `display: inline` (`.ͼ1 .cm-widgetBuffer`) verliert, jeder Puffer wird zum Block und bricht die Zeile um. Die Regel greift erst, seit der Editor `mod-cm6` trägt (Stufe 2, R1). Behoben mit einer Schutzregel in `live-preview.css` (0,5,1, ohne `!important`, enge Blockzeilen ausgenommen).
- **Obsidianite:** Die Regel `.markdown-source-view.mod-cm6.is-live-preview .HyperMD-quote, .markdown-preview-view blockquote` gibt **jeder** Zitatzeile Rahmen, Verlauf und 2 em Abstand. Obsidian setzt `HyperMD-quote` ebenfalls pro Zeile, die Darstellung dürfte also dort ähnlich aussehen. Das ist **nicht gegen Obsidian geprüft**. Nicht geändert. Ebenfalls ungeprüft: ob das Theme (dunkel ausgelegt) im Dunkelmodus unauffällig aussieht, hier nur heller Modus.

## Grenzen

- Nur oberer Teil der Test-Notiz in den Screenshots; Tabelle und Code-Block unterhalb nicht beurteilt.
- Nur heller Modus. Dunkle Themes (z. B. Obsidian Nord) sind damit nicht in ihrem Hauptmodus gesehen.
- Style-Settings-Optionen, Plugins und Seitenleisten-Details wurden nicht geprüft.
- Ränge 11 bis 50 wurden nur statisch geprüft.
- Die Screenshots lagen im Scratch-Verzeichnis der Sitzung und sind nicht erhalten.
- Die Variablen- und Klassenzahlen stammen aus einer zweiten Auswertung am selben Tag; die Rohdaten-Tabelle unten ist die der ersten.

## Offene Punkte

- Obsidianite gegen echtes Obsidian vergleichen (Zitatdarstellung) und im Dunkelmodus ansehen.
- Sichtprüfung für Ränge 11 bis 20 und im Dunkelmodus.
- Installation einzelner `obsidian.css`-Themes über den Store gegen echtes GitHub ausprobieren (bisher nur mit Testdoubles und lokalem Server getestet).
- Weitere Variablen aus der Liste unten binden, sobald ihre Wirkung per Screenshot belegt ist.

## Auswertung: was die Top 50 brauchen und Slatebase nicht liefert

Quelle: `measure-selectors.py` je Theme (nur erreichbare Regeln, Quelltext-Abgleich gegen `frontend/src` ohne Tests und `plugins/compat/`) und eine Variablenauswertung über alle 50 `theme.css`. Die Zahlen sagen, was fehlt, **nicht**, was es bewirken würde.

### Fehlende Klassen (Zahl der Themes, die sie ansprechen)

| Bereich | Klassen | Themes |
|---|---|---|
| Leseansicht | `markdown-preview-view` 41, `markdown-rendered` 35, `task-list-item` 30, `external-link` 28, `task-list-item-checkbox` 25 | 25 bis 41 |
| Workspace und Tabs | `workspace-tab-header` 34, `workspace-ribbon` 32, `mod-left` 32, `mod-active` 31, `workspace-leaf-content` 30, `view-header` 30, `workspace-tabs` 29, `view-content` 29 | 29 bis 34 |
| Editor | `cm-strong` 30, `cm-url` 27, `cm-link` 26, `cm-em` 25, `cm-quote` 25, `cm-active` 24, `cm-header-1` 24, `cm-header-2` 22 bis `-6` 23 | 22 bis 30 |
| Modale und Menüs | `suggestion-item` 28, `mod-settings` 23 | 23, 28 |
| Navigation, Einstellungen | `search-result-file-matched-text` 24, `setting-item-heading` 22 | 22, 24 |
| Body-Zustand | `is-mobile` | 30 |

Fehlende Treffer nach Bereich (Summe über alle Themes): Workspace/Tabs 9.221, Leseansicht 8.958, Editor 5.177, Body-Zustand 3.997, Canvas/Graph/Bases/Eigenschaften 1.647, Modale 1.613, Navigation 954, Einstellungen 914, Controls 208, Statusleiste 97.

**Einordnung:** Die Messung in Phase 0 dieser Spec hat für Workspace, Tabs und Leseansicht kaum Wirkung gezeigt (Minimal: 1 von 945 Elementen). Die hohen Zahlen sind deshalb kein Arbeitsauftrag.

### Variablen

- **Von Themes verwendet, aber nirgends definiert** (`var(--x)` ohne Rückfall): Randfälle mit 2 bis 8 Themes, z. B. `--font-text-override` (8), `--checkbox-icon` (6), `--default-font` (6), `--interactive-accent_hover` (5), `--touch-size-m` (5). Einige sind Tippfehler der Theme-Autoren (`--backgrouund-modifier-border`, `--background-modifer-border`).
- **Von vielen Themes gesetzt, von Slatebases eigener Oberfläche nicht gelesen** (Auszug): `--text-selection` 44, `--background-primary-alt` 44, `--background-modifier-error` 29, `-success` 27, `--scrollbar-thumb-bg` und `--scrollbar-bg` 26, `--scrollbar-active-thumb-bg` 25, `--code-normal` 25, `--titlebar-background(-focused)` 23 bis 24, `--tab-text-color-focused-active` 23, `--background-modifier-box-shadow` 22, `--tab-divider-color` 21, `--interactive-accent-rgb` 20, `--color-*-rgb` 19 bis 20, `--ribbon-background-collapsed` 20, `--checkbox-*` 17 bis 19, `--text-highlight-bg-active` 19, `--input-shadow` 19. Die Compat-Schicht definiert sie für Plugins, die eigenen Komponenten greifen nicht darauf zu.

## Was daraus umgesetzt wurde (Branch `feat/theme-obsidian-css-and-6mb`)

1. **`obsidian.css`-Fallback im Store** (`66b6723`): Fehlt `theme.css`, wird `obsidian.css` geholt; bei solchen Repos darf `manifest.json` fehlen (Katalogname ersetzt es), ein `theme.css`-Repo braucht weiter ein Manifest. Die Update-Prüfung zählt ein fehlendes Remote-Manifest als „unbekannt". Betrifft 9 der Top 50.
2. **CSS-Grenze 3 MB → 6 MB** (`66b6723`): Backend, Import und Injector, Meldungen, Doku, Tests. Willemstad (5,3 MB) passt damit.
3. **Blue-Topaz-Fehler** (`f4c50ad`): Schutzregel für `cm-widgetBuffer`, siehe oben. Im Browser nachgeprüft.
4. **Variablen in `theme-bridge.css` gebunden** (`4941251`): `--text-selection` (Editor-Auswahl und `::selection`), `--scrollbar-bg`/`-thumb-bg`/`-active-thumb-bg`, `--code-normal` (Inline-Code und Codeblock-Zeilen), `--checkbox-color`, `--tab-text-color` und `--tab-text-color-focused-active`. Jede hat in der Compat-Schicht einen Slatebase-gleichen Standardwert, ohne Theme ändert sich nichts. Im Browser mit Obsidian Nord geprüft (Inline-Code, Checkbox, aktiver Tab, Auswahlfarbe); Minimal liefert dieselben Variablen. Die Scrollbalken wurden nur über den Test, nicht im Bild geprüft.

**Bewusst nicht gebunden:** die semantischen Farben (`--background-modifier-error`/`-success`), weil die Bridge sie laut ihrem Kopfkommentar absichtlich auslässt, sowie `--titlebar-*`, `--ribbon-*` und alles aus Workspace/Tabs/Leseansicht (Wirkung gemessen als gering oder keine passende Stelle in Slatebase).

## Empfehlung für weitere Schritte

1. Weitere Variablen aus der Liste oben bindbar machen, jeweils mit Screenshot-Beleg (zuerst `--background-primary-alt`, `--text-highlight-bg-active`, `--input-shadow`, `--tab-divider-color`).
2. Editor-Klassen `cm-strong`, `cm-em`, `cm-link`, `cm-url`, `cm-quote`, `cm-header-N` als Marker an den Live-Preview-Dekorationen (R2, 22 bis 30 Themes), vorher mit der Wirkungsprobe der Spec messen.
3. Sichtprüfung der Ränge 11 bis 20 und beider Farbmodi, bevor weitere Klassen angegangen werden.
4. Workspace-Klassen und Leseansicht weiter nicht angleichen.

## Rohdaten: alle 50 Themes (statisch)

Spalten: Quelle der CSS-Datei, Größe, Style-Settings-Block, erreichbare Klassen-Treffer (fehlend/gesamt), durch Schalter gesperrte Treffer. „Manifest fehlt" bei den 9 `obsidian.css`-Themes.

| Rang | Theme | Datei | KB | SS | fehlend/erreichbar | gesperrt |
|---|---|---|---|---|---|---|
| 1 | Minimal | theme.css | 260 | ja | 921/1626 | 1328 |
| 2 | Things | theme.css | 68 | ja | 120/203 | 97 |
| 3 | AnuPpuccin | theme.css | 361 | ja | 574/1573 | 1829 |
| 4 | Blue Topaz | theme.css | 1293 | ja | 2289/3396 | 5068 |
| 5 | Obsidian Nord | theme.css | 14 | nein | 15/25 | 0 |
| 6 | Atom | obsidian.css | 9 | nein | 59/117 | 0 |
| 7 | Obsidianite | theme.css | 33 | nein | 190/423 | 0 |
| 8 | Wasp | theme.css | 87 | ja | 41/202 | 1 |
| 9 | Typewriter | theme.css | 904 | ja | 54/128 | 0 |
| 10 | ITS Theme | theme.css | 831 | ja | 2513/4951 | 422 |
| 11 | Willemstad | theme.css | 5304 | ja | 2898/7948 | 1630 |
| 12 | Obsidian gruvbox | theme.css | 18 | nein | 15/21 | 0 |
| 13 | Primary | theme.css | 1678 | ja | 1371/2214 | 374 |
| 14 | Shimmering Focus | theme.css | 638 | ja | 806/1326 | 52 |
| 15 | Catppuccin | theme.css | 2287 | ja | 481/1143 | 219 |
| 16 | Prism | theme.css | 1172 | ja | 1993/3602 | 1051 |
| 17 | Border | theme.css | 375 | ja | 1063/1769 | 1332 |
| 18 | Tokyo Night | theme.css | 69 | ja | 50/85 | 6 |
| 19 | Dracula for Obsidian | obsidian.css | 18 | nein | 103/165 | 0 |
| 20 | Sanctum | theme.css | 410 | ja | 1380/5461 | 19 |
| 21 | Everforest | obsidian.css | 26 | nein | 49/108 | 0 |
| 22 | GitHub Theme | theme.css | 39 | ja | 2/10 | 8 |
| 23 | Cybertron | theme.css | 28 | nein | 169/260 | 0 |
| 24 | Solarized | theme.css | 11 | ja | 40/68 | 0 |
| 25 | Cupertino | theme.css | 318 | ja | 2571/3410 | 1035 |
| 26 | Notation | obsidian.css | 22 | nein | 163/263 | 0 |
| 27 | Typomagical | theme.css | 2097 | ja | 175/279 | 145 |
| 28 | Terminal | theme.css | 1255 | ja | 275/414 | 0 |
| 29 | Ono Sendai | obsidian.css | 65 | nein | 497/653 | 0 |
| 30 | Shiba Inu | theme.css | 273 | ja | 566/1667 | 792 |
| 31 | Encore | theme.css | 88 | ja | 324/483 | 182 |
| 32 | PLN | theme.css | 81 | ja | 197/406 | 0 |
| 33 | Cyber Glow | theme.css | 689 | ja | 1989/3159 | 126 |
| 34 | Pink Topaz | obsidian.css | 128 | nein | 418/695 | 17 |
| 35 | Dracula Official | theme.css | 19 | nein | 96/152 | 0 |
| 36 | Obuntu | obsidian.css | 41 | nein | 158/218 | 0 |
| 37 | Ukiyo | theme.css | 573 | ja | 954/1755 | 173 |
| 38 | Baseline | theme.css | 518 | ja | 1450/2039 | 3961 |
| 39 | Material Gruvbox | theme.css | 22 | ja | 15/21 | 0 |
| 40 | Royal Velvet | theme.css | 1646 | ja | 273/394 | 8 |
| 41 | Red Graphite | theme.css | 32 | ja | 129/334 | 0 |
| 42 | Yin and Yang | obsidian.css | 386 | ja | 1488/2292 | 340 |
| 43 | Golden Topaz | obsidian.css | 129 | nein | 418/694 | 17 |
| 44 | Retroma | theme.css | 1303 | ja | 1774/4073 | 214 |
| 45 | Obsidianotion | theme.css | 51 | nein | 102/205 | 0 |
| 46 | LYT Mode | theme.css | 879 | nein | 561/1140 | 3 |
| 47 | Maple | theme.css | 542 | ja | 818/1307 | 1289 |
| 48 | Sodalite | theme.css | 18 | nein | 117/200 | 4 |
| 49 | Flexoki | theme.css | 1 | nein | 0/2 | 0 |
| 50 | Dark Moss | theme.css | 10 | nein | 41/87 | 0 |
