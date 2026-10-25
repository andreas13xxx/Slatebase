# Bases Feature-Vervollständigung — Tasks

Reihenfolge bindend: R1 → R2 → R3 → R4 → R5 → R6 → R7. **Ein einziger Branch `bases-completion`**
für das gesamte Vorhaben; die Schritte sind die Commit-Reihenfolge darauf, kein eigener Branch/PR
je Schritt. Ein PR gegen `master` am Ende (oder zwischendurch, wenn der Zwischenstand sauber ist).
Nach jedem `shared-contracts/`-Edit: dort `npm run build`, dann `npm install` in Backend UND
Frontend. Vor jedem Commit, der gepusht werden soll: tsc backend, build frontend, `test:coverage`
beide, eslint 0 Errors.

## R1 — Kandidaten-Obergrenze

- [ ] 1.1 Prädikat-Extraktion aus dem Ausdrucks-AST (`formula/evaluator.ts`): aus einem Filter-
  Ausdruck die konservativ serverseitig prüfbaren Prädikate ziehen (Property eq/exists,
  `file.hasTag`, `file.inFolder`, Pfad). Nur sicher-ausschließende Prädikate.
- [ ] 1.2 `buildPrefilterNode` in `base-eval.ts`: die extrahierten Prädikate in einen
  `BaseQueryNode` übersetzen; `buildQuerySpec` hängt ihn an die Backend-Spec (`spec.filters`).
- [ ] 1.3 `queryForBase`: `MAX_ROWS` → konfigurierbar (Server-Config, Default 5000), Response um
  `truncated: boolean` erweitern (Vorfilter läuft vor der Kappung — ist bereits so).
- [ ] 1.4 `basesRoutes.ts` + `query-base-tool.ts`: `truncated` durchreichen; MCP-Tool im
  Ergebnistext signalisieren.
- [ ] 1.5 `query-engine.ts` + `BasesView.tsx`: sichtbarer „Ergebnis gekappt"-Hinweis bei
  `truncated`.
- [ ] 1.6 Tests: >MAX_ROWS passende Zeilen (vorher verloren), Vorfilter korrekt (keine
  Falsch-Ausschlüsse), `truncated`-Flag, MCP-Pfad. fast-check für die Prädikat-Extraktion
  (Pushdown darf nie eine Zeile ausschließen, die der volle Filter behalten würde).

## R2 — Property-Typ Einzelwert/Liste

- [ ] 2.1 Query-Route: pro Antwort die Listen-Keys/Property-Typen aus der Property-Type-Registry
  mitliefern (Fallback: keine → Heuristik).
- [ ] 2.2 `BaseQueryResultWire` um `listKeys`/`types` erweitern (`types.ts`), durchreichen.
- [ ] 2.3 `toExprValue` (`base-eval.ts`): gelieferte Typ-Info nutzen, `LIST_KEYS` nur als Fallback.
- [ ] 2.4 Tests: 1-elementige Liste bleibt Liste (typisiert), Skalar bleibt Skalar, über Filter
  UND Formel; untypisierter Vault unverändert (Regression).

## R3 — `summaries`-Aggregation

- [ ] 3.1 `shared-contracts/src/bases/summaries.ts`: `computeSummaries(rows, view, doc)` mit
  count/sum/average/min/max (+ empty/filled); nicht-numerisch → leer, kein Fehler. Export in
  `index.ts`.
- [ ] 3.2 `BasesTableView.tsx`: Summary-Zeile unter dem Body.
- [ ] 3.3 `BasesKanbanView.tsx`: Gesamt-Summary im Header (Gruppen-Summary als markierter
  Folgeausbau, falls Aufwand).
- [ ] 3.4 `query-base-tool.ts`: Summaries ins MCP-Ergebnis.
- [ ] 3.5 Tests pro Aggregat inkl. leerer Menge + gemischter Typen; Round-Trip bleibt grün.

## R4 — `file.size` + `file.backlinks`

- [ ] 4.1 `file.size`: aus dem `fs.stat()`-Ergebnis des Verzeichnis-Scans in die Wire-Row;
  `base-eval.ts` `file.*`-Zweig löst es als Zahl auf.
- [ ] 4.2 `file.backlinks`: `buildBaseRow` nimmt `getBacklinks()`-Pfade mit; `base-eval.ts` löst
  als Liste auf (`.length`, `.contains`).
- [ ] 4.3 `file.embeds` (optional): prüfen, ob der Embed-Parser die Teilmenge günstig markieren
  kann; umsetzen oder dokumentiert offen lassen.
  → ENTSCHEIDUNG: dokumentiert OFFEN gelassen. Der Backend-`extractWikilinks`-Parser erfasst
  `[[...]]` und `![[...]]` NICHT getrennt (das führende `!` wird nicht als Embed-Marker geführt),
  und `forwardLinks` ist eine reine Ziel-Menge ohne Embed-/Link-Unterscheidung. `file.embeds`
  bräuchte eine neue Index-Map + Parser-Änderung + v2→v3-Persistenz-Migration + Rebuild/Rename-
  Pfade — kein Graph-Problem, aber über „günstig" hinaus. Daher aus R4 ausgeklammert; `file.size`
  und `file.backlinks` sind umgesetzt.
- [ ] 4.4 Tests: `file.size` + `file.backlinks` in Filter und Formel; `file.embeds` falls
  umgesetzt.

## R5 — `bases:insert` / `bases:add-item`

- [ ] 5.1 `.base` als Embed-Typ in `plugins/embed/syntax.ts detectEmbedType`.
- [ ] 5.2 Live-Preview-Widget (`widget-decorations.ts`) + Reading View (`ViewMode.tsx`) rendern
  eine read-only Tabellen-View der eingebetteten Base.
- [ ] 5.3 `bases:add-item`: neue Notiz im Base-Scope (Ordner aus `file.inFolder`-Filter, sonst
  Root; Frontmatter-Keys aus angezeigten Properties leer vorbelegt) via `saveFile` + unique-name.
- [ ] 5.4 Beide Command-Palette-Befehle, deutsche Labels, hinter `bases`-Toggle.
- [ ] 5.5 Tests: Embed-Rendering (Live Preview + Reading), Notiz-Anlage inkl. Scope-Ableitung.
- Nachtrag: `bases:insert` fügt einen Inline-```` ```base ````-Block ein (`BasesEmbed` mit `source`,
  `InlineBaseWidget`, `ViewMode` `case 'code'`) — siehe Nachtrag in `design.md`.

## R6 — Formelspalten sortierbar

- [ ] 6.1 `BasesTableView.tsx`: Klick auf Formel-Spaltenkopf sortiert clientseitig über die
  berechneten Werte (stabil bei Gleichstand), auf/absteigend.
- [ ] 6.2 Sortierwahl in die `.base` zurückschreiben; `BasesView` erkennt beim Laden eine
  Formel-Sortierung und wendet sie clientseitig an.
- [ ] 6.3 Tests: Formel-Sortierung auf-/absteigend, Rückschreiben, Reload.

## R7 — Welcome-Vaults

- [ ] 7.1 Beispiel-Notizen DE + EN mit reichem Frontmatter (Status, Priorität, Deadline, Tags,
  Zahlenfeld).
- [ ] 7.2 Je Sprache ≥2 Beispiel-`.base` (Tabelle mit Filter/Formel/summaries/file.size/
  file.backlinks; Karten/Kanban mit `groupBy`), echtes Obsidian-Format, gegen die Engine
  tatsächlich rendernd.
- [ ] 7.3 `Features/Bases.md` DE/EN: jedes Feature mit Verweis auf die Beispiele; Grenzen benannt.
- [ ] 7.4 `Features/Übersicht.md` / `Overview.md` verlinken; jeder Wikilink gegen `git ls-files`
  verifiziert.
- [ ] 7.5 `_meta.md` DE + EN Version + `updated` anheben.

## R8 — Querschnitt (pro PR mitlaufend)

- [ ] 8.1 Steering nachziehen: `product.md` Bases-Grenzen aktualisieren, `implementation-plan.md`
  erledigte Reste streichen, ggf. `lessons-learned.md`.
- [ ] 8.2 Alles auf einem Branch `bases-completion`; ein PR gegen `master` (Schritte als Commits,
  einzeln reviewbar über die Commit-Historie). Release-Please-PRs unberührt lassen.
