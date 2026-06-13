# Requirements Document

## Introduction

Vault-weite Volltextsuche mit Find & Replace für Slatebase (Phase 1). Ermöglicht Benutzern das Durchsuchen aller Textdateien eines oder mehrerer Vaults nach Suchbegriffen (Plain-Text oder Regex), mit Ergebnis-Vorschau, Kontext-Zeilen und der Möglichkeit, Treffer gezielt oder global zu ersetzen. Die Suche ist ein Kern-Feature für Knowledge Management bei wachsenden Vaults (>50 Dateien).

## Glossary

- **Search_Service**: Backend-Service der die Volltextsuche über Vault-Dateien durchführt
- **Replace_Service**: Backend-Service der Textersetzungen in Vault-Dateien vornimmt
- **Search_Panel**: Frontend-Komponente (Seitenpanel oder Overlay) für Sucheingabe, Optionen und Ergebnisanzeige
- **Search_Query**: Der vom Benutzer eingegebene Suchbegriff (Plain-Text oder Regex-Pattern)
- **Search_Result**: Ein einzelnes Suchergebnis bestehend aus Dateipfad, Zeilennummer, Treffer-Text und Kontext-Zeilen
- **Context_Lines**: Zeilen vor und nach einem Treffer zur Orientierung (konfigurierbar, Standard: 2)
- **Replace_Preview**: Vorschau der geplanten Ersetzungen vor Ausführung
- **VaultAccessControl**: Bestehender Service zur Prüfung von Vault-Zugriffsrechten (read/write/owner)
- **Binary_Detection**: Bestehende Logik zur Erkennung binärer Dateien (erste 8 KB nach Null-Bytes scannen)

## Requirements

### Requirement 1: Volltextsuche über einen Vault

**User Story:** Als Benutzer möchte ich alle Textdateien eines Vaults nach einem Suchbegriff durchsuchen, um relevante Notizen schnell zu finden.

#### Acceptance Criteria

1. WHEN ein Search_Query mit mindestens 1 und maximal 500 Zeichen eingegeben wird, THE Search_Service SHALL eine case-insensitive Suche über alle Textdateien des ausgewählten Vaults durchführen und übereinstimmende Zeilen zurückgeben
2. THE Search_Service SHALL binäre Dateien anhand der bestehenden Binary_Detection (erste 8 KB nach Null-Bytes scannen) überspringen
3. WHEN ein Treffer gefunden wird, THE Search_Service SHALL den relativen Dateipfad, die 1-basierte Zeilennummer, den Treffer-Text (maximal 200 Zeichen, bei Überschreitung abgeschnitten) und die konfigurierten Context_Lines (Standard: 2 Zeilen vor und nach dem Treffer) zurückgeben
4. IF die Anzahl der Textdateien im Vault 1000 überschreitet, THEN THE Search_Service SHALL nur die ersten 1000 Dateien (alphabetisch sortiert) durchsuchen und in der Response ein Truncated-Flag sowie eine Meldung zurückgeben die anzeigt dass das Dateilimit erreicht wurde
5. IF die Suchdauer 30 Sekunden überschreitet, THEN THE Search_Service SHALL die Suche abbrechen und die bis dahin gesammelten Ergebnisse zusammen mit einem Truncated-Flag und einer Meldung zurückgeben die anzeigt dass das Zeitlimit erreicht wurde
6. IF der Benutzer keinen Lesezugriff auf den ausgewählten Vault hat, THEN THE Search_Service SHALL die Suche verweigern und einen Zugriffsfehler zurückgeben

### Requirement 2: Suche über mehrere Vaults

**User Story:** Als Benutzer möchte ich optional über alle meine zugänglichen Vaults gleichzeitig suchen, um vault-übergreifende Zusammenhänge zu finden.

#### Acceptance Criteria

1. WHERE die Multi-Vault-Suche aktiviert ist, THE Search_Service SHALL alle Vaults durchsuchen auf die der Benutzer Lesezugriff hat, wobei das Dateilimit von 1000 und das Zeitlimit von 30 Sekunden über alle Vaults hinweg gelten
2. WHEN Ergebnisse aus mehreren Vaults vorliegen, THE Search_Panel SHALL die Ergebnisse nach Vault gruppiert anzeigen, wobei jede Vault-Gruppe den Vault-Namen als Header enthält und die Gruppen alphabetisch nach Vault-Name sortiert sind
3. THE Search_Service SHALL die Vault-Zugriffsprüfung über den bestehenden VaultAccessControl durchführen
4. IF ein oder mehrere Vaults während der Multi-Vault-Suche nicht erreichbar sind oder einen Fehler verursachen, THEN THE Search_Service SHALL die Ergebnisse der erfolgreich durchsuchten Vaults zurückgeben und eine Liste der fehlgeschlagenen Vaults mit Fehlergrund beifügen

### Requirement 3: Groß-/Kleinschreibung und Regex-Support

**User Story:** Als Benutzer möchte ich die Suche nach Groß-/Kleinschreibung filtern und reguläre Ausdrücke verwenden können, um präzise Suchergebnisse zu erhalten.

#### Acceptance Criteria

1. THE Search_Service SHALL standardmäßig eine case-insensitive Suche durchführen
2. WHERE die Option „Groß-/Kleinschreibung beachten" aktiviert ist, THE Search_Service SHALL eine case-sensitive Suche durchführen
3. WHERE die Option „Regulärer Ausdruck" aktiviert ist, THE Search_Service SHALL den Search_Query als JavaScript-RegExp-Pattern interpretieren und zeilenweise gegen den Dateiinhalt matchen
4. IF ein ungültiges Regex-Pattern eingegeben wird, THEN THE Search_Panel SHALL eine Fehlermeldung anzeigen die den Syntaxfehler des Regex-Engines enthält, und die Suche nicht auslösen
5. IF ein Regex-Pattern länger als 1000 Zeichen ist, THEN THE Search_Service SHALL die Suche mit einer Fehlermeldung ablehnen die auf die maximale Pattern-Länge hinweist
6. IF die Auswertung eines Regex-Patterns für eine einzelne Datei länger als 5 Sekunden dauert, THEN THE Search_Service SHALL die Auswertung dieser Datei abbrechen und zur nächsten Datei fortfahren
7. WHERE beide Optionen „Groß-/Kleinschreibung beachten" und „Regulärer Ausdruck" aktiviert sind, THE Search_Service SHALL das Regex-Pattern ohne das case-insensitive-Flag anwenden

### Requirement 4: Ergebnis-Vorschau mit Kontext

**User Story:** Als Benutzer möchte ich Suchergebnisse mit umgebendem Kontext sehen, um die Relevanz eines Treffers einschätzen zu können ohne die Datei öffnen zu müssen.

#### Acceptance Criteria

1. THE Search_Service SHALL zu jedem Treffer standardmäßig 2 Zeilen vor und 2 Zeilen nach der Treffer-Zeile als Context_Lines zurückgeben, wobei am Dateianfang oder -ende weniger Zeilen zurückgegeben werden wenn nicht genügend Zeilen vorhanden sind
2. WHEN ein Search_Result im Search_Panel angezeigt wird, THE Search_Panel SHALL den übereinstimmenden Text innerhalb der Kontext-Zeilen durch eine abweichende Hintergrundfarbe vom umgebenden Text unterscheidbar hervorheben
3. THE Search_Panel SHALL die Gesamtanzahl der Treffer pro Datei und die Gesamtanzahl aller Treffer anzeigen, wobei bei Erreichen der maximalen Ergebnisanzahl ein Hinweis angezeigt wird dass weitere Treffer existieren
4. WHEN zwei oder mehr Treffer innerhalb derselben Datei weniger als 5 Zeilen voneinander entfernt liegen, THE Search_Service SHALL deren Context_Lines zu einem zusammenhängenden Block zusammenführen anstatt überlappende Zeilen doppelt zurückzugeben

### Requirement 5: Navigation zu Suchergebnissen

**User Story:** Als Benutzer möchte ich ein Suchergebnis anklicken und direkt zur entsprechenden Zeile in der Datei springen, um den Kontext vollständig einsehen zu können.

#### Acceptance Criteria

1. WHEN ein Search_Result angeklickt wird und die zugehörige Datei noch nicht in einem Tab geöffnet ist, THE Search_Panel SHALL die Datei in einem neuen Tab im View-Modus öffnen und zur Zeile des Treffers scrollen sodass die Treffer-Zeile im sichtbaren Bereich liegt
2. WHEN ein Search_Result angeklickt wird und die zugehörige Datei bereits in einem Tab geöffnet ist, THE Search_Panel SHALL den bestehenden Tab aktivieren und zur Zeile des Treffers scrollen sodass die Treffer-Zeile im sichtbaren Bereich liegt
3. WHEN ein Search_Result aus einem anderen Vault als dem aktuell ausgewählten angeklickt wird, THE Search_Panel SHALL den Vault des Ergebnisses als ausgewählten Vault setzen bevor die Datei geöffnet wird
4. WHILE das Search_Panel geöffnet ist, THE Search_Panel SHALL das zuletzt angeklickte Ergebnis in der Ergebnisliste mit einer hervorgehobenen Hintergrundfarbe markieren
5. WHILE die navigierte Datei im Edit-Modus angezeigt wird, THE Search_Panel SHALL den Cursor in der Treffer-Zeile positionieren

### Requirement 6: Find & Replace (Einzelersetzung)

**User Story:** Als Benutzer mit Schreibrechten möchte ich einen gefundenen Treffer durch einen anderen Text ersetzen können, um Refactoring-Aufgaben effizient durchzuführen.

#### Acceptance Criteria

1. WHILE der Benutzer Schreibzugriff auf den Vault hat, THE Search_Panel SHALL ein Eingabefeld für den Ersetzungstext (maximal 10.000 Zeichen) und einen „Ersetzen"-Button pro Treffer anzeigen
2. WHEN der Benutzer „Ersetzen" für einen einzelnen Treffer auslöst, THE Replace_Service SHALL den Treffer-Text durch den Ersetzungstext in der Datei ersetzen und THE Search_Panel SHALL den ersetzten Treffer aus der Ergebnisliste entfernen sowie die Treffer-Zähler aktualisieren
3. WHILE der Benutzer nur Lesezugriff auf den Vault hat, THE Search_Panel SHALL die Replace-Funktionalität (Ersetzungsfeld und Ersetzen-Buttons) ausblenden
4. IF die Datei seit der Suche geändert wurde, THEN THE Replace_Service SHALL die Ersetzung ablehnen und THE Search_Panel SHALL eine Fehlermeldung anzeigen die den Benutzer auffordert die Suche zu wiederholen
5. WHEN eine Ersetzung erfolgreich durchgeführt wurde, THE Search_Panel SHALL eine Erfolgsmeldung mit dem betroffenen Dateipfad anzeigen

### Requirement 7: Replace All (Massenersetzung)

**User Story:** Als Benutzer mit Schreibrechten möchte ich alle Treffer auf einmal ersetzen können, um vault-weite Umbenennungen (Tags, Link-Targets) schnell durchzuführen.

#### Acceptance Criteria

1. WHILE der Benutzer Schreibzugriff auf alle Vaults hat in denen aktuell Suchergebnisse angezeigt werden, THE Search_Panel SHALL einen „Alle ersetzen"-Button anzeigen
2. WHEN der Benutzer „Alle ersetzen" auslöst, THE Search_Panel SHALL eine Replace_Preview mit der Anzahl betroffener Dateien und Treffer anzeigen und eine explizite Bestätigung erfordern
3. WHEN der Benutzer die Replace_Preview bestätigt, THE Replace_Service SHALL alle Treffer in allen betroffenen Dateien ersetzen (maximal 100 Dateien pro Vorgang)
4. IF eine oder mehrere Ersetzungen fehlschlagen, THEN THE Replace_Service SHALL die erfolgreichen Ersetzungen beibehalten und eine Liste der fehlgeschlagenen Dateien mit Fehlgrund zurückgeben
5. THE Replace_Service SHALL bei „Alle ersetzen" die Dateien sequentiell verarbeiten und atomare Schreiboperationen (temp-Datei → rename) pro Datei verwenden
6. IF eine Datei seit der Suche geändert wurde, THEN THE Replace_Service SHALL diese Datei überspringen und in der Fehlerliste als „geändert seit letzter Suche" aufführen

### Requirement 8: Keyboard-Shortcut

**User Story:** Als Benutzer möchte ich die Suche per Tastaturkürzel öffnen, um schnell zwischen Arbeiten und Suchen wechseln zu können.

#### Acceptance Criteria

1. WHEN der Benutzer Ctrl+Shift+F (Windows/Linux) oder Cmd+Shift+F (macOS) drückt, THE Search_Panel SHALL sich öffnen und den Fokus auf das Suchfeld setzen
2. WHEN das Search_Panel bereits geöffnet ist und der Shortcut erneut gedrückt wird, THE Search_Panel SHALL den Fokus auf das Suchfeld zurücksetzen und den vorhandenen Text im Suchfeld selektieren
3. WHEN der Benutzer Escape drückt während ein Element innerhalb des Search_Panel fokussiert ist, THE Search_Panel SHALL sich schließen und den Fokus auf das zuvor aktive Element (Editor oder Viewer) zurücksetzen
4. WHEN das Search_Panel geschlossen und erneut geöffnet wird, THE Search_Panel SHALL den letzten Search_Query und die Optionen (caseSensitive, regex, vault-scope) beibehalten

### Requirement 9: Debounced Suche

**User Story:** Als Benutzer möchte ich, dass die Suche erst nach einer kurzen Eingabepause startet, um unnötige Serveranfragen während des Tippens zu vermeiden.

#### Acceptance Criteria

1. THE Search_Panel SHALL nach der letzten Tastatureingabe 300 Millisekunden warten bevor die Suche ausgelöst wird, sofern der Search_Query mindestens 1 Zeichen enthält
2. WHEN eine neue Eingabe erfolgt bevor die Wartezeit abgelaufen ist, THE Search_Panel SHALL den vorherigen Timer zurücksetzen und erneut 300 Millisekunden warten
3. WHILE eine Suche läuft, THE Search_Panel SHALL einen Lade-Indikator (Spinner oder Fortschrittsbalken) im Ergebnisbereich anzeigen
4. WHEN der Benutzer das Suchfeld vollständig leert, THE Search_Panel SHALL eine laufende Suche abbrechen und den Ergebnisbereich leeren ohne eine neue Anfrage auszulösen

### Requirement 10: Performance bei großen Vaults

**User Story:** Als Benutzer möchte ich auch in Vaults mit hunderten Dateien eine akzeptable Suchgeschwindigkeit erleben, damit die Suche im täglichen Workflow nutzbar bleibt.

#### Acceptance Criteria

1. THE Search_Service SHALL Dateien die größer als 10 MB sind überspringen und diese in einer separaten Liste (`skippedFiles`) in der Response aufführen
2. THE Search_Service SHALL die Antwortzeit für einen Vault mit bis zu 500 Textdateien (durchschnittlich 10 KB pro Datei) auf maximal 5 Sekunden begrenzen
3. THE Search_Service SHALL die Anzahl zurückgegebener Ergebnisse auf maximal 500 Treffer begrenzen und bei Überschreitung ein `truncated: true` Flag sowie einen Hinweistext zurückgeben dass weitere Treffer existieren
4. THE Search_Service SHALL interne Dateien mit `_`-Prefix (z.B. `_link-index.json`) von der Suche ausschließen

### Requirement 11: Such-API-Endpoint

**User Story:** Als Frontend-Entwickler möchte ich einen dedizierten REST-Endpoint für die Suche, um die Suchlogik sauber vom Client zu trennen.

#### Acceptance Criteria

1. THE Search_Service SHALL unter `GET /api/v1/vaults/:vaultId/search` erreichbar sein und die Query-Parameter `query` (string, required, 1–500 Zeichen), `caseSensitive` (boolean, optional, Standard: false), `regex` (boolean, optional, Standard: false), `contextLines` (integer, optional, Standard: 2, Bereich: 0–10) und `maxResults` (integer, optional, Standard: 500, Bereich: 1–500) akzeptieren
2. THE Search_Service SHALL unter `GET /api/v1/search` einen vault-übergreifenden Such-Endpoint bereitstellen der zusätzlich einen `vaultIds`-Parameter als kommaseparierte Liste von Vault-IDs akzeptiert (maximal 20 IDs); IF der `vaultIds`-Parameter fehlt, THEN THE Search_Service SHALL alle Vaults durchsuchen auf die der Benutzer Lesezugriff hat
3. IF der `query`-Parameter fehlt, leer ist oder die maximale Länge von 500 Zeichen überschreitet, THEN THE Search_Service SHALL mit HTTP 400 und einer Fehlermeldung antworten
4. IF der Benutzer nicht authentifiziert ist, THEN THE Search_Service SHALL mit HTTP 401 antworten; IF der Benutzer keinen Lesezugriff auf den angeforderten Vault hat, THEN THE Search_Service SHALL mit HTTP 403 antworten
5. IF `regex` aktiviert ist und der `query`-Parameter kein gültiges Regex-Pattern darstellt, THEN THE Search_Service SHALL mit HTTP 400 und einer Fehlermeldung antworten die auf das ungültige Pattern hinweist

### Requirement 12: Replace-API-Endpoint

**User Story:** Als Frontend-Entwickler möchte ich einen dedizierten REST-Endpoint für Ersetzungen, um Schreiboperationen sicher und validiert durchzuführen.

#### Acceptance Criteria

1. THE Replace_Service SHALL unter `POST /api/v1/vaults/:vaultId/replace` erreichbar sein und im Request-Body die Felder `query` (1–500 Zeichen, nicht nur Whitespace), `replacement` (0–5000 Zeichen), `caseSensitive` (Boolean), `regex` (Boolean) und `paths` (optionales Array mit maximal 100 Einträgen zur Einschränkung auf bestimmte Dateien) akzeptieren
2. THE Replace_Service SHALL die Schreibberechtigung des Benutzers auf den Vault prüfen bevor Ersetzungen durchgeführt werden
3. IF der Benutzer keine Schreibberechtigung hat, THEN THE Replace_Service SHALL mit HTTP 403 und einem Fehler-Objekt mit `code` und `message` antworten
4. IF das Feld `regex` den Wert `true` hat und der Wert in `query` kein gültiger regulärer Ausdruck ist, THEN THE Replace_Service SHALL mit HTTP 400 und einer Fehlermeldung antworten die auf den ungültigen regulären Ausdruck hinweist ohne Ersetzungen durchzuführen
5. WHEN die Ersetzung erfolgreich abgeschlossen ist, THE Replace_Service SHALL die Gesamtanzahl durchgeführter Ersetzungen (`totalReplacements`), die Anzahl betroffener Dateien (`fileCount`) und die Liste betroffener Dateipfade (`files`) in der Response mit HTTP 200 zurückgeben
6. IF der `query`-Wert in keiner durchsuchten Datei gefunden wird, THEN THE Replace_Service SHALL mit HTTP 200 und `totalReplacements: 0`, `fileCount: 0` sowie einer leeren `files`-Liste antworten

### Requirement 13: Search Panel UI

**User Story:** Als Benutzer möchte ich eine übersichtliche Such-Oberfläche mit klarer Strukturierung von Eingabe, Optionen und Ergebnissen, um effizient suchen und ersetzen zu können.

#### Acceptance Criteria

1. THE Search_Panel SHALL als linkes Seitenpanel mit einer Mindestbreite von 280px und einer Maximalbreite von 480px angezeigt werden und den bestehenden File Explorer ersetzen solange das Panel geöffnet ist
2. THE Search_Panel SHALL ein Suchfeld, einen aufklappbaren Ersetzungsbereich (standardmäßig eingeklappt, per Chevron-Button ein-/ausklappbar), Toggle-Buttons für „Groß-/Kleinschreibung" und „Regex" sowie einen Vault-Selektor (einzelner Vault / alle Vaults) enthalten
3. THE Search_Panel SHALL die Ergebnisse als aufklappbare Datei-Gruppen anzeigen, wobei jede Gruppe den Dateipfad und die Treffer-Anzahl im Header zeigt und darunter die einzelnen Treffer mit Zeilennummer und hervorgehobenem Treffer-Text innerhalb der Kontext-Zeilen auflistet
4. THE Search_Panel SHALL deutsche Labels verwenden (z.B. „Suchen", „Ersetzen", „Alle ersetzen", „Groß-/Kleinschreibung", „Regulärer Ausdruck")
5. IF keine Ergebnisse für den Search_Query gefunden werden, THEN THE Search_Panel SHALL den Hinweistext „Keine Ergebnisse" anzeigen
6. WHILE eine Suche läuft, THE Search_Panel SHALL einen Lade-Indikator im Ergebnisbereich anzeigen und WHILE noch kein Search_Query eingegeben wurde, THE Search_Panel SHALL den Ergebnisbereich leer lassen
