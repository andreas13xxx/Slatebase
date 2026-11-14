# Bases — Objekt-Typ — Tasks

Jede Phase wird einzeln grün (tsc, `npm run lint`, betroffene Tests, `npm run build`) committet. Nach Änderungen an `shared-contracts`:
`npm run build` dort, `npm ci --install-links` im Backend (Frontend ist gesymlinkt).

## Phase 0 — Klärung (vor jeder Zeile Code)

- [ ] 0.1 Offene Frage 1 des Designs an einem echten Obsidian prüfen: wird ein verschachtelter Frontmatter-Schlüssel über `note.meta` als Objekt lesbar? Ergebnis in `design.md` eintragen
- [ ] 0.2 Offene Fragen 2 und 3 (Zelltext-Format, Reihenfolge von `keys()`/`values()`) ebenso beobachten und eintragen; Textform und Reihenfolge ggf. angleichen
- [ ] 0.3 Prüfen, welche Stellen `FormulaValue` erschöpfend behandeln (`switch`/`typeof`-Ketten in `formatFormulaValue`, Sortierung, Summaries, Zellrenderer) — ein neuer Variantentyp bricht dort sonst erst zur Laufzeit

## Phase 1 — Werttyp und Zugriff (shared-contracts)

- [ ] 1.1 `ObjectValue`, `isObject()`, `FormulaValue` erweitern; `stringify`/`isTruthy`/strukturelle Gleichheit mit Tiefengrenze
- [ ] 1.2 `memberOf` und `index` auf Objekten (Punkt, Klammer, verschachtelt, fehlend → `null`)
- [ ] 1.3 `typeName` → `object`; `objectMethods` (`keys`, `values`, `isEmpty`); unbekannte Methode → sichtbarer Fehler
- [ ] 1.4 Tests inkl. `__proto__`/`constructor` als gewöhnliche Schlüssel

## Phase 2 — Quellen und Abfrage

- [ ] 2.1 `file.properties`/`this.file.properties` in `base-eval.ts` aus `row.values` bauen (Skalar-/Listen-Erkennung wie `note.<key>`)
- [ ] 2.2 `collectRefs` + `buildQuerySpec`: `allProperties` setzen, wenn ein Ausdruck `file.properties` nutzt
- [ ] 2.3 Backend `queryForBase`: alle Properties je Zeile liefern, Grenzen (200 Properties, Antwortgröße → `truncated`); MCP `toIndexSpec` durchreichen
- [ ] 2.4 Tests (Backend, `base-eval`, `parity.test.ts` Frontend gegen MCP)

## Phase 3 — Anzeige und Doku

- [ ] 3.1 Zelltext in Tabelle/Karten/Liste/Kanban über `formatFormulaValue`, Sortierung nach Textform
- [ ] 3.2 Welcome-Vault `Features/Bases.md` DE/EN: Abschnitt „Objekte“, Slatebase-Wahlen kenntlich machen
- [ ] 3.3 `product.md`, `structure.md`, `implementation-plan.md` (Objekt-Typ erledigt), `bases-obsidian-parity/spec.md`

## Nicht in dieser Spec
- Objekt-Literal/`object()` (nicht dokumentiert), verschachtelte Frontmatter-Maps (hängt an 0.1, eigene Spec mit Index-Migration).
