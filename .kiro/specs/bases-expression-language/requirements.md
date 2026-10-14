# Bases Expression Language — Requirements

## Kontext

Die bisherige Bases-Implementierung (`.kiro/specs/bases/`, `.kiro/specs/bases-plugin-api/`)
parst `.base`-Dateien gegen ein **selbst erfundenes Schema**, nicht gegen das echte
Obsidian-Format. Ein Abgleich der kanonischen Obsidian-Syntax-Referenz
(https://help.obsidian.md/bases/syntax, geprüft 2026-10-14) gegen `frontend/src/bases/parser.ts`
ergab, dass eine **von Obsidian erzeugte `.base`-Datei bei uns nicht lädt**. Die Kerndivergenz:
Obsidian speichert Filter UND Formeln als **Ausdruck-Strings** einer gemeinsamen kleinen Sprache
(`'status != "done"'`, `price.toFixed(2)`, `file.hasTag("book")`); unser Parser erwartet
strukturierte Objekte (`{property, op, value}`) für Filter und einen 7-Funktionen-Mini-Interpreter
für Formeln.

Diese Spec migriert Slatebase **voll auf das Obsidian-Format**. Zentrale Erkenntnis: Filter und
Formeln teilen in Obsidian dieselbe Ausdruckssprache — also wird EINE gemeinsame Ausdrucks-Engine
gebaut (Tokenizer → Pratt-Parser → Evaluator), die beide bedienen, statt zweier getrennter Lösungen.
Der bestehende `frontend/src/bases/formula/`-Interpreter ist die Keimzelle und wird **erweitert, nicht
ersetzt** — er hat Tokenizer, Pratt-Parser und Baum-Evaluator mit Operatoren/Vergleichen/Arithmetik/
Datums-Logik bereits.

## Divergenz-Tabelle (Ist → Ziel)

| Bereich | Obsidian (Ziel) | Slatebase (Ist) |
|---|---|---|
| Filter-Bedingung | Ausdruck-String: `'status != "done"'`, `file.hasTag("book")` | Objekt `{property, op, value, tag, path, file}` |
| `not` | Gruppen-Operator (Liste), parallel zu `and`/`or` | boolesches Feld auf einer Bedingung |
| `groupBy` | Objekt `{property, direction}` | String |
| `summaries` | Top-Level-Block + pro View | nicht modelliert (landet in `_unknown`) |
| View-`limit` | ganze Zahl | nicht modelliert |
| Property-Präfixe | `note.`, `file.`, `formula.` (ohne Präfix = `note.`) | nur `file.name` als Pseudospalte |
| Sort-Richtung | `ASC`/`DESC` im `groupBy` | `asc`/`desc` |
| Formel-Methoden | `value.toFixed(2)`, `date.format(...)`, `list.contains(...)` | keine Methodenaufrufe |
| Bool-Operatoren | `&&`, `||`, `!` | nur Vergleiche/Arithmetik |

## Nicht-Ziele (bewusst außen vor)

- **Vollständige Obsidian-Funktionsbibliothek** 1:1. Umfang ist „pragmatisch": die in echten
  `.base`-Dateien gängigen Funktionen/Methoden (siehe Design, Funktionsliste), nicht jede exotische.
  Fehlende Funktionen ergeben einen sichtbaren Zellen-/Filter-Fehler, keinen Absturz.
- `map`/`filter`-Lambdas über Listen (Obsidian unterstützt sie; selten in der Praxis). Später.
- `summaries`-**Auswertung** (Aggregationen anzeigen). Diese Spec PARST `summaries` korrekt und
  erhält sie beim Round-Trip, rendert aber noch keine Summenzeile. Reine Parse-/Erhalt-Pflicht.
- Serverseitige Formel-/Filter-Auswertung über das heutige Maß hinaus (Query-Route bleibt wie sie ist,
  sofern die Filter-Übersetzung das zulässt — siehe Design, Risiko R2).
- `this`-Objekt (`this.file.folder` in eingebetteten/Sidebar-Bases). Später.
- `map`-View-Typ (braucht das Maps-Plugin).

## Anforderungen

### R1 — Gemeinsame Ausdruckssprache
Eine Engine parst und wertet Obsidian-Bases-Ausdrücke aus, genutzt von Filtern UND Formeln.
- R1.1 Primitive: Strings (`"…"`/`'…'`), Zahlen, Booleans, `null`.
- R1.2 Operatoren: Arithmetik `+ - * / %`, Vergleiche `== != < <= > >=`, Boolean `&& || !`, Klammern.
- R1.3 Property-Referenzen mit Präfix: `note.x`/`x` (frontmatter), `file.x` (Datei-Metadaten),
  `formula.x` (andere Formel). Bracket-Zugriff `property["x"]` und `list[0]`.
- R1.4 Funktionsaufrufe `fn(args…)` und Methodenaufrufe `value.method(args…)`.
- R1.5 Datums-Durationen: `date + "1M"`, `now() - "1 week"`; `now()`/`today()`.
- R1.6 Die Engine wirft nie nach außen: ein Fehler wird zu einem sichtbaren Fehler-/Leerwert
  (bestehendes `evaluateFormula`-Verhalten beibehalten) bzw. zu `false` im Filterkontext.

### R2 — Parser auf Obsidian-Format
`frontend/src/bases/parser.ts` liest das echte Format.
- R2.1 Filter: Ausdruck-Strings in `and`/`or`/`not`-Gruppen; `not` als Gruppen-Operator.
- R2.2 `groupBy` als Objekt `{property, direction}` (Richtung case-insensitiv).
- R2.3 `summaries` (Top-Level + View) parsen und per Round-Trip erhalten.
- R2.4 View-`limit` parsen.
- R2.5 Serializer (`serializer.ts`) schreibt alles verlustfrei zurück (Round-Trip-Test).
- R2.6 Forward-Compat (`_unknown`) bleibt erhalten.

### R3 — Query-Engine/Backend-Anbindung
Die Filter-Ausdrücke müssen die Zeilenmenge korrekt einschränken.
- R3.1 Entweder die Ausdrücke clientseitig gegen die gelieferten Zeilen auswerten, ODER sie in die
  bestehende Backend-Query-Spec übersetzen. Design R2 entscheidet; Korrektheit + Tests sind Pflicht.
- R3.2 `file.*`-Bedingungen (`file.inFolder`, `file.hasTag`, `file.ext`, `file.mtime`…) funktionieren.

### R4 — Volle Migration der eigenen `.base`-Dateien
- R4.1 Beide Welcome-Vault-Beispiele (`welcome-vault/…/Beispiel-Aufgaben (Base).base`,
  `welcome-vault-en/…/Example Tasks (Base).base`) auf das Obsidian-Format umschreiben.
- R4.2 KEIN Rückwärts-Kompatibilitäts-Pfad für das alte Objekt-Schema (bewusste Entscheidung des
  Nutzers: „voll migrieren"). Der Parser akzeptiert nur noch das Obsidian-Format; das alte Schema
  erzeugt eine klare Fehlermeldung, keine stille Weiterverarbeitung.

### R5 — Formelspalten editierbar (pragmatisch)
- R5.1 Weiterhin read-only, FALLS der Aufwand den Rahmen sprengt — Formeln sind in Obsidian auch
  berechnete, nicht direkt editierbare Spalten. Diese Anforderung ist OPTIONAL und wird nur
  umgesetzt, wenn R1–R4 stabil sind. (Dokumentiert, damit der ursprüngliche „pragmatisch editierbar"-
  Wunsch nicht verloren geht; realistisch bleibt sie wohl offen.)

### R6 — Doku & Tests
- R6.1 Unit-Tests für Tokenizer/Parser/Evaluator inkl. Fehlerpfade (fast-check wo sinnvoll).
- R6.2 Ein echtes-Format-`.base`-Fixture als Round-Trip- + Query-Test (schließt den ursprünglichen
  „Punkt 5"-Verifikationspunkt).
- R6.3 Steering-Doku (`product.md`, `lessons-learned.md`, `structure.md`) nachziehen.
- R6.4 Alle Vor-Push-Checks grün (tsc, build, test:coverage beide Packages, eslint 0 Errors).

## Vorbedingung

Baut auf der abgeschlossenen Bases-Spec auf (Query-Route, Query-Engine, Formel-Interpreter werden
wiederverwendet/erweitert, nicht neu gebaut). Branch: `bases-v3`.
