---
tags: [fortgeschritten, plugins]
---

# Tasks Plugin

Das Tasks-Plugin verwandelt gewöhnliche Checkbox-Zeilen (`- [ ]`) in ein durchsuchbares Aufgabenverwaltungssystem. Fälligkeitsdaten, Prioritäten und Wiederholungen werden als Emoji direkt in die Aufgabenzeile geschrieben — Tasks liest sie aus und stellt sie über Query-Blöcke gefiltert, sortiert und gruppiert dar.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Tasks-Plugin installiert und aktiviert
- Plugin-ZIP von GitHub: `obsidian-tasks-plugin`

---

## Installation

1. **Plugin-Verwaltung** → Tab **"Verfügbare Plugins"** öffnen und nach "Tasks" suchen
2. **Installieren** klicken, dann den **Aktivierungs-Schalter** einschalten

Nicht gelistet, oder ein bestimmter Fork/eine bestimmte Version nötig? Stattdessen die Plugin-ZIP von GitHub herunterladen und unter **"Installierte Plugins" → Plugin hochladen** verwenden.

---

## Aufgaben-Syntax

Eine Tasks-Aufgabe ist eine normale Markdown-Checkbox mit optionalen Emoji-Signifikatoren am Ende der Zeile:

```markdown
- [ ] Präsentation vorbereiten 📅 2026-08-20 ⏫
```

| Emoji | Bedeutung | Beispiel |
|-------|-----------|----------|
| 📅 | Fälligkeitsdatum | `📅 2026-08-20` |
| ⏳ | Geplantes Datum | `⏳ 2026-08-18` |
| 🛫 | Startdatum | `🛫 2026-08-15` |
| ➕ | Erstelldatum | `➕ 2026-08-10` |
| ✅ | Erledigt-Datum | `✅ 2026-08-14` |
| ❌ | Abgebrochen-Datum | `❌ 2026-08-12` |
| 🔁 | Wiederholung | `🔁 every week` |
| ⛔ | Blockiert durch (ID) | `⛔ abc123` |
| 🆔 | Eigene ID | `🆔 abc123` |

### Prioritäten

| Emoji | Priorität |
|-------|-----------|
| 🔺 | Höchste |
| ⏫ | Hoch |
| 🔼 | Mittel |
| 🔽 | Niedrig |
| ⏬ | Niedrigste |

> [!tip] Reihenfolge egal, Vollständigkeit nicht
> Die Emoji dürfen in beliebiger Reihenfolge stehen, müssen aber am Ende der Zeile bleiben — Text danach wird nicht mehr als Beschreibung erkannt.

---

## Query-Sprache

Tasks-Abfragen stehen in Code-Blöcken mit der Sprache `tasks`. Jede Zeile im Block ist ein Filter oder eine Sortier-/Anzeigeanweisung:

````markdown
```tasks
not done
due before next monday
sort by priority
```
````

### Wichtige Filter

| Filter | Beschreibung |
|--------|--------------|
| `done` / `not done` | Nur erledigte / nur offene Aufgaben |
| `due today`, `due before X`, `due after X` | Filtert nach Fälligkeitsdatum |
| `path includes X` | Nur Aufgaben aus Dateien, deren Pfad `X` enthält |
| `tags include #X` | Nur Aufgaben mit Tag `#X` |
| `priority is above medium` | Filtert nach Priorität |
| `is recurring` | Nur wiederkehrende Aufgaben |
| `no due date` | Aufgaben ohne Fälligkeitsdatum |

### Sortierung und Gruppierung

```markdown
sort by due
sort by priority
group by status
group by path
```

### Anzeige

```markdown
short mode
hide backlink
hide priority
```

---

## Wiederkehrende Aufgaben

Der `🔁`-Signifikator erzeugt beim Abhaken automatisch eine neue Instanz der Aufgabe mit verschobenem Datum:

```markdown
- [ ] Server-Backup 🔁 every week 📅 2026-08-17
```

Nach dem Abhaken entsteht:

```markdown
- [x] Server-Backup 🔁 every week 📅 2026-08-17 ✅ 2026-08-14
- [ ] Server-Backup 🔁 every week 📅 2026-08-24
```

Unterstützte Muster u.a.: `every day`, `every week`, `every month`, `every year`, `every 2 weeks`, `every weekday`.

---

## Beispiel: Persönliche Aufgabenverwaltung

```markdown
## Diese Woche

- [ ] Angebot an Kunden schicken 📅 2026-08-15 ⏫
- [ ] Rechnung Nr. 4471 prüfen 📅 2026-08-16
- [ ] Teammeeting vorbereiten 🛫 2026-08-17 📅 2026-08-18 🔼

## Wiederkehrend

- [ ] Wochenreview 🔁 every week 📅 2026-08-17
- [ ] Backup prüfen 🔁 every monday 📅 2026-08-17

## Erledigt

- [x] Kickoff-Meeting ➕ 2026-08-01 ✅ 2026-08-05
```

Dashboard-Query für offene, überfällige Aufgaben:

````markdown
```tasks
not done
due before today
sort by due
```
````

---

## Beispiel: Projekt-Dashboard mit mehreren Queries

````markdown
# Projekt-Dashboard

## Überfällig

```tasks
not done
due before today
```

## Diese Woche fällig

```tasks
not done
due after yesterday
due before in 7 days
sort by due
```

## Hohe Priorität

```tasks
not done
priority is above medium
group by path
```

## Kürzlich erledigt

```tasks
done
sort by done reverse
limit 5
```
````

---

## Kombination mit Dataview

Tasks und [[Fortgeschritten/Plugins/Dataview]] können nebeneinander laufen: Dataview besitzt selbst einen `TASK`-Query-Typ, der ebenfalls Checkbox-Zeilen sammelt — aber ohne die Emoji-Signifikatoren von Tasks zu verstehen. Für reine Fälligkeits-/Prioritäts-Workflows ist der `tasks`-Block präziser; für Abfragen über Frontmatter-Felder ist Dataview mächtiger.

---

## Einschränkungen in Slatebase

| Feature | Status |
|---------|--------|
| Checkbox-Aufgaben mit Emoji-Metadaten | Funktioniert |
| `tasks`-Query-Blöcke (Filter, Sortierung, Gruppierung) | Funktioniert |
| Wiederkehrende Aufgaben (`🔁`) | Funktioniert |
| Klick zum Abhaken direkt in der Query-Ansicht | Funktioniert |
| Globaler Filter (Einstellung) | Funktioniert |
| Auto-Vervollständigung der Emoji-Syntax beim Tippen | Eingeschränkt |

---

> [!tip] Konsistente Signifikatoren
> Halte dich an ein festes Set von Emoji (z.B. immer 📅 für Fälligkeit, nie ein Freitext-Datum). Nur so bleiben deine Queries zuverlässig.

> [!todo] Übung
> 1. Installiere und aktiviere das Tasks-Plugin
> 2. Erstelle 5 Aufgaben mit unterschiedlichen Fälligkeitsdaten und Prioritäten
> 3. Hake zwei Aufgaben ab
> 4. Erstelle einen `tasks`-Query-Block, der nur offene Aufgaben sortiert nach Fälligkeit zeigt
> 5. Füge eine wiederkehrende Aufgabe hinzu (`🔁 every week`) und hake sie ab — prüfe, ob eine neue Instanz entsteht
> 6. Erstelle einen zweiten Query-Block, der nur Aufgaben mit hoher Priorität zeigt

---

## Live-Beispiele

Die folgenden Aufgaben und Abfragen werden gerendert, wenn das Tasks-Plugin aktiviert ist — sie stammen alle aus dieser Datei.

### Aufgaben in diesem Kapitel

- [ ] Vault-Struktur reviewen 📅 2026-08-20 ⏫ #dokumentation
- [ ] Screenshots aktualisieren ⏳ 2026-08-18 🔼 #dokumentation
- [ ] Wöchentliches Backup prüfen 🔁 every week 📅 2026-08-17
- [x] Tasks-Kapitel schreiben ➕ 2026-08-10 ✅ 2026-08-14 #dokumentation
- [ ] Alte Notizen archivieren ⏬

### Offene Aufgaben, sortiert nach Fälligkeit

```tasks
not done
path includes Fortgeschritten/Plugins/Tasks
sort by due
```

### Nur hohe Priorität

```tasks
not done
path includes Fortgeschritten/Plugins/Tasks
priority is above medium
```

### Erledigte Aufgaben

```tasks
done
path includes Fortgeschritten/Plugins/Tasks
```

### Wiederkehrende Aufgaben

```tasks
path includes Fortgeschritten/Plugins/Tasks
is recurring
```

---

## Verwandte Features

- [[Fortgeschritten/Plugins/Dataview]] — Abfragen über Frontmatter und Tags
- [[Features/Tags und Properties]] — Tags zur Filterung von Aufgaben nutzen
- [[Fortgeschritten/Plugins/Kanban]] — Aufgaben visuell in Boards organisieren
- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
