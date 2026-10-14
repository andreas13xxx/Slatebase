# Bases Expression Language — Design

## Leitidee

Eine gemeinsame Ausdrucks-Engine für Filter UND Formeln, aufgebaut auf dem bestehenden
`frontend/src/bases/formula/` (Tokenizer → Pratt-Parser → Evaluator). Der Parser (`parser.ts`)
und Serializer (`serializer.ts`) für `.base`-Dateien werden auf das echte Obsidian-Format
umgestellt. Alles frontend-seitig; das Backend bleibt (Query-Route liefert Zeilen+Werte), die
Filterung geschieht clientseitig über die Engine (siehe R2 unten).

## Komponenten

### 1. Ausdrucks-Engine (`frontend/src/bases/expr/`)

Neues Unterverzeichnis, in das der bestehende `formula/`-Code hineinwächst (umbenannt/erweitert,
nicht dupliziert). Struktur analog zu `formula/`:

- `tokenizer.ts` — erweitert um: `&&` `||` `!` `%`, Punkt (`.`) für Member-/Methodenzugriff,
  eckige Klammern (`[` `]`), Durations als Teil von String-Literalen (keine eigene Token-Klasse —
  `"1 week"` ist ein String, die Semantik entsteht im Evaluator bei `date ± string`).
- `parser.ts` (Pratt) — neue Knotentypen: `member` (`a.b`), `index` (`a[b]`), `method`
  (`a.m(args)`), `logical` (`&& || !`). Präzedenz: `||` < `&&` < Vergleich < `+ -` < `* / %` <
  unär < Member/Call/Index.
- `ast.ts` — Knotentypen zentral (bisher inline in `parser.ts`).
- `functions.ts` — erweiterte globale Funktionsliste (siehe unten).
- `methods.ts` — NEU: Methodentabelle pro Werttyp (String/Number/Date/List/Link).
- `evaluator.ts` — erweitert um Member-/Index-/Method-/Logical-Auswertung und Datums-Durationen.
- `values.ts` — Wertmodell: der bestehende `FormulaValue` (`string|number|boolean|Date|null`)
  wird um `list` (`FormulaValue[]`) und `link` (`{ path, display? }`) ergänzt. Mapping auf die
  bereits existierende Bases-`Value`-Hierarchie (`bases-values.ts` im compat-Layer) prüfen und
  wo sinnvoll wiederverwenden — NICHT zwei Wertmodelle pflegen.

Pragmatische Funktionsliste (R1/Nicht-Ziel „nicht 1:1"):
- global: `if`, `concat`, `now`, `today`, `date`, `number`, `link`, `list`, `min`, `max`, `max`.
- String-Methoden: `.toFixed(n)`? (number), `.contains(s)`, `.startsWith`, `.endsWith`, `.lower`,
  `.upper`, `.replace`, `.split`, `.length` (als Methode UND Property).
- Number-Methoden: `.toFixed(n)`, `.round(n)`, `.abs`.
- Date-Methoden/-Fields: `.format(fmt)` (moment ist bereits Dependency), `.date()`, `.time()`,
  `.year`/`.month`/`.day`/`.hour`/`.minute`.
- List-Methoden: `.contains(x)`, `.length`, `[i]`-Index, `.join(sep)`.
- File-Methoden (im Filterkontext): `file.hasTag(t)`, `file.hasLink(x)`, `file.inFolder(p)`,
  `file.ext`, `file.name`, `file.folder`, `file.path`, `file.size`, `file.mtime`, `file.ctime`,
  `file.tags`, `file.links`.

Die Liste ist in der Spec bewusst endlich; der Evaluator meldet eine unbekannte Funktion/Methode
als Fehlerwert (Filter → `false`, Formel → sichtbarer Zellenfehler), nie als Absturz.

### 2. Property-Auflösung (`FormulaContext` erweitern)

Der bestehende `FormulaContext.resolve(name)` bekommt die Präfix-Logik:
- `file.*` → aus den Datei-Metadaten der Zeile (`BaseRow` bekommt `ctime`/`mtime`/`ext`/`folder`/
  `tags`/`links`, teils schon in `BaseQueryRowWire` vorhanden — Lücken im Backend-Query-Result
  nachrüsten, siehe Risiko R2).
- `formula.*` → andere Formel desselben Dokuments (bestehender Pfad, zykelgeschützt).
- `note.*` / ohne Präfix → frontmatter-Wert der Zeile.

### 3. Parser-Umstellung (`parser.ts`)

- Filter: `parseCondition` entfällt. `and`/`or`/`not` sind Listen; jedes Blatt ist entweder ein
  **String** (Ausdruck, bleibt als String im Modell — kompiliert wird lazy im Query-Schritt) oder
  eine verschachtelte Gruppe. `not` wird zu einem eigenen Knoten `{ not: BaseFilterNode[] }`.
- `BaseFilterNode`-Typen in `types.ts` neu: `string | {and:[]} | {or:[]} | {not:[]}`.
  Das alte `BaseFilterCondition` wird entfernt (R4.2 — kein Alt-Schema).
- `groupBy`: Objekt `{ property: string, direction?: 'ASC'|'DESC' }`.
- `summaries`: `Record<string,string>` (Top-Level) und pro View `Record<string, string>`.
- View-`limit`: `number`.
- Serializer spiegelt all das zurück (stabile Key-Reihenfolge wie bisher).

### 4. Query-Engine (`query-engine.ts`) + Filterauswertung

**Entscheidung R2 (Risiko unten):** Filter werden **clientseitig** gegen die vom Backend
gelieferten Zeilen ausgewertet, NICHT in die Backend-Query-Spec übersetzt. Begründung:
- Die Ausdruckssprache ist zu reich (Methoden, Durations, Arithmetik), um sie verlustfrei in die
  heutige strukturierte Backend-Query-Spec zu gießen.
- Das Backend liefert ohnehin schon Property-Werte je Zeile; die Engine filtert dann lokal.
- `buildQuerySpec` fragt weiterhin alle benötigten Spalten an (inkl. der in Filtern referenzierten
  Properties, nicht nur der angezeigten — sonst fehlen Werte zum Filtern).

Trade-off: Bei sehr großen Vaults lädt der Client mehr Zeilen, als er anzeigt. Akzeptabel für die
aktuelle Zielgröße (Bases ist experimentell, cold-default-off); eine serverseitige Vor-Filterung
der billig übersetzbaren Bedingungen (`file.inFolder`, `tag`) kann später als Optimierung dazukommen.

### 5. Welcome-Vault-Migration

Beide `.base`-Dateien auf Obsidian-Format umschreiben, z. B.:
```yaml
filters:
  and:
    - file.inFolder("Features/Beispiel-Aufgaben")
    - 'type == "task"'
formulas:
  days_left: 'date(deadline) - today()'
properties:
  file.name: { displayName: "Aufgabe" }
  formula.days_left: { displayName: "Tage übrig" }
views:
  - type: table
    name: "Offene Aufgaben"
    order: [file.name, status, priority, deadline, formula.days_left]
    sort:
      - { column: "priority", direction: "desc" }
```
(Formel-Spalten in `order`/`properties` tragen das `formula.`-Präfix — das ist der Obsidian-Weg.)

## Risiken

- **R1 — Umfang der Sprache**: „vollständig" ist unendlich. Mitigation: endliche Funktionsliste in
  dieser Spec, Fehlerwert statt Absturz für alles andere, klare Nicht-Ziele.
- **R2 — Filter clientseitig**: mehr geladene Zeilen. Akzeptiert (s. o.), Optimierung später.
- **R3 — `BaseRow` braucht mehr Datei-Felder**: `ctime/mtime/ext/folder/tags/links`. Teils im
  Backend-Query-Result vorhanden; Lücken erfordern eine kleine Backend-Erweiterung
  (`LinkIndexService.queryForBase` + `BaseQueryRowWire`). Als eigene Task geführt.
- **R4 — Wert-Doppelmodell**: `bases-values.ts` (compat) vs. `expr/values.ts`. Vor dem Bau prüfen,
  ob eins für beides taugt. Keine zwei divergierenden Wertmodelle.
- **R5 — moment für `.format()`**: Dependency ist vorhanden (Calendar-Compat). Kein neues Paket.

## Teststrategie

- Tokenizer/Parser/Evaluator-Unit-Tests inkl. Fehlerpfade; fast-check für Operator-Präzedenz
  und Round-Trip (`.pbt.test.ts`).
- Parser/Serializer-Round-Trip gegen ein echtes-Format-Fixture (schließt den „Punkt 5"-
  Verifikationspunkt).
- Query-Engine-Test: Filter-Ausdrücke schränken die Zeilenmenge korrekt ein (and/or/not,
  file.inFolder, Vergleich, Methodenaufruf).
- Bestehende BasesKanban-/BasesView-/BasesTable-Tests müssen grün bleiben (ggf. an das neue
  Filter-/groupBy-Format anpassen).
