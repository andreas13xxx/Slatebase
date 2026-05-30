# Requirements Document

## Introduction

Der Knowledge Graph ist eine visuelle Darstellung der Verlinkungen zwischen Notizen in einem Vault. Benutzer können die Beziehungen zwischen ihren Markdown-Dateien als interaktiven Graphen mit Nodes (Dateien) und Edges (Wikilinks) erkunden. Das Feature umfasst einen Backend-seitigen Link-Index (In-Memory mit JSON-Persistierung) sowie eine interaktive Frontend-Visualisierung.

## Glossary

- **Link_Index_Service**: Backend-Service der Wikilinks aus Markdown-Dateien extrahiert und einen In-Memory-Index (`Map<filePath, Set<linkedPath>>`) verwaltet, persistiert als JSON-Datei
- **Graph_View**: Frontend-Komponente die den Knowledge Graph als interaktive SVG/Canvas-Visualisierung mit Nodes und Edges darstellt
- **Forward_Link**: Ein Wikilink von Datei A zu Datei B (ausgehende Verbindung)
- **Backlink**: Eine Referenz von Datei B zurück zu Datei A, abgeleitet aus der Reverse-Map des Index
- **Link_Index_Datei**: JSON-Datei unter `data/vaults/<vaultId>/_link-index.json` die den persistierten Link-Index enthält
- **ILinkIndex**: Interface das die Link-Index-Implementierung abstrahiert (ermöglicht späteren Wechsel von JSON zu SQLite)
- **Wikilink_Parser**: Die bestehende `extractWikilinks()`-Funktion die Wikilinks aus Markdown-Strings extrahiert
- **Graph_Node**: Visuelle Repräsentation einer Datei im Graphen (Kreis/Punkt mit Label)
- **Graph_Edge**: Visuelle Repräsentation eines Links zwischen zwei Dateien (Linie/Pfeil)
- **Force_Layout**: Physik-basierter Layout-Algorithmus der Nodes automatisch positioniert (Abstoßung zwischen Nodes, Anziehung entlang Edges)

## Requirements

### Requirement 1: Link-Index aufbauen

**User Story:** Als Benutzer möchte ich, dass der Server automatisch einen Index aller Verlinkungen in meinem Vault erstellt, damit der Knowledge Graph schnell geladen werden kann.

#### Acceptance Criteria

1. WHEN ein Vault initialisiert wird, THE Link_Index_Service SHALL alle Dateien mit der Extension `.md` im Vault rekursiv parsen und einen vollständigen Link-Index aufbauen
2. THE Link_Index_Service SHALL für jede Datei die extrahierten Wikilink-Targets als Forward_Links speichern, wobei Dateipfade relativ zum Vault-Root und normalisiert (forward slashes, keine führenden `./`) gespeichert werden
3. THE Link_Index_Service SHALL eine Reverse-Map pflegen, die für jede Datei alle eingehenden Backlinks enthält
4. THE Link_Index_Service SHALL den aufgebauten Index als JSON in die Link_Index_Datei persistieren (atomarer Schreibvorgang: temp → rename)
5. WHEN der Server startet, IF eine Link_Index_Datei existiert und als gültiges JSON parsebar ist, THEN THE Link_Index_Service SHALL den Index aus der JSON-Datei laden statt alle Dateien neu zu parsen
6. IF die Link_Index_Datei fehlt, nicht als JSON parsebar ist, oder das erwartete Schema nicht erfüllt (fehlende Pflichtfelder oder ungültige Datentypen), THEN THE Link_Index_Service SHALL den Index durch vollständiges Parsen aller Vault-Dateien regenerieren
7. IF eine einzelne Markdown-Datei während des Index-Aufbaus nicht gelesen werden kann (Dateisystem-Fehler), THEN THE Link_Index_Service SHALL diese Datei überspringen, den Fehler loggen, und den Index-Aufbau mit den verbleibenden Dateien fortsetzen

### Requirement 2: Inkrementelles Index-Update

**User Story:** Als Benutzer möchte ich, dass der Link-Index automatisch aktualisiert wird wenn ich eine Datei speichere, damit der Graph immer aktuell ist.

#### Acceptance Criteria

1. WHEN eine Markdown-Datei gespeichert wird, THE Link_Index_Service SHALL nur diese eine Datei neu parsen und den Index innerhalb von 500 ms aktualisieren
2. WHEN eine Markdown-Datei aktualisiert wird, THE Link_Index_Service SHALL die alten Forward_Links dieser Datei entfernen und durch die neu extrahierten ersetzen
3. WHEN eine Markdown-Datei aktualisiert wird, THE Link_Index_Service SHALL die Reverse-Map aktualisieren, indem alte Backlink-Einträge dieser Datei aus allen Ziel-Dateien entfernt und die neuen Backlink-Einträge bei den jeweiligen Ziel-Dateien hinzugefügt werden
4. WHEN eine Markdown-Datei gelöscht wird, THE Link_Index_Service SHALL alle Forward_Links dieser Datei und alle Backlink-Einträge die auf diese Datei als Quelle verweisen aus dem Index entfernen
5. WHEN eine neue Markdown-Datei erstellt wird, THE Link_Index_Service SHALL die neue Datei parsen und ihre Links in den Index aufnehmen
6. WHEN eine Markdown-Datei umbenannt wird, THE Link_Index_Service SHALL den alten Pfad aus dem Index entfernen (Forward_Links und Backlink-Einträge) und den neuen Pfad mit den geparsten Links einfügen
7. THE Link_Index_Service SHALL nach jedem inkrementellen Update den Index atomar in die Link_Index_Datei persistieren (temp-Datei schreiben, dann rename)
8. IF die Persistierung der Link_Index_Datei fehlschlägt, THEN THE Link_Index_Service SHALL den In-Memory-Index unverändert beibehalten und den Fehler loggen, sodass beim nächsten erfolgreichen Update der vollständige aktuelle Index geschrieben wird

### Requirement 3: Link-Index API

**User Story:** Als Frontend-Entwickler möchte ich über eine REST-API auf die Graph-Daten zugreifen, damit die Graph-Visualisierung die Verlinkungen laden kann.

#### Acceptance Criteria

1. WHEN ein authentifizierter Benutzer den Graph-Endpoint für einen Vault aufruft, THE Link_Index_Service SHALL die vollständige Graph-Struktur als JSON zurückgeben, bestehend aus einem Array von Nodes (jeweils mit Dateipfad, Dateiname als Label und einem Flag ob die Datei existiert oder nur als Link-Target referenziert wird) sowie einem Array von Edges (jeweils mit Quell-Dateipfad und Ziel-Dateipfad)
2. THE Link_Index_Service SHALL nur Nodes für Dateien zurückgeben, die tatsächlich im Vault existieren oder als Link-Target referenziert werden
3. WHEN ein Benutzer Backlinks für eine bestimmte Datei abfragt, THE Link_Index_Service SHALL alle Dateien zurückgeben die auf diese Datei verlinken
4. IF ein Benutzer ohne Lese- oder Schreibberechtigung den Graph-Endpoint oder Backlinks-Endpoint aufruft, THEN THE Link_Index_Service SHALL den Zugriff mit HTTP 403 und einem Fehler im API-Error-Format ablehnen
5. IF der Index für den angefragten Vault nicht existiert, THEN THE Link_Index_Service SHALL den Index aufbauen und anschließend die Daten zurückgeben
6. IF der angefragte Vault nicht existiert, THEN THE Link_Index_Service SHALL HTTP 404 mit dem Fehlercode VAULT_NOT_FOUND zurückgeben
7. IF die im Backlinks-Request angegebene Datei nicht im Index enthalten ist, THEN THE Link_Index_Service SHALL eine leere Backlinks-Liste zurückgeben

### Requirement 4: Graph-Visualisierung

**User Story:** Als Benutzer möchte ich die Verlinkungen zwischen meinen Notizen als interaktiven Graphen sehen, damit ich die Struktur meines Wissens visuell erfassen kann.

#### Acceptance Criteria

1. THE Graph_View SHALL jede Datei die im Vault existiert sowie jede als Link-Target referenzierte (aber nicht existierende) Datei als Graph_Node darstellen, und jeden Wikilink zwischen zwei Dateien als Graph_Edge darstellen
2. THE Graph_View SHALL einen Force_Layout-Algorithmus verwenden um die Nodes automatisch zu positionieren
3. THE Graph_View SHALL Nodes mit ihrem Dateinamen (ohne Pfad und Extension) beschriften, wobei Labels die länger als 30 Zeichen sind nach 30 Zeichen mit Ellipsis abgeschnitten werden
4. THE Graph_View SHALL Nodes die keine Verbindungen haben (isolierte Dateien) im Graphen anzeigen
5. THE Graph_View SHALL referenzierte Dateien die nicht existieren (unresolved Links) visuell unterscheidbar darstellen (andere Farbe oder Form als existierende Nodes)
6. WHEN der Benutzer auf einen Graph_Node einer existierenden Datei klickt, THE Graph_View SHALL die entsprechende Datei in einem Tab öffnen
7. IF der Benutzer auf einen Graph_Node einer nicht existierenden Datei (unresolved Link) klickt, THEN THE Graph_View SHALL keine Aktion ausführen (kein Tab wird geöffnet)
8. WHILE die Graph-Daten vom Server geladen werden, THE Graph_View SHALL einen Ladeindikator anzeigen

### Requirement 5: Graph-Interaktion

**User Story:** Als Benutzer möchte ich den Graphen interaktiv erkunden können (Zoomen, Verschieben, Nodes bewegen), damit ich auch bei großen Vaults den Überblick behalte.

#### Acceptance Criteria

1. THE Graph_View SHALL Zoom per Mausrad oder Pinch-Geste unterstützen, wobei der Zoom-Level auf einen Bereich von 0.1x bis 5x begrenzt ist
2. THE Graph_View SHALL Pan (Verschieben des sichtbaren Bereichs) per Maus-Drag auf dem Hintergrund unterstützen
3. WHEN der Benutzer einen Graph_Node per Drag bewegt, THE Graph_View SHALL den Node an der neuen Position fixieren und vom Force_Layout-Algorithmus ausschließen, bis der Benutzer den Node per Doppelklick wieder freigibt
4. WHEN der Benutzer über einen Graph_Node hovert, THE Graph_View SHALL den vollständigen Dateipfad als Tooltip anzeigen
5. WHEN der Benutzer über einen Graph_Node hovert, THE Graph_View SHALL die direkten Verbindungen (eingehende und ausgehende Edges) dieses Nodes mit Akzentfarbe hervorheben und alle übrigen Edges auf 20% Deckkraft dimmen
6. WHEN der Benutzer den Hover von einem Graph_Node entfernt, THE Graph_View SHALL alle Edges auf ihre normale Darstellung zurücksetzen

### Requirement 6: Graph als Tab öffnen

**User Story:** Als Benutzer möchte ich den Knowledge Graph als Tab öffnen können, damit er sich nahtlos in die bestehende Tab-basierte Oberfläche einfügt.

#### Acceptance Criteria

1. THE Graph_View SHALL als schließbarer Tab im bestehenden Tab-System geöffnet werden können, mit dem Tab-Label "Graph" und einem Graph-Icon (Lucide)
2. WHEN der Benutzer den Graph-Button in der SidebarToolbar klickt, THE Graph_View SHALL als neuer Tab geöffnet werden (oder ein bereits geöffneter Graph-Tab aktiviert werden, sodass maximal ein Graph-Tab gleichzeitig existiert)
3. THE Graph_View SHALL den aktuell ausgewählten Vault visualisieren, indem die Graph-Daten vom Link-Index-API-Endpoint geladen werden
4. WHEN der Benutzer den Vault wechselt und ein Graph-Tab geöffnet ist, THE Graph_View SHALL im selben Tab die Graph-Daten des neuen Vaults laden und anzeigen (der Tab bleibt geöffnet, der Inhalt wird ersetzt)
5. WHILE kein Vault ausgewählt ist, THE Graph_View SHALL eine Hinweismeldung anzeigen dass ein Vault ausgewählt werden muss
6. WHILE die Graph-Daten geladen werden, THE Graph_View SHALL einen Ladeindikator anzeigen
7. IF das Laden der Graph-Daten fehlschlägt, THEN THE Graph_View SHALL eine Fehlermeldung im Tab-Inhalt anzeigen, die den Fehlergrund beschreibt, und eine Möglichkeit zum erneuten Laden bereitstellen

### Requirement 7: ILinkIndex-Interface

**User Story:** Als Entwickler möchte ich, dass der Link-Index hinter einem Interface abstrahiert ist, damit die Implementierung später ohne API-Änderung von JSON auf SQLite gewechselt werden kann.

#### Acceptance Criteria

1. THE Link_Index_Service SHALL das ILinkIndex-Interface implementieren
2. THE ILinkIndex-Interface SHALL Methoden definieren die einen Dateipfad als Eingabe akzeptieren und für Forward_Links eine Liste von Ziel-Dateipfaden, für Backlinks eine Liste von Quell-Dateipfaden und für die vollständige Graph-Struktur eine Liste von Nodes (Dateipfad, Existenz-Flag) und Edges (Quell-Dateipfad, Ziel-Dateipfad) zurückgeben
3. THE ILinkIndex-Interface SHALL Methoden für inkrementelle Updates definieren die jeweils einen Dateipfad und den Markdown-Inhalt als Eingabe akzeptieren: eine Methode für Datei hinzugefügt/geändert (parst Inhalt und aktualisiert Index) und eine Methode für Datei gelöscht (entfernt alle Einträge dieser Datei)
4. THE ILinkIndex-Interface SHALL eine Methode für den vollständigen Index-Aufbau (rebuild) definieren die keine implementierungsspezifischen Parameter erwartet
5. THE ILinkIndex-Interface SHALL keine implementierungsspezifischen Details exponieren (keine Dateipfade zur Persistierung, keine Datenbank-Referenzen, keine Serialisierungsformate) — Persistierung ist ein internes Implementierungsdetail
6. THE Link_Index_Service SHALL über manuelle Dependency Injection im Composition Root verdrahtet werden, wobei konsumierender Code ausschließlich gegen das ILinkIndex-Interface programmiert ist

### Requirement 8: Wikilink-Parsing im Backend

**User Story:** Als Entwickler möchte ich die Wikilink-Extraktion im Backend nutzen können, damit der Server Links aus Markdown-Dateien parsen kann ohne auf Frontend-Code angewiesen zu sein.

#### Acceptance Criteria

1. WHEN ein Markdown-String an den Wikilink_Parser übergeben wird, THE Link_Index_Service SHALL für jeden erkannten Wikilink ein Ergebnisobjekt mit den Feldern `target` (Dateiname ohne Extension), `display` (Anzeigetext), `heading` (Heading-Referenz oder null) und `position` (Zeile und Spalte) zurückgeben, wobei die extrahierten Targets und deren Anzahl identisch zu denen der bestehenden Frontend-Funktion `extractWikilinks()` sein müssen
2. THE Wikilink_Parser SHALL Wikilinks innerhalb von Fenced-Code-Blöcken (eingeleitet durch ``` oder ~~~), Indented-Code-Blöcken (4 Leerzeichen/1 Tab Einrückung) und Inline-Code (umschlossen von Backticks) nicht als Wikilinks erkennen und aus dem Ergebnis ausschließen
3. THE Wikilink_Parser SHALL die folgenden Wikilink-Formate erkennen und das Target wie folgt auflösen: `[[dateiname]]` → target="dateiname", `[[ordner/datei]]` → target="ordner/datei" (relativer Pfad beibehalten), `[[datei#überschrift]]` → target="datei" mit heading="überschrift", `[[datei#überschrift|anzeige]]` → target="datei" mit heading="überschrift" und display="anzeige", `[[#überschrift]]` → target="" (leer) mit heading="überschrift"
4. IF der übergebene Markdown-String syntaktisch ungültige Wikilinks enthält (z.B. `[[]]`, `[[nicht geschlossen`, `[[mit\nZeilenumbruch]]`), THEN THE Wikilink_Parser SHALL diese ignorieren und nur gültige Wikilinks im Ergebnis zurückgeben, ohne einen Fehler auszulösen
5. WHEN derselbe Markdown-String mehrfach an den Wikilink_Parser übergeben wird, THE Wikilink_Parser SHALL bei jedem Aufruf die gleiche Menge an Ergebnisobjekten mit identischen Feldwerten zurückgeben (deterministische Ausgabe)

### Requirement 9: Graph-Darstellung anpassen

**User Story:** Als Benutzer möchte ich die Darstellung des Graphen anpassen können, damit ich die für mich relevanten Informationen besser erkennen kann.

#### Acceptance Criteria

1. THE Graph_View SHALL die Node-Größe proportional zur Gesamtzahl der Verbindungen (Summe aus Forward_Links und Backlinks) skalieren, wobei Nodes mit 0 Verbindungen eine Mindestgröße von 4px Radius und Nodes mit der höchsten Verbindungsanzahl eine Maximalgröße von 20px Radius erhalten
2. THE Graph_View SHALL eine Suchfunktion bereitstellen, die den Dateinamen (ohne Pfad und Extension) per case-insensitiver Substring-Suche filtert und maximal 10 Vorschläge in einer Dropdown-Liste anzeigt
3. WHEN der Benutzer einen Node aus der Such-Dropdown-Liste auswählt, THE Graph_View SHALL den Graphen auf diesen Node zentrieren und den Node durch eine farblich abgesetzte Umrandung (Design Token) sowie eine Größenerhöhung auf das 1,5-fache hervorheben
4. IF die Suche keine Treffer ergibt, THEN THE Graph_View SHALL eine Hinweismeldung im Dropdown anzeigen, dass kein passender Node gefunden wurde
5. THE Graph_View SHALL alle Farben (Node-Füllfarbe, Edge-Farbe, Hervorhebungsfarbe, Hintergrund) ausschließlich über CSS Custom Properties (Design Tokens) definieren, sodass Dark Mode und Light Mode ohne zusätzliche Logik korrekt dargestellt werden
