---
tags: [fortgeschritten, plugins]
---

# Advanced Tables Plugin

Advanced Tables erweitert die Bearbeitung von Markdown-Tabellen um Auto-Formatierung, Tab-Navigation zwischen Zellen, Werkzeuge zum Verschieben/Sortieren von Zeilen und Spalten sowie Tabellen-Formeln. Das Dateiformat bleibt dabei reines Markdown — es entsteht kein Sonderformat wie bei Kanban oder Excalidraw.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Advanced-Tables-Plugin installiert und aktiviert
- Plugin-ZIP von GitHub: `table-editor-obsidian`

---

## Installation

1. **Plugin-Verwaltung** → Tab **"Verfügbare Plugins"** öffnen und nach "Advanced Tables" suchen
2. **Installieren** klicken, dann den **Aktivierungs-Schalter** einschalten

Nicht gelistet, oder ein bestimmter Fork/eine bestimmte Version nötig? Stattdessen die Plugin-ZIP von GitHub herunterladen und unter **"Installierte Plugins" → Plugin hochladen** verwenden.

---

## Auto-Formatierung

Sobald der Cursor eine Markdown-Tabelle verlässt, richtet Advanced Tables alle Spalten automatisch aus — Trennstriche und Leerzeichen werden neu berechnet, unabhängig davon, wie unordentlich die Tabelle vorher getippt wurde:

```markdown
| Name | Status | Deadline |
|---|---|---|
| API-Redesign | aktiv | 2026-08-20 |
| Onboarding | offen | 2026-09-01 |
```

wird automatisch zu:

```markdown
| Name         | Status | Deadline   |
| ------------ | ------ | ---------- |
| API-Redesign | aktiv  | 2026-08-20 |
| Onboarding   | offen  | 2026-09-01 |
```

---

## Navigation

| Tastenkombination | Aktion |
|--------------------|--------|
| `Tab` | Zur nächsten Zelle springen (erzeugt am Zeilenende eine neue Zeile) |
| `Shift+Tab` | Zur vorherigen Zelle springen |
| `Enter` innerhalb einer Zeile | Zur nächsten Zeile in derselben Spalte |

Damit lässt sich eine ganze Tabelle tippen, ohne die Maus zu benutzen.

---

## Zeilen und Spalten verwalten

Diese Aktionen stehen über die Command Palette (`Ctrl+P` → "Advanced Tables:") zur Verfügung, sobald der Cursor in einer Tabelle steht:

| Befehl | Beschreibung |
|--------|--------------|
| Format table | Aktuelle Tabelle neu formatieren |
| Format all tables in note | Alle Tabellen der Notiz formatieren |
| Insert column left / right | Spalte einfügen |
| Insert row above / below | Zeile einfügen |
| Delete column / Delete row | Spalte bzw. Zeile löschen |
| Move column left / right | Spalte verschieben |
| Move row up / down | Zeile verschieben |
| Sort rows ascending / descending | Zeilen nach der Spalte des Cursors sortieren |

---

## Formeln (TBLFM)

Advanced Tables unterstützt Tabellenformeln im Stil von Emacs Org-Mode. Die Formel steht als Kommentar direkt unter der Tabelle, Spalten werden mit `$N`, Zeilen mit `@N` referenziert:

```markdown
| Posten     | Menge | Preis | Summe |
| ---------- | ----- | ----- | ----- |
| Kaffee     | 3     | 4     |       |
| Kekse      | 2     | 2.5   |       |
| **Gesamt** |       |       |       |

<!-- TBLFM: @2$4=@2$2*@2$3;@3$4=@3$2*@3$3;@4$4=sum(@2..@3) -->
```

Nach dem Befehl **"Advanced Tables: Evaluate formulas"** werden die Summen-Zellen berechnet und eingesetzt. Unterstützte Funktionen sind u.a. `sum`, `average`/`mean`, `min`, `max`, `round`.

> [!warning] Formeln werden nicht automatisch neu berechnet
> Nach jeder Änderung an den Werten muss "Evaluate formulas" erneut ausgeführt werden.

---

## Beispiel: Projekt-Tracker

```markdown
| Aufgabe             | Verantwortlich | Status      | Deadline   |
| ------------------- | -------------- | ----------- | ---------- |
| API-Design           | Max            | In Arbeit   | 2026-08-20 |
| Frontend-Integration | Lisa           | Offen       | 2026-08-25 |
| Tests schreiben      | Max            | Offen       | 2026-08-27 |
| Deployment            | Team           | Blockiert   | 2026-08-30 |
```

Mit `Tab`/`Shift+Tab` lassen sich neue Zeilen anhängen, ohne die Ausrichtung von Hand zu pflegen — nach jedem Verlassen der Tabelle formatiert Advanced Tables neu.

---

## Beispiel: Budget mit Formel

```markdown
| Kategorie | Geplant | Ausgegeben |
| --------- | ------- | ---------- |
| Hosting   | 50      | 47         |
| Domains   | 20      | 18         |
| Tools     | 30      | 35         |
| **Summe** |         |            |

<!-- TBLFM: @4$2=sum(@2..@3);@4$3=sum(@2..@3) -->
```

---

## Einschränkungen in Slatebase

| Feature | Status |
|---------|--------|
| Auto-Formatierung beim Verlassen der Tabelle | Funktioniert |
| Tab-/Shift+Tab-Navigation | Funktioniert |
| Zeilen/Spalten einfügen, löschen, verschieben | Funktioniert |
| Sortieren nach Spalte | Funktioniert |
| Formeln (TBLFM, `evaluate formulas`) | Funktioniert |
| CSV-Export | Eingeschränkt |

---

> [!tip] Formatierung als Ausgangspunkt
> Auch ohne Formeln lohnt sich Advanced Tables allein für die Auto-Formatierung — Tabellen bleiben lesbar, egal wie schnell oder unordentlich getippt wird.

> [!todo] Übung
> 1. Installiere und aktiviere das Advanced-Tables-Plugin
> 2. Öffne [[Fortgeschritten/Plugins/Beispiel-Tabelle]] und beobachte, wie sich die Tabelle beim Verlassen automatisch ausrichtet
> 3. Füge über `Tab` am Ende der letzten Zeile eine neue Zeile hinzu
> 4. Sortiere die Tabelle über die Command Palette nach einer Spalte
> 5. Füge eine Formel-Zeile hinzu und berechne sie mit "Evaluate formulas"
> 6. Verschiebe eine Spalte an eine andere Position

---

## Live-Beispiel

Die folgende Tabelle richtet sich automatisch aus, sobald du sie im Editor bearbeitest und das Plugin aktiviert ist:

→ [[Fortgeschritten/Plugins/Beispiel-Tabelle]]

---

## Verwandte Features

- [[Features/Tags und Properties]] — Strukturierte Daten als Alternative zu Tabellen
- [[Fortgeschritten/Plugins/Dataview]] — Tabellen automatisch aus Frontmatter generieren
- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
