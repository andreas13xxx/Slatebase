# Bases — Objekt-Typ — Tasks

Jede Phase wird einzeln grün (tsc, `npm run lint`, betroffene Tests, `npm run build`) committet. Nach Änderungen an `shared-contracts`:
`npm run build` dort, `npm ci --install-links` im Backend (Frontend ist gesymlinkt).

## Phase 0 — Klärung (vor jeder Zeile Code)

- [ ] 0.1 Offene Frage 1 des Designs an einem echten Obsidian prüfen: wird ein verschachtelter Frontmatter-Schlüssel über `note.meta` als Objekt lesbar? Ergebnis in `design.md` eintragen
- [ ] 0.2 Offene Fragen 2 und 3 (Zelltext-Format, Reihenfolge von `keys()`/`values()`) ebenso beobachten und eintragen; Textform und Reihenfolge ggf. angleichen
- [x] 0.3 Prüfen, welche Stellen `FormulaValue` erschöpfend behandeln (`switch`/`typeof`-Ketten in `formatFormulaValue`, Sortierung, Summaries, Zellrenderer) — ein neuer Variantentyp bricht dort sonst erst zur Laufzeit

### Umsetzung Phasen 1 und 2.1 (2026-11-14)

- 0.3: Kein erschöpfender `switch` über `FormulaValue` im Code; `tsc` (shared-contracts, Frontend, Backend) bleibt mit der neuen Variante sauber.
- `ObjectValue` mit `Map` in `formula/functions.ts` (`isObject`, `makeObject`, `objectsEqual`, Tiefengrenze 16); `methods.ts` (`objectMethods`: `keys`/`values`/
  `isEmpty`/`toString`; **kein** Fallback auf Text-/Listenmethoden); `evaluator.ts` (Zugriff per Punkt/Klammer, Gleichheit, `<`/`>` nicht vergleichbar).
- Abweichung vom Design: `evalProperty` versucht bei jedem unaufgelösten gepunkteten Namen den kürzeren Pfad (früher nur bei bekannten Member-Namen),
  damit `file.properties.status` und `formula.o.key` funktionieren; ein Objekt akzeptiert jeden Schlüssel, alles andere weiter nur die Built-in-Member.
- Phase 2 (nach dem Review von PR #373 gleich mit umgesetzt): `buildQuerySpec`/`buildHostQuerySpec` setzen `allProperties`, wenn ein Ausdruck
  `file.properties[.key]` liest, und schicken diese Referenz NICHT mehr als `fileColumns` (die Route begrenzt Einträge auf 50 Zeichen/20 Stück, ein
  langer Schlüssel hätte die Abfrage mit 400 abgelehnt). Backend: `allProperties` in `BaseQuerySpec` und im Zod-Schema der Route; `LinkIndexService.rowColumns()`
  liefert alle Properties der Notiz (angefragte Spalten zuerst), höchstens `MAX_PROPERTIES_PER_ROW` = 200. Das Objekt je Zeile wird einmal gebaut (WeakMap).
- Review-Korrekturen: strikte Typgleichheit in `objectsEqual` (`1` ≠ `"1"`, `null` ≠ `""`, Listenform zählt), dasselbe Objekt ist immer sich selbst gleich,
  Zahl als Index (`o[2024]`), ein defekter Präfix (`formula.bad.key`) bleibt `null` statt Fehler, `isEmpty` nur noch einmal (universal).
- Noch offen: Grenze der Antwortgröße über `truncated` (nur die Zeilenkappung existiert), Phase 3 (Anzeige/Doku).

## Phase 1 — Werttyp und Zugriff (shared-contracts)

- [x] 1.1 `ObjectValue`, `isObject()`, `FormulaValue` erweitern; `stringify`/`isTruthy`/strukturelle Gleichheit mit Tiefengrenze
- [x] 1.2 `memberOf` und `index` auf Objekten (Punkt, Klammer, verschachtelt, fehlend → `null`)
- [x] 1.3 `typeName` → `object`; `objectMethods` (`keys`, `values`, `isEmpty`); unbekannte Methode → sichtbarer Fehler
- [x] 1.4 Tests inkl. `__proto__`/`constructor` als gewöhnliche Schlüssel

## Phase 2 — Quellen und Abfrage

- [x] 2.1 `file.properties`/`this.file.properties` in `base-eval.ts` aus `row.values` bauen (Skalar-/Listen-Erkennung wie `note.<key>`)
- [x] 2.2 `collectRefs` + `buildQuerySpec`: `allProperties` setzen, wenn ein Ausdruck `file.properties` nutzt
- [x] 2.3 Backend `queryForBase`: alle Properties je Zeile liefern, Grenzen (200 Properties, Antwortgröße → `truncated`); MCP `toIndexSpec` durchreichen
- [x] 2.4 Tests (Backend, `base-eval`, `parity.test.ts` Frontend gegen MCP)

## Phase 3 — Anzeige und Doku

- [x] 3.1 Zelltext in Tabelle/Karten/Liste/Kanban über `formatFormulaValue`, Sortierung nach Textform
- [x] 3.2 Welcome-Vault `Features/Bases.md` DE/EN: Abschnitt „Objekte“, Slatebase-Wahlen kenntlich machen
- [x] 3.3 `product.md`, `structure.md`, `implementation-plan.md` (Objekt-Typ erledigt), `bases-obsidian-parity/spec.md`

## Nicht in dieser Spec
- Objekt-Literal/`object()` (nicht dokumentiert), verschachtelte Frontmatter-Maps (hängt an 0.1, eigene Spec mit Index-Migration).
