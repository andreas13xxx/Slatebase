# Requirements Document

## Introduction

Dieses Feature erweitert den bestehenden FileViewer um ein Tab-basiertes System, das mehrere Dateien gleichzeitig geöffnet halten kann. Jede Datei kann in zwei Modi angezeigt werden: einem Bearbeitungsmodus (Klartext-Editor) und einem Ansichtsmodus (gerendertes Markdown). Binärdateien unterstützen ausschließlich den Ansichtsmodus mit Vorschau (z.B. Bilder).

## Glossary

- **Tab_Leiste**: Die UI-Komponente, die alle geöffneten Tabs als horizontale Leiste oberhalb des Inhaltsbereichs darstellt
- **Tab**: Ein einzelner Eintrag in der Tab_Leiste, der eine geöffnete Datei repräsentiert
- **Aktiver_Tab**: Der Tab, dessen Inhalt aktuell im Inhaltsbereich angezeigt wird
- **Bearbeitungsmodus**: Der Modus, in dem der Dateiinhalt als editierbarer Klartext dargestellt wird
- **Ansichtsmodus**: Der Modus, in dem der Dateiinhalt nach Markdown-Regeln gerendert dargestellt wird
- **Modus_Icon**: Das Icon im Tab oder in der Toolbar, das den aktuellen Modus anzeigt und als Umschalter zwischen den Modi dient
- **Interner_Link**: Ein Markdown-Link, der auf eine andere Datei innerhalb desselben Vaults verweist
- **Externer_Link**: Ein Markdown-Link, der auf eine URL außerhalb des Vaults verweist
- **Binärdatei**: Eine Datei, deren Inhalt Null-Bytes enthält (isBinary === true)
- **Vault**: Ein Verzeichnis mit Markdown- und anderen Dateien, das als Wissensbasis dient

## Requirements

### Requirement 1: Tabs öffnen

**User Story:** Als Benutzer möchte ich mehrere Dateien in Tabs öffnen können, damit ich zwischen verschiedenen Dokumenten wechseln kann, ohne den Kontext zu verlieren.

#### Acceptance Criteria

1. WHEN der Benutzer eine Datei im FileExplorer anklickt, THE Tab_Leiste SHALL die Datei in einem neuen Tab öffnen und diesen als Aktiver_Tab setzen
2. WHEN der Benutzer eine bereits geöffnete Datei im FileExplorer anklickt, THE Tab_Leiste SHALL den existierenden Tab dieser Datei als Aktiver_Tab setzen, ohne einen neuen Tab zu erstellen
3. THE Tab SHALL den Dateinamen als Beschriftung anzeigen; WHEN mehrere geöffnete Dateien denselben Dateinamen haben, THE Tab SHALL zusätzlich den übergeordneten Ordnerpfad als Tooltip anzeigen
4. WHEN mehrere Tabs geöffnet sind, THE Tab_Leiste SHALL alle Tabs in der Reihenfolge ihres Öffnens horizontal darstellen
5. THE Aktiver_Tab SHALL visuell von inaktiven Tabs unterscheidbar dargestellt werden (z.B. durch Hintergrundfarbe oder Unterstreichung)

### Requirement 2: Tabs schließen

**User Story:** Als Benutzer möchte ich einzelne Tabs schließen können, damit ich nicht mehr benötigte Dateien aus der Ansicht entfernen kann.

#### Acceptance Criteria

1. THE Tab SHALL eine Schließen-Schaltfläche mit einem zugänglichen Label (aria-label) anzeigen, die per Mausklick und Tastatur (Enter oder Space) bedienbar ist
2. WHEN der Benutzer die Schließen-Schaltfläche eines Tabs betätigt, THE Tab_Leiste SHALL den Tab aus der Tab-Liste entfernen und den zugehörigen FileContent-Eintrag aus dem Anwendungszustand entfernen
3. WHEN der Aktive_Tab geschlossen wird und weitere Tabs geöffnet sind, THE Tab_Leiste SHALL den rechts benachbarten Tab als Aktiver_Tab setzen; falls kein rechter Nachbar existiert, SHALL der links benachbarte Tab als Aktiver_Tab gesetzt werden
4. WHEN ein nicht-aktiver Tab geschlossen wird, THE Tab_Leiste SHALL den aktuell Aktiven_Tab unverändert beibehalten
5. WHEN der letzte verbleibende Tab geschlossen wird, THE Tab_Leiste SHALL keinen Aktiven_Tab haben und der Inhaltsbereich SHALL leer ohne Dateiinhalt dargestellt werden

### Requirement 3: Modus-Umschaltung

**User Story:** Als Benutzer möchte ich zwischen Bearbeitungs- und Ansichtsmodus umschalten können, damit ich Dateien sowohl editieren als auch gerendert lesen kann.

#### Acceptance Criteria

1. THE Modus_Icon SHALL den aktuellen Modus der Datei durch zwei visuell unterscheidbare Icons darstellen: ein Icon kennzeichnet den Bearbeitungsmodus, ein anderes Icon kennzeichnet den Ansichtsmodus. THE Modus_Icon SHALL einen zugänglichen Namen (accessible name) besitzen, der den aktuellen Modus als Text beschreibt (z.B. „Bearbeitungsmodus" oder „Ansichtsmodus")
2. WHEN der Benutzer das Modus_Icon betätigt, THE Tab_Leiste SHALL den Modus der aktiven Datei zwischen Bearbeitungsmodus und Ansichtsmodus umschalten und das Modus_Icon innerhalb von 200 ms aktualisieren
3. THE Tab_Leiste SHALL den gewählten Modus pro Tab unabhängig im Anwendungszustand (In-Memory) speichern, sodass ein Moduswechsel in einem Tab keinen Einfluss auf den Modus anderer geöffneter Tabs hat
4. WHEN eine Textdatei geöffnet wird, THE Tab_Leiste SHALL den Bearbeitungsmodus als Standard-Modus setzen
5. WHEN eine Binärdatei geöffnet wird, THE Tab_Leiste SHALL den Ansichtsmodus als Standard-Modus setzen und THE Modus_Icon SHALL deaktiviert dargestellt werden, sodass kein Moduswechsel möglich ist
6. IF der Benutzer den Modus von Bearbeitungsmodus zu Ansichtsmodus umschaltet und ungespeicherte Änderungen vorliegen, THEN THE System SHALL die ungespeicherten Änderungen im Anwendungszustand beibehalten, sodass bei Rückkehr zum Bearbeitungsmodus der zuletzt bearbeitete Inhalt wiederhergestellt wird

### Requirement 4: Bearbeitungsmodus

**User Story:** Als Benutzer möchte ich Dateien im Bearbeitungsmodus editieren können, damit ich Inhalte direkt in der Anwendung ändern kann.

#### Acceptance Criteria

1. WHEN der Benutzer in der Dateiansicht die Bearbeiten-Aktion auslöst, THE Editor SHALL in den Bearbeitungsmodus wechseln und den Dateiinhalt als editierbaren Klartext in einem mehrzeiligen Textfeld darstellen
2. WHILE eine Datei im Bearbeitungsmodus angezeigt wird, THE Editor SHALL einen per Tastatur und Mausklick positionierbaren Textcursor bereitstellen
3. WHILE eine Datei im Bearbeitungsmodus angezeigt wird, THE Editor SHALL Texteingabe, Zeichenlöschen, Textmarkierung, Kopieren und Einfügen über Standardtastenkombinationen unterstützen
4. WHEN der Benutzer im Bearbeitungsmodus die Speichern-Aktion auslöst, THE Editor SHALL den aktuellen Textfeldinhalt per API-Aufruf persistent auf dem Server speichern und eine Erfolgsbestätigung anzeigen
5. IF das Speichern per API-Aufruf fehlschlägt, THEN THE Editor SHALL eine Fehlermeldung mit dem Fehlergrund anzeigen und den ungespeicherten Inhalt im Textfeld beibehalten
6. IF die ausgewählte Datei eine Binärdatei ist, THEN THE Editor SHALL die Bearbeiten-Aktion deaktivieren
7. WHEN der Benutzer im Bearbeitungsmodus die Abbrechen-Aktion auslöst, THE Editor SHALL den Bearbeitungsmodus verlassen und zur Ansicht zurückkehren, ohne Änderungen zu speichern

### Requirement 5: Ansichtsmodus (Markdown-Rendering)

**User Story:** Als Benutzer möchte ich Markdown-Dateien gerendert anzeigen können, damit ich den formatierten Inhalt lesen kann.

#### Acceptance Criteria

1. WHILE eine Datei im Ansichtsmodus angezeigt wird, THE Renderer SHALL den Markdown-Inhalt gemäß CommonMark-Spezifikation mit GFM-Erweiterungen (Tabellen, Aufgabenlisten, Durchstreichung) gerendert darstellen
2. THE Renderer SHALL Überschriften (H1–H6) als einklappbare Abschnitte darstellen, wobei jeder Abschnitt den Inhalt bis zur nächsten Überschrift gleicher oder höherer Ebene umfasst und Abschnitte standardmäßig ausgeklappt angezeigt werden
3. THE Renderer SHALL Textformatierungen (fett, kursiv, durchgestrichen, Inline-Code) als entsprechende HTML-Elemente (strong, em, del, code) darstellen
4. THE Renderer SHALL geordnete Listen, ungeordnete Listen und Aufgabenlisten darstellen, wobei Aufgabenlisten-Checkboxen im Ansichtsmodus als nicht-interaktive Zustandsanzeigen (aktiviert/deaktiviert) gerendert werden
5. THE Renderer SHALL Codeblöcke mit Syntax-Hervorhebung darstellen; IF ein Codeblock eine nicht unterstützte oder keine Sprachkennung enthält, THEN THE Renderer SHALL den Codeblock ohne Syntax-Hervorhebung als formatierten Monospace-Text darstellen
6. THE Renderer SHALL GFM-Pipe-Tabellen, Blockzitate und horizontale Trennlinien als entsprechende HTML-Elemente (table, blockquote, hr) darstellen
7. IF der Markdown-Inhalt ungültige oder nicht parsbare Syntax enthält, THEN THE Renderer SHALL den betroffenen Abschnitt als unformatierten Klartext darstellen, ohne die Darstellung der übrigen Inhalte zu beeinträchtigen

### Requirement 6: Link-Verhalten im Ansichtsmodus

**User Story:** Als Benutzer möchte ich Links im Ansichtsmodus anklicken können, damit ich zu verlinkten Inhalten navigieren kann.

#### Acceptance Criteria

1. WHILE eine Datei im Ansichtsmodus angezeigt wird, THE Renderer SHALL Wikilinks der Form `[[Dateiname]]` und `[[Dateiname|Anzeigetext]]` sowie Standard-Markdown-Links der Form `[Text](Ziel)` erkennen und als klickbare Hyperlink-Elemente mit Unterstreichung und Zeiger-Cursor darstellen
2. WHEN der Benutzer einen Externer_Link anklickt (Ziel beginnt mit `http://` oder `https://`), THE Renderer SHALL die Ziel-URL in einem neuen Browser-Tab öffnen (target="_blank") und das Attribut rel="noopener noreferrer" setzen
3. WHEN der Benutzer einen Interner_Link anklickt und die Zieldatei im aktuellen Vault existiert, THE Tab_Leiste SHALL die Zieldatei in einem neuen Tab öffnen
4. IF der Benutzer einen Interner_Link anklickt und die Zieldatei im aktuellen Vault nicht existiert, THEN THE System SHALL eine neue Markdown-Datei mit 0 Bytes Inhalt unter dem Linkziel-Pfad anlegen und diese in einem neuen Tab öffnen
5. IF das Anlegen einer neuen Datei fehlschlägt, THEN THE System SHALL eine Fehlermeldung anzeigen, die den Dateinamen und den Fehlergrund enthält, und den aktuellen Ansichtszustand unverändert beibehalten
6. WHILE eine Datei im Ansichtsmodus angezeigt wird, THE Renderer SHALL interne Links zu nicht existierenden Dateien visuell von Links zu existierenden Dateien unterscheidbar darstellen (z.B. durch abweichende Farbe oder gestrichelte Unterstreichung)

### Requirement 7: Binärdateien

**User Story:** Als Benutzer möchte ich Binärdateien (z.B. Bilder) in der Anwendung anzeigen können, damit ich alle Vault-Inhalte einsehen kann.

#### Acceptance Criteria

1. WHEN eine Datei geöffnet wird, deren FileContent-Attribut `isBinary` den Wert `true` hat, THE Tab_Leiste SHALL ausschließlich den Ansichtsmodus aktivieren und das Modus_Icon visuell als deaktiviert darstellen (ausgegraut, nicht klickbar)
2. WHEN eine Bilddatei mit der Dateiendung PNG, JPEG, JPG, GIF, AVIF, WebP oder SVG geöffnet wird, THE Renderer SHALL das Bild als Vorschau innerhalb des Inhaltsbereichs mittels eines HTML-img-Elements darstellen, wobei das Bild auf maximal 100% der verfügbaren Breite des Inhaltsbereichs skaliert wird
3. IF eine Bilddatei geöffnet wird und das Bild nicht geladen werden kann, THEN THE Renderer SHALL anstelle der Vorschau einen Hinweis anzeigen, der den Dateinamen enthält und darauf hinweist, dass das Bild nicht geladen werden konnte
4. WHEN eine Binärdatei geöffnet wird, deren Dateiendung nicht in der Liste der darstellbaren Bildformate (PNG, JPEG, JPG, GIF, AVIF, WebP, SVG) enthalten ist, THE Renderer SHALL einen Hinweis anzeigen, der den Dateinamen und den Dateityp enthält und darauf hinweist, dass diese Datei nicht dargestellt werden kann
5. WHILE eine Markdown-Datei im Ansichtsmodus angezeigt wird und eingebettete Bild-Links in Obsidian-Syntax (`![[dateiname.ext]]`) oder Standard-Markdown-Syntax (`![alt](pfad)`) enthält, THE Renderer SHALL die referenzierten Bilder inline als img-Elemente darstellen, wobei jedes Bild auf maximal 100% der verfügbaren Breite des Inhaltsbereichs skaliert wird
6. IF eine Markdown-Datei im Ansichtsmodus ein eingebettetes Bild referenziert, das im Vault nicht gefunden werden kann, THEN THE Renderer SHALL anstelle des Bildes einen Platzhalter-Hinweis anzeigen, der den referenzierten Dateinamen enthält und darauf hinweist, dass das Bild nicht gefunden wurde

### Requirement 8: Datei speichern (Backend)

**User Story:** Als Benutzer möchte ich, dass meine Änderungen persistent gespeichert werden, damit sie beim nächsten Öffnen der Datei erhalten bleiben.

#### Acceptance Criteria

1. WHEN der Editor eine Speicheranfrage mit Vault-ID, relativem Dateipfad und Textinhalt (UTF-8) sendet, THE Backend SHALL den Inhalt an den angegebenen Pfad im Vault schreiben und die In-Memory-Verzeichnisstruktur des Vaults aktualisieren
2. IF der angegebene Pfad außerhalb des Vault-Verzeichnisses liegt, THEN THE Backend SHALL die Anfrage mit einem PATH_TRAVERSAL-Fehler ablehnen
3. IF die Datei nicht existiert, THEN THE Backend SHALL fehlende Zwischenverzeichnisse anlegen und die Datei am angegebenen Pfad neu erstellen
4. WHEN die Datei erfolgreich gespeichert wurde, THE Backend SHALL eine Bestätigung mit Dateipfad (relativ), Dateiname und Dateigröße in Bytes zurückgeben
5. IF die angegebene Vault-ID keinem geladenen Vault entspricht, THEN THE Backend SHALL die Anfrage mit einem VAULT_NOT_FOUND-Fehler ablehnen
6. IF der Dateiinhalt die konfigurierte maximale Dateigröße (maxFileSize) überschreitet, THEN THE Backend SHALL die Anfrage mit einem Fehler ablehnen, der auf die Größenüberschreitung hinweist
7. IF das Schreiben auf das Dateisystem fehlschlägt, THEN THE Backend SHALL die Anfrage mit einem STORAGE_ERROR-Fehler ablehnen, ohne den bisherigen Dateiinhalt zu korrumpieren
