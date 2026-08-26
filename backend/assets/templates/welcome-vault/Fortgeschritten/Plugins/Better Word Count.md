---
tags: [fortgeschritten, plugins]
---

# Better Word Count Plugin

Better Word Count (`better-word-count`) ersetzt die Statusleisten-Anzeige durch detailliertere Schreibstatistiken — Wörter, Zeichen, Sätze, Lesezeit und mehr, wahlweise für das ganze Dokument oder nur für die aktuelle Auswahl.

> [!tip] Voll kompatibel
> Manuell mit dem echten, aus GitHub geladenen Bundle getestet — läuft in Slatebase ohne Einschränkungen.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Better-Word-Count-Plugin installiert und aktiviert
- Plugin-ZIP von GitHub: `better-word-count`

---

## Installation

1. **Plugin-Verwaltung** → Tab **"Verfügbare Plugins"** öffnen und nach "Better Word Count" suchen
2. **Installieren** klicken, dann den **Aktivierungs-Schalter** einschalten

Nicht gelistet, oder ein bestimmter Fork/eine bestimmte Version nötig? Stattdessen die Plugin-ZIP von GitHub herunterladen und unter **"Installierte Plugins" → Plugin hochladen** verwenden.

---

## Kernfunktionen

- **Erweiterte Statusleisten-Statistik** — Wortanzahl, Zeichenanzahl (mit/ohne Leerzeichen), Satzanzahl, geschätzte Lesezeit und Seitenanzahl
- **Auswahlbasierte Zählung** — sobald Text markiert ist, zeigt die Statusleiste die Werte für die Auswahl statt für das ganze Dokument
- **Konfigurierbare Anzeige** — in den Plugin-Einstellungen auswählen, welche Statistiken sichtbar sind und in welcher Reihenfolge
- **Wörter-pro-Seite-Einstellung** — Grundlage für die Seitenanzahl-Schätzung anpassen

---

## Einschränkungen in Slatebase

| Feature | Status |
|---------|--------|
| Statusleisten-Statistiken (Wörter/Zeichen/Sätze/Lesezeit) | Funktioniert |
| Auswahlbasierte Zählung | Funktioniert |
| Einstellungen (angezeigte Statistiken, Reihenfolge) | Funktioniert |
| Plugin lädt und aktiviert | Funktioniert |

---

> [!tip] Eingebaute Alternative
> Slatebases eigene Statusleiste zeigt bereits Wort- und Zeichenanzahl inklusive Auswahl-Statistik an (siehe [[Features/Statusleiste]]). Better Word Count ergänzt das um Sätze, Lesezeit und Seitenanzahl sowie feinere Konfigurierbarkeit.

> [!todo] Übung
> 1. Installiere und aktiviere das Better-Word-Count-Plugin
> 2. Öffne eine längere Notiz und beobachte die erweiterte Statusleisten-Anzeige
> 3. Markiere einen Textabschnitt und beobachte, wie sich die Zahlen auf die Auswahl umstellen
> 4. Passe in den Plugin-Einstellungen an, welche Statistiken angezeigt werden

---

## Verwandte Features

- [[Features/Statusleiste]] — Slatebases eingebaute Wort-/Zeichenzählung
- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
