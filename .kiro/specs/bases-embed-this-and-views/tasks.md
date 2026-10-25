# Bases: Ansichtswahl beim Einbetten und `this`-Kontext — Tasks

Reihenfolge bindend: R1 → R2 → R3. Jede Phase einzeln grün (tsc, ESLint, betroffene Tests) und einzeln
committet. Die Entscheidungen in `requirements.md` (Einbettung nur als Tabelle, keine Aktualisierung bei
`vault:change`) sind getroffen und werden in den Docs als Grenzen genannt.

## R1 — Ansichtswahl

- [ ] 1.1 `BasesEmbed`: optionale Prop `viewName`; Auswahl `views.find(name)`, Fehler bei Nichttreffer.
- [ ] 1.2 Header `target › Ansichtsname`.
- [ ] 1.3 `EmbedWidget.buildBaseDOM` und `renderEmbedNode` reichen den Teil nach `#` als `viewName` durch;
  Anzeigetext hinter `|` vorher abschneiden (am Embed-Parser prüfen).
- [ ] 1.4 Tests: Standard = erste Ansicht, benannte Ansicht, nicht gefundene Ansicht = sichtbarer Fehler,
  Block-Embed unverändert, `#Ansicht|Anzeige`.

## R2 — `this`-Kontext

- [ ] 2.1 `shared-contracts`: `rowContext(row, doc?, thisRow?)`, `this.file`, `this.file.*`, `this.<Property>`;
  `filterRows`/`evaluateFormulaColumn` reichen `thisRow` durch. Danach `npm run build` in
  `shared-contracts/` und `npm install` in `backend/` und `frontend/` (file:-Kopie).
- [ ] 2.2 Tests Evaluator: ohne `thisRow` → `null`; mit `thisRow` alle Felder aus R2.1; `hasLink(this.file)`
  trifft das Backlinks-Beispiel (Link-Werte im Index vorher prüfen, ggf. `hasLink` anpassen).
- [ ] 2.3 `prefilter.ts`: `this.*`-Knoten nie nach unten; Tabellen-Tests aus dem Design (inkl. Mischausdruck).
- [ ] 2.4 `BasesEmbed`: `hostPath`-Prop, Host-Zeile per zweitem `queryBase` mit `path`-Prädikat, nur wenn die
  Base `this.` verwendet; `thisRow` an `runBaseQuery`/`filterRows`.
- [ ] 2.5 `hostPath` verdrahten: Live-Preview-Widgets (`options.sourcePath`), `ViewMode`-Prop `sourcePath`
  (von `TabContent`; verschachtelte `NoteEmbed` wechseln auf den Pfad der eingebetteten Notiz), `BasesView`
  (Pfad der Base).
- [ ] 2.6 Tests: eingebettete Base filtert nach Host (`file.hasLink(this.file)`), Host-Property
  (`status == this.status`), `.base` als eigene Datei (`this` = Base), kein Host → Zeile ausgeschlossen
  statt behalten, verschachtelte Einbettung.

## R3 — Docs

- [ ] 3.1 `Features/Bases.md` DE/EN: `#Ansicht` und `this` mit Live-Beispiel (Beispiel-Notiz, die auf die
  Aufgaben-Notizen verweist); Grenzen benennen.
- [ ] 3.2 README, `product.md`, `implementation-plan.md` aktualisieren; `_meta.md` beider Welcome-Vaults
  (Version + `updated`) anheben.
- [ ] 3.3 Jeder neue Wikilink gegen `git ls-files` verifiziert; Welcome-Vault-Tests grün.

## Vor-Push

tsc backend und frontend, `test:coverage` beide, ESLint 0 Fehler; Release-Please-PRs nicht ohne OK mergen.
