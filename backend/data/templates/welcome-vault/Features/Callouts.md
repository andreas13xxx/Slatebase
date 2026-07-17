---
tags: [features]
---

# Callouts

Callouts sind farbig hervorgehobene Hinweisboxen, mit denen du wichtige Informationen, Warnungen oder Tipps visuell kennzeichnest. Slatebase unterstützt alle gängigen Callout-Typen.

![[Screenshots/callout-typen.png]]

*Verschiedene Callout-Typen in der Vorschau*

---

## Grundsyntax

Ein Callout ist ein Blockquote mit einem speziellen Typ-Marker:

```markdown
> [!typ] Optionaler Titel
> Inhalt des Callouts.
> Kann mehrere Zeilen haben.
```

---

## Alle Callout-Typen

### Informationen & Hinweise

> [!note] Note
> Allgemeiner Hinweis oder Zusatzinformation.

```markdown
> [!note] Note
> Allgemeiner Hinweis oder Zusatzinformation.
```

> [!info] Info
> Nützliche Information, die den Kontext ergänzt.

```markdown
> [!info] Info
> Nützliche Information, die den Kontext ergänzt.
```

> [!tip] Tipp
> Ein hilfreicher Tipp, der die Arbeit erleichtert.

```markdown
> [!tip] Tipp
> Ein hilfreicher Tipp, der die Arbeit erleichtert.
```

### Warnungen & Fehler

> [!warning] Warnung
> Achtung — hier ist Vorsicht geboten.

```markdown
> [!warning] Warnung
> Achtung — hier ist Vorsicht geboten.
```

> [!danger] Gefahr
> Kritische Information — kann zu Datenverlust führen.

```markdown
> [!danger] Gefahr
> Kritische Information — kann zu Datenverlust führen.
```

> [!bug] Bug
> Bekanntes Problem oder Fehlverhalten.

```markdown
> [!bug] Bug
> Bekanntes Problem oder Fehlverhalten.
```

> [!failure] Fehler
> Etwas ist fehlgeschlagen oder wird nicht unterstützt.

```markdown
> [!failure] Fehler
> Etwas ist fehlgeschlagen oder wird nicht unterstützt.
```

### Positives & Aufgaben

> [!success] Erfolg
> Bestätigung, dass etwas funktioniert hat.

```markdown
> [!success] Erfolg
> Bestätigung, dass etwas funktioniert hat.
```

> [!todo] Aufgabe
> Eine Übung oder ein Schritt, der ausgeführt werden soll.

```markdown
> [!todo] Aufgabe
> Eine Übung oder ein Schritt, der ausgeführt werden soll.
```

> [!question] Frage
> Offene Frage oder etwas zum Nachdenken.

```markdown
> [!question] Frage
> Offene Frage oder etwas zum Nachdenken.
```

### Struktur & Referenz

> [!abstract] Zusammenfassung
> Kurze Zusammenfassung des Inhalts.

```markdown
> [!abstract] Zusammenfassung
> Kurze Zusammenfassung des Inhalts.
```

> [!example] Beispiel
> Ein konkretes Anwendungsbeispiel.

```markdown
> [!example] Beispiel
> Ein konkretes Anwendungsbeispiel.
```

> [!quote] Zitat
> „Der beste Weg, etwas zu lernen, ist es zu tun."

```markdown
> [!quote] Zitat
> „Der beste Weg, etwas zu lernen, ist es zu tun."
```

---

## Faltbare Callouts

Mit einem `-` nach dem Typ wird das Callout faltbar (standardmäßig eingeklappt):

```markdown
> [!tip]- Klicke zum Aufklappen
> Dieser Inhalt ist zunächst versteckt.
> Nützlich für optionale Details oder Spoiler.
```

> [!tip]- Klicke zum Aufklappen
> Dieser Inhalt ist zunächst versteckt.
> Nützlich für optionale Details oder Spoiler.

Mit `+` ist das Callout faltbar, aber standardmäßig aufgeklappt:

```markdown
> [!info]+ Details (aufgeklappt)
> Dieser Inhalt ist sichtbar, kann aber eingeklappt werden.
```

> [!info]+ Details (aufgeklappt)
> Dieser Inhalt ist sichtbar, kann aber eingeklappt werden.

---

## Callouts ohne Titel

Du kannst den Titel weglassen — dann wird der Typ-Name als Titel verwendet:

```markdown
> [!warning]
> Dieses Callout hat keinen eigenen Titel.
```

> [!warning]
> Dieses Callout hat keinen eigenen Titel.

---

## Verschachtelte Inhalte

Callouts können beliebigen Markdown enthalten:

```markdown
> [!example] Formatierung im Callout
> - Listen funktionieren
> - **Fett** und *kursiv* auch
> - Sogar `Code` und [[Features/Wikilinks|Links]]
>
> | Spalte A | Spalte B |
> |----------|----------|
> | Wert 1   | Wert 2   |
```

> [!example] Formatierung im Callout
> - Listen funktionieren
> - **Fett** und *kursiv* auch
> - Sogar `Code` und [[Features/Wikilinks|Links]]

---

## Praktisches Beispiel

Eine Anleitung mit verschiedenen Callout-Typen:

```markdown
# Server einrichten

> [!info] Voraussetzungen
> Du brauchst Node.js 22+ und einen freien Port 3000.

Starte den Server mit `npm run dev`.

> [!warning] Firewall
> Stelle sicher, dass Port 3000 in der Firewall freigeschaltet ist.

> [!success] Fertig
> Der Server läuft jetzt unter http://localhost:3000

> [!tip]- Fehlerbehebung
> Falls der Port belegt ist, ändere ihn in `config/default.json`.
```

---

> [!tip] Wann welchen Typ verwenden?
> - **tip** — Hilfreiche Abkürzungen, Best Practices
> - **warning** — Potenzielle Probleme, die vermeidbar sind
> - **danger** — Kritische Aktionen (Datenverlust, nicht rückgängig machbar)
> - **info** — Kontext, Hintergrundinformation
> - **todo** — Aktive Aufgaben und Übungen
> - **example** — Konkrete Anwendungsfälle

> [!todo] Übung
> Erstelle eine neue Notiz und verwende mindestens 3 verschiedene Callout-Typen. Probiere auch ein faltbares Callout aus (`> [!tip]- Titel`).

---

## Verwandte Features

- [[Features/Embeds]] — Inhalte einbetten
- [[Grundlagen/Markdown Syntax]] — Allgemeine Markdown-Formatierung
- [[Features/Mermaid Diagramme]] — Weitere visuelle Elemente
