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

**Live-Beispiel:** Im Vault liegt unter `Anhänge/Demo-Bild.png` ein Testbild. Der folgende Code

```
![[Anhänge/Demo-Bild.png|400]]
```

erzeugt direkt darunter dieses eingebettete Bild:

![[Anhänge/Demo-Bild.png|400]]

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

Zum Vergleich dasselbe Demo-Bild als Thumbnail:

![[Anhänge/Demo-Bild.png|150]]

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

**Live-Beispiel:** Im Vault liegt unter `Anhänge/Demo-Dokument.pdf` ein zweiseitiges Test-PDF. Der Code

```
![[Anhänge/Demo-Dokument.pdf|500]]
```

rendert den folgenden Inline-Viewer — blättere auf Seite 2, um zu sehen, dass die Navigation funktioniert:

![[Anhänge/Demo-Dokument.pdf|500]]

---

## Audio einbetten

Unterstützte Formate: MP3, WAV, OGG, FLAC, M4A, AAC, WMA.

```
![[aufnahme.mp3]]
![[podcast-folge.ogg]]
```

Audio-Embeds werden als nativer Audio-Player mit Play/Pause-Button dargestellt.

---

## Video einbetten

Unterstützte Formate: MP4, WebM, OGV, MOV, MKV.

```
![[vortrag.mp4]]
![[screencast.webm|640]]
```

### Größe anpassen

Die gleiche Pipe-Syntax wie bei Bildern funktioniert auch für Videos:

| Syntax | Ergebnis |
|--------|----------|
| `![[video.mp4]]` | Volle Breite |
| `![[video.mp4\|640]]` | 640px Breite |
| `![[video.mp4\|640x360]]` | 640×360px |

---

## Notizen einbetten

Du kannst den gesamten Inhalt einer anderen Markdown-Datei einbetten:

```
![[Andere Notiz]]
```

Die eingebettete Notiz wird vollständig gerendert (mit Headings, Listen, Callouts usw.).

**Live-Beispiel:** Im Vault liegt unter `Anhänge/Demo-Notiz.md` eine Demo-Notiz mit zwei Abschnitten. Der Code

```
![[Anhänge/Demo-Notiz]]
```

bettet die komplette Notiz ein — inklusive beider Abschnitte, Liste und Callout:

![[Anhänge/Demo-Notiz]]

### Heading-Embeds

Nur einen bestimmten Abschnitt einbetten:

```
![[Andere Notiz#Abschnitt]]
```

Dies zeigt nur den Inhalt unter der angegebenen Überschrift (bis zur nächsten Überschrift gleicher oder höherer Ebene).

**Live-Beispiel:** Derselbe Code mit `#Abschnitt B` zeigt nur diesen einen Abschnitt aus der Demo-Notiz — Abschnitt A und der einleitende Text fehlen:

```
![[Anhänge/Demo-Notiz#Abschnitt B]]
```

![[Anhänge/Demo-Notiz#Abschnitt B]]

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
> 3. Bette `Anhänge/Demo-Bild.png` mit einer anderen Breite ein, z. B. `![[Anhänge/Demo-Bild.png|250]]`
> 4. Bette `Anhänge/Demo-Dokument.pdf` ein und blättere im Viewer auf Seite 2
> 5. Bette `Anhänge/Demo-Notiz` einmal komplett und einmal nur mit `#Abschnitt A` ein — vergleiche die beiden Ergebnisse

---

## Verwandte Features

- [[Features/Wikilinks]] — Links statt Einbettungen
- [[Features/Callouts]] — Hervorgehobene Inhaltsblöcke
- [[Features/Mermaid Diagramme]] — Diagramme direkt im Markdown
- [[Features/Mathe (LaTeX)]] — Mathematische Formeln mit KaTeX
- [[Grundlagen/Editor und Viewer]] — Edit- und View-Modus
