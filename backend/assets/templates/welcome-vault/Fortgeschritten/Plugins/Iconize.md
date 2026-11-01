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

## Icons erscheinen in Obsidian nicht (nur der Name steht da)

Wenn du denselben Vault auch in Obsidian öffnest, kann dort statt des Icons der Icon-Name als Text stehen (z. B. `LiFaceGrinning`).

**Ursache:** Slatebase bringt eine neuere Lucide-Bibliothek mit, als Obsidian sie eingebaut hat. Der Icon-Picker in Slatebase bietet daher Lucide-Icons (Präfix `Li`) an, die Obsidians Version noch nicht kennt. Iconize speichert nur die ID. Findet Obsidian das Icon nicht, zeigt es den Namen als Text. Betroffen sind vor allem neuere Icons, etwa die `Face…`-Icons wie `face-grinning`.

**Was nicht hilft:**
- Das Pack „Lucide" in Obsidian laden und „Lucide icon pack type" auf „Custom" stellen. Das Custom-Pack hat den Präfix `Lu` statt `Li`, deine gespeicherten `Li…`-Zuordnungen passen dann nicht mehr dazu.
- Der Ordner `.obsidian/icons/` ist beim Typ „Native" (Standard) leer und das ist normal. Er wird nur für nachgeladene Packs gebraucht.

**Was hilft:** Nimm Icons, die es in beiden Welten gibt, z. B. `LiSmile` statt `LiFaceGrinning`. Ob ein Icon in Obsidian erscheint, siehst du dort im Iconize-Picker.

> [!note] Hinweis
> Das ist die plausibelste Erklärung, geprüft wurde sie nur durch Tests mit anderen Icons, nicht gegen die Lucide-Version deines Obsidian.

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
