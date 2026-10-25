# Bases Feature-Vervollständigung — Requirements

## Kontext

Bases ist auf `master` ausgeliefert (Specs `.kiro/specs/bases/`, `bases-plugin-api/`,
`bases-expression-language/`): `.base`-Parser/Serializer im echten Obsidian-Format,
Query-Engine auf dem Link-Index, geteilte Ausdrucks-Engine (`shared-contracts/src/bases/`),
editierbare Tabellen- und Karten-/Kanban-View, Feature-Toggle `bases`, Plugin-API
`registerBasesView()`, MCP-Werkzeug `query_base`.

Diese Spec schließt die bewusst zurückgestellten Lücken (siehe `implementation-plan.md`,
Abschnitt „Ausgelieferte Features mit zurückgestellten Resten") in einer vom Nutzer
festgelegten Reihenfolge und erweitert die Welcome-Vaults so, dass **alle** Bases-Features
mit lauffähigen Beispielen erklärt sind.

Plugin-Bases-Views nur im Browser (ehem. Lücke 7) ist **bewusst ausgeschlossen** —
Architekturgrenze, braucht erst „Server-Side Plugins" (Prio 5).

## Umsetzungsreihenfolge (vom Nutzer bestätigt)

Die Nutzer-Wunschreihenfolge war 1→3→2→6→4→5; nach Analyse auf
**3 → 4 → 1 → 2(file.size) → 6 → 5** umgestellt, weil:
- **#3 vor #1**: Die 1000-Zeilen-Kappung ist ein stilles Korrektheitsproblem; `summaries`
  (#1) würde über einen unvollständigen Datensatz aggregieren, solange #3 offen ist. #3 ist
  logische Voraussetzung für korrekte Aggregate.
- **#4 direkt nach #3**: Beide fassen die Index-/Query-Pipeline an (#3 Zeilenmenge, #4
  Werttypisierung). Gemeinsam = einmal einarbeiten. #4 betrifft die Datenbasis, auf der #1/#2
  rechnen.
- **Lambda-`map`/`filter` (Teil der ehem. Lücke 2)**: aus dieser Spec herausgehalten
  (höchster Aufwand, geringster realer Bedarf) — eigenes späteres Thema.

## Anforderungen

### R1 — Kandidaten-Obergrenze beheben (ehem. Lücke 3) — ZUERST

**User Story:** Als Nutzer möchte ich, dass eine gefilterte Base alle passenden Notizen
zeigt, auch in großen Vaults, damit ich mich auf Vollständigkeit verlassen kann.

Ist-Zustand: `backend/src/link-index/link-index-service.ts:634` (`MAX_ROWS = 1000`) und
`backend/src/mcp/query-base-tool.ts:51` (`MAX_LIMIT = 1000`) kappen Kandidatenzeilen, BEVOR
die Ausdrucks-Filter clientseitig (`shared-contracts/.../base-eval.ts filterRows`) laufen.
Treffer jenseits der ersten 1000 fehlen stillschweigend, ohne Fehlermeldung.

- R1.1 Die Filterung MUSS gegen die vollständige passende Menge laufen, nicht gegen die ersten
  1000 Kandidaten. Lösungsansatz offen (Design entscheidet): Filter-Pushdown in die Query-Spec,
  gestreamte/paginierte Kandidatenlieferung, oder serverseitige Vorfilterung der billig
  prüfbaren Prädikate (Pfad/Tag/Property-Existenz) vor der Kappung.
- R1.2 WENN eine harte Obergrenze aus Performance-Gründen bestehen bleibt, MUSS die View
  sichtbar signalisieren, dass das Ergebnis gekappt wurde (kein stilles Abschneiden).
- R1.3 Performance: Die Lösung DARF für kleine/mittlere Vaults keine spürbare Regression
  einführen; große Vaults (>1000 passende Zeilen) sollen korrekte, nicht zwangsläufig
  unbegrenzte Ergebnisse liefern.
- R1.4 Gilt für beide Eintrittspunkte identisch: REST-Query-Route UND MCP-`query_base`.
- R1.5 Tests, die den Fall >1000 passende Zeilen abdecken (vorher: Treffer verloren).

### R2 — Property-Typ Einzelwert vs. Liste (ehem. Lücke 4) — nach R1

**User Story:** Als Nutzer möchte ich, dass eine Property, die eine Liste ist, auch als Liste
behandelt wird, damit Filter und Formeln korrekt rechnen.

Ist-Zustand: `shared-contracts/.../base-eval.ts` (`LIST_KEYS` + `toExprValue`) liest außer
`tags`/`aliases`/`cssclasses`/`file.tags`/`file.links` jede 1-elementige Liste als Skalar —
Heuristik, weil der Link-Index jede Property als `string[]` ohne Typ-Info übergibt.

- R2.1 Der Link-Index SOLL die echte Form (Skalar vs. Liste) oder den Property-Typ aus der
  Property-Type-Registry mitliefern, sodass die Engine nicht raten muss.
- R2.2 Die Ausdrucks-Engine MUSS den gelieferten Typ nutzen statt der `LIST_KEYS`-Heuristik;
  die Heuristik bleibt nur als Fallback, wenn keine Typ-Info vorliegt.
- R2.3 Bestehende Welcome-Vault-Bases und Fixtures MÜSSEN unverändert korrekt bleiben
  (Regressionsschutz).
- R2.4 Tests: 1-elementige Liste bleibt Liste, Skalar bleibt Skalar, über Filter UND Formel.

### R3 — `summaries`-Aggregation (ehem. Lücke 1) — nach R1/R2

**User Story:** Als Nutzer möchte ich eine Zusammenfassungszeile pro Spalte (Summe, Anzahl,
Durchschnitt, Min/Max), damit meine Base wie eine Tabelle/Datenbank zusammenfasst.

Ist-Zustand: `summaries` wird geparst und per Round-Trip erhalten (`parser.ts`/`serializer.ts`),
aber **nicht ausgewertet/gerendert**.

- R3.1 Die Engine MUSS die in echten `.base`-Dateien gängigen Aggregationen über die (nach R1
  vollständige, nach R2 korrekt typisierte) Zeilenmenge berechnen: mindestens Count, Sum,
  Average, Min, Max; genaue Liste gegen die Obsidian-Syntax-Referenz.
- R3.2 Die Tabellen-View MUSS eine Zusammenfassungszeile rendern; die Karten-/Kanban-View
  nach Design (optional pro Spalte/Gruppe).
- R3.3 Aggregation läuft auf derselben geteilten Engine (`shared-contracts/`), damit MCP
  `query_base` dieselben Summen liefern kann (Design entscheidet, ob `query_base` sie ausgibt).
- R3.4 Nicht-aggregierbare Spalten (Text ohne numerischen Sinn) ergeben einen leeren/sinnvollen
  Zusammenfassungswert, keinen Fehler.
- R3.5 Tests pro Aggregat inkl. leerer Menge und gemischter Typen.

### R4 — `file.size` (Teil der ehem. Lücke 2) — nach R3

**User Story:** Als Nutzer möchte ich auf die Dateigröße filtern/anzeigen können.

Ist-Zustand: `base-eval.ts` kennt im `file.*`-Zweig nur
`name/basename/path/tags/links/folder/ctime/mtime/ext`; `file.size` und `file.backlinks`
liefern `null`. **Korrektur zur ersten Fassung:** Der Link-Index hält den vollen Backlink-Graph
bereits (`link-index-service.ts` Reverse-Map `backlinks: Map<string, Set<string>>` +
`getBacklinks(filePath)` an Zeile 382) — `file.backlinks` braucht KEINEN Graph-Neubau, nur
Durchreichen in die Query-Row und die Engine, analog zu `file.tags`/`file.links`.

- R4.1 Der Link-Index/die Query-Route SOLL die Dateigröße (Bytes) mitliefern (der
  Verzeichnis-Scan ruft ohnehin `fs.stat()` — vgl. `ctime`/`mtime`-Muster in den Lessons).
- R4.2 Die Engine MUSS `file.size` als Zahl auflösen (Filter, Formel, Anzeige).
- R4.3 Die Query-Route SOLL die Backlink-Pfade pro Zeile aus `getBacklinks()` mitliefern; die
  Engine MUSS `file.backlinks` als Liste auflösen (Filter per `file.backlinks.length`,
  `.contains(...)`, Anzeige). Keine neue Graph-Infrastruktur — nur Durchreichen.
- R4.4 `file.embeds` ist OPTIONAL in dieser Spec: Embeds (`![[…]]`) werden heute als normale
  Forward-Links indiziert, nicht separat markiert. Wenn das Design zeigt, dass die
  Embed-Teilmenge mit vertretbarem Aufwand getrennt erfasst werden kann (Markierung beim
  Index-Aufbau), MUSS `file.embeds` mit umgesetzt werden; andernfalls bleibt es dokumentiert
  offen (kein Graph-Problem, nur eine fehlende Teilmengen-Markierung).
- R4.5 Tests für `file.size` und `file.backlinks` in Filter und Formel; `file.embeds` falls
  umgesetzt.

### R5 — `bases:insert` / `bases:add-item` (ehem. Lücke 6) — nach R4

**User Story:** Als Nutzer möchte ich eine Base in eine Notiz einbetten und direkt aus der View
eine neue Zeile/Notiz anlegen.

- R5.1 `bases:insert`: Eine `.base`-Einbettung in Markdown (`![[datei.base]]`), die in Live
  Preview UND Reading View die (Tabellen-)View rendert. Design klärt Umfang (nur Tabelle zuerst?).
- R5.2 `bases:add-item`: Ein Befehl/Button in der View, der eine neue Notiz im Base-Scope
  anlegt (Zielordner + Frontmatter aus der Base-Definition abgeleitet) und sofort als Zeile
  erscheinen lässt.
- R5.3 Beide als Command-Palette-Befehle (deutsche Labels), hinter dem `bases`-Toggle.
- R5.4 Tests für Einbettungs-Rendering und Notiz-Anlage.

> **Nachtrag (Inline-Codeblock):** `bases:insert` fügt inzwischen einen ```` ```base ````-Block mit Tabellen-Gerüst
> ein (wie Obsidian), statt auf das `![[datei.base]]`-Embed zu verweisen. Der Block trägt das YAML
> der Base direkt in der Notiz und rendert in Live Preview und Reading View dieselbe read-only Tabelle;
> das Datei-Embed bleibt unverändert. Auf einer öffentlichen Freigabe bleibt der Block Code.

### R6 — Formelspalten sortierbar (ehem. Lücke 5) — ZULETZT

**User Story:** Als Nutzer möchte ich nach einer Formelspalte sortieren.

Ist-Zustand: `buildQuerySpec` filtert Formelschlüssel aus der Sortierung
(`.filter((s) => !formulaKeys.has(s.column))`); nur Properties + `file.name/ctime/mtime`
sind sortierbar.

- R6.1 Die Tabellen-View MUSS clientseitig nach einer Formelspalte sortieren können (die
  Formelwerte liegen nach Auswertung ohnehin vor), stabil bei Gleichstand.
- R6.2 Die Sortierwahl wird wie bei Property-Sortierung in die `.base`-Datei zurückgeschrieben.
- R6.3 Formelspalten bleiben read-only (keine Zell-Bearbeitung — berechnete Werte).
- R6.4 Tests für Formel-Sortierung auf- und absteigend.

### R7 — Welcome-Vault: alle Bases-Features mit Live-Beispielen

**User Story:** Als neuer Nutzer möchte ich im Tutorial-Vault jedes Bases-Feature erklärt und
an einem funktionierenden Beispiel sehen.

Ist-Zustand: Je ein Beispiel pro Sprache
(`welcome-vault/Features/Beispiel-Aufgaben (Base).base`,
`welcome-vault-en/Features/Example Tasks (Base).base`) plus Feature-Guide.

- R7.1 Der Bases-Guide (DE + EN) MUSS **alle** ausgelieferten Bases-Features erklären: Filter
  (AND/OR/NOT, Ausdruckssprache), Formelspalten, Tabellen- UND Karten-/Kanban-View, `groupBy`,
  Sortierung (inkl. der neuen Formel-Sortierung aus R6), `summaries` (R3), `file.*`-Felder
  inkl. `file.size` (R4), Einbettung (R5), sowie die bewusst offenen Grenzen (Lambdas,
  `backlinks`/`embeds`, Plugin-Views browser-only).
- R7.2 Jedes erklärte Feature MUSS ein **lauffähiges** Beispiel haben: Beispielnotizen mit
  Frontmatter + mindestens eine Beispiel-`.base`, die Filter, Formel, Gruppierung, `summaries`
  und beide View-Typen demonstriert. Beispiele müssen gegen die aktuelle Engine tatsächlich
  rendern (nicht nur beschrieben).
- R7.3 Struktur wie die übrigen Feature-Guides (Kurzbeschreibung, Schritt-für-Schritt,
  Beispiel, Tipps, Übung, verwandte Features).
- R7.4 Die Features-Übersicht (DE `Features/Übersicht.md`, EN `Features/Overview.md`) MUSS die
  Beispiele verlinken; jeder neue Wikilink gegen `git ls-files` verifiziert (keine toten Links).
- R7.5 `_meta.md` (DE + EN) Version + `updated`-Datum anheben.
- R7.6 Alle Beispiel-`.base`-Dateien im echten Obsidian-Format (kein Alt-Schema).

### R8 — Doku & Qualität (querschnittlich)

- R8.1 Nach jedem Teilschritt die passenden Vor-Push-Checks grün (tsc backend, build frontend,
  `test:coverage` beide Packages, eslint 0 Errors).
- R8.2 `shared-contracts/` nach Änderung bauen + in Backend UND Frontend `npm install`
  (file:-Kopie, kein Symlink).
- R8.3 Steering nachziehen: `product.md` (Bases-Grenzen aktualisieren),
  `implementation-plan.md` (erledigte Reste streichen), ggf. `lessons-learned.md`.
- R8.4 Pro Lücke ein eigener Branch + PR gegen `master`, einzeln reviewbar; Release-Please-PRs
  bleiben unberührt (nicht ohne ausdrückliches OK mergen).

## Out of Scope

- Lambda-`map`/`filter` über Listen in der Ausdruckssprache (eigenes späteres Thema).
- `file.embeds` nur, falls das Design keine günstige Embed-Teilmengen-Markierung findet (R4.4);
  `file.backlinks` ist in Scope (R4.3 — Daten liegen im Reverse-Index vor).
- Plugin-Bases-Views serverseitig (`registerBasesView()` bleibt browser-only — braucht
  Server-Side Plugins, Prio 5).
- Vollständige Obsidian-Funktionsbibliothek 1:1.
