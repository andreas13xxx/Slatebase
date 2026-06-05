# Requirements Document

## Introduction

Dieses Feature erweitert das bestehende Markdown-Rendering in Slatebase um native Mermaid-Diagramm-Unterstützung. Obsidian rendert Mermaid-Diagramme automatisch in Fenced Code Blocks mit dem Sprach-Tag `mermaid`. Slatebase soll dieses Verhalten replizieren — anstatt Syntax-Highlighting (highlight.js) anzuwenden, werden `mermaid`-Code-Blöcke als SVG-Diagramme gerendert. Das Feature ist rein Frontend-seitig und baut auf der bestehenden ViewMode-Komponente und dem Markdown-Rendering-Pipeline (unified + remark-parse) auf.

## Glossary

- **Mermaid_Renderer**: React-Komponente die Mermaid-Diagramm-Definitionen als SVG-Grafiken rendert
- **Mermaid_Library**: Die `mermaid.js`-Bibliothek (npm-Paket `mermaid`) die Diagramm-Definitionen in SVG konvertiert
- **Diagram_Definition**: Der Textinhalt eines Fenced Code Blocks mit Sprach-Tag `mermaid` (z.B. `graph TD; A-->B`)
- **ViewMode**: Bestehende React-Komponente die Markdown-Inhalte als formatierte HTML-Elemente rendert
- **Fenced_Code_Block**: Markdown-Syntax mit dreifachen Backticks und optionalem Sprach-Tag (` ```mermaid `)
- **Color_Scheme**: Aktives Farbschema der Anwendung (light oder dark), gesteuert über `data-theme`-Attribut oder `prefers-color-scheme`
- **Rendering_Error**: Fehler der auftritt wenn die Mermaid_Library eine ungültige Diagram_Definition nicht verarbeiten kann
- **Fallback_View**: Darstellung die bei einem Rendering_Error angezeigt wird (Fehlermeldung + roher Quelltext)

## Requirements

### Requirement 1: Erkennung von Mermaid-Code-Blöcken

**User Story:** Als Benutzer möchte ich dass Mermaid-Diagramme in meinen Obsidian-Notizen automatisch erkannt werden, damit sie als Grafiken statt als Code dargestellt werden.

#### Acceptance Criteria

1. WHEN ein Fenced_Code_Block den Sprach-Tag `mermaid` hat, THE ViewMode SHALL den Block an den Mermaid_Renderer übergeben anstatt highlight.js-Syntax-Highlighting anzuwenden
2. WHEN ein Fenced_Code_Block einen anderen Sprach-Tag hat (z.B. `javascript`, `python`), THE ViewMode SHALL weiterhin highlight.js-Syntax-Highlighting anwenden
3. WHEN ein Fenced_Code_Block keinen Sprach-Tag hat, THE ViewMode SHALL den Block als unformatierten Monospace-Text darstellen (bestehendes Verhalten)
4. THE ViewMode SHALL den Sprach-Tag-Vergleich case-insensitiv durchführen (z.B. `Mermaid`, `MERMAID` werden erkannt)

### Requirement 2: SVG-Rendering von Mermaid-Diagrammen

**User Story:** Als Benutzer möchte ich Mermaid-Diagramme als korrekte SVG-Grafiken sehen, die alle gängigen Diagrammtypen unterstützen.

#### Acceptance Criteria

1. THE Mermaid_Renderer SHALL die Mermaid_Library verwenden um eine Diagram_Definition in ein SVG-Element zu konvertieren
2. THE Mermaid_Renderer SHALL die folgenden Diagrammtypen unterstützen: flowchart, sequence, class, state, entity-relationship, gantt, pie, git graph, mindmap, timeline, quadrant, sankey, xy-chart
3. WHEN die Mermaid_Library ein gültiges SVG erzeugt, THE Mermaid_Renderer SHALL das SVG inline im Dokument darstellen (kein `<img>`-Tag, kein externer Fetch)
4. THE Mermaid_Renderer SHALL für jedes Diagramm eine eindeutige ID generieren um Konflikte bei mehreren Diagrammen auf einer Seite zu vermeiden
5. THE Mermaid_Renderer SHALL das gerenderte SVG responsive darstellen (maximale Breite 100% des Containers, Seitenverhältnis beibehalten)

### Requirement 3: Dark/Light Mode Unterstützung

**User Story:** Als Benutzer möchte ich dass Mermaid-Diagramme automatisch dem aktuellen Farbschema folgen, damit sie im Dark Mode lesbar bleiben.

#### Acceptance Criteria

1. WHILE das Color_Scheme `light` aktiv ist, THE Mermaid_Renderer SHALL das Mermaid-Theme `default` verwenden
2. WHILE das Color_Scheme `dark` aktiv ist, THE Mermaid_Renderer SHALL das Mermaid-Theme `dark` verwenden
3. WHEN das Color_Scheme wechselt (z.B. durch Benutzer-Einstellung oder System-Preference-Änderung), THE Mermaid_Renderer SHALL alle sichtbaren Diagramme mit dem neuen Theme neu rendern
4. THE Mermaid_Renderer SHALL die Theme-Erkennung über das `data-theme`-Attribut auf dem `<html>`-Element und den `prefers-color-scheme`-Media-Query durchführen (konsistent mit dem bestehenden Design-Token-System)

### Requirement 4: Fehlerbehandlung

**User Story:** Als Benutzer möchte ich bei fehlerhaften Mermaid-Definitionen eine verständliche Fehlermeldung sehen und den Quelltext einsehen können, damit ich den Fehler korrigieren kann.

#### Acceptance Criteria

1. IF die Mermaid_Library einen Rendering_Error wirft, THEN THE Mermaid_Renderer SHALL eine Fehlermeldung und den rohen Quelltext der Diagram_Definition als Fallback_View darstellen
2. WHEN ein Rendering_Error auftritt, THE Mermaid_Renderer SHALL die Fehlermeldung der Mermaid_Library in einem visuell hervorgehobenen Bereich (CSS-Klasse `mermaid-error`) anzeigen
3. WHEN ein Rendering_Error auftritt, THE Mermaid_Renderer SHALL den rohen Quelltext in einem `<pre><code>`-Block unterhalb der Fehlermeldung darstellen (identisch zur normalen Code-Block-Darstellung)
4. IF die Mermaid_Library bei der Initialisierung fehlschlägt (z.B. durch Ladefehler), THEN THE Mermaid_Renderer SHALL alle Mermaid-Code-Blöcke als normale Code-Blöcke mit Monospace-Text darstellen
5. THE Mermaid_Renderer SHALL einen einzelnen fehlerhaften Mermaid-Block nicht das Rendering anderer Mermaid-Blöcke oder des restlichen Markdown-Dokuments beeinträchtigen

### Requirement 5: Performance und Lazy Loading

**User Story:** Als Benutzer möchte ich dass die Seite schnell lädt und Mermaid-Diagramme das initiale Rendering nicht blockieren.

#### Acceptance Criteria

1. THE Mermaid_Renderer SHALL die Mermaid_Library per dynamischem `import()` laden (Code-Splitting), sodass das Mermaid-Bundle nicht im initialen JavaScript-Bundle enthalten ist
2. WHILE die Mermaid_Library geladen wird, THE Mermaid_Renderer SHALL einen Lade-Indikator (Platzhalter mit Text „Diagramm wird geladen…") an der Stelle des Diagramms anzeigen
3. THE Mermaid_Renderer SHALL die Mermaid_Library nur laden wenn mindestens ein Mermaid-Code-Block im Dokument vorhanden ist (kein Laden bei reinen Text-Dokumenten)
4. THE Mermaid_Renderer SHALL das Rendering eines einzelnen Diagramms innerhalb von 2 Sekunden abschließen (bei typischer Diagrammkomplexität mit weniger als 50 Nodes)
5. IF das Rendering eines Diagramms länger als 5 Sekunden dauert, THEN THE Mermaid_Renderer SHALL das Rendering abbrechen und eine Timeout-Fehlermeldung als Fallback_View anzeigen

### Requirement 6: Obsidian-Kompatibilität

**User Story:** Als Benutzer möchte ich dass Mermaid-Diagramme in Slatebase genauso aussehen wie in Obsidian, damit ich nahtlos zwischen beiden arbeiten kann.

#### Acceptance Criteria

1. THE Mermaid_Renderer SHALL dieselbe Mermaid-Syntax akzeptieren die Obsidian unterstützt (Mermaid.js Version 10+)
2. THE Mermaid_Renderer SHALL Mermaid-Direktiven (z.B. `%%{init: {'theme': 'forest'}}%%`) in der Diagram_Definition respektieren
3. WHEN eine Diagram_Definition Obsidian-spezifische Direktiven enthält die von der Mermaid_Library nicht unterstützt werden, THE Mermaid_Renderer SHALL die unbekannten Direktiven ignorieren und das Diagramm ohne sie rendern
4. THE Mermaid_Renderer SHALL keine zusätzliche Wrapper-Syntax erfordern — ein einfacher ` ```mermaid ` Fenced Code Block genügt (identisch zu Obsidian)

### Requirement 7: CSS-Styling und Layout

**User Story:** Als Benutzer möchte ich dass Mermaid-Diagramme visuell in das Slatebase-Design integriert sind und sich harmonisch in den Dokumentfluss einfügen.

#### Acceptance Criteria

1. THE Mermaid_Renderer SHALL das Diagramm in einem Container mit CSS-Klasse `view-mode-mermaid` darstellen
2. THE Mermaid_Renderer SHALL den Container mit einem dezenten Border (`var(--border-subtle)`), abgerundeten Ecken (`var(--radius-md)`) und optionalem Hintergrund (`var(--bg-surface)`) stylen
3. THE Mermaid_Renderer SHALL den Fallback_View-Container mit einer Fehler-Farbgebung (`var(--danger-bg)`, `var(--danger-border)`) stylen
4. THE Mermaid_Renderer SHALL den Lade-Indikator mit gedämpfter Textfarbe (`var(--text-muted)`) und zentrierter Ausrichtung darstellen
5. WHILE der Dark Mode aktiv ist, THE Mermaid_Renderer SHALL die Dark-Mode-Varianten aller Design Tokens verwenden (konsistent mit dem bestehenden Token-System)
6. THE Mermaid_Renderer SHALL das SVG mit `overflow: auto` versehen, sodass bei sehr breiten Diagrammen horizontal gescrollt werden kann

### Requirement 8: Sicherheit

**User Story:** Als Betreiber möchte ich sicherstellen dass Mermaid-Diagramme keine Sicherheitsrisiken darstellen (XSS, ungewollte externe Requests).

#### Acceptance Criteria

1. THE Mermaid_Renderer SHALL die Mermaid-Konfiguration `securityLevel: 'strict'` verwenden um eingebettetes HTML und JavaScript in Diagramm-Definitionen zu blockieren
2. THE Mermaid_Renderer SHALL keine externen Ressourcen (Bilder, Fonts, Stylesheets) aus Diagramm-Definitionen laden
3. IF eine Diagram_Definition potentiell unsicheren Inhalt enthält, THEN THE Mermaid_Library (im strict Mode) SHALL den Inhalt sanitieren oder das Rendering mit einem Fehler abbrechen
