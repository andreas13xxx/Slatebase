# Requirements Document

## Introduction

Dieses Dokument beschreibt die Anforderungen für erweiterte Dateioperationen im Slatebase FileExplorer und Editor. Das Feature umfasst drei Hauptbereiche: Drag & Drop zum Verschieben von Dateien/Ordnern innerhalb des Vaults, Kontextmenüs für zusätzliche Operationen (Erstellen, Umbenennen, Löschen) sowie das Einfügen von Markdown-Links durch Ziehen einer Datei in den Editor.

## Glossary

- **FileExplorer**: Die Baumansicht-Komponente in der Sidebar, die die Verzeichnisstruktur eines Vaults darstellt
- **Editor**: Die EditMode-Komponente, die einen Plaintext-Editor für Markdown-Dateien bereitstellt
- **Vault**: Ein Markdown-basiertes Wissensarchiv mit Verzeichnisstruktur auf dem Server-Dateisystem
- **TreeNode**: Ein einzelner Eintrag (Datei oder Ordner) in der FileExplorer-Baumansicht
- **Kontextmenü**: Ein Popup-Menü, das bei Rechtsklick auf einen TreeNode erscheint
- **Drop_Zone**: Ein visuell hervorgehobener Bereich, der anzeigt, wo ein gezogenes Element abgelegt werden kann
- **Markdown_Link**: Ein Link im Format `[Anzeigename](relativer/pfad/zur/datei.md)`
- **Move_API**: Der Backend-Endpoint zum Verschieben von Dateien und Ordnern innerhalb eines Vaults
- **Rename_API**: Der Backend-Endpoint zum Umbenennen von Dateien und Ordnern innerhalb eines Vaults

## Requirements

### Requirement 1: Drag & Drop im FileExplorer — Dateien verschieben

**User Story:** Als Benutzer möchte ich Dateien und Ordner per Drag & Drop im FileExplorer verschieben können, damit ich die Vault-Struktur intuitiv reorganisieren kann.

#### Acceptance Criteria

1. WHEN der Benutzer einen TreeNode im FileExplorer per Maus zieht, THE FileExplorer SHALL den gezogenen TreeNode visuell als "wird gezogen" kennzeichnen (Opazität 0.5)
2. WHILE ein TreeNode gezogen wird, THE FileExplorer SHALL alle Ordner-Knoten, die weder der gezogene Knoten selbst noch ein Unterordner des gezogenen Knotens sind, als gültige Drop_Zones visuell hervorheben
3. WHEN ein TreeNode auf einen Ordner-Knoten abgelegt wird, THE FileExplorer SHALL die Move_API mit dem Quellpfad und dem Zielordner-Pfad aufrufen
4. WHEN die Move_API erfolgreich antwortet, THE FileExplorer SHALL den Verzeichnisbaum vom Server neu laden und die aktualisierte Struktur anzeigen
5. IF ein TreeNode auf sich selbst oder auf einen eigenen Unterordner abgelegt wird, THEN THE FileExplorer SHALL die Drop-Operation ignorieren und keine API-Anfrage senden
6. IF die Move_API einen Fehler zurückgibt, THEN THE FileExplorer SHALL eine Fehlermeldung anzeigen und den Baum im ursprünglichen Zustand belassen
7. WHILE ein TreeNode gezogen wird, THE FileExplorer SHALL einen visuellen Indikator (Ordner-Highlight bei Hover über einen Ordner-Knoten) an der aktuellen Drop-Position anzeigen
8. WHILE die Move_API auf eine Antwort wartet, THE FileExplorer SHALL weitere Drag & Drop-Operationen deaktivieren und einen Ladezustand im Verzeichnisbaum anzeigen
9. WHILE der Vault im Nur-Lesen-Modus geteilt ist (permission === 'read'), THE FileExplorer SHALL das Starten von Drag-Operationen auf TreeNodes unterbinden

### Requirement 2: Drag & Drop im FileExplorer — Ordner verschieben

**User Story:** Als Benutzer möchte ich ganze Ordner per Drag & Drop verschieben können, damit ich die Vault-Hierarchie effizient umstrukturieren kann.

#### Acceptance Criteria

1. WHEN der Benutzer einen Ordner-Knoten im FileExplorer per Maus zieht, THE FileExplorer SHALL den Ordner visuell als "wird gezogen" kennzeichnen (Opazität 0.5) und die Kinder-Knoten ausblenden
2. WHEN ein Ordner auf einen anderen Ordner abgelegt wird, THE Move_API SHALL den gesamten Ordner einschließlich aller Unterordner und Dateien an den neuen Pfad verschieben
3. IF ein Ordner in einen eigenen Unterordner verschoben werden soll, THEN THE FileExplorer SHALL die Operation verhindern, den Drop visuell als ungültig kennzeichnen und keine API-Anfrage senden
4. WHEN ein Ordner erfolgreich verschoben wird, THE FileExplorer SHALL alle betroffenen offenen Tabs mit den aktualisierten Dateipfaden aktualisieren
5. IF die Move_API beim Verschieben eines Ordners einen Fehler zurückgibt, THEN THE FileExplorer SHALL eine Fehlermeldung anzeigen und den Verzeichnisbaum unverändert belassen

### Requirement 3: Kontextmenü — Neue Markdown-Datei erstellen

**User Story:** Als Benutzer möchte ich über ein Kontextmenü eine neue Markdown-Datei erstellen können, damit ich schnell neue Notizen im gewünschten Ordner anlegen kann.

#### Acceptance Criteria

1. WHEN der Benutzer einen Rechtsklick auf einen Ordner-Knoten ausführt, THE FileExplorer SHALL ein Kontextmenü mit der Option "Neue Datei" anzeigen
2. WHEN der Benutzer die Option "Neue Datei" auswählt, THE FileExplorer SHALL ein Inline-Eingabefeld im Verzeichnisbaum anzeigen und dieses automatisch fokussieren, in dem der Dateiname eingegeben werden kann
3. WHEN der Benutzer den Dateinamen bestätigt (Enter-Taste), THE FileExplorer SHALL die Datei über die bestehende saveFile-API mit leerem Inhalt erstellen, wobei der Dateiname maximal 128 Zeichen lang sein darf (inklusive .md-Endung)
4. WHEN die Datei erfolgreich erstellt wurde, THE FileExplorer SHALL den Verzeichnisbaum aktualisieren und die neue Datei automatisch in einem Tab öffnen
5. IF der Benutzer keinen Dateinamen eingibt, nur Leerzeichen eingibt, oder Escape drückt, THEN THE FileExplorer SHALL das Eingabefeld schließen ohne eine Datei zu erstellen
6. IF der eingegebene Dateiname keine `.md`-Endung hat, THEN THE FileExplorer SHALL die Endung `.md` automatisch anhängen
7. WHEN der Benutzer einen Rechtsklick auf eine Datei ausführt, THE FileExplorer SHALL ein Kontextmenü mit der Option "Neue Datei" anzeigen, wobei die Datei im selben Ordner wie die angeklickte Datei erstellt wird
8. IF der eingegebene Dateiname ungültige Zeichen enthält (Pfad-Separatoren `/`, `\` oder Null-Bytes), THEN THE FileExplorer SHALL das Eingabefeld beibehalten und eine Fehlermeldung anzeigen, die auf die ungültigen Zeichen hinweist
9. IF die saveFile-API einen Fehler zurückgibt (z.B. Datei existiert bereits oder Pfad ungültig), THEN THE FileExplorer SHALL eine Fehlermeldung anzeigen und das Eingabefeld zur Korrektur beibehalten

### Requirement 4: Kontextmenü — Umbenennen

**User Story:** Als Benutzer möchte ich Dateien und Ordner über ein Kontextmenü umbenennen können, damit ich die Benennung meiner Notizen korrigieren kann ohne sie neu erstellen zu müssen.

#### Acceptance Criteria

1. WHEN der Benutzer einen Rechtsklick auf einen TreeNode ausführt, THE FileExplorer SHALL ein Kontextmenü mit der Option "Umbenennen" anzeigen
2. WHEN der Benutzer die Option "Umbenennen" auswählt, THE FileExplorer SHALL den Dateinamen im Baum durch ein editierbares Eingabefeld (maximal 255 Zeichen) ersetzen, das den aktuellen Namen enthält, wobei bei Dateien der Name ohne Dateiendung vorselektiert ist und bei Ordnern der gesamte Name vorselektiert ist
3. WHEN der Benutzer den neuen Namen bestätigt (Enter-Taste) und der Name sich vom aktuellen Namen unterscheidet, THE FileExplorer SHALL die Rename_API mit dem alten Pfad und dem neuen Namen aufrufen
4. IF der Benutzer den Namen bestätigt (Enter-Taste) und der Name unverändert ist, THEN THE FileExplorer SHALL das Eingabefeld schließen ohne die Rename_API aufzurufen
5. WHEN die Rename_API erfolgreich antwortet, THE FileExplorer SHALL den Verzeichnisbaum aktualisieren und alle offenen Tabs mit dem alten Pfad auf den neuen Pfad aktualisieren
6. IF der Benutzer Escape drückt, das Eingabefeld den Fokus verliert, oder der Benutzer Enter drückt während das Feld leer ist, THEN THE FileExplorer SHALL das Eingabefeld schließen und den ursprünglichen Namen beibehalten
7. IF die Rename_API einen Fehler zurückgibt (z.B. Name bereits vergeben), THEN THE FileExplorer SHALL eine Fehlermeldung anzeigen und den ursprünglichen Namen beibehalten
8. WHEN der Benutzer eine Datei umbenennt und keinen Dateinamen-Suffix eingibt, THE FileExplorer SHALL die ursprüngliche Dateiendung automatisch beibehalten

### Requirement 5: Kontextmenü — Löschen

**User Story:** Als Benutzer möchte ich Dateien und Ordner über ein Kontextmenü löschen können, damit ich eine konsistente Bedienung über das Kontextmenü habe.

#### Acceptance Criteria

1. WHEN der Benutzer einen Rechtsklick auf einen TreeNode ausführt, THE FileExplorer SHALL ein Kontextmenü mit der Option "Löschen" anzeigen
2. WHEN der Benutzer die Option "Löschen" auswählt, THE FileExplorer SHALL einen Bestätigungsdialog mit dem Namen des zu löschenden Elements und einer Bestätigen- sowie einer Abbrechen-Schaltfläche anzeigen
3. WHEN der Benutzer die Löschung bestätigt, THE FileExplorer SHALL die bestehende deleteContent-API mit dem Pfad des ausgewählten Elements aufrufen und nach erfolgreicher Antwort den Verzeichnisbaum neu laden
4. WHEN eine geöffnete Datei gelöscht wird, THE FileExplorer SHALL den zugehörigen Tab schließen; WHEN ein Ordner gelöscht wird, THE FileExplorer SHALL alle Tabs schließen, deren Dateipfad innerhalb des gelöschten Ordners liegt
5. IF der Benutzer im Bestätigungsdialog "Abbrechen" wählt oder Escape drückt, THEN THE FileExplorer SHALL den Dialog schließen und keine Löschung durchführen
6. IF die deleteContent-API einen Fehler zurückgibt, THEN THE FileExplorer SHALL eine Fehlermeldung anzeigen und den Verzeichnisbaum unverändert belassen

### Requirement 6: Kontextmenü — Darstellung und Verhalten

**User Story:** Als Benutzer möchte ich ein übersichtliches Kontextmenü mit klarer Struktur haben, damit ich die gewünschte Operation schnell finden kann.

#### Acceptance Criteria

1. WHEN der Benutzer einen Rechtsklick auf einen TreeNode ausführt, THE FileExplorer SHALL das Browser-Standard-Kontextmenü unterdrücken und ein eigenes Kontextmenü an der Mausposition anzeigen
2. THE Kontextmenü SHALL Lucide-Icons links neben jedem Menüeintrag anzeigen
3. WHEN der Benutzer außerhalb des Kontextmenüs klickt, THE FileExplorer SHALL das Kontextmenü schließen
4. WHEN der Benutzer die Escape-Taste drückt, THE FileExplorer SHALL das Kontextmenü schließen
5. THE Kontextmenü SHALL mit `position: fixed` positioniert werden, damit es nicht von `overflow: hidden`-Containern abgeschnitten wird
6. IF das Kontextmenü am Bildschirmrand abgeschnitten würde, THEN THE FileExplorer SHALL die Position so anpassen, dass das Menü mindestens 8px Abstand zum Viewport-Rand hat und vollständig sichtbar bleibt
7. WHILE der Vault im Nur-Lesen-Modus geteilt ist (permission === 'read'), THE FileExplorer SHALL die Kontextmenü-Optionen "Neue Datei", "Umbenennen" und "Löschen" ausblenden und nur lesende Operationen anzeigen
8. WHEN der Benutzer einen Menüeintrag im Kontextmenü auswählt, THE FileExplorer SHALL das Kontextmenü schließen und die zugehörige Operation starten
9. WHEN ein Kontextmenü bereits geöffnet ist und der Benutzer einen Rechtsklick auf einen anderen TreeNode ausführt, THE FileExplorer SHALL das vorherige Kontextmenü schließen und ein neues an der aktuellen Mausposition öffnen

### Requirement 7: Datei in Editor ziehen — Markdown-Link einfügen

**User Story:** Als Benutzer möchte ich eine Datei aus dem FileExplorer in den Editor ziehen können, damit automatisch ein Markdown-Link zur gezogenen Datei eingefügt wird.

#### Acceptance Criteria

1. WHEN der Benutzer eine Datei aus dem FileExplorer in den Editor-Textarea zieht, THE Editor SHALL einen Markdown_Link an der nächstgelegenen Zeichenposition zur Drop-Koordinate im Text einfügen
2. THE Editor SHALL den Markdown_Link im Format `[Dateiname.ext](relativer/pfad/Dateiname.ext)` generieren, wobei der Dateiname die vollständige Bezeichnung inklusive Dateiendung ist und der Pfad relativ zur aktuell geöffneten Datei berechnet wird
3. WHILE eine Datei über den Editor gezogen wird, THE Editor SHALL die aktuelle Drop-Position durch einen Cursor-Indikator im Textarea visuell hervorheben
4. WHEN der Link eingefügt wird, THE Editor SHALL den Auto-Save-Mechanismus (1,5s Debounce) auslösen
5. IF der Editor sich im Nur-Lesen-Modus befindet, THEN THE Editor SHALL den Drop ignorieren, keinen Link einfügen und keine visuelle Drop-Hervorhebung anzeigen
6. IF eine Bilddatei (png, jpg, gif, svg, webp, avif) in den Editor gezogen wird, THEN THE Editor SHALL einen Markdown-Bild-Link im Format `![Dateiname.ext](relativer/pfad/Dateiname.ext)` einfügen
7. IF keine Datei im Editor geöffnet ist (kein Referenzpfad für relative Berechnung vorhanden), THEN THE Editor SHALL den Drop ignorieren und keinen Link einfügen
8. IF ein Ordner (kein Datei-Knoten) aus dem FileExplorer in den Editor gezogen wird, THEN THE Editor SHALL den Drop ignorieren und keinen Link einfügen

### Requirement 8: Backend — Verschieben von Dateien und Ordnern

**User Story:** Als Frontend-Entwickler möchte ich einen API-Endpoint zum Verschieben von Dateien und Ordnern haben, damit Drag & Drop-Operationen serverseitig ausgeführt werden können.

#### Acceptance Criteria

1. THE Move_API SHALL unter `PUT /api/v1/vaults/:vaultId/move` erreichbar sein und einen JSON-Body mit `sourcePath` (String, nicht leer) und `destinationPath` (String, nicht leer) akzeptieren
2. WHEN ein Move-Request mit gültigem `sourcePath` und `destinationPath` empfangen wird, THE Move_API SHALL die Datei oder den Ordner vom Quellpfad zum Zielpfad verschieben
3. THE Move_API SHALL beide Pfade mit `validateFilePath()` gegen Path-Traversal-Angriffe validieren
4. IF `sourcePath` oder `destinationPath` im Request-Body fehlt oder ein leerer String ist, THEN THE Move_API SHALL den HTTP-Status 400 mit dem Fehlercode `VALIDATION_ERROR` zurückgeben
5. IF `validateFilePath()` einen der Pfade ablehnt, THEN THE Move_API SHALL den HTTP-Status 400 mit dem Fehlercode `PATH_TRAVERSAL` zurückgeben
6. IF der Quellpfad nicht existiert, THEN THE Move_API SHALL den HTTP-Status 404 mit dem Fehlercode `NOT_FOUND` zurückgeben
7. IF am Zielpfad bereits eine Datei oder ein Ordner existiert, THEN THE Move_API SHALL den HTTP-Status 409 mit dem Fehlercode `CONFLICT` zurückgeben
8. IF der Zielpfad ein Unterverzeichnis des Quellpfads ist, THEN THE Move_API SHALL den HTTP-Status 400 mit dem Fehlercode `INVALID_MOVE` zurückgeben
9. WHEN der Move-Request erfolgreich ist, THE Move_API SHALL den HTTP-Status 200 mit einem JSON-Objekt zurückgeben, das den neuen relativen Pfad im Feld `newPath` enthält
10. THE Move_API SHALL fehlende Zwischenverzeichnisse im Zielpfad automatisch erstellen
11. WHEN der Move-Request erfolgreich ist, THE Move_API SHALL den In-Memory-Verzeichnisbaum des Vaults aktualisieren

### Requirement 9: Backend — Umbenennen von Dateien und Ordnern

**User Story:** Als Frontend-Entwickler möchte ich einen API-Endpoint zum Umbenennen von Dateien und Ordnern haben, damit Kontextmenü-Operationen serverseitig ausgeführt werden können.

#### Acceptance Criteria

1. THE Rename_API SHALL unter `PUT /api/v1/vaults/:vaultId/rename` erreichbar sein und einen JSON-Body mit `path` (String, nicht leer) und `newName` (String, nicht leer, maximal 255 Zeichen) akzeptieren
2. WHEN ein gültiger Rename-Request empfangen wird, THE Rename_API SHALL die Datei oder den Ordner am angegebenen Pfad mit dem neuen Namen versehen und anschließend den In-Memory-Verzeichnisbaum des Vaults aktualisieren
3. THE Rename_API SHALL den Pfad mit `validateFilePath()` gegen Path-Traversal-Angriffe validieren
4. THE Rename_API SHALL den neuen Namen gegen ungültige Zeichen validieren (keine Pfad-Separatoren `/` oder `\`, keine Null-Bytes) und bei Verstoß den HTTP-Status 400 mit dem Fehlercode `VALIDATION_ERROR` zurückgeben
5. IF der Pfad nicht existiert, THEN THE Rename_API SHALL den HTTP-Status 404 mit dem Fehlercode `NOT_FOUND` zurückgeben
6. IF am Zielpfad (gleicher Ordner, neuer Name) bereits eine Datei oder ein Ordner existiert, THEN THE Rename_API SHALL den HTTP-Status 409 mit dem Fehlercode `CONFLICT` zurückgeben
7. WHEN der Rename-Request erfolgreich ist, THE Rename_API SHALL den HTTP-Status 200 mit einem JSON-Body zurückgeben, der den neuen vollständigen relativen Pfad enthält
8. IF das Feld `path` oder `newName` im Request-Body fehlt, leer ist oder kein String ist, THEN THE Rename_API SHALL den HTTP-Status 400 mit dem Fehlercode `VALIDATION_ERROR` zurückgeben

### Requirement 10: Berechtigungsprüfung bei Dateioperationen

**User Story:** Als Vault-Besitzer möchte ich sicherstellen, dass nur berechtigte Benutzer Dateien verschieben, umbenennen oder erstellen können, damit die Integrität meines Vaults geschützt bleibt.

#### Acceptance Criteria

1. THE Move_API SHALL vor der Ausführung über den VaultAccessControlService prüfen, ob der authentifizierte Benutzer `owner`- oder `write`-Berechtigung für den Vault besitzt, und die Operation nur bei erfolgreicher Prüfung ausführen
2. THE Rename_API SHALL vor der Ausführung über den VaultAccessControlService prüfen, ob der authentifizierte Benutzer `owner`- oder `write`-Berechtigung für den Vault besitzt, und die Operation nur bei erfolgreicher Prüfung ausführen
3. THE saveFile-API SHALL vor dem Erstellen oder Überschreiben einer Datei über den VaultAccessControlService prüfen, ob der authentifizierte Benutzer `owner`- oder `write`-Berechtigung für den Vault besitzt, und die Operation nur bei erfolgreicher Prüfung ausführen
4. IF ein Benutzer ohne `owner`- oder `write`-Berechtigung eine Move-, Rename-, Save- oder Delete-Operation versucht, THEN THE API SHALL den HTTP-Status 403 mit dem Fehlercode `FORBIDDEN` im Standard-API-Error-Format (`{ code, message, timestamp }`) zurückgeben
5. IF ein nicht authentifizierter Request eine Move-, Rename-, Save- oder Delete-Operation versucht, THEN THE API SHALL den HTTP-Status 401 mit dem Fehlercode `UNAUTHORIZED` zurückgeben
6. WHILE der Benutzer nur Leseberechtigung hat (permission === 'read'), THE FileExplorer SHALL Drag & Drop-Operationen deaktivieren, keine Drag-Handles anzeigen und im Kontextmenü die Optionen "Neue Datei", "Umbenennen" und "Löschen" ausblenden
