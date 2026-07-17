---
tags: [features]
---

# Wikilinks

Wikilinks sind das Herzstück von Slatebase. Mit der `[[...]]`-Syntax kannst du beliebige Notizen miteinander verknüpfen und ein Wissensnetz aufbauen.

![[Screenshots/wikilink-autocomplete.png]]

*Wikilinks in der formatierten Ansicht*

---

## Grundsyntax

Die einfachste Form eines Wikilinks verweist auf eine andere Datei im Vault:

```
[[Dateiname]]
```

Slatebase löst den Link automatisch auf — du musst keinen vollständigen Pfad angeben, solange der Dateiname eindeutig ist.

### Beispiele

| Syntax | Ergebnis |
|--------|----------|
| `[[Start hier]]` | Verlinkt zur Datei "Start hier.md" |
| `[[Grundlagen/Markdown Syntax]]` | Verlinkt mit explizitem Pfad |
| `[[Features/Wikilinks]]` | Verlinkt zu dieser Datei |

---

## Pfad-Angaben

Wenn mehrere Dateien denselben Namen haben, kannst du den Pfad angeben:

```
[[Ordner/Unterordner/Dateiname]]
```

Slatebase versucht automatisch den kürzesten eindeutigen Pfad aufzulösen. Nur bei Mehrdeutigkeit ist der volle Pfad nötig.

---

## Aliase (Anzeigenamen)

Mit dem Pipe-Zeichen `|` kannst du einen alternativen Anzeigenamen vergeben:

```
[[Ziel|Angezeigter Text]]
```

### Beispiele

| Syntax | Anzeige |
|--------|---------|
| `[[Start hier\|Startseite]]` | Startseite |
| `[[Features/Knowledge Graph\|Graph]]` | Graph |
| `[[Grundlagen/Markdown Syntax\|Markdown lernen]]` | Markdown lernen |

Der Link zeigt den Text nach dem `|`, verweist aber auf die Datei vor dem `|`.

---

## Heading-Links

Du kannst direkt auf eine Überschrift innerhalb einer Datei verlinken:

```
[[Dateiname#Überschrift]]
```

### Beispiele

```
[[Markdown Syntax#Code-Blöcke]]
[[Features/Callouts#Faltbare Callouts]]
[[#Grundsyntax]]
```

Der letzte Fall — `[[#Überschrift]]` ohne Dateiname — verlinkt auf eine Überschrift *in der aktuellen Datei*.

---

## Block-Referenzen

Neben Headings kannst du auch einzelne Absätze (Blöcke) referenzieren:

```
[[Dateiname#^block-id]]
```

Dazu muss der Zielabsatz am Ende eine Block-ID haben:

```markdown
Dies ist ein wichtiger Absatz. ^mein-block
```

Dann verlinkst du mit:

```
[[Dateiname#^mein-block]]
```

---

## Auto-Resolve

Slatebase löst Wikilinks intelligent auf:

1. **Exakter Match** — Dateiname stimmt exakt überein
2. **Ohne Extension** — `[[Notiz]]` findet `Notiz.md`
3. **Kürzester Pfad** — Bei Eindeutigkeit reicht der Dateiname ohne Ordner
4. **Case-insensitive** — `[[notiz]]` findet `Notiz.md`

Wenn ein Link nicht aufgelöst werden kann, wird er als "Broken Link" dargestellt (gestrichelte Unterstreichung). Du kannst darauf klicken, um eine neue Datei mit diesem Namen zu erstellen.

---

## Praktisches Beispiel

Erstelle eine neue Datei `Meine Ideen.md` mit folgendem Inhalt:

```markdown
# Meine Ideen

Hier sammle ich Gedanken, die mit [[Features/Wikilinks|Verlinkung]] zusammenhängen.

## Nächste Schritte

- Den [[Features/Knowledge Graph]] erkunden
- Mehr über [[Features/Tags und Properties|Tags]] lernen
- Zurück zur [[Features/Übersicht]]
```

Wechsle dann in den Viewer-Modus — alle Links sollten klickbar sein.

---

> [!tip] Tipp: Backlinks nutzen
> Jeder Link den du erstellst, erzeugt automatisch einen **Backlink** beim Ziel. Im [[Features/Context Panel]] siehst du alle Dateien, die auf die aktuelle Datei verweisen. So entdeckst du Zusammenhänge, ohne aktiv danach zu suchen.

> [!todo] Übung
> 1. Erstelle eine neue Datei mit 3 Wikilinks zu verschiedenen Dateien in diesem Vault
> 2. Verwende mindestens einen Alias (`[[Ziel|Anzeige]]`)
> 3. Verlinke auf eine Überschrift (`[[Datei#Heading]]`)
> 4. Öffne das Context Panel und prüfe die Backlinks

---

## Verwandte Features

- [[Features/Embeds]] — Inhalte einbetten statt nur verlinken
- [[Features/Knowledge Graph]] — Verknüpfungen visuell darstellen
- [[Features/Context Panel]] — Backlinks und Forward-Links anzeigen
- [[Features/Suche und Ersetzen]] — Links über Suche finden
