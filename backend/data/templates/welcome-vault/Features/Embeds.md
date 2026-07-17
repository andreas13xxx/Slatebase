---
tags: [features]
---

# Embeds

Mit Embeds bettest du Inhalte anderer Dateien direkt in deine Notiz ein — Bilder, PDFs oder sogar ganze Notizen. Die Syntax ist ein Wikilink mit vorangestelltem `!`.

---

## Grundsyntax

```
![[Dateiname]]
```

Das Ausrufezeichen `!` vor den eckigen Klammern unterscheidet ein Embed von einem normalen Link.

---

## Bilder einbetten

Unterstützte Formate: PNG, JPG, JPEG, GIF, WEBP, SVG.

```
![[bild.png]]
![[Screenshots/gesamtansicht.png]]
```

### Größe anpassen

Mit dem Pipe-Zeichen gibst du eine Breite in Pixeln an:

```
![[bild.png|400]]
![[Screenshots/editor-toolbar.png|600]]
```

| Syntax | Ergebnis |
|--------|----------|
| `![[foto.png]]` | Volle Breite (max. Container) |
| `![[foto.png\|300]]` | 300px Breite |
| `![[foto.png\|150]]` | 150px Breite (Thumbnail) |

---

## PDFs einbetten

PDF-Dateien werden als Inline-Viewer angezeigt:

```
![[dokument.pdf]]
```

Der PDF-Viewer erlaubt:
- Seiten blättern
- Zoomen
- Text markieren und kopieren

> [!tip] PDF-Größe
> Für große PDFs empfiehlt sich eine Größenangabe, um den Viewer in der Höhe zu begrenzen: `![[handbuch.pdf|600]]`

---

## Notizen einbetten

Du kannst den gesamten Inhalt einer anderen Markdown-Datei einbetten:

```
![[Andere Notiz]]
```

Die eingebettete Notiz wird vollständig gerendert (mit Headings, Listen, Callouts usw.).

### Heading-Embeds

Nur einen bestimmten Abschnitt einbetten:

```
![[Andere Notiz#Abschnitt]]
```

Dies zeigt nur den Inhalt unter der angegebenen Überschrift (bis zur nächsten Überschrift gleicher oder höherer Ebene).

---

## Praktisches Beispiel

Erstelle eine Datei `Zusammenfassung.md`:

```markdown
# Zusammenfassung

## Wichtige Konzepte

Die folgenden Grundlagen sind essentiell:

![[Grundlagen/Markdown Syntax#Code-Blöcke]]

## Referenz-Bild

![[Screenshots/gesamtansicht.png|500]]

*Die Slatebase-Oberfläche im Überblick*
```

Im Viewer-Modus siehst du den eingebetteten Abschnitt und das Bild direkt in deiner Notiz.

---

## Bilder in den Vault importieren

Es gibt mehrere Wege, Bilder in deinen Vault zu bekommen:

1. **Drag & Drop** — Ziehe eine Bilddatei vom Desktop in den Datei-Explorer
2. **Einfügen** — Kopiere ein Bild und füge es im Editor mit `Ctrl+V` ein
3. **Upload-Button** — Über das Kontextmenü im Datei-Explorer

Eingefügte Bilder werden automatisch im Vault gespeichert und können sofort eingebettet werden.

---

> [!tip] Bildunterschriften
> Slatebase hat keine native Bildunterschrift-Syntax. Verwende kursiven Text direkt unter dem Embed:
> ```
> ![[diagramm.png|500]]
> *Abbildung 1: Architektur-Übersicht*
> ```

> [!todo] Übung
> 1. Erstelle eine neue Datei und bette diese Datei ein: `![[Features/Embeds#Grundsyntax]]`
> 2. Wechsle in den Viewer-Modus und prüfe, ob nur der Abschnitt "Grundsyntax" angezeigt wird
> 3. Falls du ein Bild im Vault hast, bette es mit einer Größenangabe ein

---

## Verwandte Features

- [[Features/Wikilinks]] — Links statt Einbettungen
- [[Features/Callouts]] — Hervorgehobene Inhaltsblöcke
- [[Features/Mermaid Diagramme]] — Diagramme direkt im Markdown
- [[Grundlagen/Editor und Viewer]] — Edit- und View-Modus
