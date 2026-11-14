# Bases — Objekt-Typ der Ausdrucks-Engine — Requirements

Status: Entwurf (2026-11-14). Quelle: Obsidian-Hilfe `obsidian.md/help/bases/syntax` und `/functions` (am 2026-11-14 gelesen, siehe
„Belegte Fakten“). Anlass: Der Rest „Objekt-Typ“ aus `bases-obsidian-parity` (`keys`/`values` entfielen „mangels Objekt-Typ“).

## Ziel

Die Ausdrucks-Engine (`shared-contracts/src/bases/formula/`, genutzt von Frontend, Tabelle/Karten/Kanban und MCP `query_base`) bekommt
einen Werttyp **Objekt**, damit `file.properties`, `this.file.properties` und die in Obsidian dokumentierten Methoden `keys()`,
`values()`, `isEmpty()` funktionieren, ohne dass eine Base mit solchen Ausdrücken stillschweigend leer oder fehlerhaft ausgewertet wird.

## Belegte Fakten (Obsidian-Doku)

- Zugriff: „Access object elements using square brackets and the element name or dot notation. For example, `property.subprop` or
  `property["subprop"]`.“
- Methoden des Typs Objekt: `object.isEmpty(): boolean` (true, wenn keine eigenen Eigenschaften), `object.keys(): list`,
  `object.values(): list`.
- Methoden jedes Typs (gelten auch für Objekte): `any.isTruthy()`, `any.isType(type)`, `any.toString()`.
- Quelle von Objekten: `file.properties` (Typ `object`, „All properties on the file“; aktualisiert sich nicht automatisch bei
  Vault-Änderungen). `this.file.…` ist dokumentiert, der Typ von `this` nicht.

## Was die Doku NICHT sagt (nicht raten, siehe R6)

Objekt-Literal-Syntax, eine `object()`-Funktion, Anzeigeformat im Tabellen-Zelltext, Gleichheit/Vergleich/Sortierung von Objekten,
Schlüsselreihenfolge, ob ein verschachtelter Frontmatter-Schlüssel (`meta: {a: 1}`) ein Objekt wird, und ob `note` selbst ein Objekt ist.

## Anforderungen

### R1 — Werttyp
1. `FormulaValue` kennt ein Objekt (`{ kind: 'object', entries }`, Schlüssel → `FormulaValue`), gleiche Konvention wie `link`/`regex`.
2. `typeName()` liefert `object`; `x.isType("object")` ist wahr genau dafür.
3. Objekte sind unveränderlich; kein Ausdruck verändert eines.

### R2 — Zugriff
1. `obj.key` und `obj["key"]` liefern den Wert, bei fehlendem Schlüssel `null` (kein Fehler).
2. Verschachtelt: `obj.a.b`, `obj["a"]["b"]` und Mischformen; ein Schritt über `null` bleibt `null`.
3. Der Zugriff über `note["…"]`/`file["…"]`/`formula["…"]` (heutiger Sonderfall) bleibt unverändert.

### R3 — Methoden
1. `keys()` → Liste der Schlüssel, `values()` → Liste der Werte, beide in Einfügereihenfolge (Slatebase-Wahl, Doku schweigt).
2. `isEmpty()` → wahr ohne Eigenschaften (heutiges `isEmpty` für Liste/Text/`null` bleibt).
3. `isTruthy()`: ein Objekt ist wahr, wenn es mindestens eine Eigenschaft hat. `toString()` siehe R5.
4. Andere Listen-/Text-Methoden auf einem Objekt sind ein sichtbarer Auswertungsfehler, kein stilles `null`.

### R4 — Quellen
1. `file.properties` und `this.file.properties` liefern ein Objekt aus den Properties der Zeile (gleiche Skalar-/Listen-Erkennung wie
   `note.<key>`, siehe „Der Index kennt keinen Unterschied zwischen Einzelwert und Liste“ in `lessons-learned.md`).
2. Die Property-Menge einer Zeile ist heute die der angefragten Spalten (`buildQuerySpec`). Referenziert ein Ausdruck
   `file.properties`, muss die Abfrage ALLE Properties der Notiz liefern (Backend-Erweiterung, R6.3), sonst wäre das Objekt unvollständig.
3. Verschachtelte YAML-Maps als Objekt-Werte sind NICHT Teil dieser Spec (R6.2).

### R5 — Anzeige und Vergleich (Slatebase-Entscheidungen, als solche zu dokumentieren)
1. Textform/Zelle: kompaktes JSON mit stabiler Reihenfolge, z. B. `{"status":"open","tags":["a","b"]}`.
2. Gleichheit (`==`, `!=`): strukturell (gleiche Schlüssel, gleiche Werte); `<`/`>` mit Objekten sind „nicht vergleichbar“ wie eine
   fehlende Property.
3. Sortierung nach einer Objekt-Spalte: nach der Textform (stabil, aber nicht fachlich sinnvoll — in der Hilfe vermerken).

### R6 — Abgrenzung
1. Kein Objekt-Literal und keine `object()`-Funktion, solange Obsidian sie nicht dokumentiert (kein erfundenes Dateiformat).
2. Verschachtelte Frontmatter-Maps: erst entscheiden, wenn an einem echten Obsidian geprüft ist, ob `meta.a` über `note.meta` einen
   Objekt-Wert liefert. Der Link-Index kennt heute nur flache Listen; ein Wechsel wäre eine Index-Änderung mit Migration.
3. Backend: neuer optionaler Flag in der Abfrage (alle Properties liefern), Obergrenze der Properties je Zeile und der Antwortgröße,
   damit `file.properties` keine unbegrenzten Antworten erzeugt.

### R7 — Qualität
1. Frontend und MCP rechnen identisch (ein Code in `shared-contracts`); Paritätstests wie `parity.test.ts`.
2. Kein `eval`; CSP-sichere Engine bleibt. Keine Prototyp-Verschmutzung: Schlüssel wie `__proto__`, `constructor` sind gewöhnliche
   Schlüssel (Objekt ohne Prototyp bzw. `Map`), nie ein Zugriff auf `Object.prototype`.
3. Fehlerpfade (Methode auf Objekt unbekannt, zu große Objekte) liefern einen sichtbaren Fehlerwert in Formelspalten und `false` in Filtern.
