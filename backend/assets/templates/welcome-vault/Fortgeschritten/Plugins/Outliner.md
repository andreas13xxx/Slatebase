---
tags: [fortgeschritten, plugins]
---

# Outliner Plugin

Outliner (`obsidian-outliner`) macht aus Slatebases einfachen Aufzählungslisten einen echten Outline-Editor — ganze Äste einer Liste lassen sich als Einheit verschieben, einrücken und einklappen statt Zeile für Zeile.

> [!tip] Voll kompatibel
> Die statische Analyse zeigt, dass jeder API-Zugriff von Outliner vollständig von Slatebases Kompatibilitätsschicht emuliert wird. Es gilt als voll kompatibel und wird upstream aktiv gepflegt.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Outliner-Plugin installiert und aktiviert
- Plugin-ZIP von GitHub: `obsidian-outliner`

---

## Installation

1. **Plugin-Verwaltung** → Tab **"Verfügbare Plugins"** öffnen und nach "Outliner" suchen
2. **Installieren** klicken, dann den **Aktivierungs-Schalter** einschalten

Nicht gelistet, oder ein bestimmter Fork/eine bestimmte Version nötig? Stattdessen die Plugin-ZIP von GitHub herunterladen und unter **"Installierte Plugins" → Plugin hochladen** verwenden.

---

## Kernfunktionen

- **Ganze Äste verschieben** — per Drag oder Hotkey einen Listenpunkt inklusive aller Kinder in einem Schritt verschieben
- **Einrücken/Ausrücken als Einheit** — Tab/Shift+Tab verschachtelt eine komplette Unterliste neu, nicht nur die aktuelle Zeile
- **In einen Listenpunkt hineinzoomen** — dich auf einen einzelnen Ast der Gliederung fokussieren
- **Äste ein-/ausklappen** — Kinder einklappen, um nur die oberste Ebene der Struktur zu sehen

---

## Einschränkungen in Slatebase

| Feature | Status |
|---------|--------|
| Kern-Outlining (Verschieben, Ein-/Ausrücken, Zoom, Falten) | Funktioniert |
| Plugin lädt und aktiviert | Funktioniert |
| Optionale Vim-`o`/`O`-Tastenüberschreibung | Nicht funktional |

> [!info] Zur Vim-Tastenüberschreibung
> Outliner hat eine optionale Einstellung, die das Verhalten der Tasten `o`/`O` in Obsidians Vim-Modus überschreibt. Dafür prüft es `window.CodeMirrorAdapter.Vim`, das Slatebase nur als nicht-abstürzenden Stub bereitstellt (Slatebase hat keine echte Vim-Keymap-Engine dahinter) — diese eine optionale Integration bleibt damit wirkungslos, während der Rest des Plugins normal läuft.

---

> [!todo] Übung
> 1. Installiere und aktiviere das Outliner-Plugin
> 2. Erstelle eine verschachtelte Aufzählungsliste mit zwei bis drei Ebenen
> 3. Verschiebe einen übergeordneten Listenpunkt und prüfe, ob seine Kinder mitwandern
> 4. Zoome in einen Ast hinein und wieder heraus
> 5. Klappe einen Ast ein und wieder aus

---

## Verwandte Features

- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
- [[Fortgeschritten/Plugins/Kanban]] — Ein weiteres listenbasiertes, drag-gesteuertes Plugin
