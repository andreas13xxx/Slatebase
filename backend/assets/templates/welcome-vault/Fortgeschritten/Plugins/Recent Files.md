---
tags: [fortgeschritten, plugins]
---

# Recent Files Plugin

Recent Files (`recent-files-obsidian`) fügt eine Seitenleisten-Ansicht hinzu, die die zuletzt geöffneten Notizen nachverfolgt — so springst du zurück zu etwas, ohne im Dateibaum zu suchen.

> [!tip] Voll kompatibel
> Die statische Analyse zeigt, dass jeder API-Zugriff von Recent Files vollständig von Slatebases Kompatibilitätsschicht emuliert wird. Es gilt als voll kompatibel und wird upstream aktiv gepflegt.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Recent-Files-Plugin installiert und aktiviert
- Plugin-ZIP von GitHub: `recent-files-obsidian`

---

## Installation

1. **Plugin-Verwaltung** → Tab **"Verfügbare Plugins"** öffnen und nach "Recent Files" suchen
2. **Installieren** klicken, dann den **Aktivierungs-Schalter** einschalten

Nicht gelistet, oder ein bestimmter Fork/eine bestimmte Version nötig? Stattdessen die Plugin-ZIP von GitHub herunterladen und unter **"Installierte Plugins" → Plugin hochladen** verwenden.

---

## Kernfunktionen

- **Recent-Files-Ansicht** — eine Seitenleisten-Ansicht mit den zuletzt geöffneten Notizen, neueste zuerst
- **Mit einem Klick zurückspringen** — einen Eintrag auswählen, um die Notiz wieder zu öffnen
- **Einträge anpinnen** — eine Datei anpinnen, damit sie unabhängig vom Öffnungszeitpunkt in der Liste bleibt
- **Pfade und Endungen ausschließen** — bestimmte Ordner oder Dateitypen (z. B. einen Tagesnotizen-Ordner, Bildanhänge) über die Plugin-Einstellungen von der Verfolgung ausnehmen
- **Listenlänge begrenzen** — festlegen, wie viele Einträge die Ansicht behält

---

## Die Ansicht öffnen

Die Recent-Files-Ansicht öffnet sich über das registrierte Ribbon-Icon oder über die Command Palette (`Ctrl+P` → "Recent Files: Open Recent Files"). Die Ansicht dockt wie jede andere Seitenleisten-Ansicht an und aktualisiert sich automatisch beim Wechsel zwischen Notizen.

---

## Einschränkungen in Slatebase

| Feature | Status |
|---------|--------|
| Recent-Files-Seitenleisten-Ansicht | Funktioniert |
| Zu einer letzten Datei springen | Funktioniert |
| Einträge anpinnen/lösen | Funktioniert |
| Pfade/Endungen in den Einstellungen ausschließen | Funktioniert |
| Plugin lädt und aktiviert | Funktioniert |

---

> [!tip] Eingebaute Alternative
> Slatebases eigene [[Features/Lesezeichen]]-Ansicht deckt manuell kuratierte Favoriten ab. Recent Files ergänzt das um eine automatische, zeitlich sortierte Liste, die du nicht selbst pflegen musst.

> [!todo] Übung
> 1. Installiere und aktiviere das Recent-Files-Plugin
> 2. Öffne die Recent-Files-Ansicht über das Ribbon oder die Command Palette
> 3. Öffne ein paar verschiedene Notizen und beobachte, wie sich die Liste aktualisiert
> 4. Pinne einen Eintrag an, damit er oben bleibt
> 5. Schließe einen Ordner oder eine Dateiendung in den Plugin-Einstellungen aus und prüfe, dass er aus der Liste verschwindet

---

## Verwandte Features

- [[Features/Lesezeichen]] — Manuell kuratierte Favoriten und gespeicherte Suchen
- [[Features/Command Palette]] — Die Recent-Files-Ansicht ohne Ribbon öffnen
- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
