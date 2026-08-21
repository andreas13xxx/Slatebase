# Requirements Document

## Introduction

„Editor-Erweiterungen: Mathe & Medien" schließt zwei der sichtbarsten Rendering-Lücken gegenüber Obsidian: LaTeX-Mathe-Formeln und Audio-/Video-Embeds. Beide Features bauen auf vorhandener, funktionierender Infrastruktur auf — dem Mermaid-Lazy-Load-Pattern (`MermaidRenderer.tsx`), der Embed-Pipeline (`plugins/embed/`) und den Plugin-Compat-Stubs (`renderMath`/`finishRenderMath` in `obsidian-api-extensions.ts`).

1. **Mathe/LaTeX-Rendering**: Die Obsidian-Syntax für Mathe — Inline `$...$` und Block `$$...$$` — wird aktuell in der Reading View und im Live Preview komplett ignoriert (Dollar-Zeichen erscheinen als literaler Text). Plugins, die Obsidians `renderMath`/`finishRenderMath` aufrufen, sehen nur den rohen LaTeX-Quelltext. KaTeX (MIT, ~300 KB gzipped, kein DOM-Tree-Patching nötig) soll lazy-loaded nach dem bewährten Mermaid-Muster eingebunden werden.
2. **Audio-/Video-Embeds**: `![[datei.mp3]]` / `![[datei.mp4]]` werden aktuell als Notiz-Embeds gerendert (Dateizugriff-Fehler, da es keine Markdown-Dateien sind). Obsidian liefert dafür native `<audio>` / `<video>` Player. Die bestehende Embed-Pipeline (`detectEmbedType()`) kennt nur `image | pdf | note` — sie muss um `audio` und `video` erweitert werden.

**Vorhandene Infrastruktur (wird wiederverwendet, nicht neu gebaut):**

- Mermaid-Lazy-Load-Pattern: Modul-Level-Promise-Cache, `Promise.race`-Timeout, State-Machine (`loading → rendered | error | timeout | load-failed`)
- Embed-Pipeline: `detectEmbedType()` + `EmbedNode.embedType` (MDAST) + `EmbedWidget.kind` (Live Preview) + `renderEmbedNode()` (ViewMode)
- Compat-Shims: `renderMath(source, display)` + `finishRenderMath()` + `loadMathJax()` — aktuell No-Ops/Verbatim-Stubs
- Editor-Commands: `insert-mathblock` + `toggle-inline-math` existieren bereits in `core-commands.ts`

## Glossary

Wiederverwendete Begriffe aus bestehenden Specs: **Embed**, **EmbedNode**, **EmbedWidget**, **Live Preview**, **Reading View**, **Code Block Processor**, **Widget Decoration**.

Neue Begriffe für diese Spec:

- **Inline-Mathe**: Eine LaTeX-Formel innerhalb eines Fließtext-Absatzes, begrenzt durch einfache Dollar-Zeichen (`$E=mc^2$`). In Obsidian und dieser Spec: kein Whitespace direkt nach dem öffnenden `$` oder vor dem schließenden `$`.
- **Block-Mathe**: Eine freistehende LaTeX-Formel, begrenzt durch doppelte Dollar-Zeichen (`$$...$$`) auf eigenen Zeilen, analog zu einem Fenced Code Block.
- **KaTeX**: Ein schnelles, leichtgewichtiges JavaScript-LaTeX-Rendering-Paket (MIT-Lizenz), das HTML/MathML-Output erzeugt — Obsidians Alternative zu MathJax für Mathe-Rendering.
- **Audio-Embed**: Ein `![[datei.ext]]`-Embed, dessen Ziel eine Audiodatei ist (`.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`, `.aac`, `.wma`).
- **Video-Embed**: Ein `![[datei.ext]]`-Embed, dessen Ziel eine Videodatei ist (`.mp4`, `.webm`, `.ogv`, `.mov`, `.mkv`).
- **Media-Embed**: Oberbegriff für Audio-Embed und Video-Embed.

## Requirements

### Requirement 1: KaTeX — Inline-Mathe-Rendering

**User Story:** Als Benutzer möchte ich LaTeX-Formeln in Fließtext (`$...$`) sowohl in der Reading View als auch im Live Preview gerendert sehen, damit ich technische/wissenschaftliche Notizen visuell korrekt lesen kann.

#### Acceptance Criteria

1. WHEN der Benutzer ein Markdown-Dokument mit Inline-Mathe-Syntax (`$...$`) öffnet, THE Reading View (ViewMode) SHALL die Formel als formatierte Mathe-Ausgabe rendern und nicht als Rohtext mit Dollar-Zeichen anzeigen.
2. THE Inline-Mathe-Erkennung SHALL folgende Begrenzungsregeln anwenden (konsistent mit Obsidian):
   - Das öffnende `$` DARF NICHT direkt von Whitespace gefolgt werden.
   - Das schließende `$` DARF NICHT direkt von Whitespace vorangestellt werden.
   - Das schließende `$` DARF NICHT von einer Ziffer gefolgt werden (verhindert falsche Erkennung bei Geldbeträgen wie `$5 ... $10`).
   - Dollar-Zeichen innerhalb von Code-Spans (`` `$x$` ``) und Fenced Code Blocks SHALL ignoriert werden (kein Mathe-Rendering).
3. WHEN der Benutzer im Live Preview einen Absatz mit Inline-Mathe bearbeitet, THE Live Preview SHALL die Formel als gerenderte Mathe anzeigen, sofern der Cursor nicht innerhalb der Dollar-Begrenzung positioniert ist (cursor-aware, konsistent mit dem bestehenden Verhalten für Bold/Italic/Wikilinks).
4. THE KaTeX-Bibliothek SHALL lazy-loaded werden (gleicher Mechanismus wie Mermaid: Modul-Level-Promise-Cache, `import('katex')`, Fehlerfall → Library-Load-Failed-Zustand); THE Bibliothek SHALL erst beim ersten tatsächlichen Mathe-Vorkommen geladen werden, nicht beim Seitenstart.
5. IF das Laden der KaTeX-Bibliothek fehlschlägt, THEN THE System SHALL die rohe LaTeX-Quelle in einem `<span class="math math-inline math-load-failed">` anzeigen, nicht den Absatz leer lassen oder einen nicht-sichtbaren Fehler produzieren.
6. IF die LaTeX-Quelle ungültig ist (KaTeX-Parse-Fehler), THEN THE System SHALL die Formel in einem `<span class="math math-inline math-error">` mit einem `title`-Attribut anzeigen, das die Fehlermeldung enthält, und den rohen LaTeX-Quelltext als Fallback sichtbar machen.
7. THE KaTeX-Rendering SHALL einen Timeout von 2000ms pro Formel respektieren; bei Überschreitung SHALL der Rohtext angezeigt werden (analog zum Mermaid-Timeout-Pattern).

### Requirement 2: KaTeX — Block-Mathe-Rendering

**User Story:** Als Benutzer möchte ich mehrzeilige LaTeX-Formeln in `$$...$$`-Blöcken zentriert und größer gerendert sehen, damit komplexe Gleichungen lesbar dargestellt werden.

#### Acceptance Criteria

1. WHEN der Benutzer ein Markdown-Dokument mit Block-Mathe-Syntax (`$$` auf eigener Zeile, Formelinhalt, `$$` auf eigener Zeile) öffnet, THE Reading View SHALL die Formel als zentrierter Display-Mode-Block rendern (KaTeX `displayMode: true`).
2. THE Block-Mathe-Erkennung SHALL Block-Mathe nur erkennen, wenn die `$$`-Begrenzungen auf eigenen Zeilen stehen (Obsidians Konvention); `$$..$$` innerhalb eines Absatzes auf einer Zeile SHALL ebenfalls als Block-Mathe gewertet werden (Obsidian-kompatibel: beide Varianten gültig).
3. WHEN der Benutzer im Live Preview einen Block-Mathe-Bereich editiert, THE Live Preview SHALL den Formelblock als gerenderte Mathe anzeigen, sofern der Cursor nicht innerhalb des `$$...$$`-Bereichs positioniert ist (cursor-aware Widget-Decoration, analog zu Fenced Code Block Processors).
4. THE Block-Mathe-Widget in der Live Preview SHALL als Replace-Decoration den gesamten `$$...$$`-Bereich ersetzen und SHALL ein klickbares Element sein, das bei Klick den Cursor in den Block bewegt (gleiche Interaktion wie bestehende Code-Block-Widgets).
5. THE Fehler- und Timeout-Behandlung (Requirement 1.5–1.7) SHALL identisch für Block-Mathe gelten.
6. Block-Mathe-Blöcke innerhalb von Fenced Code Blocks (```` ```math ```` oder andere Code-Blöcke) SHALL nicht als Mathe gerendert werden (Code-Block-Inhalt bleibt Rohtext).

### Requirement 3: KaTeX — Plugin-Compat-Integration (renderMath/finishRenderMath)

**User Story:** Als Plugin-Entwickler möchte ich, dass `renderMath()`/`finishRenderMath()` echtes Rendering liefern, damit mein Plugin (z. B. Dataview, Tasks) LaTeX-Formeln in seinen eigenen Views korrekt darstellt.

#### Acceptance Criteria

1. THE `window.obsidian.renderMath(source, display)` Compat-Shim SHALL nach dem Laden der KaTeX-Bibliothek ein DOM-Element mit gerenderter Mathe zurückgeben (statt wie bisher den rohen Quelltext).
2. THE `renderMath`-Implementierung SHALL synchron ein Element zurückgeben: wenn KaTeX noch nicht geladen ist, SHALL das Element zunächst den Quelltext zeigen und sich asynchron aktualisieren, sobald KaTeX verfügbar ist (hydration-Pattern — ein Plugin, das das Element sofort in den DOM hängt, sieht erst den Text, dann die gerenderte Formel).
3. THE `window.obsidian.finishRenderMath()` SHALL nach Abschluss aller ausstehenden Render-Vorgänge resolven (vorher: sofortiger No-Op-Resolve); es SHALL ein `Promise<void>` zurückgeben.
4. THE `window.obsidian.loadMathJax()` SHALL nach dem Laden der KaTeX-Bibliothek resolven (Plugins rufen dies auf, um sicherzugehen, dass Mathe-Rendering verfügbar ist, bevor sie `renderMath` aufrufen).
5. IF KaTeX nicht geladen werden kann, THEN `renderMath` SHALL das bisherige Fallback-Verhalten beibehalten (roher Quelltext in einem `math`-Element) und `loadMathJax` SHALL mit `null` resolven (Plugin erhält das Signal, dass Mathe nicht verfügbar ist).

### Requirement 4: Audio-Embeds

**User Story:** Als Benutzer möchte ich Audiodateien in meinem Vault per `![[datei.mp3]]` einbetten und direkt in der Notiz abspielen können, ohne die Datei extern öffnen zu müssen.

#### Acceptance Criteria

1. WHEN ein `![[datei.ext]]`-Embed ein Ziel mit einer Audio-Endung hat (`.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`, `.aac`, `.wma`), THE System SHALL es als Audio-Embed klassifizieren (`embedType: 'audio'`), nicht als Note-Embed.
2. THE Reading View SHALL ein Audio-Embed als nativen `<audio controls>` Player rendern, mit dem rohen Dateiendpunkt als `src` (gleicher Endpoint-Pfad wie bei Bild-Embeds: `/api/v1/vaults/:id/files?path=...&raw=true`).
3. THE Live Preview SHALL ein Audio-Embed als Widget-Decoration mit einem `<audio controls>` Player rendern (analog zur bestehenden Image-Widget-Mechanik — ein Replace-Widget, das die `![[...]]`-Syntax ersetzt).
4. IF die Audio-Datei nicht im Vault gefunden wird (Auflösung via `resolveWikilinkTarget` liefert `null`), THEN THE System SHALL einen Platzhalter mit dem Dateinamen anzeigen (analog zu „Bild nicht gefunden").
5. THE `display`-Parameter des Embeds (`![[datei.mp3|controls]]`) SHALL vorerst ignoriert werden (kein Größen-/Stil-Parameter bei Audio — Obsidian unterstützt dort ebenfalls keinen).
6. THE Audio-Erkennung SHALL vor der Note-Erkennung in `detectEmbedType()` stattfinden, aber nach Image und PDF, sodass die bestehende Prioritätsreihenfolge (image > pdf > audio > video > note) gilt.

### Requirement 5: Video-Embeds

**User Story:** Als Benutzer möchte ich Videodateien in meinem Vault per `![[datei.mp4]]` einbetten und direkt in der Notiz abspielen können.

#### Acceptance Criteria

1. WHEN ein `![[datei.ext]]`-Embed ein Ziel mit einer Video-Endung hat (`.mp4`, `.webm`, `.ogv`, `.mov`, `.mkv`), THE System SHALL es als Video-Embed klassifizieren (`embedType: 'video'`), nicht als Note-Embed.
2. THE Reading View SHALL ein Video-Embed als nativen `<video controls>` Player rendern, mit dem rohen Dateiendpunkt als `src`.
3. THE `display`-Parameter des Embeds (`![[datei.mp4|640]]` oder `![[datei.mp4|640x360]]`) SHALL analog zur bestehenden Bild-Größen-Logik (`parseEmbedImageStyle`) als Breiten-/Höhen-Steuerung für den Video-Player interpretiert werden.
4. THE Live Preview SHALL ein Video-Embed als Widget-Decoration mit einem `<video controls>` Player rendern (Replace-Widget).
5. IF die Video-Datei nicht im Vault gefunden wird, THEN THE System SHALL einen Platzhalter mit dem Dateinamen anzeigen.
6. THE Video-Player SHALL `preload="metadata"` setzen, sodass nur die Metadaten (Dauer, Abmessungen) beim Laden der Notiz abgerufen werden — nicht die gesamte Videodatei.
7. THE Video-Erkennung SHALL nach Audio und vor Note in `detectEmbedType()` stattfinden.

### Requirement 6: KaTeX-Styling und Dark Mode

**User Story:** Als Benutzer möchte ich, dass gerenderte Formeln sich nahtlos in die aktuelle Theme-Darstellung (Light/Dark) der App einfügen.

#### Acceptance Criteria

1. THE KaTeX-CSS-Datei (`katex/dist/katex.min.css`) SHALL zusammen mit der Bibliothek lazy-loaded werden (dynamisch injiziertes `<link>` oder eingebundenes CSS-Modul); sie SHALL nur einmal geladen werden, auch bei mehreren Formeln im Dokument.
2. THE Mathe-Rendering SHALL in beiden Theme-Modi (Light und Dark) lesbar sein; die Standard-KaTeX-Ausgabe nutzt `currentColor` und erbt damit die Textfarbe des umgebenden Containers — es SHALL geprüft werden, dass keine expliziten Farbwerte in den KaTeX-Styles den Dark-Mode-Kontrast brechen.
3. Block-Mathe SHALL horizontal zentriert und mit angemessenem vertikalen Abstand (`margin-block`) zum umgebenden Text dargestellt werden.
4. Inline-Mathe SHALL vertikal zum umgebenden Fließtext ausgerichtet sein (Baseline-Alignment).

