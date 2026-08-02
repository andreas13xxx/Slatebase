---
tags: [features]
---

# Context Panel

Das Context Panel ist die rechte Seitenleiste in Slatebase. Es zeigt kontextabhängige Informationen zur aktuell geöffneten Datei — von der Dokument-Gliederung über Verlinkungen bis zu Tags und Properties.

![[Screenshots/context-panel.png]]

*Das Context Panel zeigt Outline, Links und Tags*

---

## Panel öffnen und schließen

- **Automatisch:** Das Panel ist standardmäßig sichtbar
- **Manuell:** Über den Resize-Handle am Rand zuklappen oder aufziehen
- **Tastenkürzel:** Über Command Palette (`Ctrl+P` → "Context Panel")

---

## Verfügbare Ansichten

Das Panel hat mehrere Tabs, zwischen denen du wechseln kannst:

### Outline

Zeigt die Überschriften-Hierarchie der aktuellen Datei:

- H1 → H2 → H3 als verschachtelter Baum
- Klick auf eine Überschrift scrollt im Editor/Viewer dorthin
- Nützlich für die Navigation in langen Dokumenten

### Forward-Links

Alle Wikilinks, die **von** der aktuellen Datei ausgehen:

- Aufgelöste Links (Zieldatei existiert)
- Unresolved Links (Zieldatei existiert noch nicht — gestrichelt dargestellt)
- Klick öffnet die verlinkte Datei

### Backlinks

Alle Dateien, die **auf** die aktuelle Datei verlinken:

- Zeigt den Kontext (die Zeile, in der der Link steht)
- Klick öffnet die verlinkende Datei
- Besonders wertvoll, um zu entdecken, wo eine Notiz referenziert wird

### Tags

Alle Tags im gesamten Vault als hierarchische Liste:

- Verschachtelte Tags als aufklappbarer Baum (z.B. `#projekt/` mit Kindern)
- Anzahl der Verwendungen pro Tag
- Klick expandiert den Tag und zeigt verwendende Dateien

### Properties

Frontmatter-Felder der aktuellen Datei als Schlüssel-Wert-Tabelle:

- Zeigt `tags`, `datum`, `autor` und alle anderen YAML-Felder
- Read-only Ansicht (Bearbeitung im Editor)
- Listen werden kommasepariert angezeigt

---

## Splits (Mehrere Abschnitte)

Du kannst mehrere Ansichten gleichzeitig sehen:

1. Ziehe einen Tab in den unteren Bereich des Panels
2. Das Panel teilt sich in zwei Abschnitte (Split-View)
3. Jeder Abschnitt zeigt eine andere Ansicht
4. Der Trennbalken ist per Drag verschiebbar

**Beispiel-Setup:**
- Oben: Outline (Navigation)
- Unten: Backlinks (Kontext)

---

## Tab-Reihenfolge anpassen

Die Tabs im Panel lassen sich per Drag & Drop umsortieren:

1. Klicke auf einen Tab und halte die Maustaste
2. Ziehe ihn an die gewünschte Position
3. Lasse los — die neue Reihenfolge wird gespeichert

Die Reihenfolge bleibt über Sitzungen hinweg erhalten (localStorage).

---

## Praktisches Beispiel

Öffne diese Datei (`Features/Context Panel.md`) und beobachte das Context Panel:

1. **Outline:** Du siehst die Überschriften dieser Datei (Panel öffnen, Splits, etc.)
2. **Forward-Links:** Zeigt die ausgehenden Links (z.B. zu Wikilinks, Tags, Knowledge Graph)
3. **Backlinks:** Zeigt, welche anderen Dateien auf diese Datei verlinken
4. **Tags:** Du siehst `#features` (aus dem Frontmatter)
5. **Properties:** Zeigt `tags: [features]`

Klicke auf eine Überschrift in der Outline — der Viewer scrollt zur entsprechenden Stelle.

---

> [!tip] Backlinks als Entdeckungstool
> Backlinks zeigen dir Zusammenhänge, die du beim Schreiben nicht bewusst eingeplant hast. Wenn du eine Notiz über "Markdown" schreibst und verschiedene Guides darauf verlinken, siehst du über Backlinks sofort alle Kontexte, in denen Markdown relevant ist.

> [!tip] Split-View nutzen
> Die Split-Ansicht ist ideal für die Kombination:
> - **Outline + Backlinks** — Wo bin ich + Wer verweist auf mich?
> - **Forward-Links + Tags** — Wohin verlinke ich + Wie ist diese Datei kategorisiert?

> [!todo] Übung
> 1. Öffne das Context Panel (rechte Seite)
> 2. Wechsle zwischen den Tabs (Outline, Links, Tags, Properties)
> 3. Klicke auf einen Forward-Link, um die Zieldatei zu öffnen
> 4. Erstelle einen Split: Ziehe einen Tab in die untere Hälfte

---

## Verwandte Features

- [[Features/Wikilinks]] — Links erstellen, die im Panel erscheinen
- [[Features/Tags und Properties]] — Was in Tags/Properties angezeigt wird
- [[Features/Knowledge Graph]] — Visuelle Alternative zum Panel
- [[Grundlagen/Navigation und Tabs]] — Panel in der Gesamtoberfläche
