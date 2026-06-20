# Requirements Document

## Introduction

Dieses Feature erweitert das bestehende Markdown-Rendering in Slatebase um Obsidian-spezifische Syntax-Elemente. Ziel ist die vollständige Kompatibilität mit Obsidian-Vaults, sodass Wikilinks, Embeds, Callouts, Tags und Block-Referenzen korrekt dargestellt werden. Das Feature baut auf der bestehenden Markdown-Infrastruktur (unified, remark-parse, remark-gfm, remark-frontmatter) auf und erweitert die ViewMode-Komponente um dedizierte remark-Plugins für Obsidian-Syntax.

## Glossary

- **Wikilink_Parser**: Remark-Plugin das `[[Target]]`, `[[Target|Anzeige]]` und `[[Target#Heading]]` Syntax im Markdown-AST erkennt und als eigene MDAST-Nodes repräsentiert
- **Embed_Parser**: Remark-Plugin das `![[Datei]]` und `![[Datei#Abschnitt]]` Syntax erkennt und als Embed-Nodes im AST repräsentiert
- **Callout_Parser**: Remark-Plugin das Obsidian-Callout-Syntax (`> [!typ] Titel`) in Blockquotes erkennt und als Callout-Nodes repräsentiert
- **Tag_Parser**: Remark-Plugin das Inline-Tags (`#tag`, `#verschachtelt/tag`) erkennt und als Tag-Nodes repräsentiert
- **Link_Resolver**: Modul das Wikilink-Targets gegen den DirectoryTree auflöst und den vollständigen Dateipfad zurückgibt
- **Embed_Renderer**: Komponente die Embed-Nodes als eingebettete Inhalte (Bilder, Notiz-Abschnitte) darstellt
- **Callout_Renderer**: Komponente die Callout-Nodes als gestylte Hinweisboxen mit Icon und optionaler Einklappbarkeit darstellt
- **Tag_Renderer**: Komponente die Tag-Nodes als klickbare Inline-Elemente mit visueller Hervorhebung darstellt
- **ViewMode**: Bestehende React-Komponente die Markdown-Inhalte als formatierte HTML-Elemente rendert
- **DirectoryTree**: Baumstruktur aller Dateien und Ordner eines Vaults, verwendet zur Link-Auflösung
- **Block_Marker_Parser**: Remark-Plugin das `^block-id` Syntax am Ende von Absätzen, Listenelementen und Überschriften erkennt und als Metadaten-Attribut im MDAST speichert
- **Block_Reference**: Ein Verweis auf einen spezifischen Block (Absatz, Listenelement, Überschrift) über dessen eindeutige Block-ID
- **MDAST**: Markdown Abstract Syntax Tree — Zwischenformat das von remark-Plugins erzeugt und vom Renderer konsumiert wird
- **Callout_Typ**: Bezeichner der den visuellen Stil eines Callouts bestimmt (z.B. `note`, `warning`, `tip`, `danger`, `info`, `example`, `quote`, `bug`, `success`, `question`, `failure`, `abstract`)
- **Heading_Anchor**: Normalisierter Anker-Bezeichner einer Überschrift, verwendet für `[[Seite#Überschrift]]`-Navigation

## Requirements

### Requirement 1: Wikilink-Parsing

**User Story:** Als Benutzer möchte ich Wikilinks in meinen Obsidian-Notizen korrekt dargestellt sehen, damit ich zwischen Notizen navigieren kann.

#### Acceptance Criteria

1. WHEN ein Markdown-Text `[[Seitenname]]` enthält, THE Wikilink_Parser SHALL einen Wikilink-Node mit `target: "Seitenname"` und `display: "Seitenname"` im MDAST erzeugen
2. WHEN ein Markdown-Text `[[Seitenname|Anzeigetext]]` enthält, THE Wikilink_Parser SHALL einen Wikilink-Node mit `target: "Seitenname"` und `display: "Anzeigetext"` im MDAST erzeugen
3. WHEN ein Markdown-Text `[[Seitenname#Überschrift]]` enthält, THE Wikilink_Parser SHALL einen Wikilink-Node mit `target: "Seitenname"`, `heading: "Überschrift"` und `display: "Seitenname > Überschrift"` im MDAST erzeugen
4. WHEN ein Markdown-Text `[[#Überschrift]]` enthält, THE Wikilink_Parser SHALL einen Wikilink-Node mit `target: ""`, `heading: "Überschrift"` und `display: "Überschrift"` im MDAST erzeugen (Link innerhalb derselben Seite)
5. WHEN ein Wikilink-Target Sonderzeichen enthält (Leerzeichen, Umlaute, Satzzeichen), THE Wikilink_Parser SHALL das Target unverändert als String speichern
6. WHEN ein Wikilink innerhalb eines Code-Blocks oder Inline-Code steht, THE Wikilink_Parser SHALL die Syntax nicht als Wikilink interpretieren
7. FOR ALL gültigen Wikilink-Strings, Parsen und anschließendes Serialisieren zu Markdown SHALL einen äquivalenten Wikilink-String erzeugen (Round-Trip-Eigenschaft)

### Requirement 2: Wikilink-Rendering und Navigation

**User Story:** Als Benutzer möchte ich auf Wikilinks klicken können, um zur verlinkten Notiz zu navigieren, und visuelles Feedback erhalten ob das Ziel existiert.

#### Acceptance Criteria

1. WHEN ein Wikilink-Node gerendert wird und das Target im DirectoryTree existiert, THE ViewMode SHALL einen klickbaren Link mit CSS-Klasse `view-mode-link--internal` darstellen
2. WHEN ein Wikilink-Node gerendert wird und das Target im DirectoryTree nicht existiert, THE ViewMode SHALL einen Link mit zusätzlicher CSS-Klasse `view-mode-link--broken` darstellen
3. WHEN ein Benutzer auf einen aufgelösten Wikilink klickt, THE ViewMode SHALL den `onInternalLinkClick`-Callback mit dem aufgelösten Dateipfad aufrufen
4. WHEN ein Wikilink ein Heading-Fragment enthält (`[[Seite#Überschrift]]`), THE ViewMode SHALL nach der Navigation zur Zielseite zum entsprechenden Heading-Anchor scrollen
5. WHEN ein Wikilink nur ein Heading-Fragment enthält (`[[#Überschrift]]`), THE ViewMode SHALL innerhalb der aktuellen Seite zum entsprechenden Heading-Anchor scrollen

### Requirement 3: Heading-Anchor-Generierung

**User Story:** Als Benutzer möchte ich über `[[Seite#Überschrift]]`-Links direkt zu einer bestimmten Überschrift springen können.

#### Acceptance Criteria

1. THE ViewMode SHALL für jede gerenderte Überschrift (H1–H6) ein `id`-Attribut mit dem normalisierten Heading-Anchor setzen
2. WHEN ein Heading-Anchor generiert wird, THE ViewMode SHALL den Überschriftstext in Kleinbuchstaben umwandeln, Leerzeichen durch Bindestriche ersetzen und nicht-alphanumerische Zeichen (außer Bindestriche und Unterstriche) entfernen
3. WHEN zwei Überschriften denselben normalisierten Anchor ergeben, THE ViewMode SHALL dem zweiten Vorkommen ein numerisches Suffix anhängen (z.B. `überschrift-1`)
4. FOR ALL Überschriftstexte, die Normalisierung SHALL deterministisch sein (gleicher Input erzeugt immer gleichen Anchor)

### Requirement 4: Embed-Parsing

**User Story:** Als Benutzer möchte ich eingebettete Inhalte (`![[Datei]]`) in meinen Notizen sehen, damit referenzierte Bilder und Notiz-Abschnitte inline dargestellt werden.

#### Acceptance Criteria

1. WHEN ein Markdown-Text `![[dateiname.png]]` enthält, THE Embed_Parser SHALL einen Embed-Node mit `target: "dateiname.png"` und `embedType: "image"` im MDAST erzeugen
2. WHEN ein Markdown-Text `![[notiz.md]]` enthält, THE Embed_Parser SHALL einen Embed-Node mit `target: "notiz.md"` und `embedType: "note"` im MDAST erzeugen
3. WHEN ein Markdown-Text `![[notiz.md#Abschnitt]]` enthält, THE Embed_Parser SHALL einen Embed-Node mit `target: "notiz.md"`, `heading: "Abschnitt"` und `embedType: "note"` im MDAST erzeugen
4. WHEN ein Markdown-Text `![[datei]]` ohne Dateiendung enthält, THE Embed_Parser SHALL einen Embed-Node mit `target: "datei"` und `embedType: "note"` im MDAST erzeugen (Annahme: Markdown-Notiz)
5. WHEN ein Embed innerhalb eines Code-Blocks oder Inline-Code steht, THE Embed_Parser SHALL die Syntax nicht als Embed interpretieren
6. FOR ALL gültigen Embed-Strings, Parsen und anschließendes Serialisieren zu Markdown SHALL einen äquivalenten Embed-String erzeugen (Round-Trip-Eigenschaft)

### Requirement 5: Embed-Rendering

**User Story:** Als Benutzer möchte ich eingebettete Bilder und Notiz-Abschnitte direkt in meiner Notiz sehen, ohne die Zieldatei separat öffnen zu müssen.

#### Acceptance Criteria

1. WHEN ein Bild-Embed gerendert wird und die Datei im DirectoryTree existiert, THE Embed_Renderer SHALL ein `<img>`-Element mit der Vault-API-URL als `src` darstellen
2. WHEN ein Bild-Embed gerendert wird und die Datei nicht im DirectoryTree existiert, THE Embed_Renderer SHALL einen Platzhalter mit dem Text „Bild nicht gefunden: {dateiname}" darstellen
3. WHEN ein Notiz-Embed gerendert wird und die Zieldatei existiert, THE Embed_Renderer SHALL den Inhalt der Zieldatei als gerendertes Markdown in einem visuell abgegrenzten Container darstellen
4. WHEN ein Notiz-Embed ein Heading-Fragment enthält, THE Embed_Renderer SHALL nur den Abschnitt ab der angegebenen Überschrift bis zur nächsten gleichrangigen oder höheren Überschrift darstellen
5. WHEN ein Notiz-Embed gerendert wird und die Zieldatei nicht existiert, THE Embed_Renderer SHALL einen Platzhalter mit dem Text „Notiz nicht gefunden: {dateiname}" darstellen
6. WHILE ein Notiz-Embed geladen wird, THE Embed_Renderer SHALL einen Lade-Indikator anzeigen
7. IF ein Notiz-Embed eine zirkuläre Referenz erzeugt (A bettet B ein, B bettet A ein), THEN THE Embed_Renderer SHALL die Rekursion nach maximal 3 Ebenen abbrechen und einen Hinweis „Maximale Einbettungstiefe erreicht" anzeigen

### Requirement 6: Callout-Parsing

**User Story:** Als Benutzer möchte ich Obsidian-Callouts in meinen Notizen korrekt dargestellt sehen, damit wichtige Hinweise visuell hervorgehoben werden.

#### Acceptance Criteria

1. WHEN ein Blockquote mit `> [!typ]` beginnt, THE Callout_Parser SHALL einen Callout-Node mit `calloutType: "typ"`, `title: "Typ"` (kapitalisiert) und `foldable: false` im MDAST erzeugen
2. WHEN ein Blockquote mit `> [!typ] Eigener Titel` beginnt, THE Callout_Parser SHALL einen Callout-Node mit `calloutType: "typ"` und `title: "Eigener Titel"` im MDAST erzeugen
3. WHEN ein Blockquote mit `> [!typ]- Titel` beginnt (Minus nach Klammer), THE Callout_Parser SHALL einen Callout-Node mit `foldable: true` und `defaultOpen: false` im MDAST erzeugen
4. WHEN ein Blockquote mit `> [!typ]+ Titel` beginnt (Plus nach Klammer), THE Callout_Parser SHALL einen Callout-Node mit `foldable: true` und `defaultOpen: true` im MDAST erzeugen
5. WHEN ein Callout mehrzeiligen Inhalt hat (weitere `>` Zeilen nach der Titelzeile), THE Callout_Parser SHALL den gesamten Inhalt als `body`-Eigenschaft des Callout-Nodes speichern
6. WHEN ein Callout-Typ nicht in der Liste bekannter Typen enthalten ist, THE Callout_Parser SHALL den Callout trotzdem parsen und den unbekannten Typ als `calloutType` speichern
7. FOR ALL gültigen Callout-Blockquotes, Parsen und anschließendes Serialisieren zu Markdown SHALL einen äquivalenten Callout-Blockquote erzeugen (Round-Trip-Eigenschaft)

### Requirement 7: Callout-Rendering

**User Story:** Als Benutzer möchte ich Callouts als farblich kodierte Hinweisboxen mit Icons sehen, die ich bei Bedarf ein- und ausklappen kann.

#### Acceptance Criteria

1. THE Callout_Renderer SHALL für jeden bekannten Callout_Typ (note, warning, tip, danger, info, example, quote, bug, success, question, failure, abstract) eine eigene Farbgebung und ein Lucide-Icon verwenden
2. WHEN ein Callout mit `foldable: true` gerendert wird, THE Callout_Renderer SHALL ein `<details>`-Element mit `<summary>` verwenden, sodass der Inhalt ein- und ausklappbar ist
3. WHEN ein Callout mit `foldable: true` und `defaultOpen: true` gerendert wird, THE Callout_Renderer SHALL das `<details>`-Element mit dem `open`-Attribut rendern
4. WHEN ein Callout mit `foldable: false` gerendert wird, THE Callout_Renderer SHALL den Inhalt immer sichtbar darstellen (kein `<details>`-Element)
5. THE Callout_Renderer SHALL den Callout-Body als Markdown rendern (verschachtelte Formatierung, Listen, Code-Blöcke innerhalb von Callouts)
6. WHEN ein unbekannter Callout-Typ gerendert wird, THE Callout_Renderer SHALL die Standard-Farbgebung des `note`-Typs verwenden

### Requirement 8: Tag-Parsing

**User Story:** Als Benutzer möchte ich Inline-Tags in meinen Notizen visuell hervorgehoben sehen, damit ich Themen und Kategorien schnell erkennen kann.

#### Acceptance Criteria

1. WHEN ein Markdown-Text `#tagname` enthält (gefolgt von Leerzeichen, Zeilenende oder Satzzeichen), THE Tag_Parser SHALL einen Tag-Node mit `tag: "tagname"` im MDAST erzeugen
2. WHEN ein Markdown-Text `#verschachtelt/untertag` enthält, THE Tag_Parser SHALL einen Tag-Node mit `tag: "verschachtelt/untertag"` im MDAST erzeugen
3. WHEN ein `#`-Zeichen am Zeilenanfang steht (Heading-Syntax), THE Tag_Parser SHALL es nicht als Tag interpretieren
4. WHEN ein `#`-Zeichen innerhalb eines Code-Blocks, Inline-Code oder einer URL steht, THE Tag_Parser SHALL es nicht als Tag interpretieren
5. WHEN ein `#`-Zeichen von einem Leerzeichen oder Zeilenende gefolgt wird (z.B. `# Heading`), THE Tag_Parser SHALL es nicht als Tag interpretieren
6. THE Tag_Parser SHALL nur Tags erkennen die mit einem Buchstaben oder Unterstrich beginnen und aus Buchstaben, Ziffern, Unterstrichen, Bindestrichen und Schrägstrichen bestehen
7. FOR ALL gültigen Tag-Strings, Parsen und anschließendes Serialisieren zu Markdown SHALL einen äquivalenten Tag-String erzeugen (Round-Trip-Eigenschaft)

### Requirement 9: Tag-Rendering

**User Story:** Als Benutzer möchte ich Tags als klickbare Elemente sehen, die sich visuell vom Fließtext abheben.

#### Acceptance Criteria

1. THE Tag_Renderer SHALL Tags als Inline-Elemente mit CSS-Klasse `view-mode-tag` und einem Hash-Icon (Lucide `Hash`) darstellen
2. THE Tag_Renderer SHALL Tags mit einer dezenten Hintergrundfarbe und abgerundeten Ecken vom Fließtext abheben
3. WHEN ein Benutzer auf einen Tag klickt, THE Tag_Renderer SHALL ein `onTagClick`-Event mit dem vollständigen Tag-String (inkl. verschachtelter Pfade) auslösen
4. THE Tag_Renderer SHALL Tags im Dark Mode mit angepassten Farben darstellen (Design-Token-basiert)

### Requirement 10: Wikilink-Auflösung (Link Resolver)

**User Story:** Als Benutzer möchte ich dass Wikilinks auch dann korrekt aufgelöst werden, wenn die Zieldatei in einem Unterordner liegt oder der Name ohne `.md`-Endung angegeben ist.

#### Acceptance Criteria

1. WHEN ein Wikilink-Target ohne Dateiendung angegeben ist, THE Link_Resolver SHALL zuerst nach einer exakten Übereinstimmung suchen, dann nach `{target}.md` im gesamten DirectoryTree
2. WHEN ein Wikilink-Target mit Pfad angegeben ist (z.B. `ordner/datei`), THE Link_Resolver SHALL den relativen Pfad im DirectoryTree auflösen
3. WHEN mehrere Dateien mit demselben Namen in verschiedenen Ordnern existieren, THE Link_Resolver SHALL die erste gefundene Datei verwenden (Tiefensuche, alphabetisch)
4. THE Link_Resolver SHALL die Suche case-insensitiv durchführen
5. FOR ALL Wikilink-Targets die auf eine existierende Datei verweisen, THE Link_Resolver SHALL den vollständigen relativen Pfad der Datei zurückgeben
6. FOR ALL Wikilink-Targets die auf keine existierende Datei verweisen, THE Link_Resolver SHALL `null` zurückgeben

### Requirement 11: Obsidian-Syntax remark-Plugin-Architektur

**User Story:** Als Entwickler möchte ich die Obsidian-Syntax-Erweiterungen als modulare remark-Plugins implementieren, damit sie unabhängig testbar und wartbar sind.

#### Acceptance Criteria

1. THE Wikilink_Parser SHALL als eigenständiges remark-Plugin implementiert sein, das in die unified-Pipeline eingefügt werden kann
2. THE Embed_Parser SHALL als eigenständiges remark-Plugin implementiert sein, das in die unified-Pipeline eingefügt werden kann
3. THE Callout_Parser SHALL als eigenständiges remark-Plugin implementiert sein, das in die unified-Pipeline eingefügt werden kann
4. THE Tag_Parser SHALL als eigenständiges remark-Plugin implementiert sein, das in die unified-Pipeline eingefügt werden kann
5. THE ViewMode SHALL alle Obsidian-Plugins in der Reihenfolge Wikilink_Parser, Embed_Parser, Callout_Parser, Tag_Parser in die unified-Pipeline einfügen
6. IF ein einzelnes Plugin einen Fehler wirft, THEN THE ViewMode SHALL den Fehler abfangen und den Markdown-Inhalt ohne das fehlerhafte Plugin rendern (Graceful Degradation)

### Requirement 12: CSS-Styling mit Design Tokens

**User Story:** Als Benutzer möchte ich dass alle Obsidian-Elemente konsistent mit dem bestehenden Design-System gestylt sind und im Dark Mode korrekt dargestellt werden.

#### Acceptance Criteria

1. THE ViewMode SHALL für Callouts CSS Custom Properties (Design Tokens) in `index.css` definieren, mit separaten Farben pro Callout_Typ
2. THE ViewMode SHALL für Tags CSS Custom Properties definieren, die im Light und Dark Mode unterschiedliche Werte haben
3. THE ViewMode SHALL für Wikilinks die bestehenden `--link-*` Design Tokens verwenden
4. THE ViewMode SHALL für Embeds einen visuell abgegrenzten Container mit Border und dezenter Hintergrundfarbe verwenden
5. WHILE der Dark Mode aktiv ist, THE ViewMode SHALL alle Obsidian-Elemente mit den Dark-Mode-Varianten der Design Tokens darstellen

### Requirement 13: Wikilink-Serialisierung (Pretty Printer)

**User Story:** Als Entwickler möchte ich Wikilink-Nodes zurück in Markdown-Syntax serialisieren können, damit Round-Trip-Tests möglich sind.

#### Acceptance Criteria

1. WHEN ein Wikilink-Node mit `target` und ohne `display` (oder `display === target`) serialisiert wird, THE Wikilink_Parser SHALL `[[target]]` erzeugen
2. WHEN ein Wikilink-Node mit `target` und abweichendem `display` serialisiert wird, THE Wikilink_Parser SHALL `[[target|display]]` erzeugen
3. WHEN ein Wikilink-Node mit `target` und `heading` serialisiert wird, THE Wikilink_Parser SHALL `[[target#heading]]` erzeugen
4. WHEN ein Wikilink-Node mit leerem `target` und `heading` serialisiert wird, THE Wikilink_Parser SHALL `[[#heading]]` erzeugen
5. FOR ALL gültigen Wikilink-Nodes, Serialisieren und anschließendes Parsen SHALL einen äquivalenten Wikilink-Node erzeugen (Round-Trip-Eigenschaft)

### Requirement 14: Embed-Serialisierung (Pretty Printer)

**User Story:** Als Entwickler möchte ich Embed-Nodes zurück in Markdown-Syntax serialisieren können, damit Round-Trip-Tests möglich sind.

#### Acceptance Criteria

1. WHEN ein Embed-Node mit `target` ohne `heading` serialisiert wird, THE Embed_Parser SHALL `![[target]]` erzeugen
2. WHEN ein Embed-Node mit `target` und `heading` serialisiert wird, THE Embed_Parser SHALL `![[target#heading]]` erzeugen
3. FOR ALL gültigen Embed-Nodes, Serialisieren und anschließendes Parsen SHALL einen äquivalenten Embed-Node erzeugen (Round-Trip-Eigenschaft)

### Requirement 15: Callout-Serialisierung (Pretty Printer)

**User Story:** Als Entwickler möchte ich Callout-Nodes zurück in Markdown-Syntax serialisieren können, damit Round-Trip-Tests möglich sind.

#### Acceptance Criteria

1. WHEN ein Callout-Node mit `calloutType`, `title` und `foldable: false` serialisiert wird, THE Callout_Parser SHALL `> [!typ] Titel` erzeugen
2. WHEN ein Callout-Node mit `foldable: true` und `defaultOpen: false` serialisiert wird, THE Callout_Parser SHALL `> [!typ]- Titel` erzeugen
3. WHEN ein Callout-Node mit `foldable: true` und `defaultOpen: true` serialisiert wird, THE Callout_Parser SHALL `> [!typ]+ Titel` erzeugen
4. WHEN ein Callout-Node einen Body enthält, THE Callout_Parser SHALL jede Zeile des Body mit `> ` prefixen
5. FOR ALL gültigen Callout-Nodes, Serialisieren und anschließendes Parsen SHALL einen äquivalenten Callout-Node erzeugen (Round-Trip-Eigenschaft)

### Requirement 16: Tag-Serialisierung (Pretty Printer)

**User Story:** Als Entwickler möchte ich Tag-Nodes zurück in Markdown-Syntax serialisieren können, damit Round-Trip-Tests möglich sind.

#### Acceptance Criteria

1. WHEN ein Tag-Node mit `tag: "tagname"` serialisiert wird, THE Tag_Parser SHALL `#tagname` erzeugen
2. WHEN ein Tag-Node mit `tag: "verschachtelt/untertag"` serialisiert wird, THE Tag_Parser SHALL `#verschachtelt/untertag` erzeugen
3. FOR ALL gültigen Tag-Nodes, Serialisieren und anschließendes Parsen SHALL einen äquivalenten Tag-Node erzeugen (Round-Trip-Eigenschaft)

### Requirement 17: Block References — Marker-Parsing

**User Story:** Als Benutzer möchte ich Block-IDs (`^block-id`) am Ende von Absätzen, Listenelementen und Überschriften setzen können, damit ich einzelne Blöcke gezielt verlinken und einbetten kann.

#### Acceptance Criteria

1. WHEN ein Markdown-Text eine Zeile enthält die mit ` ^block-id` endet (Leerzeichen + Caret + alphanumerisch/Bindestriche), THE Block_Marker_Parser SHALL einen Block-Marker mit `blockId: "block-id"` erkennen und dem zugehörigen Block-Node (Paragraph, ListItem, Heading) als Metadaten anhängen
2. WHEN ein Block-Marker am Ende eines Paragraphen steht, THE Block_Marker_Parser SHALL den Marker-Text aus dem sichtbaren Inhalt entfernen und als `blockId`-Eigenschaft des Paragraph-Nodes speichern
3. WHEN ein Block-Marker am Ende eines Listenelements steht, THE Block_Marker_Parser SHALL den Marker dem ListItem-Node als `blockId`-Eigenschaft zuweisen
4. WHEN ein Block-Marker am Ende einer Überschrift steht, THE Block_Marker_Parser SHALL den Marker der Heading-Node als `blockId`-Eigenschaft zuweisen
5. THE Block_Marker_Parser SHALL nur Block-IDs erkennen die mit einem Buchstaben oder Ziffer beginnen und aus Buchstaben, Ziffern und Bindestrichen bestehen (Regex: `[a-zA-Z0-9][a-zA-Z0-9-]*`)
6. WHEN ein `^`-Zeichen innerhalb eines Code-Blocks, Inline-Code oder mitten im Fließtext steht (nicht am Zeilenende nach Leerzeichen), THE Block_Marker_Parser SHALL es nicht als Block-Marker interpretieren
7. FOR ALL gültigen Block-Marker, Parsen und anschließendes Serialisieren zu Markdown SHALL den Marker am Zeilenende wiederherstellen (Round-Trip-Eigenschaft)

### Requirement 18: Block References — Wikilink-Syntax

**User Story:** Als Benutzer möchte ich mit `[[Seite#^block-id]]` auf einen bestimmten Block in einer anderen Notiz verlinken können, damit ich präzise Querverweise erstelle.

#### Acceptance Criteria

1. WHEN ein Markdown-Text `[[Seitenname#^block-id]]` enthält, THE Wikilink_Parser SHALL einen Wikilink-Node mit `target: "Seitenname"`, `blockRef: "block-id"` und `display: "Seitenname > ^block-id"` im MDAST erzeugen
2. WHEN ein Markdown-Text `[[#^block-id]]` enthält, THE Wikilink_Parser SHALL einen Wikilink-Node mit `target: ""`, `blockRef: "block-id"` und `display: "^block-id"` im MDAST erzeugen (Block-Referenz innerhalb derselben Seite)
3. WHEN ein Markdown-Text `[[Seitenname#^block-id|Anzeige]]` enthält, THE Wikilink_Parser SHALL einen Wikilink-Node mit `target: "Seitenname"`, `blockRef: "block-id"` und `display: "Anzeige"` im MDAST erzeugen
4. THE Wikilink_Parser SHALL `blockRef` und `heading` als sich gegenseitig ausschließende Felder behandeln — ein Wikilink hat entweder `#heading` oder `#^block-id`, nie beides
5. WHEN ein Wikilink-Node mit `blockRef` serialisiert wird, THE Wikilink_Parser SHALL `[[target#^block-id]]` bzw. `[[target#^block-id|display]]` erzeugen

### Requirement 19: Block References — Embed-Syntax

**User Story:** Als Benutzer möchte ich mit `![[Seite#^block-id]]` einen einzelnen Block aus einer anderen Notiz einbetten können, damit ich gezielt Absätze oder Listenelemente referenziere.

#### Acceptance Criteria

1. WHEN ein Markdown-Text `![[notiz.md#^block-id]]` enthält, THE Embed_Parser SHALL einen Embed-Node mit `target: "notiz.md"`, `blockRef: "block-id"` und `embedType: "note"` im MDAST erzeugen
2. WHEN ein Markdown-Text `![[notiz#^block-id]]` enthält (ohne Dateiendung), THE Embed_Parser SHALL einen Embed-Node mit `target: "notiz"`, `blockRef: "block-id"` und `embedType: "note"` im MDAST erzeugen
3. THE Embed_Parser SHALL `blockRef` und `heading` als sich gegenseitig ausschließende Felder behandeln — ein Embed hat entweder `#heading` oder `#^block-id`, nie beides
4. WHEN ein Embed-Node mit `blockRef` serialisiert wird, THE Embed_Parser SHALL `![[target#^block-id]]` erzeugen

### Requirement 20: Block References — Rendering

**User Story:** Als Benutzer möchte ich Block-Referenz-Links und -Embeds korrekt dargestellt sehen, damit ich den referenzierten Block direkt in meiner Notiz sehe oder dorthin navigieren kann.

#### Acceptance Criteria

1. WHEN ein Wikilink-Node mit `blockRef` gerendert wird und der Zielblock existiert, THE ViewMode SHALL den Link als klickbar darstellen und bei Klick zur Zieldatei navigieren und zum referenzierten Block scrollen
2. WHEN ein Wikilink-Node mit `blockRef` gerendert wird und der Zielblock nicht gefunden wird, THE ViewMode SHALL den Link mit CSS-Klasse `view-mode-link--broken` darstellen
3. WHEN ein Embed-Node mit `blockRef` gerendert wird und der Zielblock existiert, THE Embed_Renderer SHALL nur den einzelnen referenzierten Block (Absatz, Listenelement oder Überschrifts-Abschnitt) in einem visuell abgegrenzten Container darstellen
4. WHEN ein Embed-Node mit `blockRef` gerendert wird und der Zielblock nicht gefunden wird, THE Embed_Renderer SHALL einen Platzhalter mit „Block nicht gefunden: ^{block-id}" darstellen
5. THE ViewMode SHALL für Blocks mit `blockId` ein `id`-Attribut mit dem Wert `^{block-id}` setzen, damit Block-Referenz-Navigation via Fragment-Scroll funktioniert

### Requirement 21: Block References — Extraktion für Link-Index

**User Story:** Als Entwickler möchte ich Block-Referenzen im Link-Index erfassen, damit der Knowledge Graph und Backlinks auch Block-Level-Verweise anzeigen.

#### Acceptance Criteria

1. THE `extractWikilinks` Funktion SHALL bei Wikilinks mit `blockRef` das Feld `blockRef` im zurückgegebenen `WikilinkInfo`-Objekt enthalten
2. THE Link_Index_Service SHALL Block-Referenzen als Kanten im Graph erfassen (Quelle → Zielseite, mit `blockRef`-Annotation)
3. WHEN Backlinks für eine Datei abgefragt werden, THE Link_Index_Service SHALL Block-Referenz-Links mit der Information welcher Block referenziert wird anzeigen

### Requirement 22: Link-Extraktion für Knowledge Graph

**User Story:** Als Entwickler möchte ich alle Wikilinks aus einer Markdown-Datei extrahieren können, damit der Knowledge Graph die Verlinkungen zwischen Notizen darstellen kann.

#### Acceptance Criteria

1. THE Wikilink_Parser SHALL eine Funktion `extractWikilinks(markdown: string): WikilinkInfo[]` exportieren, die alle Wikilinks aus einem Markdown-String extrahiert
2. WHEN `extractWikilinks` aufgerufen wird, THE Wikilink_Parser SHALL für jeden gefundenen Wikilink ein Objekt mit `target`, `display`, `heading` (optional), `blockRef` (optional) und `position` (Zeile/Spalte) zurückgeben
3. THE Wikilink_Parser SHALL Wikilinks innerhalb von Code-Blöcken bei der Extraktion ignorieren
4. FOR ALL Markdown-Strings, die Anzahl der extrahierten Wikilinks SHALL kleiner oder gleich der Anzahl der `[[`-Vorkommen im Text sein (keine falschen Positiven außerhalb von Code-Blöcken)
