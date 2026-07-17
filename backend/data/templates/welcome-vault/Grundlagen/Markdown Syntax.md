---
tags:
  - grundlagen
---

# Markdown Syntax

Markdown ist die Formatierungssprache, mit der du in Slatebase schreibst. Im Edit-Modus siehst du den Markdown-Code, im View-Modus das formatierte Ergebnis.

![[Screenshots/viewer-formatiert.png]]

*Formatierte Ansicht im View-Modus*

---

## Überschriften

Verwende `#`-Zeichen für Überschriften (1–6 Ebenen):

```markdown
# Überschrift 1
## Überschrift 2
### Überschrift 3
#### Überschrift 4
##### Überschrift 5
###### Überschrift 6
```

> [!tip] Tipp
> Verwende maximal 3 Ebenen in einer Notiz. Zu viele Ebenen machen die Struktur unübersichtlich.

---

## Textformatierung

| Syntax | Ergebnis | Beschreibung |
|--------|----------|--------------|
| `**fett**` | **fett** | Hervorhebung |
| `*kursiv*` | *kursiv* | Betonung |
| `~~durchgestrichen~~` | ~~durchgestrichen~~ | Veraltetes |
| `**_fett und kursiv_**` | **_fett und kursiv_** | Kombination |
| `` `Code` `` | `Code` | Inline-Code |

---

## Listen

### Ungeordnete Liste

```markdown
- Erster Punkt
- Zweiter Punkt
  - Unterpunkt
- Dritter Punkt
```

### Geordnete Liste

```markdown
1. Schritt eins
2. Schritt zwei
   1. Unter-Schritt
3. Schritt drei
```

### Checkliste

```markdown
- [x] Erledigt
- [ ] Noch offen
```

---

## Tabellen

```markdown
| Spalte A | Spalte B | Spalte C |
|----------|----------|----------|
| Wert 1   | Wert 2   | Wert 3   |
| Wert 4   | Wert 5   | Wert 6   |
```

---

## Code-Blöcke

### Inline-Code

Verwende Backticks für Code im Fließtext: `variableName` oder `npm install`.

### Fenced Code-Block

Umschließe mehrzeiligen Code mit drei Backticks und gib die Sprache an:

````markdown
```javascript
function greet(name) {
  return `Hallo, ${name}!`;
}
```
````

Unterstützte Sprachen: `javascript`, `typescript`, `python`, `css`, `html`, `json`, `bash` und viele mehr.

---

## Horizontale Linie

Drei Bindestriche erzeugen eine Trennlinie:

```markdown
---
```

---

## Blockzitate

```markdown
> Dies ist ein Zitat.
```

> Dies ist ein Zitat.

---

## Links

```markdown
[Externer Link](https://example.com)
```

Für interne Links verwende Wikilinks: `[[Dateiname]]` — mehr dazu im Guide [[Features/Wikilinks|Wikilinks]].

---

> [!todo] Übung
> Erstelle eine neue Datei in diesem Vault und probiere folgende Elemente aus:
> 1. Eine Überschrift mit `##`
> 2. Einen fettgedruckten Satz
> 3. Eine Liste mit 3 Punkten
> 4. Einen Code-Block mit einer beliebigen Sprache
>
> Wechsle dann in den View-Modus, um das Ergebnis zu sehen.

---

## Verwandte Seiten

- [[Grundlagen/Editor und Viewer|Editor und Viewer]] — Nächster Guide
- [[Features/Callouts|Callouts]] — Spezielle Hinweisboxen
- [[Features/Mermaid Diagramme|Mermaid-Diagramme]] — Diagramme in Markdown
