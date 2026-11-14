# Bases — Objekt-Typ — Design

## Ausgangslage (Code, 2026-11-14)

- `FormulaValue` (`shared-contracts/src/bases/formula/functions.ts`) = `string | number | boolean | Date | FormulaValue[] | LinkValue | RegexValue | null`.
  Link und Regex tragen ein `kind`-Feld; `isLink`/`isRegex` unterscheiden sie von Datum und Liste.
- `evaluator.ts`: `member` ruft `memberOf(value, property)`, `index` hat einen Sonderfall für `note[...]`/`file[...]`/`formula[...]` und
  sonst Listen-Indizierung. `method` hat einen Sonderfall für `file.<prädikat>()`.
- `methods.ts`: `typeName()` und `universalMethods` (`isEmpty`, `isTruthy`, `isType`, `toString`).
- Properties einer Zeile: `BaseRow.values` (flache `string[]` je Schlüssel + `file.*`), `listKeys` für die Listen-Erkennung.
- Der Link-Index hält Properties flach (`extractProperties`, Regex, nur Skalare und Listen).

## Entscheidungen

| Frage | Entscheidung | Grund |
|-------|--------------|-------|
| Darstellung | `interface ObjectValue { readonly kind: 'object'; readonly entries: ReadonlyMap<string, FormulaValue> }` | Gleiche `kind`-Konvention wie Link/Regex; `Map` statt Objekt schließt Prototyp-Probleme (`__proto__`) aus und hält die Einfügereihenfolge. |
| Erzeugung | Nur intern: `file.properties`, `this.file.properties` | Obsidian dokumentiert weder Literal noch `object()`; nichts erfinden. |
| Verschachtelte YAML-Maps | Nicht in dieser Spec | Doku schweigt; der Index ist flach. Erst an echtem Obsidian prüfen, siehe Offene Fragen. |
| `file.properties`-Inhalt | Alle Properties der Notiz, Werte wie `note.<key>` (Skalar/Liste-Erkennung) | Ein Objekt, das etwas anderes zeigt als `note.x`, wäre überraschend. |
| Textform | Kompaktes JSON, Schlüssel in Einfügereihenfolge | Eindeutig, testbar; Obsidians Format ist unbekannt (als Slatebase-Wahl dokumentieren). |
| Gleichheit | Strukturell | Sonst wäre `a.properties == b.properties` immer falsch; Doku schweigt. |
| Fehlende Methode | Sichtbarer Auswertungsfehler | Ein stilles `null` wäre von „Property fehlt“ nicht zu unterscheiden. |

## Änderungen

### shared-contracts (`bases/formula/`)
- `functions.ts`: `ObjectValue`, `isObject()`, `FormulaValue` erweitern; `stringify()` (JSON-Form), `isTruthy()` (≥ 1 Eintrag),
  Vergleich/Gleichheit (strukturell, tief; Tiefengrenze 16 gegen Zyklen/Tiefe).
- `methods.ts`: `typeName` → `'object'`; Methodentabelle `objectMethods` (`keys`, `values`, `isEmpty`) vor den universellen; ein Objekt
  ohne passende Methode → Fehler `Unknown method: <name> on object`.
- `evaluator.ts`: `memberOf` kann Objekte (`entries.get(key) ?? null`); `index` mit String auf Objekt; `collectRefs` meldet, wenn ein
  Ausdruck `file.properties`/`this.file.properties` nutzt, damit die Abfrage alle Properties anfordert (siehe unten).
- `base-eval.ts`: `resolve('file.properties')` baut das Objekt aus `row.values` (ohne die `file.*`-Schlüssel); `resolveThis` ebenso für
  `this.file.properties`. Objektgröße begrenzt (z. B. 200 Einträge, Werte gekürzt) → danach Fehlerwert.

### Abfrage (`buildQuerySpec`, Backend `queryForBase`)
- Neues optionales Feld `allProperties: true` in `BaseQuerySpecWire`/`BaseQuerySpec`, gesetzt von `buildQuerySpec`, wenn ein Ausdruck
  `file.properties` referenziert. Der Index liefert dann je Zeile alle Properties statt nur der angeforderten Spalten.
- Grenzen: max. 200 Properties je Zeile, die bestehende Kandidatenobergrenze (5000 Zeilen) bleibt; ist die Antwort zu groß, wird `truncated`
  gesetzt wie bei der Zeilenkappung. Der MCP-Pfad nutzt dieselbe Spec (`toIndexSpec` in `query-base-tool.ts`).

### Frontend
- Zelltext: Tabelle/Karten/Liste/Kanban zeigen die Textform (die Anzeige läuft über `formatFormulaValue`, kein neuer Renderer).
- Keine Toolbar-Änderung; Formeln mit Objekten sind in der Quelltext-Ansicht bearbeitbar wie alle anderen.

## Tests
- `evaluator.test.ts`/neues `object.test.ts`: Zugriff (Punkt, Klammer, verschachtelt, fehlend), `keys`/`values`/`isEmpty`/`isTruthy`/`isType`/`toString`,
  Gleichheit, Fehler bei unbekannter Methode, Schlüssel `__proto__`/`constructor`, Tiefen-/Größengrenze.
- `base-eval.test.ts`: `file.properties` aus einer Zeile, `this.file.properties`, Listen-Erkennung wie `note.x`.
- `parity.test.ts`: dieselben Ausdrücke Frontend vs. MCP.
- Backend: `queryForBase` mit `allProperties` (Grenzen, nicht angeforderte Properties erscheinen).
- Welcome-Vault `Features/Bases.md` (DE/EN): Abschnitt „Objekte“ mit den dokumentierten Methoden und dem Hinweis auf die Slatebase-Wahl bei der Textform.

## Offene Fragen (vor Phase 3 klären)
1. Wird ein verschachtelter Frontmatter-Schlüssel in Obsidian als Objekt über `note.meta` lesbar? → mit einem echten Obsidian und einer
   Testnotiz prüfen; Ergebnis hier eintragen. Ja → Index-Erweiterung (strukturierte Werte, Migration des Link-Index v2→v3) als eigene Spec.
2. Zeigt Obsidian ein Objekt im Tabellenzelltext als JSON, als `key: value`-Liste oder gar nicht? → Beobachtung eintragen, Textform ggf. angleichen.
3. Reihenfolge von `keys()`/`values()` in Obsidian (Einfüge- oder alphabetische Reihenfolge)?
