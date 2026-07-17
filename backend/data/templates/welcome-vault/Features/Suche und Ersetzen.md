---
tags: [features]
---

# Suche und Ersetzen

Slatebase bietet eine leistungsfähige Suche, mit der du Inhalte über den gesamten Vault oder sogar über mehrere Vaults hinweg findest und ersetzen kannst.

![[Screenshots/suche-ergebnisse.png]]

*Suchergebnisse mit Kontext-Zeilen*

---

## Suchpanel öffnen

- **Tastenkürzel:** `Ctrl+Shift+F` (Vault-weite Suche)
- **Über Command Palette:** `Ctrl+P` → "Suche"
- **Über Sidebar:** Klick auf das Lupen-Symbol

Das Suchpanel ersetzt temporär den Datei-Explorer in der Sidebar.

---

## Volltextsuche

Gib einfach einen Suchbegriff ein. Die Suche durchsucht den gesamten Text aller Markdown-Dateien im aktiven Vault.

**Funktionen:**
- Live-Ergebnisse während der Eingabe (mit Debounce)
- Treffer werden mit Kontext-Zeilen angezeigt
- Klick auf ein Ergebnis öffnet die Datei an der passenden Stelle

### Kontext-Zeilen

Jeder Treffer zeigt die umliegenden Zeilen, damit du den Kontext erkennst, ohne die Datei öffnen zu müssen.

---

## Regex-Suche

Aktiviere den Regex-Modus (Button mit `.*` Symbol) für musterbasierte Suche:

| Pattern | Findet |
|---------|--------|
| `#todo` | Alle Todo-Tags |
| `\d{4}-\d{2}-\d{2}` | Datumsangaben (YYYY-MM-DD) |
| `^## ` | Alle H2-Überschriften |
| `\[\[.*?\]\]` | Alle Wikilinks |
| `> \[!warning\]` | Alle Warning-Callouts |

> [!tip] Regex-Referenz
> Slatebase verwendet JavaScript-Regex. Häufig gebraucht:
> - `.` — beliebiges Zeichen
> - `*` — 0 oder mehr Wiederholungen
> - `+` — 1 oder mehr Wiederholungen
> - `\d` — Ziffer, `\w` — Wort-Zeichen
> - `^` — Zeilenanfang, `$` — Zeilenende

---

## Multi-Vault-Suche

Wenn du mehrere Vaults hast, kannst du die Suche auf alle Vaults ausdehnen:

1. Öffne das Suchpanel
2. Aktiviere "Alle Vaults durchsuchen"
3. Ergebnisse werden nach Vault gruppiert angezeigt

Nützlich, um verstreute Informationen zu finden oder Duplikate aufzuspüren.

---

## Ersetzen

### Einzelnes Ersetzen

1. Öffne das Suchpanel
2. Gib den Suchbegriff ein
3. Klappe das Ersetzen-Feld auf (Pfeil-Button oder `Ctrl+H`)
4. Gib den Ersetzungstext ein
5. Klicke bei einem Treffer auf "Ersetzen"

### Batch-Ersetzen (Alle ersetzen)

1. Gleiche Schritte wie oben
2. Klicke auf "Alle ersetzen"
3. Slatebase ersetzt in allen Dateien gleichzeitig (atomar)

> [!warning] Batch-Ersetzen
> "Alle ersetzen" ändert bis zu 100 Dateien gleichzeitig. Die Änderungen sind sofort gespeichert. Prüfe vorher die Treffer-Liste, ob alle Ergebnisse wirklich ersetzt werden sollen.

### Ersetzen mit Regex

Im Regex-Modus kannst du Capture Groups im Ersetzungstext verwenden:

| Suche | Ersetzen | Ergebnis |
|-------|----------|----------|
| `(\d{4})-(\d{2})-(\d{2})` | `$3.$2.$1` | `2024-06-15` → `15.06.2024` |
| `#(todo)` | `#erledigt` | `#todo` → `#erledigt` |

---

## Praktisches Beispiel

**Szenario:** Du möchtest alle Vorkommen von "Projekt Alpha" in "Projekt Beta" umbenennen.

1. `Ctrl+Shift+F` — Suchpanel öffnen
2. Suchbegriff: `Projekt Alpha`
3. Ersetzen-Feld aufklappen: `Projekt Beta`
4. Treffer prüfen (Anzahl und Kontext)
5. "Alle ersetzen" klicken

Alle Dateien werden atomar aktualisiert — entweder alle Änderungen greifen oder keine.

---

> [!tip] Suche als Übersicht
> Nutze die Suche nicht nur zum Finden, sondern auch als Übersicht. Zum Beispiel: `> [!todo]` zeigt dir alle offenen Aufgaben im gesamten Vault.

> [!todo] Übung
> 1. Öffne das Suchpanel mit `Ctrl+Shift+F`
> 2. Suche nach `Übung` — du solltest Treffer in allen Guide-Dateien finden
> 3. Aktiviere Regex und suche nach `^# ` (alle H1-Überschriften)
> 4. Beobachte die Kontext-Zeilen bei den Ergebnissen

---

## Verwandte Features

- [[Features/Tags und Properties]] — Strukturierte Suche über Tags
- [[Features/Wikilinks]] — Links als Alternative zur Suche
- [[Fortgeschritten/Regex Suche]] — Erweiterte Regex-Patterns
- [[Features/Context Panel]] — Schneller Überblick ohne Suche
