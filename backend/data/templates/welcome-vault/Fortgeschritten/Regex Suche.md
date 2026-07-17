---
tags: [fortgeschritten]
---

# Regex Suche

Reguläre Ausdrücke (Regex) sind mächtige Suchmuster, mit denen du komplexe Textstrukturen in deinen Notizen finden kannst. Dieser Guide erklärt die wichtigsten Konzepte mit praktischen Beispielen.

---

## Regex-Modus aktivieren

1. Öffne das Suchpanel mit `Ctrl+Shift+F`
2. Klicke auf den `.*`-Button rechts neben dem Suchfeld
3. Gib ein Regex-Pattern ein — die Ergebnisse aktualisieren sich live

---

## Character Classes (Zeichenklassen)

```regex
\d    — Eine Ziffer (0-9)
\D    — Kein Ziffern-Zeichen
\w    — Wort-Zeichen (Buchstaben, Ziffern, Unterstrich)
\W    — Kein Wort-Zeichen
\s    — Whitespace (Leerzeichen, Tab, Newline)
\S    — Kein Whitespace
.     — Beliebiges Zeichen (außer Newline)
```

### Eigene Klassen mit eckigen Klammern

```regex
[aeiou]      — Ein Vokal
[A-Z]        — Ein Großbuchstabe
[0-9a-f]     — Hexadezimale Ziffer
[^0-9]       — Alles außer Ziffern (^ negiert)
```

---

## Quantifier (Wiederholungen)

```regex
*       — 0 oder mehr (gierig)
+       — 1 oder mehr (gierig)
?       — 0 oder 1 (optional)
{n}     — Exakt n Wiederholungen
{n,m}   — Zwischen n und m Wiederholungen
```

### Gierig vs. Genügsam

Mit `?` hinter dem Quantifier wird er genügsam (matcht so wenig wie möglich):

- `\[\[.*\]\]` matcht `[[Link A]] und [[Link B]]` (alles auf einmal)
- `\[\[.*?\]\]` matcht `[[Link A]]` und `[[Link B]]` (jeweils einzeln)

---

## Anker (Position)

```regex
^       — Zeilenanfang
$       — Zeilenende
\b      — Wortgrenze
```

**Beispiele:** `^## .*` findet alle H2-Überschriften. `\bProjekt\b` findet "Projekt" als ganzes Wort (nicht "Projektplan").

---

## Gruppen und Capture Groups

```regex
(Gruppe)        — Capture Group ($1, $2, ...)
(?:Gruppe)      — Non-Capturing Group
(A|B)           — Alternative: A oder B
```

### Ersetzen mit Capture Groups

| Suche | Ersetzen | Ergebnis |
|-------|----------|----------|
| `(\w+), (\w+)` | `$2 $1` | `Müller, Hans` → `Hans Müller` |
| `## (.+)` | `### $1` | H2 → H3 herabstufen |
| `\[(.+?)\]\((.+?)\)` | `[[$2\|$1]]` | Markdown-Link → Wikilink |

---

## Lookahead und Lookbehind

Prüfen ob ein Muster vor/nach der Position steht, **ohne es einzuschließen**:

```regex
(?=Muster)      — Positive Lookahead (Muster folgt)
(?!Muster)      — Negative Lookahead (Muster folgt NICHT)
(?<=Muster)     — Positive Lookbehind (Muster steht davor)
(?<!Muster)     — Negative Lookbehind (Muster steht NICHT davor)
```

**Beispiele:**

```regex
\w+(?=:)            — Wort direkt vor einem Doppelpunkt
#(?!#)\w+           — Tags (aber nicht Headings wie ##)
(?<!\[)\[(?!\[)     — Einzelne [ (keine Wikilinks [[)
```

---

## Praktische Patterns für Notizen

```regex
\[\[([^\]]+)\]\]              — Alle Wikilinks finden
(?<!\w)#[a-zA-Zäöü][\w/ÄÖÜß-]*  — Alle Tags finden
^#{1,6}\s*$                   — Leere Überschriften
^- \[ \] .+                   — Offene Aufgaben
^- \[x\] .+                   — Erledigte Aufgaben
^> \[!(warning|danger)\]      — Warning/Danger-Callouts
\d{4}-\d{2}-\d{2}            — Datumsangaben (YYYY-MM-DD)
^(\w+):\s*(.+)$              — Frontmatter Key-Value-Paare
```

---

## Escape-Zeichen

Diese Zeichen müssen mit `\` escaped werden, um sie literal zu suchen:

```regex
\. \* \+ \? \^ \$ \| \\ \( \) \[ \] \{ \}
```

Um z.B. `[!tip]` literal zu finden: `\[!tip\]`

---

> [!tip] Pattern testen
> Teste Regex direkt im Suchpanel. Die Live-Ergebnisse zeigen sofort, ob dein Pattern matcht. Starte einfach und verfeinere schrittweise.

> [!warning] Performance
> Sehr komplexe Patterns (verschachtelte Quantifier wie `(a+)+`) können die Suche verlangsamen. Halte Patterns so einfach wie möglich.

---

## Verwandte Features

- [[Features/Suche und Ersetzen]] — Grundlagen der Suche
- [[Praxis/Übung 4 - Suche meistern]] — Regex-Übungen zum Ausprobieren
- [[Features/Tags und Properties]] — Alternative Strukturierung über Tags
