---
tags: [fortgeschritten, plugins]
---

# Paste URL into Selection

Paste URL into Selection (`url-into-selection`) ist ein kleines Komfort-Plugin: Text markieren, eine URL aus der Zwischenablage einfügen — und aus der Markierung wird ein richtiger Markdown-Link, statt dass der Text von der rohen URL überschrieben wird.

> [!tip] Voll kompatibel
> Die statische Analyse zeigt, dass alle API-Zugriffe dieses Plugins vollständig von Slatebases Kompatibilitätsschicht emuliert werden. Als voll kompatibel eingestuft und im Original aktiv gepflegt.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Plugin "Paste URL into Selection" installiert und aktiviert
- Plugin-ZIP von GitHub: `obsidian-url-into-selection`

---

## Installation

1. Öffne **Plugin-Verwaltung** → Tab **"Verfügbare Plugins"** und suche nach "Paste URL into selection"
2. Klicke **Installieren**, dann den **Aktivierungs-Toggle** einschalten

Nicht gelistet, oder ein bestimmter Fork/eine bestimmte Version nötig? Alternativ die ZIP von GitHub herunterladen und über **"Installierte Plugins" → Plugin installieren** hochladen.

---

## Kernfunktionen

- **Markieren, dann Link einfügen** — Text markieren, eine URL darüber einfügen, und daraus wird `[markierter Text](url)` statt dass die rohe URL den markierten Text ersetzt
- **Normales Einfügen bleibt unverändert** — Einfügen ohne Markierung oder mit Inhalten, die keine URL sind, funktioniert weiterhin wie gewohnt
- **Konfigurierbare URL-Erkennung** — in den Plugin-Einstellungen lässt sich die Regex anpassen, mit der entschieden wird, ob der Inhalt der Zwischenablage als URL zählt

---

## Beispiel

1. Einen Satz schreiben: `Details stehen in der Dokumentation.`
2. Das Wort `Dokumentation` markieren
3. Eine URL kopieren (z. B. `https://example.com/docs`) und über die Markierung einfügen
4. Ergebnis: `Details stehen in der [Dokumentation](https://example.com/docs).`

---

## Einschränkungen in Slatebase

| Funktion | Status |
|----------|--------|
| Markierung mit eingefügter URL umwandeln | Funktioniert |
| Normales Einfügen (ohne Markierung / keine URL) | Funktioniert |
| Eigene URL-Regex in den Einstellungen | Funktioniert |

---

> [!tip] Eingebaute Alternative
> Slatebases eigener Editor-Befehl **Link einfügen** (Command Palette → "Link einfügen", siehe [[Features/Live Preview Editor]]) verpackt eine Markierung ebenfalls als `[Text](url)` und setzt den Cursor danach auf "url" zum Eintippen. Paste URL into Selection spart diesen letzten Schritt, wenn der Link schon in der Zwischenablage liegt.

> [!todo] Übung
> 1. Plugin "Paste URL into Selection" installieren und aktivieren
> 2. Einen kurzen Satz schreiben und darin ein Wort oder eine Phrase markieren
> 3. Eine URL kopieren und über die Markierung einfügen
> 4. Prüfen, dass daraus ein Markdown-Link wurde statt dass der Text überschrieben wurde

---

## Verwandte Features

- [[Features/Live Preview Editor]] — Eingebauter Link-einfügen-Befehl
- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
