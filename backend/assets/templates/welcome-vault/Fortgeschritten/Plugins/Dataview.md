---
tags: [fortgeschritten, plugins]
author: Andreas
difficulty: mittel
---

# Dataview Plugin

Dataview verwandelt deinen Vault in eine abfragbare Datenbank. Du schreibst Queries in spezielle Code-Blöcke, und Dataview generiert daraus dynamische Tabellen, Listen und Aufgabenübersichten — basierend auf Frontmatter, Tags und Datei-Metadaten.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Dataview-Plugin installiert und aktiviert
- Plugin-ZIP von GitHub: `obsidian-dataview`

---

## Installation

1. **Plugin-Verwaltung** → Tab **"Verfügbare Plugins"** öffnen und nach "Dataview" suchen
2. **Installieren** klicken, dann den **Aktivierungs-Schalter** einschalten

Nicht gelistet, oder ein bestimmter Fork/eine bestimmte Version nötig? Stattdessen die Plugin-ZIP von GitHub herunterladen und unter **"Installierte Plugins" → Plugin hochladen** verwenden.

---

## Query-Sprache (DQL)

Dataview nutzt eine eigene Query-Sprache (Dataview Query Language). Queries werden in Code-Blöcke mit der Sprache `dataview` geschrieben:

````markdown
```dataview
TABLE file.ctime AS "Erstellt", file.size AS "Größe"
FROM "Projekte"
SORT file.ctime DESC
```
````

---

## Query-Typen

### TABLE — Tabellarische Ansicht

````markdown
```dataview
TABLE status, deadline, priority
FROM #projekt
SORT deadline ASC
```
````

Erzeugt eine Tabelle mit Spalten aus Frontmatter-Feldern.

### LIST — Einfache Liste

````markdown
```dataview
LIST
FROM #meeting
WHERE file.ctime >= date("2025-01-01")
SORT file.name ASC
```
````

Erzeugt eine verlinkte Liste aller Dateien mit Tag `#meeting` ab 2025.

### TASK — Aufgabensammlung

````markdown
```dataview
TASK
FROM "Projekte"
WHERE !completed
SORT file.name ASC
```
````

Sammelt alle offenen Aufgaben (`- [ ]`) aus dem Ordner "Projekte".

---

## Frontmatter als Datenquelle

Dataview liest Felder aus dem YAML-Frontmatter:

```markdown
---
status: aktiv
deadline: 2025-03-15
priority: hoch
assignee: Max
tags: [projekt, backend]
---

# API-Redesign

Beschreibung des Projekts...
```

Diese Felder kannst du in Queries nutzen:

````markdown
```dataview
TABLE status, deadline, assignee
FROM #projekt
WHERE status = "aktiv"
SORT priority DESC
```
````

---

## Beispiel: Projektübersicht-Dashboard

Erstelle eine Datei `Dashboard.md`:

````markdown
# Dashboard

## Aktive Projekte

```dataview
TABLE status, deadline, priority
FROM #projekt
WHERE status = "aktiv"
SORT deadline ASC
```

## Überfällige Aufgaben

```dataview
TASK
FROM "Projekte"
WHERE !completed AND due < date(today)
```

## Letzte Änderungen

```dataview
TABLE file.mtime AS "Geändert"
FROM ""
SORT file.mtime DESC
LIMIT 10
```

## Meetings diese Woche

```dataview
LIST
FROM #meeting
WHERE file.ctime >= date(today) - dur(7 days)
SORT file.ctime DESC
```
````

---

## Beispiel: Leseliste

```markdown
---
title: "Clean Code"
author: "Robert C. Martin"
status: gelesen
rating: 4
finished: 2025-01-10
tags: [buch, programmierung]
---

# Clean Code

Notizen zum Buch...
```

Abfrage aller Bücher:

````markdown
```dataview
TABLE author, rating, status
FROM #buch
SORT rating DESC
```
````

---

## Beispiel: Kontaktdatenbank

```markdown
---
name: "Max Mustermann"
email: "max@example.com"
company: "TechCorp"
role: "Developer"
tags: [kontakt, tech]
---

# Max Mustermann

Notizen zur Person...
```

Abfrage:

````markdown
```dataview
TABLE company, role, email
FROM #kontakt
SORT company ASC
```
````

---

## Nützliche Operatoren

| Operator | Beschreibung | Beispiel |
|----------|--------------|---------|
| `=` | Gleich | `WHERE status = "aktiv"` |
| `!=` | Ungleich | `WHERE status != "archiviert"` |
| `>`, `<` | Größer/Kleiner | `WHERE priority > 3` |
| `contains` | Enthält | `WHERE tags contains "wichtig"` |
| `AND`, `OR` | Logische Verknüpfung | `WHERE status = "aktiv" AND priority = "hoch"` |
| `LIMIT` | Ergebnisse begrenzen | `LIMIT 5` |
| `GROUP BY` | Gruppierung | `GROUP BY status` |

---

## Inline-Queries

Neben Code-Blöcken gibt es auch Inline-Queries — diese werden **direkt im Fließtext** geschrieben (nicht in einem Code-Block). Die Syntax ist ein Backtick, Gleichzeichen, Leerzeichen, Expression, Backtick:

Beispiel (so im Editor geschrieben):

    Letzte Änderung: `= this.file.mtime`
    Dateigröße: `= this.file.size`
    Erstelldatum: `= this.file.cday`

> [!warning] Nicht in Code-Blöcke setzen
> Inline-Queries funktionieren nur im normalen Fließtext. Innerhalb von ` ``` `-Fences werden sie als Code angezeigt, nicht ausgeführt.

---

## Einschränkungen in Slatebase

| Feature | Status |
|---------|--------|
| DQL (TABLE, LIST, TASK) | Funktioniert |
| Inline-Queries | Funktioniert |
| Frontmatter-Felder lesen | Funktioniert |
| DataviewJS (JavaScript) | Eingeschränkt |
| Komplexe Funktionen | Teilweise |

> [!tip] DQL bevorzugen
> Die deklarative Query-Sprache (DQL) funktioniert zuverlässiger als DataviewJS. Nutze DQL für die meisten Anwendungsfälle.

---

## Fehlerbehebung

| Problem | Lösung |
|---------|--------|
| Query zeigt "No results" | Pfad und Tags prüfen — Groß-/Kleinschreibung beachten |
| Frontmatter-Feld nicht erkannt | YAML-Syntax prüfen (Einrückung, Anführungszeichen) |
| Tabelle leer | `FROM`-Pfad prüfen (relativ zum Vault-Root) |

---

> [!tip] Strukturiertes Frontmatter
> Je konsistenter dein Frontmatter ist, desto mächtiger werden Dataview-Queries. Definiere ein Schema (z.B. immer `status`, `tags`, `created`) und halte dich daran.

> [!todo] Übung
> 1. Installiere und aktiviere das Dataview-Plugin
> 2. Erstelle 3 Notizen mit Frontmatter-Feldern (`status`, `priority`, `tags`)
> 3. Erstelle eine Dashboard-Datei mit einer TABLE-Query
> 4. Filtere mit `WHERE` nach einem bestimmten Status
> 5. Erstelle eine TASK-Query, die alle offenen Aufgaben aus einem Ordner sammelt
> 6. Teste eine LIST-Query mit Sortierung nach Erstelldatum
> 7. Siehe [[Praxis/Plugins/Dataview Queries]] für eine geführte Übung

---

## Live-Beispiele

Die folgenden Beispiele werden automatisch gerendert, wenn das Dataview-Plugin aktiviert ist.

### Alle Dateien in diesem Vault (TABLE)

```dataview
TABLE file.ctime AS "Erstellt", file.size AS "Größe", file.folder AS "Ordner"
FROM ""
SORT file.ctime DESC
LIMIT 10
```

### Dateien mit Tag "fortgeschritten" (LIST)

```dataview
LIST
FROM #fortgeschritten
SORT file.name ASC
```

### Inline-Queries (direkt im Text)

Diese Datei heißt: `= this.file.name`

Sie wurde erstellt am: `= this.file.cday`

Sie hat die Tags: `= this.tags`

Anzahl Zeichen in dieser Datei: `= this.file.size`

Dateipfad: `= this.file.path`

Ordner: `= this.file.folder`

Letzte Änderung: `= this.file.mday`

Anzahl Links in dieser Datei: `= length(this.file.outlinks)`

Autor (custom Frontmatter): `= this.author`

Schwierigkeit: `= this.difficulty`

---

## Verwandte Features

- [[Features/Tags und Properties]] — Tags und Frontmatter als Datenquelle
- [[Features/Suche und Ersetzen]] — Alternative: textbasierte Suche
- [[Fortgeschritten/Plugins/Kanban]] — Aufgaben visuell organisieren
- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
- [[Praxis/Plugins/Dataview Queries]] — Praktische Übung
