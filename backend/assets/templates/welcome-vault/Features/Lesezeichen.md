---
tags: [features]
---

# Lesezeichen

Über das Stern-Symbol markierte Dateien (**Favoriten**) sind der einfachste Fall — Slatebase kennt daneben eine eigene **Lesezeichen**-Ansicht in der linken Seitenleiste, in der du diese Favoriten sortierst, umbenennst und verwaltest. Über die Command Palette kommen drei weitere Lesezeichen-Typen hinzu: Überschriften, Textblöcke und gespeicherte Suchanfragen.

---

## Die Lesezeichen-Ansicht öffnen

1. Klicke in der linken Seitenleiste auf den Tab **Lesezeichen** (Stern-Symbol)
2. Alle Favoriten des aktuellen Vaults erscheinen als Liste

---

## Reihenfolge ändern

Ziehe einen Eintrag per Drag & Drop an die gewünschte Position:

1. Klicke und halte einen Eintrag in der Lesezeichen-Liste
2. Ziehe ihn nach oben oder unten
3. Eine Einfüge-Markierung zeigt die Zielposition
4. Lasse los, um die neue Reihenfolge zu speichern

Lässt du außerhalb der Liste los, bleibt die ursprüngliche Reihenfolge erhalten.

---

## Kontextmenü

Rechtsklick (oder die Kontextmenü-Taste bzw. `Shift+F10` bei fokussiertem Eintrag) öffnet ein Menü mit:

| Option | Wirkung |
|--------|---------|
| Umbenennen | Eigenen Anzeigenamen vergeben (siehe unten) |
| Im Datei-Explorer anzeigen | Wechselt zum Datei-Explorer und hebt die Datei hervor (nicht bei Such-Lesezeichen) |
| Aus Favoriten entfernen | Löscht den Eintrag |

---

## Eigene Anzeigenamen

Ein Dateiname wie `2026-Q1-Planung-final-v3.md` ist als Lesezeichen-Beschriftung wenig hilfreich. Über **Umbenennen** im Kontextmenü vergibst du einen eigenen Anzeigenamen:

1. Rechtsklick auf den Eintrag → **Umbenennen**
2. Neuen Namen eingeben, `Enter` bestätigt
3. `Escape` bricht ohne Änderung ab

Gibst du wieder den ursprünglichen Dateinamen ein, wird der eigene Name entfernt und die Datei zeigt automatisch wieder ihren echten Namen. Der tatsächliche Pfad bleibt als Tooltip beim Überfahren mit der Maus sichtbar.

---

## Weitere Lesezeichen-Typen (Command Palette)

Über die [[Features/Command Palette|Command Palette]] (`Ctrl+P`) stehen vier zusätzliche Bookmark-Befehle zur Verfügung — ihre Namen erscheinen auf Englisch, da sie Obsidians eigene Befehlsnamen übernehmen:

| Befehl | Wirkung |
|--------|---------|
| `Bookmarks: Bookmark heading under cursor...` | Merkt sich die nächstgelegene Überschrift oberhalb des Cursors |
| `Bookmarks: Bookmark block under cursor...` | Merkt sich den Absatz unter dem Cursor als Textblock (fügt bei Bedarf eine Block-ID `^abc123` am Absatzende ein) |
| `Bookmarks: Bookmark current search...` | Speichert die aktuelle Suchanfrage samt Groß-/Kleinschreibung- und Regex-Einstellung |
| `Bookmarks: Bookmark all tabs...` | Fügt alle aktuell geöffneten Datei-Tabs als Favoriten hinzu (übersprungen werden bereits favorisierte Tabs) |

Diese Lesezeichen erscheinen mit eigenem Icon in der Lesezeichen-Ansicht:

- **Überschriften-Lesezeichen** — öffnet die Datei
- **Block-Lesezeichen** — öffnet die Datei
- **Such-Lesezeichen** — öffnet das Suchpanel und führt die gespeicherte Anfrage direkt aus

> [!tip] Grenze
> Insgesamt sind maximal 50 Lesezeichen pro Vault möglich — unabhängig vom Typ.

---

## Praktisches Beispiel

Du arbeitest an einem längeren Recherche-Projekt:

1. Öffne deine wichtigste Übersichtsdatei und markiere sie als Favorit (Stern-Symbol)
2. Wechsle in die Lesezeichen-Ansicht und benenne sie um in „📌 Projektübersicht"
3. Öffne eine lange Quelldatei, positioniere den Cursor unter einer relevanten Überschrift und führe `Bookmarks: Bookmark heading under cursor...` aus
4. Suche vaultweit nach einem wiederkehrenden Begriff und speichere die Suche mit `Bookmarks: Bookmark current search...`
5. Ziehe die Übersicht in der Lesezeichen-Liste ganz nach oben

---

> [!todo] Übung
> Markiere zwei beliebige Dateien in diesem Vault als Favorit. Wechsle in die Lesezeichen-Ansicht, benenne einen der beiden Einträge um und sortiere ihn per Drag & Drop an die erste Position.

---

## Verwandte Features

- [[Grundlagen/Datei-Explorer|Datei-Explorer]] — Der Stern zum Favorisieren lebt hier
- [[Features/Command Palette|Command Palette]] — Zugang zu den vier zusätzlichen Lesezeichen-Typen
- [[Features/Suche und Ersetzen|Suche und Ersetzen]] — Grundlage für Such-Lesezeichen
