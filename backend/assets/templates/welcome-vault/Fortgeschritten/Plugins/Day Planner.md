---
tags: [fortgeschritten, plugins]
---

# Day Planner Plugin

Day Planner (`obsidian-day-planner`) verwandelt zeitlich geblockte Checkbox-Zeilen in deiner Daily Note in eine visuelle Timeline — ein Tagesplan zum Überfliegen statt einer flachen Aufgabenliste.

> [!tip] Aktiv gepflegt und getestet
> Day Planner wird upstream aktiv weiterentwickelt und wurde manuell mit seinem echten, von GitHub geladenen Bundle innerhalb von Slatebase getestet (nicht nur statisch analysiert) — eines von wenigen Plugins, die auf diese Weise verifiziert wurden. Es gilt als voll kompatibel.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Day-Planner-Plugin installiert und aktiviert
- Plugin-ZIP von GitHub: `obsidian-day-planner`

---

## Installation

1. **Plugin-Verwaltung** → Tab **"Verfügbare Plugins"** öffnen und nach "Day Planner" suchen
2. **Installieren** klicken, dann den **Aktivierungs-Schalter** einschalten

Nicht gelistet, oder ein bestimmter Fork/eine bestimmte Version nötig? Stattdessen die Plugin-ZIP von GitHub herunterladen und unter **"Installierte Plugins" → Plugin hochladen** verwenden.

---

## Kernfunktionen

- **Timeline-Ansicht** — ein Seitenleisten-Panel, das zeitlich geblockte Aufgaben aus deiner Daily Note als vertikalen Tagesplan darstellt
- **Time Tracker** — zeigt den Fortschritt innerhalb des aktuellen Zeitblocks
- **Zeitblock-Syntax** — schreibe Aufgaben mit Zeitspanne direkt in deine Daily Note; Day Planner erkennt sie automatisch
- **Per Drag verschieben** — passe die Zeit eines Blocks direkt in der Timeline-Ansicht an

---

## Einschränkungen in Slatebase

| Feature | Status |
|---------|--------|
| Plugin lädt und aktiviert | Funktioniert |
| Timeline-Ansicht | Funktioniert |
| Time Tracker | Funktioniert |
| Zeitblock-Parsing | Funktioniert |

---

> [!info] Warum es zuverlässig funktioniert
> Day Planners Timeline- und Time-Tracker-Komponenten lesen `ItemView.containerEl` positionsbasiert aus (erst der Header, dann der Content) statt per CSS-Selektor. Slatebases View-Shim wurde exakt gegen dieses Zwei-Kind-Layout geprüft — deshalb hält dieses Plugin auch beim Test mit dem echten Bundle stand, wo andere Plugins nur die statische Analyse bestehen.

> [!todo] Übung
> 1. Installiere und aktiviere das Day-Planner-Plugin
> 2. Füge deiner heutigen Daily Note ein paar zeitlich geblockte Aufgaben hinzu
> 3. Öffne die Timeline-Ansicht und prüfe, ob die Blöcke in der richtigen Reihenfolge erscheinen
> 4. Beobachte, wie der Time Tracker im Laufe des Tages aktualisiert wird

---

## Verwandte Features

- [[Features/Vorlagen und Daily Notes]] — Daily Notes ohne Plugin
- [[Fortgeschritten/Plugins/Calendar]] — Seitenleisten-Kalender für Daily Notes
- [[Fortgeschritten/Plugins/Tasks]] — Checkbox-basierte Aufgabenverwaltung
- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
