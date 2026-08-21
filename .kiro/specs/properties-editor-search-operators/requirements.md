# Requirements Document

## Introduction

„Properties-Editor & Suchoperatoren" (Prio 8) ist die zwingende Vorarbeit für Bases (Prio 10) — sie schafft die geteilte Property-/Metadaten-Schicht, auf die eine spätere Query-Engine ohne Duplizierung aufbauen kann. Die Spec deckt zwei zusammengehörende Bereiche ab:

1. **Properties-Editor**: Die bestehende `PropertiesView` im Context Panel zeigt YAML-Frontmatter als reine Nur-Lesen-Tabelle an (`Record<string, unknown>`). Es existiert kein typisiertes Editing, kein Per-Vault-Property-Type-Schema und keine type-aware UI-Steuerelemente. Der Properties-Editor ersetzt die passive Tabelle durch eine interaktive, typisierte Bearbeitungsansicht mit Inline-Editing — gesteuert durch ein persistiertes Property-Type-Register pro Vault.

2. **Such-Operatoren**: Die bestehende Volltextsuche (`SearchService`) akzeptiert nur einen flachen String-Query mit `caseSensitive`/`regex`-Flags. Es existiert keinerlei Query-Syntax-Parsing, keine Metadaten-Filterung und keine Pfad-/Tag-/Property-Vorfilterung. Such-Operatoren fügen eine Parsing-Schicht ein, die strukturierte Präfixe (`path:`, `file:`, `tag:`, `property:`, `-tag:`, `-path:` u. a.) aus dem Query extrahiert und als Vorfilter anwendet, bevor der verbleibende Freitextanteil wie bisher greift.

Beide Teile teilen dieselbe Grundlage: das vault-weite Property-Register im Link-Index und ein Property-Type-Schema, das Wertetypen (Text, Zahl, Datum, Checkbox, Liste, Tags, Links) pro Property-Key festlegt.

## Glossary

Wiederverwendete Begriffe (nicht neu definiert): **Link_Index_Service**, **Vault_Change_Event**, **DirectoryTree**, **Frontmatter**, **Forward_Link**, **Backlink**, **Wikilink**.

Neue Begriffe für diese Spec:

- **Property-Key**: Ein top-level YAML-Schlüssel innerhalb des Frontmatter-Blocks eines Markdown-Dokuments (z. B. `tags`, `date`, `status`).
- **Property-Type**: Der für einen Property-Key deklarierte Werttyp, der bestimmt, welche UI-Kontrolle und welche Validierung bei der Bearbeitung gelten. Mögliche Typen: `text`, `number`, `date`, `datetime`, `checkbox`, `list`, `tags`, `aliases`.
- **Property-Type-Registry**: Ein pro Vault persistiertes JSON-Dokument (`.slatebase/property-types.json`), das die bekannten Property-Keys mit ihrem deklarierten Property-Type und optionalen Metadaten auflistet.
- **Type-Inference**: Der Vorgang, bei dem der Property-Type eines Keys aus dem tatsächlichen Wert abgeleitet wird, wenn kein expliziter Eintrag in der Property-Type-Registry existiert.
- **Such-Operator**: Ein strukturiertes Schlüsselwort-Präfix innerhalb des Suchstrings (z. B. `tag:status`), das vor der Freitextsuche als Metadaten-/Pfad-Vorfilter ausgewertet wird.
- **Negations-Operator**: Ein Such-Operator mit vorangestelltem Minuszeichen (z. B. `-tag:archiv`), der als Ausschlussfilter wirkt (entfernt alle Dateien aus dem Ergebnis, die den Kriterien entsprechen).
- **Freitext-Anteil**: Der verbleibende Teil des Suchstrings, nachdem alle Such-Operatoren extrahiert wurden — wird an die bestehende Text-/Regex-Suche weitergegeben.
- **Property-Value-Index**: Die bestehende Datenstruktur `LinkIndexService.fileProperties: Map<string, Map<string, string[]>>`, erweitert um einen inversen Index `propertyValueIndex: Map<string, Map<string, Set<string>>>` (Key → Value → FilePaths) für effiziente Property-Filter-Queries.

## Requirements

### Requirement 1: Property-Type-Registry (Backend)

**User Story:** Als Vault-Besitzer möchte ich für meinen Vault definieren können, welchen Datentyp die einzelnen Frontmatter-Felder haben, damit der Properties-Editor passende Eingabekontrollen anzeigt und Werte korrekt validiert.

#### Acceptance Criteria

1. THE System SHALL ein Property-Type-Register pro Vault in `.slatebase/property-types.json` persistieren, analog zum bestehenden `.slatebase/config.json`-Muster (atomare Writes via `KeyedJsonFileStore`, Mutex-geschützt).
2. THE Registry SHALL pro Property-Key speichern: `key` (string), `type` (PropertyType-Enum), optional `options` (z. B. erlaubte Werte für Dropdowns, Datumsformat).
3. THE System SHALL folgende Property-Types unterstützen: `text` (freier String), `number` (Ganzzahl oder Fließkomma), `date` (ISO 8601-Datum `YYYY-MM-DD`), `datetime` (ISO 8601-Datum+Zeit `YYYY-MM-DDTHH:mm`), `checkbox` (boolean `true`/`false`), `list` (YAML-Array beliebiger Strings), `tags` (YAML-Array mit Tag-Semantik — wie `list`, aber mit Autocomplete aus dem vault-weiten Tag-Pool), `aliases` (YAML-Array, Obsidian-Konvention für Datei-Aliase).
4. THE System SHALL einen REST-Endpunkt `GET /api/v1/vaults/:vaultId/property-types` bereitstellen, der die gesamte Registry als Array zurückgibt; authentifiziert, Read-Access-Check auf den Vault.
5. THE System SHALL einen REST-Endpunkt `PUT /api/v1/vaults/:vaultId/property-types` bereitstellen, der die gesamte Registry atomar überschreibt; authentifiziert, Write-Access-Check auf den Vault (nur Besitzer/Schreibberechtigte).
6. THE System SHALL einen REST-Endpunkt `PUT /api/v1/vaults/:vaultId/property-types/:key` bereitstellen, der einen einzelnen Property-Key hinzufügt oder aktualisiert (Merge statt Full-Replace); authentifiziert, Write-Access-Check.
7. IF die Registry-Datei nicht existiert (neu erstellter Vault), THEN THE System SHALL ein leeres Array als Default zurückgeben (kein Fehler).
8. THE Property-Types `tags` und `aliases` SHALL die YAML-Schlüssel `tags` und `aliases` als fest zugeordnete Typen behandeln — sie können vom Benutzer nicht auf einen anderen Typ umgestellt werden.
9. THE Registry SHALL maximal 200 Property-Key-Einträge pro Vault erlauben (Schutz gegen Missbrauch, da die Registry auf jedem Properties-Editor-Öffnen geladen wird).

### Requirement 2: Type-Inference für unregistrierte Properties

**User Story:** Als Benutzer möchte ich, dass der Properties-Editor auch für Frontmatter-Felder, die nicht in der Registry stehen, eine sinnvolle Typ-Erkennung vornimmt, damit neu genutzte Felder sofort interaktiv editierbar sind (nicht nur als Text).

#### Acceptance Criteria

1. WHEN der Properties-Editor ein Frontmatter-Feld antrifft, das keinen Eintrag in der Property-Type-Registry hat, THE System SHALL den Type anhand des tatsächlichen Werts ableiten:
   - Boolean (`true`/`false`) → `checkbox`
   - Zahl (parseInt/parseFloat erfolgreich, kein NaN) → `number`
   - ISO-Datum-String (`YYYY-MM-DD`) → `date`
   - ISO-Datetime-String (`YYYY-MM-DDTHH:mm`) → `datetime`
   - YAML-Array → `list`
   - Alles andere → `text`
2. THE Inference-Ergebnis SHALL nur für die aktuelle Anzeige verwendet werden; es SHALL NICHT automatisch in die Property-Type-Registry geschrieben werden (der Benutzer soll explizit über „Typ festlegen" in der UI einen permanenten Eintrag erzeugen können).
3. IF ein Wert für einen registrierten Property-Key nicht dem deklarierten Typ entspricht (z. B. Registry sagt `number`, Wert ist `"hello"`), THEN THE Editor SHALL den Wert trotzdem anzeigen (als Fallback-Text-Input) und einen visuellen Hinweis (Warnung-Icon) auf den Typ-Mismatch geben, ohne den Benutzer am Bearbeiten zu hindern.

### Requirement 3: Properties-Editor UI (Frontend)

**User Story:** Als Benutzer möchte ich Frontmatter-Properties direkt im Context Panel mit typgerechten Steuerelementen bearbeiten können, ohne den YAML-Quelltext manuell editieren zu müssen.

#### Acceptance Criteria

1. THE Properties-Editor SHALL die bestehende read-only `PropertiesView` im Context Panel ersetzen (gleiche Position, gleicher Tab-Name, keine parallele Ansicht), WHEN die aktive Datei bearbeitbar ist (Write-Access auf den Vault und kein Read-Only-Modus).
2. IF die aktive Datei nicht bearbeitbar ist (Read-Only-Vault-Share, kein Write-Access), THEN THE Properties-Editor SHALL in den bestehenden Nur-Lesen-Modus zurückfallen (identisch zur aktuellen `PropertiesView`).
3. THE Editor SHALL für jeden Property-Key eine Zeile mit Schlüsselname (links) und typgerechter Eingabekontrolle (rechts) anzeigen:
   - `text`: Einzeiliger Textinput, Escape→Abbruch, Enter/Blur→Commit
   - `number`: Numerischer Input (`type="number"`, Dezimal erlaubt), Validierung bei Commit
   - `date`: Date-Picker (nativer `<input type="date">`) oder manuelles ISO-Feld
   - `datetime`: Datetime-Picker (`<input type="datetime-local">`) oder manuelles ISO-Feld
   - `checkbox`: Toggle-Switch/Checkbox
   - `list`: Inline-Chip-Editor (jeder Eintrag als Chip, „+" zum Hinzufügen, „×" zum Entfernen, Drag-to-Reorder)
   - `tags`: Wie `list`, aber mit Autocomplete aus dem vault-weiten Tag-Pool (`/vaults/:vaultId/graph/tags`)
   - `aliases`: Wie `list` (keine spezielle Autocomplete-Quelle)
4. WHEN der Benutzer einen Wert ändert (Commit), THE Editor SHALL den gesamten Frontmatter-Block im Dokument-Content atomar ersetzen: neues YAML aus den bearbeiteten Werten generieren, den alten `---…---`-Block durch den neuen ersetzen und den bestehenden `onChange`-Pfad triggern (identisch zu einem manuellen Edit im CodeMirror-Editor, sodass Auto-Save und debounced Properties-Reload greifen).
5. IF die aktive Datei kein Frontmatter hat, THE Editor SHALL ein „+ Eigenschaft hinzufügen"-Steuerelement anzeigen; bei dessen Nutzung SHALL ein leerer `---\n---`-Block am Dokumentanfang eingefügt und das neue Feld darin angelegt werden.
6. THE Editor SHALL ein „+ Eigenschaft hinzufügen"-Steuerelement auch bei bestehendem Frontmatter bereitstellen; bei Betätigung SHALL ein leerer Schlüssel-Input erscheinen, in den der Benutzer einen neuen Key einträgt (Autocomplete aus bekannten vault-weiten Property-Keys der Registry + Link-Index), gefolgt von der typgerechten Werteingabe.
7. WHEN ein neuer Property-Key eingegeben wird, der nicht in der Registry steht, THE Editor SHALL den Typ per Inference aus dem ersten eingegebenen Wert ableiten (Requirement 2.1) und dem Benutzer optional anbieten, den Key dauerhaft in der Registry zu registrieren.
8. THE Editor SHALL Inline-Löschen pro Property-Key unterstützen (Icon-Button rechts neben dem Wert); Löschen SHALL den Schlüssel aus dem Frontmatter-Block entfernen und den Commit-Pfad aus Kriterium 4 auslösen.
9. THE Editor SHALL bei YAML-Parse-Fehlern im bestehenden Frontmatter (beschädigter Block) keine Bearbeitung erlauben; stattdessen SHALL eine Fehlermeldung und der rohe YAML-Text angezeigt werden (identisch zum bestehenden `PropertiesView` Fehlerzustand).
10. WHEN der Benutzer einen Property-Key umbenennt (Inline-Rename per Doppelklick auf den Key), THE Editor SHALL den alten Key im Frontmatter entfernen und den neuen Key mit dem alten Wert einfügen, analog zum Löschen+Hinzufügen.
11. THE Properties-Editor SHALL innerhalb von 100ms auf eine Wertänderung reagieren (kein sichtbarer Lag zwischen Commit und Aktualisierung des angezeigten Werts — der Zustand ist lokal-optimistisch, bevor der Auto-Save-Roundtrip landet).
12. THE Properties-Editor SHALL bei nicht-Markdown-Dateien (Bilder, PDFs, Canvas) nicht angezeigt werden; stattdessen SHALL ein Platzhalter „Keine Eigenschaften für diesen Dateityp" erscheinen.

### Requirement 4: Property-Value-Index (Backend)

**User Story:** Als System möchte ich einen inversen Index über Property-Werte besitzen, damit Such-Operatoren wie `property:status=done` effizient (ohne Vault-weiten Linearscan) beantwortet werden können.

#### Acceptance Criteria

1. THE Link_Index_Service SHALL neben dem bestehenden `fileProperties: Map<string, Map<string, string[]>>` (Datei→Key→Werte) einen inversen Index `propertyValueIndex: Map<string, Map<string, Set<string>>>` (Key→Wert→Dateipfade) führen.
2. THE inverse Index SHALL bei jedem `updateFile()` und `removeFile()` konsistent mit `fileProperties` gehalten werden (keine separate Rebuild-Phase, kein Lazy-Neuaufbau).
3. THE inverse Index SHALL bei `rebuild()` (vollständiger Vault-Neuaufbau) aus denselben Quelldaten wie `fileProperties` erzeugt werden.
4. THE Link_Index_Service SHALL eine Methode `getFilesByProperty(key: string, value?: string): string[]` bereitstellen, die alle Dateipfade zurückgibt, deren Frontmatter den gegebenen Key (und optional den gegebenen Wert) enthält. Bei fehlendem `value`-Parameter: alle Dateien, die den Key besitzen (unabhängig vom Wert).
5. THE inverse Index SHALL in der JSON-v2-Persistierung **nicht** gespeichert werden (er wird beim Laden aus `properties` deterministisch rekonstruiert — Duplikation im Speicher wäre inkonsistenter als Neuberechnung).
6. THE `getFilesByProperty`-Methode SHALL Wert-Vergleiche case-insensitive durchführen (konsistent mit der bestehenden Tag-Suche, die ebenfalls case-insensitive matcht).

### Requirement 5: Such-Operatoren — Query-Syntax (Backend)

**User Story:** Als Benutzer möchte ich in der Vault-Suche strukturierte Filter (Pfad, Tags, Properties, Dateiname) als Präfixe verwenden können, damit ich gezielt in bestimmten Bereichen meines Vaults suche, ohne irrelevante Treffer durchscrollen zu müssen.

#### Acceptance Criteria

1. THE System SHALL folgende Such-Operatoren unterstützen (jeder Operator ist ein `keyword:value`-Paar, getrennt durch Leerzeichen vom Rest des Querys):
   - `path:<glob>` — nur Dateien einschließen, deren relativer Pfad dem Glob-Muster entspricht (z. B. `path:Projekte/**`)
   - `file:<pattern>` — nur Dateien einschließen, deren Dateiname (ohne Pfad) das Pattern als Substring enthält (case-insensitive)
   - `tag:<tagname>` — nur Dateien einschließen, die den gegebenen Tag besitzen (aus Link-Index-Tags, inkl. Frontmatter-Tags, case-insensitive, ohne führendes `#`)
   - `property:<key>` — nur Dateien einschließen, die den gegebenen Property-Key im Frontmatter haben (unabhängig vom Wert)
   - `property:<key>=<value>` — nur Dateien einschließen, deren Property-Key den angegebenen Wert hat (case-insensitiver String-Vergleich)
   - `-path:<glob>` — Dateien ausschließen, die dem Glob-Muster entsprechen
   - `-file:<pattern>` — Dateien ausschließen, die dem Muster entsprechen
   - `-tag:<tagname>` — Dateien ausschließen, die den gegebenen Tag haben
   - `-property:<key>` — Dateien ausschließen, die den Property-Key haben
   - `-property:<key>=<value>` — Dateien ausschließen, deren Property die gegebene Key=Value-Kombination hat
2. THE Operator-Parsing SHALL vor der eigentlichen Textsuche stattfinden und eine Kandidaten-Dateiliste erzeugen; der verbleibende Freitext-Anteil wird dann nur noch innerhalb dieser Kandidaten gesucht.
3. IF der Query ausschließlich aus Operatoren besteht (kein Freitext-Anteil), THEN THE System SHALL alle Dateien zurückgeben, die den Operatoren entsprechen, mit einem leeren `matchText`/`matchLine` pro Datei (Datei-Listing-Modus statt Volltext-Ergebnis).
4. WHEN mehrere Inklusions-Operatoren desselben Typs angegeben werden (z. B. `tag:projekt tag:aktiv`), THE System SHALL diese mit UND verknüpfen (Datei muss BEIDE Tags haben).
5. WHEN Inklusions-Operatoren verschiedener Typen kombiniert werden (z. B. `tag:projekt path:Arbeit/**`), THE System SHALL diese ebenfalls mit UND verknüpfen (Datei muss den Tag UND im Pfad liegen).
6. THE Negations-Operatoren SHALL NACH den Inklusions-Operatoren angewendet werden (erst einschließen, dann ausschließen).
7. THE Operator-Parsing SHALL Anführungszeichen innerhalb des Werts unterstützen für Werte mit Leerzeichen: `property:status="in progress"` oder `path:"Mein Ordner/**"`.
8. IF ein unbekannter Operator-Syntax vorliegt (z. B. `foo:bar` ohne Match auf bekannte Operatoren), THE System SHALL diesen als Teil des Freitext-Anteils behandeln (kein Fehler, keine stillschweigende Ignorierung).
9. THE Such-Operatoren SHALL mit der bestehenden `caseSensitive`/`regex`-Option des Freitextanteils kompatibel sein — Operatoren werden immer case-insensitive ausgewertet, unabhängig von der `caseSensitive`-Einstellung, die nur den Freitext betrifft.
10. THE `path:`-Operator SHALL einfache Glob-Syntax unterstützen: `*` (beliebige Zeichen im Dateinamen), `**` (beliebige Verzeichnistiefe), `?` (einzelnes Zeichen). Keine Regex.
11. THE System SHALL die bestehende API (`GET /vaults/:vaultId/search` + `GET /search`) NICHT um neue Query-Parameter erweitern — die Operatoren werden innerhalb des bestehenden `query`-Strings geparst (abwärtskompatibel: ein Query ohne Operatoren verhält sich exakt wie bisher).

### Requirement 6: Such-Operatoren — Frontend-Integration

**User Story:** Als Benutzer möchte ich die Such-Operatoren direkt im bestehenden Suchfeld eingeben können, mit visueller Syntax-Hervorhebung und Autocomplete-Unterstützung, damit ich die richtige Syntax verwende und schnell zum Ergebnis komme.

#### Acceptance Criteria

1. THE SearchPanel SHALL den eingegebenen Query-String in Echtzeit analysieren und erkannte Operatoren visuell hervorheben (farblich abgesetzt, z. B. per Inline-`<span>` mit Klasse) — der Freitext-Anteil bleibt unformatiert.
2. THE SearchPanel SHALL bei Eingabe eines bekannten Operator-Präfixes (`path:`, `tag:`, `file:`, `property:`, `-path:`, `-tag:`, `-file:`, `-property:`) einen Inline-Autocomplete-Vorschlag zeigen:
   - `tag:` → Tags aus dem aktuellen Vault (bestehender `GET /vaults/:vaultId/graph/tags`-Endpunkt)
   - `property:` → Property-Keys aus dem aktuellen Vault (neuer Endpunkt, oder aus `graph/meta` — `GraphMeta.propertyKeys`)
   - `path:` → Top-Level-Verzeichnisnamen des Vaults (aus dem geladenen `DirectoryTree`)
   - `file:` → keine Autocomplete (zu viele Kandidaten)
3. IF der Benutzer einen unvollständigen Operator tippt (z. B. `ta` oder `pro`), THE SearchPanel SHALL KEINE Autocomplete-Vorschläge zeigen, bis ein bekanntes Präfix vollständig mit `:` abgeschlossen ist.
4. THE Autocomplete-Dropdown SHALL per Tastatur navigierbar sein (Pfeil-Tasten, Enter zum Auswählen, Escape zum Schließen), analog zum bestehenden Befehls-Palette-Muster.
5. THE Operator-Hervorhebung und Autocomplete SHALL rein im Frontend geschehen (keine zusätzliche Backend-Anfrage pro Tastendruck — Tags und Property-Keys werden beim Panel-Öffnen vorgeladen und lokal gefiltert).
6. WHEN die Suche Ergebnisse im Datei-Listing-Modus zurückgibt (nur Operatoren, kein Freitext — Requirement 5.3), THE SearchPanel SHALL die Treffer als reine Dateiliste ohne Kontext-Snippets anzeigen; jede Zeile zeigt den Dateipfad und ist anklickbar (öffnet die Datei).
7. THE SearchPanel SHALL einen „Operatoren-Hilfe"-Button (ℹ️ oder `?`-Icon neben dem Suchfeld) bereitstellen, der ein Kurzreferenz-Popover mit allen unterstützten Operatoren und Beispielen zeigt.

### Requirement 7: Property-Metadaten-API für Vault-weite Abfragen

**User Story:** Als zukünftige Bases-Feature-Engine (Prio 10) brauche ich eine API, die vault-weit nach Dateien filtert, die bestimmte Property-Werte haben, damit Bases-Queries ohne eigene Scan-Logik auskommen.

#### Acceptance Criteria

1. THE System SHALL einen REST-Endpunkt `GET /api/v1/vaults/:vaultId/properties` bereitstellen, der alle im Vault vorkommenden Property-Keys mit ihren jeweiligen Häufigkeiten und (falls in der Registry registriert) ihrem deklarierten Typ zurückgibt.
2. THE System SHALL einen REST-Endpunkt `GET /api/v1/vaults/:vaultId/properties/:key/values` bereitstellen, der alle beobachteten Werte für einen gegebenen Key mit ihren Häufigkeiten zurückgibt (Top-100 nach Häufigkeit, Pagination bei mehr als 100 distinct Werten).
3. THE System SHALL einen REST-Endpunkt `POST /api/v1/vaults/:vaultId/properties/query` bereitstellen, der eine Filterliste akzeptiert (`filters: Array<{ key: string, operator: 'eq' | 'neq' | 'contains' | 'exists' | 'not_exists', value?: string }>`) und die Menge aller Dateipfade zurückgibt, die alle Filter erfüllen (UND-Verknüpfung) — maximal 500 Ergebnisse.
4. ALL property-related endpoints SHALL denselben Access-Check wie die bestehenden Vault-Endpunkte nutzen (Session-Auth, Read-Access auf den Vault).
5. THE `POST /properties/query`-Endpunkt SHALL den Property-Value-Index (Requirement 4) nutzen statt einen linearen Dateiscan durchzuführen.
6. THE `GET /properties`-Antwort SHALL die Daten aus der bereits im Speicher gehaltenen `fileProperties`-Map des Link_Index ableiten (kein zusätzlicher Disk-Scan), ergänzt um die Typ-Information aus der Property-Type-Registry.

