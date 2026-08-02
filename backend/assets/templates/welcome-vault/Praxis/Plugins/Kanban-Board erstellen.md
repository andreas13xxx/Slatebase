---
tags: [praxis, plugins]
---

# Übung — Kanban-Board erstellen

**Schwierigkeit:** :star::star: Mittel
**Dauer:** ~10 Minuten
**Voraussetzung:** Kanban-Plugin installiert und aktiviert

---

## Ziel

Du erstellst ein funktionierendes Kanban-Board für ein Beispielprojekt und lernst, wie Boards als Markdown-Dateien funktionieren.

---

## Schritte

> [!todo] Schritt 1: Board-Datei erstellen
> 1. Erstelle eine neue Datei `Praxis/Plugins/Mein Sprint Board.md`
> 2. Füge folgenden Inhalt ein:
>
> ```markdown
> ---
> kanban-plugin: basic
> ---
>
> ## Backlog
>
> - [ ] Nutzerprofile implementieren
> - [ ] API-Dokumentation schreiben
> - [ ] Suchfunktion erweitern
> - [ ] Performance-Tests durchführen
>
> ## Sprint aktiv
>
> - [ ] Login-Seite redesignen #design
> - [ ] Datenbankschema aktualisieren #backend
>
> ## In Review
>
> - [ ] E-Mail-Benachrichtigungen #feature
>
> ## Done
>
> - [x] Projekt-Setup abschließen
> - [x] CI/CD einrichten
> ```

> [!todo] Schritt 2: Board im Kanban-Modus öffnen
> 1. Öffne die erstellte Datei
> 2. Das Kanban-Plugin sollte sie automatisch als Board rendern
> 3. Du siehst 4 Spalten mit Karten

> [!todo] Schritt 3: Karten verschieben
> 1. Ziehe "Login-Seite redesignen" von "Sprint aktiv" nach "In Review"
> 2. Ziehe "Nutzerprofile implementieren" von "Backlog" nach "Sprint aktiv"
> 3. Ziehe "E-Mail-Benachrichtigungen" von "In Review" nach "Done"

> [!todo] Schritt 4: Neue Karte hinzufügen
> 1. Klicke den "+" Button in der Spalte "Backlog"
> 2. Gib ein: `Benutzer-Dashboard erstellen #feature`
> 3. Bestätige mit Enter

> [!todo] Schritt 5: Markdown prüfen
> 1. Wechsle in den Source-Modus (Editor)
> 2. Beobachte: Die verschobenen Karten stehen jetzt in neuen Abschnitten
> 3. Die Markdown-Struktur spiegelt den Board-Status wider

> [!todo] Schritt 6: Wikilinks in Karten
> 1. Wechsle zurück zum Kanban-Modus
> 2. Bearbeite eine Karte und füge einen Wikilink ein:
>    `[[Praxis/Plugins/Mein Sprint Board|Sprint Board]] Review`
> 3. Der Link wird im Board klickbar angezeigt

---

## Erfolgskriterien

- [ ] Board wird als Kanban angezeigt (nicht als Markdown)
- [ ] Mindestens 2 Karten wurden zwischen Spalten verschoben
- [ ] Eine neue Karte wurde hinzugefügt
- [ ] Im Source-Modus ist die Markdown-Struktur sichtbar
- [ ] Mindestens eine Karte enthält einen Wikilink

---

## Bonus-Aufgabe

Erstelle ein persönliches Wochen-Board:

```markdown
---
kanban-plugin: basic
---

## Montag

- [ ] 

## Dienstag

- [ ] 

## Mittwoch

- [ ] 

## Donnerstag

- [ ] 

## Freitag

- [ ] 
```

Fülle es mit deinen echten Aufgaben für die Woche.

---

## Weiter geht's

- [[Praxis/Plugins/Dataview Queries]] — Dynamische Daten abfragen
- [[Fortgeschritten/Plugins/Kanban]] — Vollständige Kanban-Dokumentation
