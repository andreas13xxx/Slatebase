# Bases — Restlücken zu Obsidian (Parity)

Stand 2026-11-03. Quelle: Abgleich von Code gegen die Obsidian-Hilfe (obsidian.md/help/bases/syntax, /functions,
/views, /views/table|cards|list|map). Nur Punkte, die im Code verifiziert offen sind.

## Status (2026-11-03)
P1, P2, P3, P5 umgesetzt. P4 teilweise: `groupOrder`, Cards-Raster und -Optionen, `type: kanban` umgesetzt; Tabellen-`rowHeight` und
Listen-Optionen **nicht** (YAML-Schlüssel in der Obsidian-Doku nicht belegt; Raten würde das Dateiformat verbiegen); Copy/CSV offen.
Nachprüfung 2026-11-14: Die Doku nennt die Optionen (Zeilenhöhe: short/medium/tall/extra tall; Liste: Markierung, Einrücken, Trennzeichen),
aber keinen YAML-Schlüssel. Zwei in Obsidian erzeugte `.base`-Dateien belegen sie, umgesetzt am 2026-11-14: `rowHeight` (`medium`/`tall`/`extra`), `markers` (`number`/`none`), `indentProperties`, `separator`; Panel „Anzeige" in der Toolbar. Objekt-Typ: umgesetzt in `bases-object-type/` (`file.properties`, `keys`/`values`/`isEmpty`).
Abweichungen: `file()`/`image()` liefern einen Link, `icon()`/`html()` Text;
`map`-Ansicht bleibt in der Einbettung eine Tabelle (Kacheln sind Operator-Konfiguration). Ein `cards`-View ohne `groupBy` ist jetzt das
Obsidian-Kartenraster, mit `groupBy` bleibt es das Kanban-Board.
Cards-Schlüssel (`image`, `imageFit`, `imageAspectRatio`, `cardSize`) stammen aus einem Forenbeispiel, `groupOrder` aus `obsidian.d.ts` (1.14.3).

## Phasen

### P1 — Ausdruckssprache: Funktionen und Methoden
- R1.1 Globale Funktionen: `file()`, `image()`, `icon()`, `html()`, `escapeHTML()`, `duration()`, `random()`.
- R1.2 Any: `isTruthy()`, `isType()`. Object: `keys()`, `values()`, `isEmpty()`.
- R1.3 String: `containsAll/Any`, `repeat`, `reverse`, `slice`, `title`, `isEmpty`.
- R1.4 Number: `ceil`, `floor`, `isEmpty`. Date: `relative()`, `isEmpty`.
- R1.5 Liste: `containsAll/Any`, `flat`, `reverse`, `slice`, `sort`, `unique`, `isEmpty`.
- R1.6 Regexp-Literale (`/abc/g`), `Regexp.matches()`, `replace`/`split` mit Regexp (`g` steuert erstes/alle).
- R1.7 Link: `asFile()`, `linksTo()`. File: `hasProperty()`, `asLink()`.

### P2 — Lambdas und eigene Summaries
- R2.1 `list.map(expr)`, `filter(expr)`, `reduce(expr, acc)`; implizite Variablen `value`, `index`, `acc` (Obsidian-Syntax, kein Pfeil).
- R2.2 Top-Level `summaries:` mit Formeln über `values` (z. B. `values.mean().round(3)` — `mean` ist in Obsidian nicht dokumentiert, wird trotzdem unterstützt); View-`summaries` dürfen darauf verweisen.

### P3 — Datenfelder
- R3.1 `file.embeds` (Embeds getrennt von Links aus dem Link-Index).

### P4 — Ansichts-Einstellungen
- R4.1 `groupOrder` (Liste, leere Liste blendet alle Gruppen aus, `null` = Elemente ohne Wert) in Parser, Serializer, Tabelle/Karten/Liste/Kanban.
- R4.2 Tabelle: `rowHeight` (`medium`/`tall`/`extra`; kurz = Schlüssel fehlt) — umgesetzt.
- R4.3 Karten: `image`, `imageFit` (cover/contain), `imageAspectRatio`, `cardSize`.
- R4.4 Liste: `markers` (`number`/`none`; Aufzählung = Schlüssel fehlt), `indentProperties`, `separator` — umgesetzt. Standard laut Doku: Trennzeichen ein Komma, nur ohne „Eigenschaften einrücken"; mit Einrücken steht jede Eigenschaft in einer eigenen Zeile (Slatebase zeigt dabei die Bezeichner). Ein Leerzeichen nach dem Trennzeichen ist Slatebase-Wahl. Nicht belegt: Standard von Markierung (Aufzählung angenommen) und Einrücken (aus angenommen), Zeilenhöhe (kurz angenommen).
- R4.5 Toolbar: Ergebnisse kopieren und CSV exportieren.
- Unbekannte Schlüssel bleiben im Round-Trip erhalten (Passthrough).

### P5 — Einbettung
- R5.1 Einbettung rendert den echten Ansichtstyp (`cards`, `list`, Kanban, `map`) statt immer Tabelle.
- R5.2 Einbettung aktualisiert sich bei `vault:change`.

### P6 — Doku
- Spec-Status, `implementation-plan.md`, `Features/Bases.md` DE/EN (Welcome-Vault), README-Funktionsliste, steering.

## Nicht-Ziele
- `this` im MCP-Tool `query_base` (kein Host-Kontext), Base in der Seitenleiste, Bearbeiten in der Einbettung.
- Serverseitige Plugin-Views. Pro-Ansicht-Kartenkacheln der Map (Tiles bleiben Operator-Konfiguration).
- Verhalten des Obsidian-Kanban-Layouts: nicht gegen die Doku verifiziert, bleibt offen.
