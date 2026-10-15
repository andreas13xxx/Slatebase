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
| **`views`** | Eine oder mehrere benannte Ansichten: **Tabelle** oder **Karten** (Kanban), je mit eigener Spaltenreihenfolge, Sortierung, Filter und `limit` |
| **`summaries`** | Zusammenfassungen je Spalte — werden gelesen und beim Speichern erhalten, aber noch nicht berechnet (siehe Grenzen) |

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

## In der Tabelle bearbeiten

Property-Zellen sind inline editierbar, über dieselben typisierten Controls wie der [[Features/Tags und Properties|Properties-Editor]] — Text, Zahl, Datum, Checkbox, Liste/Tags. Eine Änderung landet direkt in der Frontmatter der Notiz. Formel-Spalten sind schreibgeschützt.

Klick auf einen Spalten-Header sortiert; die Sortierung wird in die `.base`-Datei zurückgeschrieben.

---

## Ansichten: Tabelle und Karten (Kanban)

Eine Base kann mehrere Ansichten enthalten; oben erscheint dann ein Umschalter.

- **Tabelle** — eine Zeile pro Notiz, editierbare Zellen.
- **Karten (Kanban)** — Notizen nach einer Property in Spalten gruppiert. Jeder Wert wird eine Spalte, Notizen ohne Wert landen in „Ohne …". Spalten sind einklappbar, ein Klick auf eine Karte öffnet die Notiz.
  **Ziehe eine Karte in eine andere Spalte**, um den Wert der Gruppierungs-Property in der Notiz zu ändern; das Ziehen in „Ohne …" entfernt die Property. (Nur mit Schreibrecht auf den Vault.)

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

## Grenzen und Lücken

Damit du nicht überrascht wirst:

**Datenmenge**
- Pro Abfrage liefert der Index **höchstens 1000 Notizen** als Kandidaten (in der Reihenfolge der Ansichts-Sortierung); gefiltert wird erst danach. In sehr großen Vaults kann eine Base daher Treffer nicht sehen, die jenseits dieser 1000 liegen — auch ein Filter wie `file.inFolder(...)` verkleinert diesen Kreis nicht, weil er erst nachträglich greift.

**Ausdruckssprache**
- Es ist eine **pragmatische Teilmenge** von Obsidians Funktionen (siehe Liste oben), nicht die vollständige Bibliothek. Eine unbekannte Funktion ergibt in einer Formelspalte `#ERR` und lässt in einem Filter die Notiz weg.
- **Keine Lambdas** und keine `map`/`filter`-Operationen auf Listen.
- Nicht unterstützte Datei-Felder: `file.size`, `file.backlinks`, `file.embeds`.
- **Listen mit einem Eintrag:** Der Index liefert jede Property als Liste, ein einzelner Wert und eine Ein-Element-Liste sind dort nicht zu unterscheiden. Nur `tags`, `aliases`, `cssclasses`, `file.tags` und `file.links` gelten immer als Liste; bei jeder anderen Property wird eine Liste mit genau einem Eintrag wie ein einzelner Wert behandelt (`.contains()` prüft dann Text statt Listenelement).

**Formeln und Zusammenfassungen**
- Formelspalten sind **schreibgeschützt** und lassen sich **nicht sortieren** (die Sortierung greift nur für Properties, `file.name`, `file.ctime`, `file.mtime`).
- **`summaries` werden nicht berechnet:** Der Block wird gelesen und beim Speichern unverändert erhalten, eine Zusammenfassungszeile erscheint aber nicht.

**Ansichten**
- Eingebaut sind nur **Tabelle** und **Karten**; alles andere braucht ein Plugin. Die Plugin-Ansichten laufen ausschließlich im Browser, nicht auf dem Server.
- Eine Base lässt sich **nicht als Codeblock in eine Notiz einbetten**, nur als eigene `.base`-Datei öffnen.
- Der Obsidian-Befehl „Eintrag zur Base hinzufügen" (`bases:add-item`) fehlt: Neue Notizen legst du selbst an; sie erscheinen, sobald sie den Filter erfüllen.

**KI-Zugriff über MCP**
- Das Werkzeug `query_base` wertet eine `.base` serverseitig mit derselben Engine aus ([[Fortgeschritten/MCP Context Server|MCP-Schnittstelle]] für KI-Clients). Es hat dieselbe 1000er-Grenze, liefert standardmäßig 100 Zeilen (maximal 1000) und gibt Formelwerte als Text zurück. `total` ist die Zeilenzahl der Ansicht (nach deren eigenem `limit`), `truncated` zeigt nur, ob das `limit` des Aufrufs weitere Zeilen abgeschnitten hat.

---

## Praxisbeispiel

Dieser Vault bringt ein fertiges Beispiel mit: [[Features/Beispiel-Aufgaben (Base)]]. Es filtert eine kleine Menge Aufgaben-Notizen mit `file.inFolder(...)` und `type == "task"` und zeigt eine Formel-Spalte „Tage übrig". Öffne es, dann:

1. Bearbeite eine `status`-Zelle direkt in der Tabelle — die Änderung landet in der Frontmatter der Notiz.
2. Klick auf den Spalten-Header **Priorität**, um zu sortieren.
3. Öffne den Rohquellen-Modus, um das YAML hinter der Tabelle zu sehen.

---

> [!todo] Übung
> 1. Öffne die Beispiel-Base und ändere den `status` einer Notiz aus der Tabelle heraus.
> 2. Lege eine neue Notiz mit `type: task`, `status` und `priority` im Ordner der Beispiel-Aufgaben an — sie sollte als neue Zeile erscheinen.
> 3. Führe **„Neue Base erstellen"** aus und baue eine kleine eigene Base mit dem Filter `file.hasTag("features")`.
> 4. Füge eine zweite Ansicht `type: cards` mit `groupBy: { property: status }` hinzu und ziehe eine Karte in eine andere Spalte.

---

## Verwandte Features

- [[Features/Tags und Properties]] — Die Metadaten-Schicht, auf der Bases aufbauen
- [[Features/Suche und Ersetzen]] — Die `path:`/`tag:`/`property:`-Operatoren
- [[Features/Context Panel]] — Pro-Notiz-Ansicht derselben Properties
- [[Fortgeschritten/Plugins/Dataview]] — Die Plugin-basierte Alternative zum Abfragen von Notizen
- [[Admin/Feature Toggles]] — Bases serverweit ein-/ausschalten
