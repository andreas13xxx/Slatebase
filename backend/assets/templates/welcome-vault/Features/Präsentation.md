---
tags: [features]
---

# Präsentation (Slides)

Eine Notiz lässt sich als Vollbild-Präsentation zeigen. Jede Folie ist ein Abschnitt der Notiz.

## Starten

1. Öffne eine Markdown-Notiz
2. Öffne die Command Palette (`Strg+P`) und wähle **Präsentation starten** (`slides:start`)

## Folien trennen

Eine Zeile, die nur `---` enthält, beginnt eine neue Folie. Vor der Zeile muss eine Leerzeile stehen — sonst ist es die Unterstreichung einer Überschrift.

```markdown
# Titel

---

## Erste Folie

- Punkt A
- Punkt B

---

## Zweite Folie
```

Frontmatter am Anfang der Notiz zählt nicht als Folie. Ein `---` in einem Code-Block trennt nichts.

## Bedienung

| Taste | Wirkung |
|-------|---------|
| `→`, `↓`, `Leertaste`, `Bild ↓` | Nächste Folie |
| `←`, `↑`, `Bild ↑` | Vorherige Folie |
| `Pos1` / `Ende` | Erste / letzte Folie |
| `Esc` | Präsentation beenden |

Die Folien zeigen den aktuellen Text der Notiz, auch ungespeicherte Änderungen.

> [!todo] Übung
> 1. Lege eine neue Notiz an und schreibe drei Abschnitte, getrennt durch `---`
> 2. Starte die Präsentation und blättere mit den Pfeiltasten

---

## Verwandte Features

- [[Features/Command Palette]] — Befehle ausführen
- [[Features/Live Preview Editor]] — Folieninhalt schreiben
