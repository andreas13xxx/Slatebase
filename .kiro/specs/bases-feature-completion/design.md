# Bases Feature-Vervollständigung — Design

Baut auf `requirements.md` dieser Spec auf. Reihenfolge: R1 → R2 → R3 → R4 → R5 → R6, dann R7
(Welcome-Vaults), R8 querschnittlich. Jede Lücke ist ein eigener Branch + PR gegen `master`.

## Ist-Architektur (verifiziert)

Zwei Filter-Pfade existieren nebeneinander:

1. **Strukturierter Backend-Filter** (`link-index-service.ts queryForBase` + `basesRoutes.ts`):
   wertet eine `BaseQueryNode`-AND/OR/NOT-Baumstruktur (`{property, op, value}` /
   `{tag}` / `{path}` / `{file}`) serverseitig aus, sortiert, kappt mit
   `limit`/`MAX_ROWS = 1000`.
2. **Clientseitiger Ausdrucks-Filter** (`shared-contracts/.../base-eval.ts`): `buildQuerySpec`
   baut die Backend-Spec, schickt aber **nur Spalten + Sort**, KEINE Filter. `filterRows`
   wertet die reichhaltige Ausdruckssprache (`'status != "done"'`, Methoden, `file.hasTag`)
   erst auf den gelieferten Zeilen aus.

**Kernproblem für R1:** Weil `buildQuerySpec` keine Filter ans Backend gibt, liefert
`queryForBase` bis zu 1000 **ungefilterte** Kandidaten; passt der Treffer nicht in die ersten
1000 Kandidaten der Index-Iteration, sieht `filterRows` ihn nie. Der strukturierte Backend-Pfad
wird vom Frontend derzeit gar nicht genutzt — er ist der Rest der Vor-Ausdruckssprache-Version.

## R1 — Kandidaten-Obergrenze beheben

**Gewählter Ansatz: serverseitige Vorfilterung der billig prüfbaren Prädikate + sichtbare
Kappung als Fallback.** Begründung gegen die Alternativen:

- Voller Filter-Pushdown (ganze Ausdruckssprache ins Backend) würde die Engine duplizieren —
  genau das, was `shared-contracts/` vermeiden soll. Verworfen.
- Reines Streaming aller Kandidaten an den Client skaliert nicht (ein großer Vault hat zehntausende
  Notizen; alle Zeilen inkl. aller Spaltenwerte zu serialisieren ist teuer). Verworfen als
  Default.

Design:
1. `collectExpressionRefs` liefert bereits die referenzierten Properties. Erweitern: aus einem
   Filter-Ausdruck die **billig serverseitig prüfbaren** Prädikate extrahieren — Property-
   Existenz/Gleichheit, `file.hasTag`, `file.inFolder`, Pfad-Glob — und als `BaseQueryNode` in
   die Backend-Spec übersetzen (`buildQuerySpec` → `buildPrefilterNode`). Diese Vorfilterung ist
   **konservativ**: nur Prädikate, die eine Zeile sicher ausschließen, werden gepusht; alles
   andere bleibt dem Client-`filterRows` überlassen (das weiterhin die volle Semantik anwendet).
2. `queryForBase` wendet den gepushten Vorfilter an, BEVOR `MAX_ROWS` greift — die 1000 sind dann
   1000 *vorgefilterte* Kandidaten, nicht 1000 beliebige.
3. `MAX_ROWS` bleibt als Schutz gegen Pathologien, wird aber auf einen höheren, konfigurierbaren
   Wert angehoben (Vorschlag: 5000, via Server-Config), und die Response trägt ein
   `truncated: boolean` + `total`-Feld. `filterRows`/die View zeigen bei `truncated` einen
   sichtbaren Hinweis („Ergebnis gekappt — Filter verfeinern").
4. Identisch für MCP `query-base-tool.ts` (`MAX_LIMIT`): dieselbe `truncated`-Signalisierung im
   Tool-Ergebnistext.

Risiko: Ein Ausdruck ohne jedes serverseitig prüfbare Prädikat (reine Formel-Vergleiche) kann
weiterhin kappen — dann greift der sichtbare Hinweis (R1.2). Das ist der ehrliche Rest, besser
als stilles Abschneiden.

Dateien: `shared-contracts/src/bases/base-eval.ts` (buildPrefilterNode), `formula/evaluator.ts`
(Prädikat-Extraktion aus dem AST), `backend/src/link-index/link-index-service.ts` (MAX_ROWS +
truncated), `backend/src/api/basesRoutes.ts` + `mcp/query-base-tool.ts` (truncated durchreichen),
`frontend/src/bases/query-engine.ts` + `components/bases/BasesView.tsx` (Hinweis-UI).

## R2 — Property-Typ Einzelwert vs. Liste

1. Die Query-Route liefert pro Property mit, ob der Index sie als Liste oder Skalar führt. Zwei
   mögliche Quellen: (a) die Property-Type-Registry (`.slatebase/property-types.json`, falls der
   Key dort einen `list`/`tags`-Typ hat), (b) die rohe Frontmatter-Form. Design-Entscheidung:
   **Registry zuerst, Fallback auf die bestehende `LIST_KEYS`-Heuristik** — kein Zwang, jede
   Property zu typisieren.
2. `BaseQueryRowWire` bekommt ein optionales `listKeys: string[]` (oder ein `types`-Map) pro
   Antwort (nicht pro Zeile — der Typ ist vault-weit). `toExprValue` nutzt es statt der statischen
   `LIST_KEYS`.
3. Fallback bleibt die Heuristik, damit untypisierte Vaults sich nicht verschlechtern (R2.3).

Dateien: `backend/src/link-index/link-index-service.ts` (Typ-Info in die Query-Row),
`backend/src/api/basesRoutes.ts` (durchreichen), `shared-contracts/src/bases/base-eval.ts`
(`toExprValue` typgesteuert), `types.ts` (Wire-Typ erweitern).

## R3 — `summaries`-Aggregation

1. `summaries` ist bereits in `types.ts` modelliert und wird geparst. Neue reine Funktion in
   `shared-contracts/src/bases/`: `computeSummaries(rows, view, doc)` → pro Spalte ein
   aggregierter Wert. Aggregate: `count`, `sum`, `average`, `min`, `max` (+ ggf. `empty`/`filled`
   wie Obsidian). Läuft auf der nach R1 vollständigen, nach R2 typisierten Zeilenmenge.
2. Nicht-numerische Spalten: `count`/`empty`/`filled` sinnvoll, `sum`/`average` → leer (kein
   Fehler, R3.4).
3. Tabellen-View (`BasesTableView.tsx`): eine Summary-Zeile unterhalb des Bodys. Karten-/
   Kanban-View: optional pro Gruppe (Design: zunächst nur Gesamt-Summary im Header, Gruppen-
   Summaries als Folgeausbau markieren falls Aufwand).
4. MCP `query_base`: Summaries in das Ergebnis aufnehmen (R3.3), damit AI-Konsumenten sie sehen.

Dateien: `shared-contracts/src/bases/summaries.ts` (neu) + `index.ts`-Export,
`frontend/src/components/bases/BasesTableView.tsx` + `BasesKanbanView.tsx`,
`backend/src/mcp/query-base-tool.ts`.

## R4 — `file.size` + `file.backlinks` (+ optional `file.embeds`)

1. **`file.size`**: Der Verzeichnis-Scan in `backend/src/vault/index.ts` ruft bereits `fs.stat()`
   und nimmt `size` mit (vgl. Lessons zu `ctime`/`mtime`). `queryForBase`/`buildBaseRow` reichen
   `file.size` in die Wire-Row; `base-eval.ts` löst es im `file.*`-Zweig als Zahl auf.
2. **`file.backlinks`**: `getBacklinks(filePath)` (`link-index-service.ts:382`, Reverse-Map liegt
   vor). `buildBaseRow` nimmt die Backlink-Pfade mit; `base-eval.ts` löst `file.backlinks` als
   Liste auf (`.length`, `.contains(...)`). Kein Graph-Neubau.
3. **`file.embeds`** (optional, R4.4): Embeds werden heute nicht getrennt von Wikilinks geführt.
   Umsetzung nur, wenn der Index-Aufbau (`updateFileCache`/der Wikilink-Parser) die Embed-
   Teilmenge mit vertretbarem Aufwand markieren kann (der Embed-Parser kennt `![[…]]` bereits).
   Entscheidung im Zuge der Implementierung; sonst dokumentiert offen.

Dateien: `backend/src/vault/index.ts` (size durchreichen, falls noch nicht in der Row),
`backend/src/link-index/link-index-service.ts` (`buildBaseRow` + Wire-Typ),
`shared-contracts/src/bases/base-eval.ts` (`file.*`-Zweig), `types.ts`.

## R5 — `bases:insert` / `bases:add-item`

1. **`bases:insert`**: `![[datei.base]]` als Embed. Der Embed-Erkenner
   (`plugins/embed/syntax.ts detectEmbedType`) muss `.base` als neuen Embed-Typ kennen; Live
   Preview (`widget-decorations.ts`) und Reading View (`ViewMode.tsx`) rendern eine kompakte
   Tabellen-View (read-only Variante der `BasesTableView`). Scope: nur Tabelle zuerst.
2. **`bases:add-item`**: Button/Command in `BasesView`, der eine neue Notiz anlegt. Zielordner +
   Default-Frontmatter aus der Base-Definition ableiten (die Filter nennen Properties/Werte, die
   die neue Notiz erfüllen sollte — pragmatisch: Ordner aus einem `file.inFolder`-Filter, sonst
   Vault-Root; Frontmatter-Keys aus den angezeigten Properties leer vorbelegt). Anlage über
   `IVaultService.saveFile` + unique-filename; sofortiger `vault:change` lässt die Zeile
   erscheinen.
3. Beide als Command-Palette-Befehle mit deutschen Labels, hinter `bases`-Toggle.

Dateien: `frontend/src/plugins/embed/syntax.ts`, `editor/live-preview/widget-decorations.ts`,
`components/ViewMode.tsx`, `components/bases/BasesView.tsx`, `plugins/compat/core-commands-app.ts`
(Command-Registrierung).

## R6 — Formelspalten sortierbar

1. Formelwerte liegen nach `evaluateFormulaColumn` ohnehin vor. `BasesTableView` sortiert bei
   Klick auf einen Formel-Spaltenkopf **clientseitig** über die berechneten Werte (stabil bei
   Gleichstand). Der Server-Sort bleibt für Properties; eine Formel-Sortierung wird nicht an die
   Backend-Spec gegeben (bleibt aus `buildQuerySpec` ausgefiltert), sondern nach dem Laden
   angewandt.
2. Die Sortierwahl (inkl. Formelspalte) wird wie bisher in die `.base`-Datei zurückgeschrieben;
   `BasesView` erkennt beim Laden eine Formel-Sortierung und wendet sie clientseitig an.

Dateien: `frontend/src/components/bases/BasesTableView.tsx`, `BasesView.tsx`.

## R7 — Welcome-Vaults

1. Beispiel-Notizen (DE + EN) mit reichem Frontmatter (Status, Priorität, Deadline, Tags,
   Zahlenfeld für `summaries`), damit Filter/Formel/Gruppierung/Aggregation echt etwas zeigen.
2. Mindestens zwei Beispiel-`.base` je Sprache: eine Tabelle (Filter + Formel + `summaries` +
   `file.size`/`file.backlinks`) und eine Karten-/Kanban-Base (`groupBy`). Echtes Obsidian-Format.
3. Guide (`Features/Bases.md` DE/EN, Struktur wie übrige Guides) erklärt jedes Feature mit Verweis
   auf die lauffähigen Beispiele; Grenzen (Lambdas, embeds falls offen, Plugin-Views browser-only)
   benannt.
4. `Features/Übersicht.md` / `Overview.md` verlinken; jeder Wikilink gegen `git ls-files`
   verifiziert. `_meta.md` Version + `updated` anheben.

## R8 — Querschnitt

- `shared-contracts/` nach jeder Änderung: `npm run build` dort, dann `npm install` in Backend UND
  Frontend (file:-Kopie).
- Vor-Push: tsc backend, build frontend, `test:coverage` beide, eslint 0 Errors — pro PR.
- Steering nachziehen (`product.md` Bases-Grenzen, `implementation-plan.md` Reste streichen).
- Release-Please-PRs nicht ohne OK mergen.
