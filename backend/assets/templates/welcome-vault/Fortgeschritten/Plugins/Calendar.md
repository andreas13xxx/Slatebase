---
tags: [fortgeschritten, plugins]
---

# Calendar Plugin

Das Calendar-Plugin zeigt einen Monatskalender in der Seitenleiste. Per Klick auf ein Datum öffnest oder erstellst du die zugehörige Daily Note — ideal für Tagebücher, Journaling und tägliche Protokolle.

> [!warning] Seit rund 2 Jahren kein Update mehr
> Das Calendar-Plugin (`liamcain/obsidian-calendar-plugin`) hatte seinen letzten GitHub-Push am 2024-06-22 — seither erscheinen keine neuen Releases mehr. Es funktioniert aktuell weiterhin zuverlässig (siehe Tabelle unten), aber Fehlerbehebungen für zukünftige Obsidian- oder Slatebase-Änderungen sind nicht zu erwarten.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Calendar-Plugin installiert und aktiviert
- Daily-Notes-Verzeichnis konfiguriert (Einstellungen → Vault → Daily Notes)

---

## Installation

1. Lade das Calendar-Plugin als ZIP von GitHub: `obsidian-calendar-plugin`
2. Einstellungen → Vault → Plugins → "Plugin installieren"
3. ZIP hochladen → Aktivieren

---

## Grundfunktion

Nach der Aktivierung erscheint ein Kalender-Widget in der rechten Seitenleiste (Context Panel):

- **Aktueller Monat** wird angezeigt mit Tagesnummern
- **Heutiges Datum** ist hervorgehoben
- **Tage mit existierender Notiz** haben einen Punkt-Indikator
- **Klick auf ein Datum** öffnet die Daily Note oder erstellt sie

### Navigation

| Aktion | Ergebnis |
|--------|----------|
| Klick auf Tag | Daily Note öffnen/erstellen |
| Pfeil links/rechts | Vorheriger/nächster Monat |
| Klick auf "Heute" | Zum aktuellen Monat springen |

---

## Konfiguration

### Daily-Notes-Verzeichnis

Das Calendar-Plugin nutzt das in Slatebase konfigurierte Daily-Notes-Verzeichnis:

1. Einstellungen (`Ctrl+,`) → Vault-Konfiguration
2. "Daily-Notes-Verzeichnis" setzen (z.B. `Journal` oder `Tägliche Notizen`)
3. Calendar erstellt Notizen in diesem Ordner

### Dateiname-Format

Daily Notes folgen dem Format `YYYY-MM-DD.md`:
- `2025-01-15.md`
- `2025-02-03.md`

---

## Beispiel-Workflow: Tägliches Journal

### Schritt 1: Verzeichnis vorbereiten

Erstelle einen Ordner `Journal` in deinem Vault und setze ihn als Daily-Notes-Verzeichnis.

### Schritt 2: Vorlage erstellen

Erstelle eine Datei `Templates/daily.md` mit folgendem Inhalt:

```markdown
---
tags: [journal, daily]
---

# {{date}}

## Morgenroutine

- [ ] Prioritäten für heute festlegen
- [ ] Gestrige Notizen reviewen

## Notizen

## Erledigtes

- [ ] 

## Reflexion

> Was lief heute gut?

```

### Schritt 3: Tägliche Nutzung

1. Klicke im Kalender auf das heutige Datum
2. Die Daily Note wird aus der Vorlage erstellt
3. Fülle die Abschnitte im Laufe des Tages
4. Am nächsten Tag: Neuer Klick → neue Notiz

---

## Wochen-Übersicht

Du kannst Wochen-Überblicke erstellen, die auf die Daily Notes verlinken:

```markdown
# Woche 03/2025

## Montag [[2025-01-13]]
- Projekt-Kickoff

## Dienstag [[2025-01-14]]
- Sprint Planning

## Mittwoch [[2025-01-15]]
- Deep Work: Dokumentation

## Donnerstag [[2025-01-16]]
- Code Review

## Freitag [[2025-01-17]]
- Retrospektive
```

---

## Einschränkungen in Slatebase

| Feature | Status |
|---------|--------|
| Monatskalender | Funktioniert |
| Daily Note öffnen/erstellen | Funktioniert |
| Punkt-Indikator für existierende Notizen | Funktioniert |
| Weekly Notes | Nicht unterstützt |
| Dot-Counts (Wortanzahl) | Nicht unterstützt |

---

> [!tip] Kalender + Vorlagen
> Kombiniere Calendar mit dem Vorlagen-System: Setze eine `daily.md`-Vorlage im Templates-Verzeichnis. Jede neue Daily Note wird damit vorausgefüllt.

> [!todo] Übung
> 1. Installiere und aktiviere das Calendar-Plugin
> 2. Konfiguriere ein Daily-Notes-Verzeichnis (z.B. `Journal`)
> 3. Erstelle eine Daily-Note-Vorlage unter `Templates/daily.md`
> 4. Klicke im Kalender auf das heutige Datum
> 5. Fülle die erstellte Notiz mit Inhalt
> 6. Klicke auf ein vergangenes Datum und erstelle eine rückwirkende Notiz
> 7. Prüfe die Punkt-Indikatoren im Kalender

---

## Verwandte Features

- [[Features/Vorlagen und Daily Notes]] — Daily Notes ohne Plugin
- [[Features/Context Panel]] — Seitenleiste (Kalender erscheint hier)
- [[Fortgeschritten/Plugins/Templater]] — Erweiterte Vorlagen
- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
