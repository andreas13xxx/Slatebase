# Bases — Restlücken zu Obsidian (Parity)

Stand 2026-11-03. Quelle: Abgleich von Code gegen die Obsidian-Hilfe (obsidian.md/help/bases/syntax, /functions,
/views, /views/table|cards|list|map). Nur Punkte, die im Code verifiziert offen sind.

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
- R4.2 Tabelle: `rowHeight` (short/medium/tall/extraTall).
- R4.3 Karten: `image`, `imageFit` (cover/contain), `imageAspectRatio`, `cardSize`.
- R4.4 Liste: Marker (bullets/numbers/none), Einrückung, Trennzeichen.
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
