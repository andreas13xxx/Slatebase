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
  days_left: 'days(date(deadline), today())'
```

**Eingebaute Funktionen:** `if`, `concat`, `now`, `today`, `date`, `number`, `list`, `link`, `min`, `max`, `days`, `length`.

**Methoden:**

| Typ | Methoden |
|-----|----------|
| Text | `contains`, `startsWith`, `endsWith`, `lower`, `upper`, `trim`, `replace`, `split`, `length` |
| Zahl | `toFixed`, `round`, `abs` |
| Datum | `format`, `date`, `time` sowie `year`, `month`, `day`, `hour`, `minute`, `second` |
| Liste | `contains`, `length`, `join`, `first`, `last` |

> [!note] Datumsdifferenz
> `date1 - date2` liefert **Millisekunden** (wie in Obsidian). Willst du Tage, nimm `days(a, b)`.

---

## Zusammenfassungen (`summaries`)

Pro Spalte lässt sich eine Zusammenfassung über die angezeigten Zeilen berechnen. Sie steht unter `summaries:` der Ansicht als `Spalte: Funktion` und erscheint in der Tabelle als Zeile unter dem Inhalt, in der Karten-Ansicht als Leiste über dem Board.

```yaml
views:
  - type: table
    name: Aufgaben
    order: [file.name, status, estimate]
    summaries:
      file.name: Count
      estimate: Sum
```

Eingebaute Funktionen (wie in Obsidian):

| Gilt für | Funktionen |
|----------|-----------|
| Alle Typen | `Count`, `Empty`, `Filled`, `Unique` |
| Zahlen | `Sum`, `Average`, `Min`, `Max`, `Median`, `Range`, `Stddev` |
| Daten | `Earliest`, `Latest`, `Range` |
| Checkbox | `Checked`, `Unchecked` |

Eine numerische Funktion auf einer nicht-numerischen Spalte ergibt einen leeren Wert, keinen Fehler. Eigene Zusammenfassungen per Formel über `values` (Lambdas) sind nicht umgesetzt.

---

## In der Tabelle bearbeiten

Property-Zellen sind inline editierbar, über dieselben typisierten Controls wie der [[Features/Tags und Properties|Properties-Editor]] — Text, Zahl, Datum, Checkbox, Liste/Tags. Eine Änderung landet direkt in der Frontmatter der Notiz. Formel-Spalten sind schreibgeschützt.

Klick auf einen Spalten-Header sortiert; die Sortierung wird in die `.base`-Datei zurückgeschrieben. Das gilt auch für Formel-Spalten — die werden nach dem Laden anhand ihrer berechneten Werte sortiert.

---

## Ansichten: Tabelle, Karten, Liste und Karte

Eine Base kann mehrere Ansichten enthalten; oben erscheint dann ein Umschalter.

- **Tabelle** — eine Zeile pro Notiz, editierbare Zellen.
- **Karten (Kanban)** — Notizen nach einer Property in Spalten gruppiert. Jeder Wert wird eine Spalte, Notizen ohne Wert landen in „Ohne …". Spalten sind einklappbar, ein Klick auf eine Karte öffnet die Notiz.
  **Ziehe eine Karte in eine andere Spalte**, um den Wert der Gruppierungs-Property in der Notiz zu ändern; das Ziehen in „Ohne …" entfernt die Property. (Nur mit Schreibrecht auf den Vault.)
- **Liste** (`type: list`) — eine einfache, schreibgeschützte Liste mit einem Eintrag pro Notiz, ohne Gruppierung. Formelspalten werden ausgewertet, Zusammenfassungen erscheinen als Leiste über der Liste.
- **Karte** (`type: map`) — Notizen mit Geokoordinaten als Pins auf einer Karte; ein Klick auf einen Pin öffnet die Notiz. Die Koordinate liest Slatebase aus der Ansichts-Option `coordinates` (oder `location`) als Property mit `"Breite,Länge"` oder aus zwei Zahl-Properties `latProperty` und `lngProperty` (auch `lat`/`lng`/`longitude`). Notizen ohne lesbare Koordinate erscheinen nicht, ein Zähler nennt ihre Anzahl. Die Kartenkacheln kommen von einem Server, den der Betreiber festlegt (`SLATEBASE_MAP_TILE_URL`); ohne ihn zeigt die Ansicht nur einen Hinweis, dass sie nicht aktiv ist.

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

## Grenzen und Lücken

Damit du nicht überrascht wirst:

**Datenmenge**
- Pro Abfrage prüft der Index **bis zu 5000 Notizen** als Kandidaten. Wo möglich schiebt Slatebase die billig prüfbaren Teile deines Filters (Property-Gleichheit, `file.hasTag`, `file.inFolder`) **vor** diese Grenze, sodass sie echte Treffer kaum je erreicht. Wird sie dennoch überschritten, zeigt die Ansicht einen sichtbaren Hinweis „Ergebnis gekappt" — nie ein stilles Abschneiden.

**Ausdruckssprache**
- Es ist eine **pragmatische Teilmenge** von Obsidians Funktionen (siehe Liste oben), nicht die vollständige Bibliothek. Eine unbekannte Funktion ergibt in einer Formelspalte `#ERR` und lässt in einem Filter die Notiz weg.
- **Keine Lambdas** und keine `map`/`filter`-Operationen auf Listen (das gilt auch für eigene `summaries` per Formel).
- Nicht unterstützt: `file.embeds`. `file.size` und `file.backlinks` werden dagegen unterstützt.

**Listen vs. Einzelwerte**
- Der Index liefert jede Property als Liste. Eine Property, die in deinem Vault **irgendwo mehrere Werte** hat — oder in der Property-Typ-Registry als Liste/Tags deklariert ist — wird auch mit nur einem Wert als Liste behandelt. Nur bei einer Property, die nirgends als Liste auftaucht und nicht so deklariert ist, wird eine Ein-Element-Liste wie ein Einzelwert gelesen.

**Ansichten und Einbettung**
- Eingebaut sind **Tabelle**, **Karten**, **Liste** und **Karte** (Map); andere Ansichtstypen brauchen ein Plugin, und Plugin-Ansichten laufen nur im Browser, nicht auf dem Server.
- Eine Base lässt sich **als eigene `.base`-Datei öffnen, per `![[…]]` einbetten oder als ```` ```base ````-Codeblock direkt in eine Notiz schreiben** (jeweils schreibgeschützte Tabelle). Eingebettet zeigt sie **eine** Ansicht — die erste oder die per `#Ansichtsname` gewählte — und zwar immer als **Tabelle**, auch wenn die Ansicht vom Typ Karten, Liste oder Karte ist.
- Eine eingebettete Base wird beim Anzeigen einmal abgefragt und **nicht** bei Änderungen im Vault aktualisiert; die geöffnete `.base`-Datei dagegen schon. Das gilt auch für `this`: Ändert sich die einbettende Notiz, zeigt die Einbettung den alten Stand, bis die Notiz neu geöffnet wird.
- `this` gilt in der eingebauten Tabelle, nicht in Ansichten, die ein Plugin liefert, und nicht im MCP-Werkzeug `query_base` (dort ergibt `this.…` einen leeren Wert).

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
