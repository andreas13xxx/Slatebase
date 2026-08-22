---
tags: [fortgeschritten, plugins]
---

# Iconize Plugin

Iconize (`obsidian-icon-folder`) weist Dateien und Ordnern individuelle Icons zu, die im Dateibaum vor dem Namen erscheinen. Dazu bringt es einen durchsuchbaren Icon-Picker mit mehreren nachladbaren Icon-Packs (Boxicons, Feather, Simple Icons, Tabler, Lucide, …).

> [!warning] Kernfunktion in Slatebase eingeschränkt
> Iconize weist Icons über einen direkten DOM-Zugriff auf den Datei-Explorer zu (`fileExplorer.view.fileItems[path]` → `titleEl.querySelector('.iconize-icon')`). Slatebases Dateibaum ist React-gerendert und exponiert diese Struktur nicht. Das Plugin installiert, aktiviert sich und der Icon-Picker öffnet sich normal — aber die eigentliche Kernfunktion, **Icons im Dateibaum anzuzeigen, funktioniert nicht zuverlässig**. Vermutlich sind auch ähnliche Datei-Explorer-Erweiterungen (z. B. File Explorer Note Count, Folder Notes) betroffen.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Iconize-Plugin installiert und aktiviert
- Plugin-ZIP von GitHub: `obsidian-icon-folder` (Repository [florianwoelki/obsidian-iconize](https://github.com/florianwoelki/obsidian-iconize))

---

## Installation

1. **Plugin-Verwaltung** → Tab **"Verfügbare Plugins"** öffnen und nach "Iconize" suchen
2. **Installieren** klicken, dann den **Aktivierungs-Schalter** einschalten

Nicht gelistet, oder ein bestimmter Fork/eine bestimmte Version nötig? Stattdessen die Plugin-ZIP von GitHub herunterladen und unter **"Installierte Plugins" → Plugin hochladen** verwenden.

---

## Icon zuweisen (Grundfunktion)

1. Rechtsklick auf eine Datei oder einen Ordner im Dateibaum
2. "Icon ändern" im Kontextmenü wählen
3. Im Icon-Picker durchsuchen oder einen Suchbegriff eingeben
4. Icon auswählen

In echtem Obsidian erscheint das Icon danach vor dem Datei-/Ordnernamen im Dateibaum. In Slatebase öffnet sich der Picker und die Auswahl lässt sich treffen, aber das Icon selbst zeigt sich im Dateibaum meist nicht (siehe Warnung oben) — der Rest des Plugins (Einstellungen, Icon-Pack-Verwaltung) funktioniert unabhängig davon.

---

## Icon-Packs nachladen

Iconize lädt zusätzliche Icon-Packs bei Bedarf als ZIP von GitHub herunter:

| Icon-Pack | Beschreibung |
|-----------|--------------|
| Boxicons | Umfangreiches, generisches Icon-Set |
| Feather | Minimalistische Outline-Icons |
| Simple Icons | Marken- und Produkt-Logos |
| Tabler | Umfangreiches Outline-Icon-Set |
| Lucide | Deckt sich teilweise mit Slatebases eingebauten Icons |

Der Download läuft über `requestUrl()` und funktioniert grundsätzlich in Slatebase, ist aber zusätzlich von der Netzwerk-Allowlist des Backend-Proxys abhängig.

---

## Einschränkungen in Slatebase

| Feature | Status |
|---------|--------|
| Plugin installieren/aktivieren | Funktioniert |
| Icon-Picker öffnen und durchsuchen | Funktioniert |
| Icon-Pack nachladen | Funktioniert (abhängig von Netzwerk-Allowlist) |
| Icon im Dateibaum anzeigen | Eingeschränkt — meist nicht sichtbar |
| Icon in Notiz-Titeln/Tabs | Nicht unterstützt |

---

> [!tip] Alternative für sichtbare Datei-Unterscheidung
> Solange Iconize-Icons im Dateibaum nicht zuverlässig erscheinen, eignen sich Emoji-Präfixe direkt im Dateinamen (z. B. `📌 Wichtige Notiz.md`) oder konsistente Namenskonventionen besser für die visuelle Unterscheidung in Slatebase.

> [!todo] Übung
> 1. Installiere und aktiviere das Iconize-Plugin
> 2. Öffne den Icon-Picker per Rechtsklick auf eine Datei im Dateibaum
> 3. Wähle ein Icon aus einem der mitgelieferten Icon-Packs aus
> 4. Prüfe, ob das Icon im Dateibaum erscheint
> 5. Lade probeweise ein zusätzliches Icon-Pack nach (z. B. Boxicons)

---

## Verwandte Features

- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
- [[Fortgeschritten/Plugins/Calendar]] — Weiteres getestetes Plugin mit Sidebar-Integration
