# Bases Expression Language — Tasks

Umsetzung in Phasen; jede Phase einzeln committbar + grün (tsc/build/test/lint). Branch: `bases-v3`.

## Phase 0 — Spec (dieses Dokument)
- [x] 0.1 Requirements, Design, Tasks schreiben und committen

## Phase 1 — Ausdrucks-Engine erweitern
- [ ] 1.1 `formula/` → `expr/` umziehen (Dateien verschieben, Importe nachziehen), `ast.ts` extrahieren
- [ ] 1.2 Tokenizer: `&&` `||` `!` `%`, `.`, `[` `]` ergänzen (+ Tests)
- [ ] 1.3 Parser: `member`/`index`/`method`/`logical`-Knoten + Präzedenz (+ Tests, fast-check Präzedenz)
- [ ] 1.4 `values.ts`: `list`/`link` ergänzen; Abgleich mit `bases-values.ts`, Doppelmodell vermeiden
- [ ] 1.5 `methods.ts`: String/Number/Date/List-Methodentabelle (+ Tests, inkl. unbekannte Methode → Fehlerwert)
- [ ] 1.6 `functions.ts`: Funktionsliste erweitern (`number`, `link`, `list`, `min`, `max`) (+ Tests)
- [ ] 1.7 Evaluator: Member/Index/Method/Logical + Datums-Durationen (`date ± "1M"`) (+ Tests)
- [ ] 1.8 `FormulaContext`: Präfix-Auflösung `note.`/`file.`/`formula.` (+ Tests)

## Phase 2 — Datei-Metadaten für Filter (Backend)
- [ ] 2.1 `BaseQueryRowWire`/`BaseRow` um `ext`/`folder`/`tags`/`links` ergänzen (ctime/mtime prüfen)
- [ ] 2.2 `LinkIndexService.queryForBase` liefert diese Felder (+ Backend-Tests)
- [ ] 2.3 `basesRoutes` + `IApiClient.queryBase` Wire-Typen nachziehen

## Phase 3 — Parser/Serializer auf Obsidian-Format
- [ ] 3.1 `types.ts`: `BaseFilterNode` = `string | {and} | {or} | {not}`; altes `BaseFilterCondition` entfernen; `groupBy`-Objekt; `summaries`; View-`limit`
- [ ] 3.2 `parser.ts`: Filter-Strings + `not`-Gruppe, `groupBy`-Objekt, `summaries`, `limit` (+ Tests, Fehler bei Alt-Schema)
- [ ] 3.3 `serializer.ts`: verlustfreier Round-Trip (+ Round-Trip-Test gegen echtes-Format-Fixture)

## Phase 4 — Query-Engine (clientseitige Filterung)
- [ ] 4.1 `query-engine.ts`: `buildQuerySpec` fragt auch filter-referenzierte Properties an
- [ ] 4.2 Filter-Auswertung: Ausdruck-Strings gegen Zeilen auswerten (and/or/not) über die Engine (+ Tests)
- [ ] 4.3 `BasesView`/`BasesTableView`/`BasesKanbanView` an neues `groupBy`-Objekt + Filterformat anpassen
- [ ] 4.4 Bestehende Bases-Tests auf neues Format umstellen, grün

## Phase 5 — Migration & Doku
- [ ] 5.1 Beide Welcome-Vault-`.base`-Beispiele auf Obsidian-Format umschreiben
- [ ] 5.2 `product.md`/`lessons-learned.md`/`structure.md` nachziehen (expr-Verzeichnis, Format-Hinweis)
- [ ] 5.3 Echtes-Format-`.base`-Fixture als Round-Trip- + Query-Test (schließt „Punkt 5")

## Phase 6 — Optional
- [ ] 6.1 (optional) Formelspalten editierbar — nur falls 1–5 stabil (R5, realistisch offen)
- [ ] 6.2 (später) `summaries`-Auswertung/Summenzeile — ausdrücklich NICHT in dieser Spec

## Abschluss-Gate (vor „fertig")
- [ ] Backend `npx tsc --noEmit` + `npm run test:coverage` grün
- [ ] Frontend `npm run build` + `npm run test:coverage` grün, `npx eslint . --quiet` 0 Errors
- [ ] Ein echtes-Obsidian-`.base` lädt, filtert und rendert korrekt (manuell/Fixture verifiziert)
