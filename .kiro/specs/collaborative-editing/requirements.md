# Requirements Document

## Introduction

Mehrere Benutzer sollen gleichzeitig an demselben Markdown-Dokument arbeiten können. Änderungen werden in Echtzeit an alle aktiven Editoren übertragen. Das System verwendet einen Conflict-Free Replicated Data Type (CRDT) oder Operational Transformation (OT) Ansatz um konkurrierende Edits ohne Datenverlust zusammenzuführen. Cursor-Positionen und Selektionen anderer Benutzer werden live angezeigt.

## Glossary

- **Collaboration_Session**: Eine aktive Bearbeitungssitzung für ein bestimmtes Dokument, an der mindestens ein Benutzer teilnimmt
- **Collaboration_Server**: Die Backend-Komponente die Editing-Sessions verwaltet, Operationen verteilt und den autoritativen Dokumentzustand hält
- **Operation**: Eine atomare Textänderung (Insert, Delete, Retain) die von einem Client erzeugt und an alle Teilnehmer verteilt wird
- **Cursor_Presence**: Die sichtbare Cursor-Position und Selektion eines anderen Benutzers im Dokument
- **Conflict_Resolution**: Der automatische Algorithmus der konkurrierende Operationen in eine konsistente Reihenfolge bringt
- **Document_State**: Der aktuelle autoritative Text eines Dokuments, verwaltet vom Collaboration_Server
- **Awareness**: Metadaten über aktive Teilnehmer (Cursor, Selektion, Username, Farbe)

## Requirements

### Requirement 1: Collaboration-Session starten und beitreten

**User Story:** Als Benutzer möchte ich ein Dokument öffnen und automatisch in eine Collaboration-Session eintreten, damit ich mit anderen gleichzeitig arbeiten kann.

#### Acceptance Criteria

1. WHEN ein Benutzer eine Markdown-Datei im Editor öffnet, THE Collaboration_Server SHALL prüfen ob bereits eine Collaboration_Session für diese Datei existiert und den Benutzer automatisch der bestehenden Session zuweisen oder eine neue Session erstellen
2. WHEN ein Benutzer einer bestehenden Session beitritt, THE Collaboration_Server SHALL dem Client den aktuellen Document_State senden, sodass der Editor den identischen Text anzeigt
3. THE Collaboration_Server SHALL maximal 10 gleichzeitige Teilnehmer pro Dokument zulassen; IF das Limit erreicht ist, THEN THE Editor SHALL das Dokument im Read-Only-Modus öffnen mit einem Hinweis dass die maximale Teilnehmeranzahl erreicht ist
4. WHEN ein Benutzer den Tab schließt, die Datei wechselt oder sich abmeldet, THE Collaboration_Server SHALL den Benutzer aus der Session entfernen
5. IF keine Teilnehmer mehr in einer Session sind, THEN THE Collaboration_Server SHALL die Session nach 60 Sekunden Inaktivität beenden und den letzten Document_State auf das Dateisystem persistieren
6. THE Collaboration_Session SHALL nur für Benutzer mit Schreibberechtigung auf den Vault verfügbar sein; Benutzer mit Leseberechtigung sehen das Dokument im Read-Only-Modus ohne Collaboration-Funktionen

### Requirement 2: Echtzeit-Textänderungen synchronisieren

**User Story:** Als Benutzer möchte ich die Änderungen anderer Teilnehmer sofort im Editor sehen, damit wir gemeinsam am gleichen Dokument arbeiten können.

#### Acceptance Criteria

1. WHEN ein Benutzer eine Textänderung vornimmt (Tippen, Einfügen, Löschen), THE Editor SHALL die Änderung als Operation an den Collaboration_Server senden (maximale Latenz bis zum Server: < 100ms unter normalen Netzwerkbedingungen)
2. WHEN der Collaboration_Server eine Operation empfängt, THE Collaboration_Server SHALL die Operation gegen den aktuellen Document_State transformieren (OT) oder mergen (CRDT) und das Ergebnis an alle anderen Teilnehmer der Session senden
3. THE Conflict_Resolution SHALL sicherstellen dass alle Clients nach dem Empfang aller Operationen den identischen Document_State haben (Konvergenz-Garantie)
4. WHEN ein Client eine remote Operation empfängt, THE Editor SHALL die Änderung am korrekten Position im Text einfügen ohne die aktuelle Cursor-Position oder Selektion des lokalen Benutzers unbeabsichtigt zu verschieben
5. THE Collaboration_Server SHALL Operationen in einer determinierten Reihenfolge verarbeiten (Server-Authoritative Order) und jedem Client eine monoton steigende Revisionsnummer zuweisen
6. IF ein Client offline geht und Operationen lokal zwischenspeichert, THEN THE Editor SHALL bei Reconnect die gepufferten Operationen an den Server senden, der sie gegen den aktuellen State transformiert

### Requirement 3: Cursor-Presence anderer Benutzer

**User Story:** Als Benutzer möchte ich sehen wo andere Teilnehmer gerade arbeiten (Cursor und Selektion), damit wir uns nicht gegenseitig ins Gehege kommen.

#### Acceptance Criteria

1. WHEN ein Benutzer seinen Cursor bewegt oder eine Selektion ändert, THE Editor SHALL die Cursor-Position (Zeile, Spalte) und Selektion (Start, Ende) an den Collaboration_Server senden
2. THE Collaboration_Server SHALL Cursor-Updates an alle anderen Teilnehmer der Session weiterleiten (Throttle: maximal alle 50ms pro Benutzer)
3. THE Editor SHALL für jeden remote Teilnehmer einen farbigen Cursor-Indikator (vertikale Linie, 2px breit) an der entsprechenden Position im Text anzeigen
4. THE Editor SHALL für jeden remote Teilnehmer mit aktiver Selektion den selektierten Textbereich mit einer halbtransparenten Hintergrundfarbe (Benutzer-Farbe, 20% Opacity) hervorheben
5. THE Editor SHALL über dem Cursor jedes remote Teilnehmers ein kleines Label mit dem Benutzernamen anzeigen (verschwindet nach 3 Sekunden Inaktivität, erscheint bei erneuter Cursor-Bewegung)
6. THE Collaboration_Server SHALL jedem Teilnehmer einer Session eine eindeutige Farbe zuweisen (aus einer Palette von 10 gut unterscheidbaren Farben, Zuweisung round-robin)

### Requirement 4: Konflikterkennung und Auto-Merge

**User Story:** Als Benutzer möchte ich dass gleichzeitige Änderungen automatisch zusammengeführt werden, ohne dass ich manuell Konflikte lösen muss.

#### Acceptance Criteria

1. WHEN zwei Benutzer gleichzeitig an verschiedenen Stellen im Dokument schreiben, THE Conflict_Resolution SHALL beide Änderungen korrekt zusammenführen ohne Textverlust
2. WHEN zwei Benutzer gleichzeitig an derselben Stelle im Dokument schreiben, THE Conflict_Resolution SHALL eine determinierte Reihenfolge festlegen (basierend auf Client-ID/Timestamp) und beide Eingaben hintereinander einfügen
3. THE Conflict_Resolution SHALL niemals zu Datenverlust führen — alle bestätigten Operationen müssen im finalen Dokument enthalten sein
4. IF ein Client einen veralteten State hat (mehrere Operationen im Rückstand), THEN THE Collaboration_Server SHALL alle ausstehenden Operationen transformiert in einer Batch-Nachricht senden
5. THE Editor SHALL keine explizite Konflikt-UI anzeigen — alle Konflikte werden automatisch auf Algorithmus-Ebene gelöst (transparent für den Benutzer)

### Requirement 5: Auto-Save und Persistierung

**User Story:** Als Benutzer möchte ich dass meine Collaborative-Änderungen automatisch gespeichert werden, damit keine Arbeit verloren geht.

#### Acceptance Criteria

1. THE Collaboration_Server SHALL den Document_State alle 5 Sekunden auf das Dateisystem persistieren (Debounce: nur wenn seit dem letzten Save Änderungen vorliegen)
2. WHEN das Auto-Save eine Datei auf das Dateisystem schreibt, THE Collaboration_Server SHALL atomare Writes verwenden (temp → rename) und den Link-Index über die Änderung informieren
3. IF der Server unerwartet beendet wird, THEN THE Collaboration_Server SHALL beim Neustart die letzte persistierte Version als Ausgangspunkt verwenden (maximal 5 Sekunden Datenverlust)
4. THE Collaboration_Server SHALL die manuelle Save-Aktion des bestehenden Editors (Ctrl+S) als sofortige Persistierung behandeln (Debounce-Timer zurücksetzen)
5. WHEN eine Datei durch den Collaboration_Server gespeichert wird, THE bestehende SSE-Infrastruktur SHALL ein `vault:change`-Event an alle Benutzer mit Vault-Zugriff senden (exklusive der aktiven Session-Teilnehmer)

### Requirement 6: Session-Anzeige und Awareness-UI

**User Story:** Als Benutzer möchte ich sehen wer gerade am selben Dokument arbeitet, damit ich über aktive Mitarbeiter informiert bin.

#### Acceptance Criteria

1. WHEN ein Dokument eine aktive Collaboration_Session hat, THE Editor SHALL im Tab-Header oder unterhalb der Toolbar eine Teilnehmerliste anzeigen (Avatar/Initialen + Name, maximal 5 sichtbar, "+N" bei mehr)
2. WHEN ein Benutzer der Session beitritt oder sie verlässt, THE Teilnehmerliste SHALL innerhalb von 1 Sekunde aktualisiert werden
3. THE Teilnehmerliste SHALL jeden Teilnehmer mit seiner zugewiesenen Farbe (identisch zur Cursor-Farbe) markieren
4. WHEN ein Benutzer auf einen Teilnehmer in der Liste klickt, THE Editor SHALL zu dessen aktueller Cursor-Position scrollen
5. IF der Benutzer das einzige Session-Mitglied ist, THEN THE Teilnehmerliste SHALL ausgeblendet werden (normaler Single-User-Modus)

### Requirement 7: Netzwerk-Resilienz

**User Story:** Als Benutzer möchte ich bei kurzen Netzwerkunterbrechungen weiterarbeiten können ohne Datenverlust, damit mein Workflow nicht unterbrochen wird.

#### Acceptance Criteria

1. WHEN die Verbindung zum Collaboration_Server unterbrochen wird, THE Editor SHALL lokal weiterhin editierbar bleiben und Operationen in einem lokalen Buffer zwischenspeichern (maximal 1000 Operationen)
2. WHEN die Verbindung wiederhergestellt wird, THE Editor SHALL alle gepufferten Operationen an den Server senden, der sie gegen den aktuellen State transformiert und den Client synchronisiert
3. IF der lokale Buffer die Kapazität von 1000 Operationen überschreitet, THEN THE Editor SHALL den Benutzer warnen und bei Reconnect einen Full-Document-Sync durchführen statt einzelner Operationen
4. THE Editor SHALL einen visuellen Indikator für den Verbindungsstatus der Collaboration-Session anzeigen (z.B. farbiger Punkt: grün = verbunden, gelb = synchronisierend, rot = getrennt)
5. IF ein Benutzer länger als 5 Minuten offline ist, THEN THE Collaboration_Server SHALL den Benutzer aus der Session entfernen und bei Reconnect eine neue Session-Beitritts-Sequenz durchführen
