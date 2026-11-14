---
tags: [features]
---

# Bases

Bases machen aus den Metadaten, die ohnehin schon in deinem Vault stecken, eine lebendige, filterbare Tabelle. Eine `.base`-Datei beschreibt — in einfachem YAML — welche Notizen aufgenommen werden, welche Properties als Spalten erscheinen, wie sortiert wird und optional berechnete Spalten (Formeln). Das Ergebnis öffnet sich wie jede andere Datei: eine Tabelle oder ein Kanban-Board, in dem jede Zeile bzw. Karte eine Notiz ist.

Stell es dir als gespeicherte, strukturierte Ansicht über deine Notizen vor — die Datenbank-Schicht über [[Features/Tags und Properties|Tags und Properties]].

> [!warning] Experimentell
> Bases steht hinter dem Feature-Toggle `bases` (standardmäßig aus). Rendert die Tabelle nicht, ist das Toggle serverseitig aus — frag eine:n Administrator:in, siehe [[Admin/Feature Toggles]]. Das Dateiformat ist das **echte Obsidian-`.base`-Format**: Eine `.base`-Datei aus Obsidian lässt sich hier öffnen und umgekehrt. Nicht jede Obsidian-Funktion ist aber umgesetzt — die [[#Grenzen und Lücken|Liste unten]] sagt ehrlich, was fehlt.

---

## Woraus eine Base besteht

| Teil | Wofür |
|------|-------|
| **`filters`** | Welche Notizen erscheinen — als Ausdruck, kombinierbar mit `and` / `or` / `not` |
| **`properties`** | Anzeigenamen der Spalten |
| **`formulas`** | Berechnete Spalten (schreibgeschützt), z. B. Tage bis zur Deadline |
| **`views`** | Eine oder mehrere benannte Ansichten: **Tabelle**, **Karten** (Kanban), **Liste** oder **Karte** (Map), je mit eigener Spaltenreihenfolge, Sortierung, Filter und `limit` |
| **`summaries`** | Zusammenfassungen je Spalte (Summe, Anzahl, Durchschnitt, Min/Max …) — unter der Tabelle bzw. im Kanban-Kopf |

---

## Eine Base öffnen und erstellen

- **Öffnen:** Klicke eine `.base`-Datei im [[Grundlagen/Datei-Explorer|Datei-Explorer]] an, folge einem Wikilink darauf oder finde sie im Schnellwechsler (`Ctrl+O`). Sie rendert als Ansicht, nicht als Markdown-Editor. Das funktioniert auch in einem geteilten Bereich (Split Panes).
- **Erstellen:** Führe **„Neue Base erstellen"** über die [[Features/Command Palette|Command Palette]] (`Ctrl+P`) aus.
- **Rohquelle:** Jede Base hat einen Rohquellen-Modus (YAML direkt bearbeiten) — nützlich für alles, was die Oberfläche nicht abbildet.

---

## Filtern

Eine Filterbedingung ist ein **Ausdruck als Text** — dieselbe Sprache wie in Obsidian. Mehrere Bedingungen kombinierst du mit `and`, `or` und `not` (jeweils eine Liste):

```yaml
filters:
  and:
    - file.inFolder("Projekte")
    - 'status != "done"'
    - or:
        - file.hasTag("wichtig")
        - 'priority > 2'
```

Das kannst du in Bedingungen verwenden:

- **Properties** — `status`, `priority`, `note.status` (Frontmatter der Notiz)
- **Datei-Felder** — `file.name`, `file.basename`, `file.path`, `file.ext`, `file.folder`, `file.tags`, `file.links`, `file.ctime`, `file.mtime`
- **Datei-Prüfungen** — `file.hasTag("x")`, `file.inFolder("Ordner")`, `file.hasLink("Notiz")`
- **Vergleiche und Logik** — `==  !=  <  <=  >  >=`, `&&  ||  !`, Rechnen mit `+ - * / %`. `a || "x"` liefert den Wert von `a` bzw. den Ersatzwert `"x"`. Eine fehlende Property ist mit `<`, `>` usw. nie vergleichbar (Ergebnis: falsch). Mit Minus brauchst du keine Leerzeichen (`end-start`); eine Property mit Bindestrich schreibst du `note["due-date"]`
- **Methoden** auf Text, Zahlen, Daten und Listen, z. B. `title.contains("Plan")`, `deadline < today()`

Ein Filter in einer **Ansicht** wird zusätzlich zum Filter der ganzen Base angewandt (UND). Eine Bedingung, die sich nicht auswerten lässt (Tippfehler, unbekannte Funktion), schließt die Notiz aus — sie bricht die Tabelle nicht.

Die Base aktualisiert sich automatisch, wenn du Notizen hinzufügst, bearbeitest, löschst oder umbenennst.

---

## Formeln (berechnete Spalten)

Formeln stehen unter `formulas:` und sind schreibgeschützte Spalten, pro Zeile berechnet. Sie nutzen dieselbe Ausdruckssprache wie die Filter. In Spalten und Sortierung heißen sie `formula.name`; eine Formel kann auf eine andere verweisen (`formula.andere`).

```yaml
formulas:
  days_left: '(date(deadline) - today()).days'
```

**Eingebaute Funktionen:** `if`, `concat`, `now`, `today`, `date`, `duration`, `number`, `list`, `link`, `file`, `image`, `icon`, `html`, `escapeHTML`, `random`, `min`, `max`, `days`, `length`.

**Methoden:**

| Typ | Methoden |
|-----|----------|
| Text | `contains`, `containsAll`, `containsAny`, `startsWith`, `endsWith`, `lower`, `upper`, `trim`, `title`, `repeat`, `reverse`, `slice`, `replace`, `split`, `length`, `isEmpty` |
| Zahl | `toFixed`, `round`, `abs`, `ceil`, `floor`, `isEmpty` |
| Datum | `format`, `date`, `time`, `relative` sowie `year`, `month`, `day`, `hour`, `minute`, `second` |
| Liste | `contains`, `containsAll`, `containsAny`, `length`, `join`, `first`, `last`, `flat`, `reverse`, `slice`, `sort`, `unique`, `isEmpty`, `map`, `filter`, `reduce` |
| Regexp | `matches` — Literale wie `/abc/gi`; `replace` und `split` akzeptieren sie ebenfalls (`g` ersetzt alle Treffer, sonst nur den ersten) |
| Link | `asFile`, `linksTo` |
| Datei | `file.hasTag`, `file.inFolder`, `file.hasLink`, `file.hasProperty`, `file.asLink` |
| Jeder Wert | `isTruthy`, `isType`, `toString` |

**Lambdas auf Listen** nutzen wie in Obsidian keine Pfeilsyntax, sondern einen Ausdruck mit den impliziten Variablen `value`, `index` und (bei `reduce`) `acc`:

```yaml
formulas:
  doppelt: 'zahlen.map(value * 2)'
  grosse: 'zahlen.filter(value > 10).length'
  summe: 'zahlen.reduce(acc + value, 0)'
```

> [!note] Datumsdifferenz
> `date1 - date2` liefert **Millisekunden** (wie in Obsidian). Willst du Tage, nimm wie in Obsidian `(a - b).days` (auch `.hours`, `.minutes`, `.seconds`, `.milliseconds`); `days(a, b)` gibt es zusätzlich.

---

## Zusammenfassungen (`summaries`)

Pro Spalte lässt sich eine Zusammenfassung über die angezeigten Zeilen berechnen. Sie steht unter `summaries:` der Ansicht als `Spalte: Funktion` und erscheint in der Tabelle als Zeile unter dem Inhalt, in der Karten-Ansicht als Leiste über dem Board.

```yaml
views:
  - type: table
    name: Aufgaben
    order: [file.name, status, estimate]
    summaries:
      file.name: Filled
      estimate: Sum
```

Eingebaute Funktionen (wie in Obsidian):

| Gilt für | Funktionen |
|----------|-----------|
| Alle Typen | `Empty`, `Filled`, `Unique` (und `Count` als Slatebase-Zusatz — in Obsidian unbekannt) |
| Zahlen | `Sum`, `Average`, `Min`, `Max`, `Median`, `Range`, `Stddev` |
| Daten | `Earliest`, `Latest`, `Range` |
| Checkbox | `Checked`, `Unchecked` |

Eine numerische Funktion auf einer nicht-numerischen Spalte ergibt einen leeren Wert, keinen Fehler. Eigene Zusammenfassungen definierst du im Top-Level-Block `summaries:` als Formel über die Liste `values` und weist sie in der Ansicht per Namen zu:

```yaml
summaries:
  mittel: 'values.mean().round(1)'
  gross: 'values.filter(value > 10).length'
views:
  - type: table
    summaries:
      aufwand: mittel
```

Schlägt die Formel fehl, bleibt die Zusammenfassung leer.

---

## In der Tabelle bearbeiten

Property-Zellen sind inline editierbar, über dieselben typisierten Controls wie der [[Features/Tags und Properties|Properties-Editor]] — Text, Zahl, Datum, Checkbox, Liste/Tags. Eine Änderung landet direkt in der Frontmatter der Notiz. Formel-Spalten sind schreibgeschützt.

Klick auf einen Spalten-Header sortiert; die Sortierung wird in die `.base`-Datei zurückgeschrieben. Das gilt auch für Formel-Spalten — die werden nach dem Laden anhand ihrer berechneten Werte sortiert.

---

## Werkzeugleiste: Ansichten, Filter, Sortierung, Gruppen, Eigenschaften

Über der Tabelle sitzt eine Werkzeugleiste — du musst das YAML nicht von Hand schreiben. Jede Änderung wird sofort in die `.base`-Datei geschrieben (mit Schreibrecht auf den Vault; ohne lassen sich die Einstellungen nur ansehen).

- **Ansichtenmenü** (Name der Ansicht ▾): zwischen Ansichten wechseln, eine **neue Ansicht** mit Name und Typ anlegen, die aktuelle **umbenennen**, ihren **Typ ändern**, **duplizieren** oder **löschen** (die letzte Ansicht bleibt immer erhalten).
- **Sortieren:** mehrere Sortierungen mit Eigenschaft und Richtung, in der Reihenfolge verschiebbar.
- **Gruppieren:** eine Eigenschaft, nach der Karten- und Kanban-Ansichten ihre Spalten bilden.
- **Filtern:** Bedingungen aus Eigenschaft, Operator und Wert (ist, enthält, beginnt mit, ist leer, größer/kleiner, hat Tag, liegt in Ordner …), beliebig zu **und / oder / nicht**-Gruppen verschachtelt. Der Reiter **Diese Ansicht** wirkt nur auf die aktuelle Ansicht, **Alle Ansichten** auf die ganze Base. Was sich nicht als Baukasten-Bedingung darstellen lässt, bleibt als Ausdruck editierbar (`</>`).
- **Eigenschaften:** festlegen, welche Spalten angezeigt werden und in welcher Reihenfolge — auch Datei-Felder (`file.ctime` …) und Formeln; eigene Eigenschaften trägst du per Namen ein.

Das Symbol rechts in der Pfadzeile (Breadcrumb) wechselt zwischen Ansicht und Quelltext (rohes YAML, das den ganzen verfügbaren Platz nutzt).

---

## Ansichten: Tabelle, Karten, Liste und Karte

Eine Base kann mehrere Ansichten enthalten; oben erscheint dann ein Umschalter.

- **Tabelle** — eine Zeile pro Notiz, editierbare Zellen.
- **Karten** (`type: cards` ohne `groupBy`) — ein Raster aus Karten, eine pro Notiz, wie in Obsidian. Optionen: `image` (Property mit dem Titelbild: `[[Anhang]]`-Link, http(s)-URL oder Farbe wie `#ff8800`), `imageFit` (`cover` schneidet zu, `contain` nicht), `imageAspectRatio` (Breite / Höhe, Standard 1) und `cardSize` (Kartenbreite in Pixeln, Standard 200).
- **Karten (Kanban)** (`type: kanban`, oder `type: cards` **mit** `groupBy`) — Notizen nach einer Property in Spalten gruppiert. Mit `groupOrder` (Liste von Werten, `null` steht für „Ohne …") zeigst du nur die genannten Spalten in dieser Reihenfolge; eine leere Liste blendet alle aus. Jeder Wert wird eine Spalte, Notizen ohne Wert landen in „Ohne …". Spalten sind einklappbar, ein Klick auf eine Karte öffnet die Notiz.
  **Ziehe eine Karte in eine andere Spalte**, um den Wert der Gruppierungs-Property in der Notiz zu ändern; das Ziehen in „Ohne …" entfernt die Property. (Nur mit Schreibrecht auf den Vault.)
- **Liste** (`type: list`) — eine einfache, schreibgeschützte Liste mit einem Eintrag pro Notiz. Formelspalten werden ausgewertet, Zusammenfassungen erscheinen als Leiste über der Liste.
- **Gruppen in Tabelle und Liste** — ein `groupBy` an einer Tabellen- oder Listenansicht teilt die Zeilen in Gruppen mit Kopfzeile (Name und Anzahl). Ein Klick auf die Kopfzeile klappt die Gruppe ein oder aus. `groupOrder` wirkt wie in der Kanban-Ansicht: nur die genannten Gruppen erscheinen, in dieser Reihenfolge; `null` steht für Notizen ohne Wert; eine leere Liste blendet alle Gruppen aus. Ohne `groupOrder` sind die Gruppen nach Wert sortiert (`direction: DESC` kehrt um), die Gruppe „Ohne …" steht zuletzt. Das Einklappen wird nicht gespeichert.
- **Karte** (`type: map`) — Slatebase bringt keine eingebaute Kartenansicht mit; sie kommt vom Obsidian-Community-Plugin **Maps** (aktiviere die Obsidian-Plugin-Kompatibilität und installiere das Plugin). Das Plugin registriert die Ansicht `type: map` und zeichnet Notizen mit Geokoordinaten als Pins auf eine Karte. Die Demo-Base „Beispiel-Orte" nutzt diese Ansicht; ohne das Plugin fällt sie auf die Tabelle zurück.

```yaml
views:
  - type: table
    name: Alle Aufgaben
    order: [file.name, status, priority]
    limit: 50
  - type: cards
    name: Board
    groupBy:
      property: status
      direction: ASC
    order: [file.name, priority]
```

`limit` begrenzt die Zeilen einer Ansicht — und zwar **nach** dem Filtern.

Andere Ansichtstypen kommen von Obsidian-Plugins (siehe [[Fortgeschritten/Obsidian Plugins]]).

---

## Eine Base einbetten und Einträge anlegen

- **Einbetten:** Schreibe `![[Meine Base.base]]` in eine Notiz. Im Lesemodus und in der Live-Vorschau erscheint die Base als schreibgeschützte Tabelle direkt in der Notiz — nützlich für ein Dashboard, das mehrere Bases nebeneinander zeigt.
- **Eine bestimmte Ansicht einbetten:** `![[Meine Base.base#Ansichtsname]]` zeigt die Ansicht mit diesem Namen statt der ersten. Existiert der Name nicht, steht dort „Ansicht nicht gefunden" — es springt nie stillschweigend auf die erste Ansicht. Das Beispiel hier zeigt die Ansicht „Offene Aufgaben" der Beispiel-Tabelle:

  ![[Features/Beispiel-Aufgaben (Base).base#Offene Aufgaben]]

- **Inline als Codeblock:** Ein ```` ```base ````-Block enthält das YAML der Base direkt in der Notiz, ganz ohne eigene `.base`-Datei. Führe **„Bases: Neue Base einfügen"** über die [[Features/Command Palette|Command Palette]] aus, um ein Gerüst an der Cursorposition einzufügen. Die Notiz zeigt dann dieselbe schreibgeschützte Tabelle; in der Live-Vorschau erscheint der Rohtext, sobald du in den Block klickst. Auf einer [[Features/Öffentliche Links|öffentlichen Freigabe]] und solange das Feature-Toggle `bases` aus ist, bleibt der Block als Code stehen; der Befehl fügt dann nichts ein, sondern verweist auf das Toggle.
- **Eintrag hinzufügen:** Führe **„Bases: Add item"** über die [[Features/Command Palette|Command Palette]] aus, während eine Base geöffnet ist. Slatebase legt eine neue Notiz im Geltungsbereich der Base an — der Zielordner stammt aus einem `file.inFolder(...)`-Filter (sonst Vault-Wurzel), und die angezeigten Properties werden als leere Frontmatter-Felder vorbereitet (ein `property == "x"`-Filter füllt den Wert vor). Die Notiz öffnet sich und erscheint als neue Zeile.

---

## `this`: Filter relativ zur Notiz

In Filtern und Formeln steht `this` für die Notiz, in der die Base eingebettet ist — wie in Obsidian. So zeigt dieselbe Base in jeder Notiz etwas anderes:

- `this.file.name`, `this.file.path`, `this.file.folder`, `this.file.tags`, `this.file.size` … — die Datei-Felder der einbettenden Notiz
- `this.status` (oder `this.note.status`) — eine Property aus ihrem Frontmatter
- `this.file` allein ist die Notiz selbst und passt als Argument von `file.hasLink(...)`

Das klassische Beispiel sind die **Backlinks einer Notiz**: Alle Notizen, die auf diese Notiz verlinken. Der Block unten steht direkt in dieser Seite und listet darum alle Notizen, die auf „Bases" verweisen:

```base
filters: file.hasLink(this.file)
properties:
  file.name:
    displayName: "Verweist auf Bases"
views:
  - type: table
    name: "Verweise"
    order:
      - file.name
```

Wird die Base als **eigene `.base`-Datei** geöffnet, ist `this` die Base-Datei selbst. Ist keine Notiz bekannt, ergibt `this.…` einen leeren Wert — eine Zeile, die davon abhängt, wird dann ausgeschlossen, nie fälschlich behalten.

> [!note] Namen und Duplikate
> `file.hasLink(this.file)` vergleicht den Link, so wie er in der Notiz steht (`Plan`, `Projekte/Plan`), mit dem Pfad der Host-Notiz — mit oder ohne `.md`, ganz oder als Pfadende. Gibt es zwei Dateien mit demselben Namen in verschiedenen Ordnern, kann ein Link auf den kurzen Namen beide treffen.

---

## Objekte: `file.properties`

`file.properties` ist ein **Objekt** mit allen Properties einer Notiz (Name → Wert). Du erreichst einen Eintrag mit Punkt oder Klammer, auch verschachtelt:

- `file.properties.status` oder `file.properties["status"]`
- `file.properties.keys()` — die Namen als Liste, in der Reihenfolge der Frontmatter
- `file.properties.values()` — die Werte als Liste
- `file.properties.isEmpty()` — `true`, wenn die Notiz keine Properties hat

Ein fehlender Eintrag ergibt einen leeren Wert, keinen Fehler. In einer Zelle erscheint ein Objekt als kompakter Text (JSON), und eine Sortierung nach einer solchen Formel nutzt genau diesen Text.

> [!note] Slatebase-Wahlen
> Obsidian beschreibt nur `file.properties` und die drei Methoden. Textform (kompaktes JSON), Gleichheit (zwei Objekte sind gleich, wenn Namen und Werte gleich sind) und Reihenfolge sind Entscheidungen von Slatebase. Objekt-Literale gibt es nicht, und verschachtelte Frontmatter-Objekte werden noch nicht als Objekt gelesen. Pro Notiz liefert der Index höchstens 200 Properties.

---

## Grenzen und Lücken

Damit du nicht überrascht wirst:

**Datenmenge**
- Pro Abfrage prüft der Index **bis zu 5000 Notizen** als Kandidaten. Wo möglich schiebt Slatebase die billig prüfbaren Teile deines Filters (Property-Gleichheit, `file.hasTag`, `file.inFolder`) **vor** diese Grenze, sodass sie echte Treffer kaum je erreicht. Wird sie dennoch überschritten, zeigt die Ansicht einen sichtbaren Hinweis „Ergebnis gekappt" — nie ein stilles Abschneiden.

**Ausdruckssprache**
- Es ist eine **pragmatische Teilmenge** von Obsidians Funktionen (siehe Liste oben), nicht die vollständige Bibliothek. Eine unbekannte Funktion ergibt in einer Formelspalte `#ERR` und lässt in einem Filter die Notiz weg.
- Objekte gibt es nur als `file.properties` (siehe oben), nicht als Literal. `html()`, `icon()` und `image()` liefern Text bzw. einen Link, es wird nie rohes HTML eingefügt.
- `file.embeds`, `file.size` und `file.backlinks` werden unterstützt. `file.embeds` enthält nur `![[…]]`-Einbettungen; beim ersten Start nach dem Update baut Slatebase den Link-Index einmal neu auf.
- Nicht umgesetzt: Zeilenhöhe der Tabelle und die Listen-Optionen (Marker, Einrückung, Trennzeichen) — ihre YAML-Schlüssel sind nicht belegt.

**Listen vs. Einzelwerte**
- Der Index liefert jede Property als Liste. Eine Property, die in deinem Vault **irgendwo mehrere Werte** hat — oder in der Property-Typ-Registry als Liste/Tags deklariert ist — wird auch mit nur einem Wert als Liste behandelt. Nur bei einer Property, die nirgends als Liste auftaucht und nicht so deklariert ist, wird eine Ein-Element-Liste wie ein Einzelwert gelesen.

**Ansichten und Einbettung**
- Eingebaut sind **Tabelle**, **Karten**, **Liste** und **Karte** (Map); andere Ansichtstypen brauchen ein Plugin, und Plugin-Ansichten laufen nur im Browser, nicht auf dem Server.
- Eine Base lässt sich **als eigene `.base`-Datei öffnen, per `![[…]]` einbetten oder als ```` ```base ````-Codeblock direkt in eine Notiz schreiben** (jeweils schreibgeschützt). Eingebettet zeigt sie **eine** Ansicht — die erste oder die per `#Ansichtsname` gewählte — in ihrem eigenen Typ: Tabelle, Karten, Kanban oder Liste. Nur eine **Karte** (Map) und Plugin-Ansichten erscheinen eingebettet als Tabelle.
- Eine eingebettete Base aktualisiert sich bei Änderungen im Vault von selbst (auch wenn sich die einbettende Notiz und damit `this` ändert); die alte Anzeige bleibt stehen, bis die neue Abfrage fertig ist.
- `this` gilt in der eingebauten Tabelle, nicht in Ansichten, die ein Plugin liefert. Im MCP-Werkzeug `query_base` gilt es nur mit dem Parameter `thisPath`, sonst ergibt `this.…` einen leeren Wert.

**KI-Zugriff über MCP**
- Das Werkzeug `query_base` wertet eine `.base` serverseitig mit derselben Engine aus ([[Fortgeschritten/MCP Context Server|MCP-Schnittstelle]] für KI-Clients), inklusive der `summaries`. Es liefert standardmäßig 100 Zeilen (maximal 1000) und gibt Formelwerte als Text zurück.

---

## Praxisbeispiel

Dieser Vault bringt zwei fertige Beispiele mit, die auf denselben Aufgaben-Notizen arbeiten:

- [[Features/Beispiel-Aufgaben (Base)]] — eine **Tabelle** mit Filter, Formel-Spalte „Tage übrig", der Aufwands-Spalte und einer **Zusammenfassungszeile** (Anzahl, Summe des Aufwands, Durchschnitt der Resttage).
- [[Features/Beispiel-Board (Base)]] — ein **Karten-Board**, nach `status` gruppiert, mit einer Summary-Leiste über den Spalten.

Dieselben Aufgaben als **Inline-Base** — das ist ein ```` ```base ````-Block, der direkt in dieser Notiz steht:

```base
filters:
  and:
    - file.inFolder("Features/Beispiel-Aufgaben")
    - 'type == "task"'
properties:
  file.name:
    displayName: "Aufgabe"
  status:
    displayName: "Status"
  priority:
    displayName: "Priorität"
views:
  - type: table
    name: "Aufgaben"
    order:
      - file.name
      - status
      - priority
```

Öffne die Tabelle, dann:

1. Bearbeite eine `status`-Zelle direkt in der Tabelle — die Änderung landet in der Frontmatter der Notiz, und die Summary-Zeile rechnet neu.
2. Klick auf den Spalten-Header **Tage übrig** (eine Formel-Spalte), um clientseitig danach zu sortieren.
3. Öffne den Rohquellen-Modus, um das YAML samt `summaries`-Block zu sehen.
4. Öffne das Board und zieh eine Karte in eine andere Status-Spalte.

---

> [!todo] Übung
> 1. Öffne die Beispiel-Base und ändere den `status` einer Notiz aus der Tabelle heraus.
> 2. Führe **„Bases: Add item"** aus, während die Base geöffnet ist — eine neue Aufgaben-Notiz sollte im richtigen Ordner entstehen und als Zeile erscheinen.
> 3. Führe **„Neue Base erstellen"** aus und baue eine kleine eigene Base mit dem Filter `file.hasTag("features")`.
> 4. Füge eine `summaries`-Zeile mit `estimate: Sum` hinzu und bette die Base per `![[…]]` in eine andere Notiz ein.
> 5. Führe **„Bases: Neue Base einfügen"** aus und passe den `filters`-Block im eingefügten Codeblock an.

---

## Verwandte Features

- [[Features/Tags und Properties]] — Die Metadaten-Schicht, auf der Bases aufbauen
- [[Features/Suche und Ersetzen]] — Die `path:`/`tag:`/`property:`-Operatoren
- [[Features/Context Panel]] — Pro-Notiz-Ansicht derselben Properties
- [[Fortgeschritten/Plugins/Dataview]] — Die Plugin-basierte Alternative zum Abfragen von Notizen
- [[Admin/Feature Toggles]] — Bases serverweit ein-/ausschalten
