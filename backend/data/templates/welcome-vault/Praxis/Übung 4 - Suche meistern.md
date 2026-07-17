---
tags: [praxis]
---

# Übung 4 — Suche meistern

**Schwierigkeit:** :star::star::star: Fortgeschritten
**Dauer:** ~15 Minuten

---

## Ziel

Du lernst die Volltextsuche, Regex-Patterns und das Ersetzen in mehreren Dateien gleichzeitig.

## Voraussetzungen

- [[Übung 3 - Projekt organisieren]] abgeschlossen (Dateien mit verschiedenen Inhalten vorhanden)
- Du kennst grundlegende Markdown-Syntax

---

## Schritte

> [!todo] Schritt 1: Suchpanel öffnen
> 1. Drücke `Ctrl+Shift+F` (oder klicke auf das Lupen-Symbol)
> 2. Das Suchpanel öffnet sich links (ersetzt den Datei-Explorer)
> 3. Gib im Suchfeld ein: `Projekt`
> 4. Du siehst alle Dateien, die "Projekt" enthalten, mit Kontext-Zeilen
>
> Probiere verschiedene Suchbegriffe: `Meeting`, `Tags`, `Slatebase`

> [!todo] Schritt 2: Groß-/Kleinschreibung und ganze Wörter
> 1. Klicke auf das **Aa**-Symbol im Suchfeld → Groß-/Kleinschreibung beachten
> 2. Suche nach `meeting` (klein) — weniger Treffer als `Meeting`
> 3. Klicke auf das **W**-Symbol → nur ganze Wörter
> 4. Suche nach `Plan` — findet `Plan`, aber nicht `Planung`
> 5. Deaktiviere beide Filter wieder für die nächsten Schritte

> [!todo] Schritt 3: Regex-Suche aktivieren
> 1. Klicke auf das **.\***-Symbol (Regex-Modus)
> 2. Suche nach Datumsformaten mit diesem Pattern:
>
> ```
> \d{4}-\d{2}-\d{2}
> ```
>
> 3. Das Pattern findet alle Datumsangaben im Format `YYYY-MM-DD`, z.B.:
>    - `2025-01-15`
>    - `2025-02-01`
>    - `2025-03-01`

> [!todo] Schritt 4: Weitere Regex-Patterns ausprobieren
> Versuche diese Patterns (im Regex-Modus):
>
> | Pattern | Findet |
> |---------|--------|
> | `#\w+` | Alle Tags im Text |
> | `\[\[.*?\]\]` | Alle Wikilinks |
> | `^## .+` | Alle H2-Überschriften |
> | `- \[ \]` | Alle offenen Checkboxen |

> [!todo] Schritt 5: Text ersetzen (einzelne Datei)
> 1. Erstelle eine Testdatei `Sandbox/Ersetzung-Test.md`:
>
> ```markdown
> # Ersetzung Test
>
> Die Firma heißt ACME Corp.
> ACME Corp wurde 2020 gegründet.
> Kontakt: info@acme-corp.example
> ACME Corp ist in Berlin ansässig.
> ```
>
> 2. Öffne das Suchpanel (`Ctrl+Shift+F`)
> 3. Gib im Suchfeld ein: `ACME Corp`
> 4. Klappe das **Ersetzen**-Feld auf (Pfeil neben dem Suchfeld)
> 5. Gib als Ersetzung ein: `Nova GmbH`
> 6. Klicke auf **Alle ersetzen** bei der Datei `Ersetzung-Test.md`
> 7. Prüfe die Datei — alle Vorkommen sollten ersetzt sein

> [!todo] Schritt 6: Ersetzen in mehreren Dateien
> 1. Erstelle eine weitere Testdatei `Sandbox/Ersetzung-Test-2.md` mit dem Text "ACME Corp"
> 2. Suche erneut nach `ACME Corp`
> 3. Ersetze durch `Nova GmbH`
> 4. Klicke auf **Alle ersetzen** (globaler Button) und bestätige
>
> > [!warning] Vorsicht
> > "Alle ersetzen" ändert alle gefundenen Dateien auf einmal. Prüfe vorher die Treffer!

---

## Erfolgskriterien

- [ ] Du kannst das Suchpanel mit `Ctrl+Shift+F` öffnen
- [ ] Regex-Pattern `\d{4}-\d{2}-\d{2}` findet Datumsangaben
- [ ] Du hast Text in einer einzelnen Datei ersetzt
- [ ] Du hast Text über mehrere Dateien gleichzeitig ersetzt
- [ ] Die Ersetzung hat korrekt funktioniert (alle Vorkommen geändert)

---

## Was du gelernt hast

- Volltextsuche über alle Dateien im Vault
- Groß-/Kleinschreibung und Wort-Grenzen als Filter
- Regex-Patterns für komplexe Suchmuster
- Ersetzen in einzelnen Dateien und über den gesamten Vault
- Sicherheitsbewusstsein bei globalen Ersetzungen

---

## Nützliche Regex-Patterns

| Anwendung | Pattern | Beispiel |
|-----------|---------|----------|
| Datum (ISO) | `\d{4}-\d{2}-\d{2}` | 2025-01-15 |
| E-Mail | `\S+@\S+\.\S+` | info@example.com |
| URL | `https?://\S+` | https://example.com |
| Leere Zeilen | `^\s*$` | (leere Zeile) |

---

## Weiter geht's

:arrow_right: [[Übung 5 - Canvas erstellen]] — Brainstorming visuell gestalten
