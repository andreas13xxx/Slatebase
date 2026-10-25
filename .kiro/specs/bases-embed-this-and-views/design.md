# Bases: Ansichtswahl beim Einbetten und `this`-Kontext — Design

Baut auf `requirements.md` auf. Reihenfolge: R1 (klein, entkoppelt) → R2 → R3.

## Ist-Architektur (verifiziert)

- `BasesEmbed` (`frontend/src/components/bases/BasesEmbed.tsx`): holt `.base` (oder `source`),
  `parseBase`, nimmt `parsed.document.views[0]`, ruft `runBaseQuery(apiClient, vaultId, doc, view)`
  und rendert `BasesTableView` mit `{ ...first, type: 'table' }`.
- Embed-Pfade, die `BasesEmbed` mounten: `EmbedWidget.buildBaseDOM` und `InlineBaseWidget`
  (`editor/live-preview/widget-decorations.ts`), `renderEmbedNode` und `InlineBase` in `ViewMode.tsx`.
- Ausdrucks-Engine: `FormulaContext.resolve(name)` in `shared-contracts/src/bases/formula/evaluator.ts`.
  `evalProperty` ruft `ctx.resolve(name)` mit dem punktierten Namen (`this.file.name` ist **ein**
  `property`-Knoten). `rowContext` (`shared-contracts/src/bases/base-eval.ts`) baut den Kontext je Zeile
  und kennt `file.*`, `note.`/bare und `formula.`.
- Zeilen kommen über `queryBase` (Link-Index); `buildQuerySpec` schickt Spalten + Sort, der
  Ausdrucks-Filter läuft clientseitig in `filterRows`. `prefilter.ts` leitet daraus konservativ
  Backend-Prädikate ab (`property` eq/exists, `file.hasTag`, `file.inFolder`, `path`).
- Der Host-Pfad ist im Live Preview schon vorhanden (`options.sourcePath`, aus `editorInfoField`).
  `ViewMode` hat **keine** `sourcePath`-Prop.

## R1 — Ansichtswahl

1. `EmbedWidget` kennt `this.heading` (der Teil nach `#`) bereits; für `kind === 'base'` ist das der
   Ansichtsname. `renderEmbedNode` bekommt ihn aus `node.heading` (Embed-Parser unverändert, er trennt
   `#` schon).
2. `BasesEmbed` erhält optional `viewName?: string`. Auswahl: `viewName === undefined` → `views[0]`,
   sonst `views.find((v) => v.name === viewName)`; kein Treffer → Fehler
   `Ansicht nicht gefunden: ${viewName}` (R1.3). Vergleich exakt, nach `trim`.
3. Header: `target` + ` › ${view.name}` bei gewählter Ansicht.
4. Der Block-Embed übergibt keinen `viewName`.

Datei-Embeds heißen im Embed-Parser u. U. `file.base#Ansicht|Anzeige`; der Anzeigetext hinter `|`
wird wie bei Notizen abgeschnitten, bevor der Name verglichen wird (am Parser prüfen, Test).

## R2 — `this`-Kontext

### Datenmodell

`BaseRow` der Host-Notiz ist die Quelle (R2.6). Neuer, optionaler Parameter:

```ts
rowContext(row: BaseRow, doc?: BaseDocument, thisRow?: BaseRow): FormulaContext
```

`filterRows` und `evaluateFormulaColumn` reichen `thisRow` durch (optionaler letzter Parameter, bestehende
Aufrufer bleiben gültig).

### Auflösung in `buildContext`

Vor den bestehenden Zweigen in `resolve(name)`:

- `name === 'this.file'` → Pfad der Host-Notiz (`thisRow.path`) als Link-Wert; passt zu `hasLink(this.file)`.
- `name.startsWith('this.file.')` → wie `file.*`, aber auf `thisRow`: `name`/`basename` → `thisRow.fileName`,
  `path` → `thisRow.path`, sonst `toExprValue(..., thisRow.values[...])`.
- `name.startsWith('this.')` → Frontmatter-Property von `thisRow` (`values[key]`).
- ohne `thisRow` → `null` (R2.4).

`file.hasLink(target)` vergleicht heute `links` (Strings) gegen `target`. Zu klären im Test: wie die Link-Werte
im Index aufgebaut sind (Name oder Pfad, mit/ohne `.md`), damit `hasLink(this.file)` das Backlinks-Beispiel
trifft. Falls nötig, vergleicht `hasLink` zusätzlich gegen den Dateinamen ohne Endung.

### Woher kommt die Host-Zeile

`BasesEmbed` erhält optional `hostPath?: string`. Ist es gesetzt und enthält das Dokument irgendwo `this.`
(einfache Textprüfung auf die Filter-/Formelstrings, sonst spart man den Abruf), fragt es die Host-Zeile mit
einem zweiten `queryBase` ab: `buildQuerySpec`-Form mit Bedingung `{ path: hostPath }` und allen Spalten, die
die Base per `this.<Property>` braucht (aus den Ausdrücken extrahiert; `file.*` ist immer dabei). Das nutzt
das bestehende `path`-Prädikat, kein neuer Backend-Endpunkt.

Quellen für `hostPath`:

| Ort | Wert |
|-----|------|
| Live Preview (`InlineBaseWidget`, `EmbedWidget`) | `options.sourcePath` |
| Leseansicht | neue optionale `ViewMode`-Prop `sourcePath`, von `TabContent` gesetzt; verschachtelte `NoteEmbed` reichen den Pfad der eingebetteten Notiz durch |
| `.base` als eigene Datei (`BasesView`) | der Pfad der Base selbst (R2.3) |
| öffentliche Freigabe | entfällt (kein Base-Rendering) |

### Vorfilterung (R2.5)

`prefilter.ts` extrahiert heute `property`-Gleichheit aus Ausdrücken der Form `<Property> == <Literal>`. Ein
Ausdruck wie `status == this.status` hat kein Literal auf der rechten Seite und wird verworfen; ebenso
`file.inFolder(this.file.folder)` (Argument kein String-Literal) und `file.hasLink(this.file)`. Das ist
heute implizit korrekt, aber **nicht getestet**. Test-Vorgabe: Tabelle von Ausdrücken mit `this.*`, jeweils
erwartet „kein Prädikat nach unten", plus ein Test, dass eine Mischung (`file.hasTag("a") && status == this.status`)
nur den Tag-Teil nach unten gibt. Zusätzlich verwirft `prefilter.ts` explizit jeden `property`-Knoten, dessen
Name mit `this.` beginnt (Absicherung, falls später Literal-Vergleiche für Hostwerte hinzukämen).

## R3 — Docs

`Features/Bases.md` (DE/EN): Abschnitt „Eine Base einbetten" um `#Ansicht` erweitern, neuer Abschnitt
„`this`: Filter relativ zur Notiz" mit Beispiel „Notizen, die auf diese Notiz verlinken"
(`file.hasLink(this.file)`), das im Vault live in einer Notiz steht. Grenzen (laut Entscheidungen in
`requirements.md`): nur Tabelle in der Einbettung, `this` nicht in MCP, keine Aktualisierung bei Änderung
der Host- oder Zielnotizen. Ziehen nach: README, `product.md`, `implementation-plan.md`,
`_meta.md` beider Welcome-Vaults.

## Risiken

- **Zusätzliche Abfrage je Einbettung** mit `this`: bewusst nur, wenn das Dokument `this.` verwendet.
- **Verschachtelte Einbettung** (Notiz A bettet Notiz B ein, B enthält eine Base mit `this`): `this` ist B,
  nicht A (Obsidian: „embedding file"). Der Pfad muss beim Rendern von `NoteEmbed` zu B wechseln.
- **Falsches Ergebnis ist schlimmer als kein Ergebnis**: wo `this` nicht auflösbar ist (kein Host), bleibt es
  `null` und der Filter schließt die Zeile aus, statt sie zu behalten.
