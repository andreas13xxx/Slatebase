---
tags: [praxis, plugins]
---

# Übung — Dataview Queries

**Schwierigkeit:** :star::star::star: Fortgeschritten
**Dauer:** ~20 Minuten
**Voraussetzung:** Dataview-Plugin installiert und aktiviert

---

## Ziel

Du erstellst mehrere Notizen mit strukturiertem Frontmatter und schreibst Dataview-Queries, die diese Daten dynamisch als Tabellen und Listen darstellen.

---

## Schritte

> [!todo] Schritt 1: Projekt-Notizen erstellen
> Erstelle folgende 4 Dateien im Ordner `Praxis/Plugins/Projekte/`:

**Datei 1: `Praxis/Plugins/Projekte/Website-Relaunch.md`**
```markdown
---
status: aktiv
priority: hoch
deadline: 2025-04-01
assignee: Anna
tags: [projekt, frontend]
---

# Website-Relaunch

- [ ] Design-Mockups erstellen
- [ ] Content migrieren
- [ ] SEO-Optimierung
- [x] Hosting einrichten
```

**Datei 2: `Praxis/Plugins/Projekte/API-Dokumentation.md`**
```markdown
---
status: aktiv
priority: mittel
deadline: 2025-03-15
assignee: Max
tags: [projekt, backend]
---

# API-Dokumentation

- [ ] Endpunkte dokumentieren
- [ ] Beispiel-Requests schreiben
- [x] OpenAPI-Schema erstellen
```

**Datei 3: `Praxis/Plugins/Projekte/Mobile-App.md`**
```markdown
---
status: planung
priority: hoch
deadline: 2025-06-01
assignee: Lisa
tags: [projekt, mobile]
---

# Mobile-App

- [ ] Technologie-Evaluation
- [ ] Prototyp erstellen
- [ ] Nutzer-Tests planen
```

**Datei 4: `Praxis/Plugins/Projekte/Datenbank-Migration.md`**
```markdown
---
status: abgeschlossen
priority: kritisch
deadline: 2025-01-31
assignee: Max
tags: [projekt, backend]
---

# Datenbank-Migration

- [x] Schema-Design
- [x] Migrationsskript schreiben
- [x] Tests durchführen
- [x] Production-Migration
```

> [!todo] Schritt 2: Dashboard erstellen
> Erstelle `Praxis/Plugins/Projekt-Dashboard.md` mit folgenden Queries:

````markdown
# Projekt-Dashboard

## Alle Projekte

```dataview
TABLE status, priority, deadline, assignee
FROM "Praxis/Plugins/Projekte"
SORT deadline ASC
```

## Aktive Projekte

```dataview
TABLE priority, deadline, assignee
FROM "Praxis/Plugins/Projekte"
WHERE status = "aktiv"
SORT priority DESC
```

## Offene Aufgaben

```dataview
TASK
FROM "Praxis/Plugins/Projekte"
WHERE !completed
```

## Projekte nach Assignee

```dataview
LIST
FROM "Praxis/Plugins/Projekte"
WHERE assignee = "Max"
```
````

> [!todo] Schritt 3: Ergebnisse prüfen
> 1. Öffne `Projekt-Dashboard.md` im View-Modus
> 2. Die TABLE-Query sollte eine Tabelle mit 4 Zeilen zeigen
> 3. Die gefilterte Query zeigt nur aktive Projekte (2 Stück)
> 4. Die TASK-Query sammelt alle offenen Checkboxen
> 5. Die LIST-Query zeigt nur Max' Projekte

> [!todo] Schritt 4: Eigene Query schreiben
> Füge folgende Queries zum Dashboard hinzu:

````markdown
## Projekte mit hoher Priorität

```dataview
TABLE status, deadline
FROM "Praxis/Plugins/Projekte"
WHERE priority = "hoch" OR priority = "kritisch"
SORT deadline ASC
```

## Letzte 3 Dateien (nach Änderungsdatum)

```dataview
TABLE file.mtime AS "Geändert"
FROM "Praxis/Plugins/Projekte"
SORT file.mtime DESC
LIMIT 3
```
````

> [!todo] Schritt 5: Inline-Query testen
> Füge in einer der Projektdateien folgende Zeilen **direkt im Fließtext** ein (nicht in einem Code-Block):
>
> `Erstellt: ` gefolgt von `` `= this.file.cday` ``
> `Deadline: ` gefolgt von `` `= this.deadline` ``
>
> Die fertige Zeile sieht so aus: `Erstellt: `= this.file.cday``

---

## Erfolgskriterien

- [ ] 4 Projekt-Dateien mit konsistentem Frontmatter existieren
- [ ] Dashboard zeigt mindestens 3 verschiedene Query-Typen
- [ ] TABLE-Query zeigt alle 4 Projekte mit korrekten Feldern
- [ ] WHERE-Filter funktioniert (weniger Ergebnisse als unfiltriert)
- [ ] TASK-Query zeigt offene Aufgaben aus allen Dateien
- [ ] Mindestens eine selbst geschriebene Query funktioniert

---

## Bonus-Aufgaben

### Leseliste erstellen

Erstelle 3 Buch-Notizen mit `title`, `author`, `rating`, `status` und eine Query:

````markdown
```dataview
TABLE author, rating, status
FROM #buch
SORT rating DESC
```
````

### Gruppierung testen

````markdown
```dataview
TABLE rows.file.link AS "Projekte"
FROM "Praxis/Plugins/Projekte"
GROUP BY status
```
````

---

## Weiter geht's

- [[Fortgeschritten/Plugins/Dataview]] — Vollständige Dataview-Dokumentation
- [[Fortgeschritten/Plugins/Templater]] — Dynamische Vorlagen
- [[Features/Tags und Properties]] — Frontmatter-Grundlagen
