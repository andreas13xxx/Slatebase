# Requirements Document

## Introduction

Dieses Dokument spezifiziert die kombinierten Tier-2-Features für tägliche Workflow-Verbesserungen in Slatebase. Es umfasst drei Bereiche: Vault-Explorer-Erweiterungen (Statistiken, Kontextmenü, Drag & Drop Upload), Editor-Verbesserungen (Zeilennummern, Undo/Redo, Recent Files, Templates, Daily Notes, Bild-Paste, Favoriten) sowie Papierkorb und Datei-Versionierung. Gemeinsam heben diese Features die tägliche Nutzbarkeit auf Obsidian-Niveau.

## Glossary

- **File_Explorer**: Die linke Seitenleiste mit dem vereinheitlichten Multi-Vault-Dateibaum (React-Komponente `FileExplorer.tsx`)
- **Editor**: Die Textarea-basierte Bearbeitungsansicht im Hauptbereich (React-Komponente `EditMode.tsx`)
- **Vault_Statistics_Service**: Backend-Service der Vault-Metadaten (Dateizahl, Ordnerzahl, Gesamtgröße) berechnet
- **Context_Menu**: Positioniertes Overlay-Menü das bei Rechtsklick anstelle des Browser-Kontextmenüs erscheint
- **Drop_Zone**: Visuelles Feedback-Element das beim Ziehen von Dateien über den Editor erscheint; im File_Explorer wird stattdessen der jeweilige Zielordner individuell hervorgehoben
- **History_Stack**: Frontend-Datenstruktur die Editor-Änderungen als Einträge mit Zeitstempel und Inhalt speichert
- **Recent_Files_Store**: Persistierte Liste (localStorage) der zuletzt geöffneten Dateien pro Benutzer
- **Template_Service**: Backend-Service der Vorlagen-Dateien aus einem konfigurierbaren Vault-Verzeichnis bereitstellt
- **Daily_Note_Service**: Frontend-Logik die eine Tagesnotiz im Format `YYYY-MM-DD.md` erstellt oder öffnet
- **Image_Upload_Service**: Backend-Endpoint der Clipboard-Blobs als Bild-Dateien im Vault speichert
- **Favorites_Store**: Persistierte Liste (localStorage) der als Favorit markierten Dateien pro Vault
- **Trash_Service**: Backend-Service der Dateien in einen `.trash/`-Ordner verschiebt statt sie zu löschen
- **Version_Service**: Backend-Service der bei jedem Speichervorgang die vorherige Dateiversion unter `.versions/` aufbewahrt
- **Cleanup_Job**: Periodischer Prozess der abgelaufene Trash-Einträge und alte Versionen entfernt
- **VaultService**: Bestehender Backend-Service der Vault-Operationen orchestriert (Business-Schicht)
- **Command_Palette**: Bestehende modale Suchleiste (Ctrl+K) für Schnellzugriff auf Aktionen

## Requirements

### Requirement 1: Vault-Statistiken anzeigen

**User Story:** Als Benutzer möchte ich auf einen Blick sehen wie groß ein Vault ist (Dateien, Ordner, Speicher), damit ich den Überblick über meine Wissensbasis behalte.

#### Acceptance Criteria

1. WHEN der Benutzer einen Vault-Eintrag im File_Explorer expandiert, THE Vault_Statistics_Service SHALL die Gesamtanzahl der Dateien, die Gesamtanzahl der Ordner und die Gesamtgröße in Bytes für den Vault berechnen, wobei die Berechnung rekursiv alle Unterordner einschließt und innerhalb von 5 Sekunden abgeschlossen sein muss
2. WHEN der Benutzer mit der Maus über einen Vault-Eintrag im File_Explorer fährt, THE File_Explorer SHALL einen Tooltip mit Dateizahl, Ordnerzahl und menschenlesbarer Gesamtgröße anzeigen, wobei die Größe mit maximal 2 Nachkommastellen in der größtmöglichen Einheit (Bytes unter 1024, KB ab 1024, MB ab 1.048.576, GB ab 1.073.741.824) dargestellt wird
3. WHEN die Statistiken für einen Vault berechnet wurden, THE Vault_Statistics_Service SHALL das Ergebnis cachen und bei erneutem Hover den gecachten Wert verwenden bis ein SSE `vault:change` Event für diesen Vault empfangen wird
4. WHEN ein `vault:change` Event für einen Vault empfangen wird, THE Vault_Statistics_Service SHALL den Cache für den betroffenen Vault invalidieren sodass beim nächsten Hover eine Neuberechnung ausgelöst wird
5. IF die Berechnung der Vault-Statistiken fehlschlägt oder das 5-Sekunden-Timeout überschreitet, THEN THE File_Explorer SHALL im Tooltip einen Hinweistext anzeigen dass die Statistiken nicht verfügbar sind und den letzten gecachten Wert nicht überschreiben
6. WHEN ein Vault keine Dateien und keine Ordner enthält, THE Vault_Statistics_Service SHALL die Werte 0 Dateien, 0 Ordner und 0 Bytes zurückgeben

---

### Requirement 2: Custom Context-Menu

**User Story:** Als Benutzer möchte ich per Rechtsklick im File Explorer ein angepasstes Kontextmenü mit relevanten Aktionen sehen, damit ich Dateioperationen schnell ausführen kann.

#### Acceptance Criteria

1. WHEN der Benutzer auf eine Datei im File_Explorer rechtsklickt, THE Context_Menu SHALL die Optionen Umbenennen, Löschen, Kopieren und Verschieben anzeigen
2. WHEN der Benutzer auf einen Ordner im File_Explorer rechtsklickt, THE Context_Menu SHALL die Optionen Neuer Ordner, Neue Datei, Umbenennen und Löschen anzeigen
3. WHEN der Benutzer auf einen Vault-Eintrag im File_Explorer rechtsklickt, THE Context_Menu SHALL die Optionen Neuer Ordner, Neue Datei und Export anzeigen
4. WHEN der Benutzer im File_Explorer rechtsklickt, THE Context_Menu SHALL das native Browser-Kontextmenü unterdrücken und ein positioniertes Overlay an der Klickposition anzeigen, wobei das Menü innerhalb der sichtbaren Viewport-Grenzen geclampt wird
5. WHEN der Benutzer außerhalb des Context_Menu klickt oder Escape drückt, THE Context_Menu SHALL sich schließen
6. WHILE das Context_Menu geöffnet ist, THE Context_Menu SHALL die Menüeinträge per Tastatur-Navigation (Pfeiltasten hoch/runter mit zyklischem Wrapping, Enter zur Auswahl) bedienbar machen und den Fokus auf den ersten Eintrag setzen
7. IF der Benutzer nur Lese-Berechtigung für den Vault besitzt, THEN THE Context_Menu SHALL keine schreibenden Aktionen (Umbenennen, Löschen, Kopieren, Verschieben, Neuer Ordner, Neue Datei) anzeigen und stattdessen einen Hinweis darstellen, dass keine Aktionen verfügbar sind

---

### Requirement 3: Drag & Drop Datei-Upload

**User Story:** Als Benutzer möchte ich Dateien direkt in den Explorer oder Editor ziehen können, damit ich Inhalte ohne Umweg über den Import-Dialog hinzufügen kann.

#### Acceptance Criteria

1. WHEN der Benutzer eine oder mehrere Dateien (maximal 50 Dateien pro Drop-Vorgang, egal ob vom Betriebssystem oder intern aus dem File_Explorer) über einen Ordner im File_Explorer zieht, THE File_Explorer SHALL den jeweiligen Zielordner visuell hervorheben (nicht den gesamten Explorer-Bereich), sodass der Benutzer erkennt in welchen Ordner die Dateien abgelegt werden
2. WHEN der Benutzer Dateien über einen Ordner im File_Explorer fallen lässt, THE VaultService SHALL die Dateien in den Zielordner des aktiven Vaults hochladen, wobei jede einzelne Datei maximal 100 MB groß sein darf
3. WHEN der Benutzer Dateien über den Editor fallen lässt, THE VaultService SHALL die Dateien im selben Verzeichnis wie die aktuell geöffnete Datei speichern
4. WHEN der Benutzer Bild-Dateien (Dateien mit Endung `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.avif`, `.bmp`) oder PDF-Dateien (Endung `.pdf`) über den Editor fallen lässt, THE Editor SHALL für jede Bild- oder PDF-Datei einen Embed-Link (`![[dateiname]]`) an der aktuellen Cursor-Position einfügen
5. WHEN der Upload abgeschlossen ist, THE File_Explorer SHALL den Dateibaum aktualisieren und die neuen Dateien anzeigen
6. IF eine Datei mit gleichem Namen im Zielordner existiert, THEN THE VaultService SHALL einen Suffix (`-1`, `-2`, etc.) an den Dateinamen vor der Dateiendung anhängen
7. IF der Upload fehlschlägt, THEN THE File_Explorer SHALL eine Fehlermeldung per Toast-Notification anzeigen die den Dateinamen und den Fehlergrund enthält
8. IF der Benutzer Dateien über den Editor fallen lässt und keine Datei im Editor geöffnet ist, THEN THE Editor SHALL den Drop ablehnen und eine Toast-Notification mit einem Hinweis anzeigen dass zuerst eine Datei geöffnet werden muss
9. IF eine einzelne Datei die maximale Dateigröße von 100 MB überschreitet, THEN THE VaultService SHALL diese Datei ablehnen und eine Toast-Notification mit dem Dateinamen und einem Hinweis auf die Größenbeschränkung anzeigen
10. WHILE der Benutzer Dateien über den File_Explorer zieht und sich nicht über einem gültigen Ordner-Eintrag befindet, THE File_Explorer SHALL keinen Ordner hervorheben und den Drop nicht akzeptieren

---

### Requirement 4: Zeilennummern im Editor

**User Story:** Als Benutzer möchte ich Zeilennummern im Editor ein- und ausschalten können, damit ich mich in langen Dokumenten besser orientieren kann.

#### Acceptance Criteria

1. THE Editor SHALL eine Toggle-Option für Zeilennummern in der Editor-Toolbar bereitstellen, die den aktuellen Zustand visuell unterscheidbar darstellt (aktiv/inaktiv) und standardmäßig deaktiviert ist
2. WHEN der Benutzer die Zeilennummern-Option umschaltet, THE Editor SHALL die Zeilennummern-Anzeige innerhalb von 100ms ein- oder ausblenden ohne Neuladen der Seite
3. WHILE Zeilennummern aktiviert sind, THE Editor SHALL links neben jeder Textzeile die entsprechende Zeilennummer anzeigen und die Nummerierung bei Inhaltsänderungen (Zeilen hinzufügen/entfernen) sofort aktualisieren
4. WHILE Zeilennummern aktiviert sind, THE Editor SHALL die vertikale Position der Zeilennummern pixelgenau mit der zugehörigen Textzeile im Textarea ausrichten, sodass beim Scrollen kein sichtbarer Versatz entsteht
5. THE Editor SHALL die Zeilennummern-Einstellung im localStorage persistieren und beim nächsten Laden wiederherstellen
6. IF localStorage nicht verfügbar ist oder das Lesen fehlschlägt, THEN THE Editor SHALL den Standardzustand (deaktiviert) verwenden ohne eine Fehlermeldung anzuzeigen

---

### Requirement 5: Undo/Redo-History

**User Story:** Als Benutzer möchte ich Änderungen über die Browser-native Textarea-Undo-Funktionalität hinaus rückgängig machen können, damit Toolbar-Aktionen (Formatierung, Template-Einfügen) zuverlässig reversibel sind.

#### Acceptance Criteria

1. THE History_Stack SHALL jeden Editor-Zustand (vollständiger Textinhalt, Cursor-Position als selectionStart und selectionEnd) vor einer Toolbar-Aktion (Bold, Italic, Strikethrough, Code, Link, Heading, Liste, Checkbox, Blockquote, Horizontale Linie, Tabelle, Drag-and-Drop-Link-Einfügen) als Eintrag speichern
2. WHEN der Benutzer Ctrl+Z drückt oder den Undo-Button klickt, THE Editor SHALL den vorherigen Zustand aus dem History_Stack wiederherstellen einschließlich Textinhalt und Cursor-Selektion (selectionStart und selectionEnd)
3. WHEN der Benutzer Ctrl+Y oder Ctrl+Shift+Z drückt oder den Redo-Button klickt, THE Editor SHALL den nächsten Zustand aus dem Redo-Stack wiederherstellen einschließlich Textinhalt und Cursor-Selektion
4. WHEN eine neue Toolbar-Aktion oder eine Texteingabe durch den Benutzer nach einem Undo vorgenommen wird, THE History_Stack SHALL alle Redo-Einträge verwerfen
5. THE History_Stack SHALL maximal 100 Einträge pro Datei speichern und bei Überschreitung den ältesten Eintrag verwerfen
6. WHEN der Benutzer eine andere Datei öffnet, THE History_Stack SHALL den Stack der vorherigen Datei verwerfen
7. IF der History_Stack leer ist (kein vorheriger Zustand vorhanden), THEN THE Editor SHALL den Undo-Button deaktiviert darstellen und Ctrl+Z ignorieren
8. IF der Redo-Stack leer ist (kein nachfolgender Zustand vorhanden), THEN THE Editor SHALL den Redo-Button deaktiviert darstellen und Ctrl+Y sowie Ctrl+Shift+Z ignorieren

---

### Requirement 6: Recent Files

**User Story:** Als Benutzer möchte ich schnell auf zuletzt geöffnete Dateien zugreifen können, damit ich zwischen häufig genutzten Notizen wechseln kann.

#### Acceptance Criteria

1. WHEN der Benutzer eine Datei öffnet, THE Recent_Files_Store SHALL die Datei (Vault-ID, Pfad, Zeitstempel als ISO 8601) an den Anfang der Liste setzen und einen bereits vorhandenen Eintrag mit identischem Vault-ID + Pfad entfernen
2. THE Recent_Files_Store SHALL maximal 20 Einträge pro Benutzer speichern und beim Hinzufügen eines neuen Eintrags den ältesten Eintrag (letzter in der Liste) entfernen, wenn das Limit erreicht ist
3. WHEN der Benutzer die Command_Palette ohne Suchbegriff öffnet, THE Command_Palette SHALL eine Sektion "Zuletzt geöffnet" mit den letzten 10 Einträgen aus dem Recent_Files_Store anzeigen
4. WHEN der Benutzer einen Recent-Files-Eintrag auswählt, THE Editor SHALL die entsprechende Datei in einem neuen Tab öffnen oder einen bestehenden Tab mit derselben Datei aktivieren
5. IF eine Datei aus der Recent-Liste beim Auswählen nicht mehr existiert, THEN THE Recent_Files_Store SHALL den Eintrag entfernen und eine Fehlermeldung anzeigen, die den Dateinamen enthält
6. THE Recent_Files_Store SHALL die Liste im localStorage des Browsers persistieren, sodass Einträge nach einem Seitenneustart erhalten bleiben

---

### Requirement 7: Templates/Vorlagen

**User Story:** Als Benutzer möchte ich neue Notizen aus Vorlagen erstellen können (Daily Note, Meeting-Protokoll, etc.), damit ich wiederkehrende Strukturen nicht manuell anlegen muss.

#### Acceptance Criteria

1. THE Template_Service SHALL Vorlagen-Dateien (`.md`-Dateien, deren Dateiname nicht mit `_` beginnt) aus einem konfigurierbaren Verzeichnis (Standard: `_templates/`) im jeweiligen Vault lesen, wobei maximal 100 Vorlagen-Dateien berücksichtigt werden
2. WHEN der Benutzer "Neue Notiz aus Vorlage" auswählt, THE Template_Service SHALL eine alphabetisch sortierte Liste aller verfügbaren Vorlagen-Dateien (Dateiname ohne `.md`-Endung als Anzeigename) innerhalb von 2 Sekunden anzeigen
3. WHEN der Benutzer eine Vorlage auswählt und einen Dateinamen eingibt, THE Template_Service SHALL eine neue `.md`-Datei mit dem Vorlageninhalt im aktuell geöffneten Verzeichnis erstellen und im Editor öffnen
4. IF beim Erstellen aus einer Vorlage bereits eine Datei mit dem eingegebenen Namen im Zielverzeichnis existiert, THEN THE Template_Service SHALL die Erstellung abbrechen und eine Fehlermeldung anzeigen, die den Dateinamen-Konflikt benennt
5. THE Template_Service SHALL Platzhalter in Vorlagen ersetzen: `{{date}}` mit aktuellem Datum (YYYY-MM-DD, lokale Zeitzone des Servers), `{{time}}` mit aktueller Uhrzeit (HH:mm, lokale Zeitzone des Servers), `{{title}}` mit dem vom Benutzer eingegebenen Dateinamen (ohne Erweiterung). Nicht erkannte Platzhalter (z.B. `{{unbekannt}}`) SHALL unverändert im Ergebnis verbleiben
6. IF das Vorlagen-Verzeichnis nicht existiert oder keine gültigen `.md`-Dateien enthält, THEN THE Template_Service SHALL eine Hinweismeldung anzeigen, die den erwarteten Verzeichnispfad nennt und erklärt, wie Vorlagen dort erstellt werden können
7. IF der Benutzer die Dateinamen-Eingabe abbricht (Abbrechen/Escape), THEN THE Template_Service SHALL keine Datei erstellen und zur vorherigen Ansicht zurückkehren

---

### Requirement 8: Daily Notes

**User Story:** Als Benutzer möchte ich per Klick oder Shortcut eine Tagesnotiz erstellen oder öffnen, damit ich ein schnelles Tagesjournal führen kann.

#### Acceptance Criteria

1. WHEN der Benutzer den Daily-Note-Button klickt oder den Shortcut (Ctrl+Alt+D) drückt, THE Daily_Note_Service SHALL das heutige Datum nach der lokalen Zeitzone des Browsers im Format `YYYY-MM-DD` ermitteln und prüfen, ob eine Datei `YYYY-MM-DD.md` im konfigurierten Daily-Notes-Verzeichnis des aktiven Vaults existiert
2. IF die Daily Note für heute bereits existiert, THEN THE Daily_Note_Service SHALL die existierende Datei im Editor in einem neuen Tab öffnen (bzw. den bereits geöffneten Tab fokussieren)
3. IF die Daily Note für heute noch nicht existiert, THEN THE Daily_Note_Service SHALL eine neue Datei `YYYY-MM-DD.md` im konfigurierten Daily-Notes-Verzeichnis erstellen, den Inhalt der Vorlage `_templates/daily.md` einfügen falls diese Datei im aktiven Vault existiert (andernfalls eine leere Datei erstellen), und die Datei im Editor öffnen
4. THE Daily_Note_Service SHALL das Zielverzeichnis für Daily Notes pro Vault konfigurierbar machen (localStorage-Einstellung, Standard: Root des aktiven Vaults), wobei der Verzeichnispfad maximal 255 Zeichen lang sein darf und den gleichen Pfad-Validierungsregeln wie andere Vault-Pfade unterliegt
5. IF kein Vault aktiv ist WHEN der Benutzer die Daily-Note-Aktion auslöst, THEN THE Daily_Note_Service SHALL keine Datei erstellen und eine Fehlermeldung anzeigen, die darauf hinweist, dass ein Vault ausgewählt werden muss
6. IF das konfigurierte Daily-Notes-Verzeichnis nicht existiert WHEN eine neue Daily Note erstellt werden soll, THEN THE Daily_Note_Service SHALL das Verzeichnis automatisch anlegen bevor die Datei erstellt wird
7. IF die Dateierstellung fehlschlägt (z.B. durch ungültigen Pfad oder fehlende Schreibberechtigung), THEN THE Daily_Note_Service SHALL eine Fehlermeldung anzeigen, die den Grund des Fehlschlags beschreibt, ohne den Editor-Zustand zu verändern

---

### Requirement 9: Bild-Paste

**User Story:** Als Benutzer möchte ich Screenshots direkt aus der Zwischenablage in den Editor einfügen können, damit ich visuelle Inhalte ohne manuellen Upload-Prozess einbinden kann.

#### Acceptance Criteria

1. WHEN der Benutzer Ctrl+V drückt und die Zwischenablage ein Bild enthält (MIME-Typ image/png, image/jpeg, image/gif oder image/webp), THE Image_Upload_Service SHALL das Bild als Datei im Vault speichern
2. THE Image_Upload_Service SHALL den Dateinamen im Format `paste-YYYY-MM-DD-HHmmss.png` generieren, wobei die Dateiendung dem tatsächlichen MIME-Typ entspricht (.png, .jpg, .gif, .webp)
3. IF eine Datei mit dem generierten Namen bereits im Zielverzeichnis existiert, THEN THE Image_Upload_Service SHALL einen numerischen Suffix (`-1`, `-2`, etc.) an den Dateinamen vor der Endung anhängen
4. THE Image_Upload_Service SHALL die Bild-Datei im selben Verzeichnis wie die aktuell geöffnete Datei speichern (oder in einem konfigurierbaren Unterordner, Standard: gleiches Verzeichnis)
5. THE Image_Upload_Service SHALL Bilder mit einer maximalen Dateigröße von 10 MB akzeptieren
6. WHEN das Bild erfolgreich gespeichert wurde, THE Editor SHALL einen Embed-Link `![[dateiname]]` an der aktuellen Cursor-Position einfügen
7. IF das Speichern des Bildes fehlschlägt oder die maximale Dateigröße überschritten wird, THEN THE Editor SHALL eine Fehlermeldung per Toast-Notification anzeigen und den Editor-Inhalt unverändert lassen
8. IF keine Datei im Editor geöffnet ist WHEN der Benutzer ein Bild einfügt, THEN THE Image_Upload_Service SHALL den Paste ignorieren und keine Aktion ausführen
9. THE Image_Upload_Service SHALL nur Bild-MIME-Typen (image/png, image/jpeg, image/gif, image/webp) verarbeiten und bei Text- oder anderen Clipboard-Inhalten das Standard-Paste-Verhalten des Browsers nicht unterbrechen

---

### Requirement 10: Favoriten/Bookmarks

**User Story:** Als Benutzer möchte ich Dateien als Favoriten markieren können, damit ich besonders wichtige Notizen sofort wiederfinde.

#### Acceptance Criteria

1. WHEN der Benutzer eine Datei als Favorit markiert (Stern-Icon im File_Explorer oder Context_Menu), THE Favorites_Store SHALL die Datei (Vault-ID, Pfad) zur Favoritenliste hinzufügen
2. WHEN der Benutzer eine Datei aus den Favoriten entfernt (erneuter Klick auf Stern-Icon oder Context_Menu), THE Favorites_Store SHALL die Datei aus der Favoritenliste löschen
3. IF mindestens ein Favorit für einen Vault existiert, THEN THE File_Explorer SHALL eine "Favoriten"-Sektion oberhalb des Dateibaums anzeigen, die pro Eintrag den Dateinamen und das zugehörige Datei-Icon darstellt
4. WHEN der Benutzer auf einen Eintrag in der Favoriten-Sektion klickt, THE File_Explorer SHALL die zugehörige Datei in einem Tab öffnen
5. THE Favorites_Store SHALL die Favoritenliste im localStorage pro Vault persistieren und maximal 50 Favoriten pro Vault zulassen
6. THE Favorites_Store SHALL die Favoriten in der Reihenfolge anzeigen, in der sie hinzugefügt wurden (neueste zuerst)
7. IF eine favorisierte Datei umbenannt oder verschoben wird, THEN THE Favorites_Store SHALL den Favoriteneintrag mit dem neuen Pfad aktualisieren
8. IF eine favorisierte Datei gelöscht wird, THEN THE Favorites_Store SHALL den Eintrag aus der Favoritenliste entfernen
9. IF localStorage nicht verfügbar oder voll ist, THEN THE Favorites_Store SHALL die Favoritenliste nur im Arbeitsspeicher halten ohne eine Fehlermeldung anzuzeigen

---

### Requirement 11: Papierkorb (Soft-Delete)

**User Story:** Als Benutzer möchte ich gelöschte Dateien wiederherstellen können, damit versehentliche Löschungen — besonders bei Multi-User und Auto-Save — keine permanenten Datenverluste verursachen.

#### Acceptance Criteria

1. WHEN eine Datei oder ein Ordner gelöscht wird, THE Trash_Service SHALL die Datei in das Verzeichnis `.trash/` innerhalb des Vault-Datenverzeichnisses verschieben anstatt sie permanent zu entfernen
2. WHEN eine Datei in das `.trash/`-Verzeichnis verschoben wird, THE Trash_Service SHALL den ursprünglichen Pfad und den Löschzeitpunkt (ISO 8601) als Metadaten-Eintrag in einer `.trash/_index.json`-Datei speichern
3. WHEN der Benutzer die Papierkorb-Ansicht öffnet, THE Trash_Service SHALL alle gelöschten Dateien mit Original-Pfad und Löschdatum absteigend nach Löschzeitpunkt sortiert auflisten
4. WHEN der Benutzer eine Datei wiederherstellt, THE Trash_Service SHALL die Datei an den ursprünglichen Pfad zurückverschieben, fehlende übergeordnete Verzeichnisse automatisch erstellen und den Metadaten-Eintrag entfernen
5. IF der ursprüngliche Pfad bei Wiederherstellung bereits belegt ist, THEN THE Trash_Service SHALL einen Suffix (`-restored`, `-restored-2`, `-restored-3`, bis maximal `-restored-99`) an den Dateinamen (vor der Dateiendung) anhängen
6. IF die Wiederherstellung fehlschlägt (Dateisystemfehler, fehlende Berechtigungen), THEN THE Trash_Service SHALL die Datei im `.trash/`-Verzeichnis belassen, den Metadaten-Eintrag unverändert lassen und eine Fehlermeldung zurückgeben die den Grund angibt
7. THE Cleanup_Job SHALL in einem konfigurierbaren Intervall (Standard: 60 Minuten, Minimum: 5 Minuten) Trash-Einträge die älter als die konfigurierte Aufbewahrungsfrist sind permanent löschen
8. THE Trash_Service SHALL die Aufbewahrungsfrist als Server-Konfigurationswert in Tagen (Minimum: 1, Maximum: 365, Standard: 30) bereitstellen
9. THE File_Explorer SHALL `.trash/`-Verzeichnisse aus dem normalen Dateibaum ausblenden

---

### Requirement 12: Datei-Versionierung

**User Story:** Als Benutzer möchte ich frühere Versionen einer Datei einsehen und wiederherstellen können, damit ich Änderungen nachvollziehen und bei Bedarf zurücksetzen kann.

#### Acceptance Criteria

1. WHEN eine Datei gespeichert wird (Auto-Save oder manuell), THE Version_Service SHALL die vorherige Version unter `.versions/<relativer-pfad>/<timestamp>.<original-extension>` im Vault-Datenverzeichnis aufbewahren, wobei der Timestamp im Format `YYYYMMDDTHHmmssSSS` (UTC, millisekunden-genau) gespeichert wird
2. THE Version_Service SHALL maximal N Versionen pro Datei aufbewahren (N konfigurierbar im Bereich 1–100, Standard: 20)
3. WHEN die Anzahl gespeicherter Versionen einer Datei den konfigurierten Maximalwert überschreitet, THE Version_Service SHALL die ältesten Versionen löschen bis die Anzahl dem Maximalwert entspricht
4. WHEN der Benutzer den Versions-Browser für eine Datei öffnet, THE Version_Service SHALL alle gespeicherten Versionen mit Zeitstempel (lokale Zeitzone des Browsers, Format `DD.MM.YYYY HH:mm`) chronologisch absteigend auflisten
5. IF der Benutzer den Versions-Browser für eine Datei ohne gespeicherte Versionen öffnet, THEN THE Version_Service SHALL eine leere Liste mit einem Hinweistext anzeigen, dass keine früheren Versionen vorhanden sind
6. WHEN der Benutzer eine Version im Versions-Browser auswählt, THE Version_Service SHALL den Inhalt der ausgewählten Version anzeigen mit einer zeilenweisen Inline-Diff-Ansicht (hinzugefügte Zeilen grün hervorgehoben, entfernte Zeilen rot hervorgehoben) zur aktuellen Version
7. WHEN der Benutzer eine Version wiederherstellt, THE Version_Service SHALL zuerst den aktuellen Dateiinhalt als neue Version sichern und danach den Inhalt der ausgewählten Version als aktuelle Datei atomar speichern (Temp-Datei → rename)
8. THE Version_Service SHALL die maximale Versionszahl als Server-Konfigurationswert bereitstellen (Schlüssel `maxVersionsPerFile`, gilt global für alle Vaults)
9. THE File_Explorer SHALL `.versions/`-Verzeichnisse aus dem normalen Dateibaum ausblenden
10. IF eine Datei umbenannt oder verschoben wird, THEN THE Version_Service SHALL die zugehörigen Versionen unter dem neuen Pfad verfügbar halten, indem das entsprechende Verzeichnis unter `.versions/` analog umbenannt bzw. verschoben wird
11. IF eine Datei gelöscht wird (auch über den Papierkorb endgültig), THEN THE Version_Service SHALL alle zugehörigen Versionen unter `.versions/<relativer-pfad>/` ebenfalls löschen

---

### Requirement 13: Konfiguration der Schutzmaßnahmen

**User Story:** Als Administrator möchte ich Papierkorb- und Versionierungs-Einstellungen zentral konfigurieren können, damit ich Speicherverbrauch und Aufbewahrung kontrollieren kann.

#### Acceptance Criteria

1. THE VaultService SHALL die folgenden Konfigurationswerte aus der Server-Konfiguration lesen: `trash.retentionDays` (Standard: 30, gültiger Bereich: 0–365) und `versions.maxPerFile` (Standard: 20, gültiger Bereich: 0–100)
2. IF ein Konfigurationswert außerhalb des gültigen Bereichs liegt, THEN THE VaultService SHALL den Standardwert verwenden und eine Warnung loggen
3. WHEN der Administrator die Konfiguration ändert, THE Cleanup_Job SHALL die neuen Werte beim nächsten planmäßigen Durchlauf anwenden (innerhalb von maximal 24 Stunden)
4. WHEN der Server startet, THE Cleanup_Job SHALL einen ersten Durchlauf ausführen und danach alle 24 Stunden wiederholt werden
5. WHEN der Cleanup_Job ausgeführt wird und `trash.retentionDays` niedriger ist als bei der vorherigen Ausführung, THEN THE Cleanup_Job SHALL alle Papierkorb-Dateien entfernen, deren Löschzeitpunkt länger als der neue `trash.retentionDays`-Wert zurückliegt
6. WHEN der Cleanup_Job ausgeführt wird und `versions.maxPerFile` niedriger ist als die aktuelle Versionsanzahl einer Datei, THEN THE Cleanup_Job SHALL die ältesten Versionen entfernen, bis die Anzahl dem neuen Limit entspricht
7. IF `trash.retentionDays` auf 0 gesetzt ist, THEN THE Trash_Service SHALL bei jeder Löschaktion die Datei sofort permanent löschen ohne sie in den Papierkorb zu verschieben
8. IF `versions.maxPerFile` auf 0 gesetzt ist, THEN THE Version_Service SHALL keine neuen Versionen erstellen
