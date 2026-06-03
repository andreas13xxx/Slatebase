# Requirements Document

## Introduction

Dieses Feature implementiert einen Compatibility Layer für Obsidian Community Plugins in Slatebase. Ziel ist es, eine Teilmenge der Obsidian Plugin API zu emulieren, sodass ausgewählte Community Plugins im Slatebase Web-Frontend ausgeführt werden können. Das Feature umfasst einen Plugin-Loader (Erkennung, Laden, Initialisierung), ein API-Shim-Layer (Emulation der wichtigsten Obsidian-Interfaces wie App, Workspace, Vault, MetadataCache), ein Sicherheitsmodell (Sandboxing, Berechtigungen) und eine Plugin-Verwaltungsoberfläche. Das Feature baut auf der bestehenden Obsidian-Markdown-Kompatibilität (Wikilinks, Embeds, Callouts, Tags) auf.

## Glossary

- **Plugin_Loader**: Modul das Plugin-Bundles erkennt, lädt, validiert und initialisiert
- **Plugin_Registry**: Persistenter Speicher der installierten Plugins mit Metadaten (ID, Version, Status, Berechtigungen)
- **Plugin_Sandbox**: Isolierte Ausführungsumgebung die den Zugriff eines Plugins auf Browser-APIs und Slatebase-Interna einschränkt
- **API_Shim**: Implementierung eines Obsidian-API-Subsets das Plugin-Aufrufe auf Slatebase-Äquivalente abbildet
- **App_Shim**: Emulation des Obsidian `App`-Objekts als zentraler Einstiegspunkt für Plugins (Zugriff auf Vault, Workspace, MetadataCache)
- **Vault_Shim**: Emulation des Obsidian `Vault`-Interfaces (Datei-Lese-/Schreiboperationen, Events)
- **Workspace_Shim**: Emulation des Obsidian `Workspace`-Interfaces (Leaf-Management, aktive View, Events)
- **MetadataCache_Shim**: Emulation des Obsidian `MetadataCache`-Interfaces (Frontmatter, Links, Tags, Headings)
- **Plugin_Manifest**: JSON-Datei (`manifest.json`) die ein Obsidian-Plugin beschreibt (ID, Name, Version, minAppVersion, Autor)
- **Plugin_Bundle**: JavaScript-Datei (`main.js`) die den kompilierten Plugin-Code enthält
- **Plugin_Settings**: Persistente Konfigurationsdaten eines Plugins (gespeichert als `data.json`)
- **Lifecycle_Hook**: Methode die vom Plugin-System zu definierten Zeitpunkten aufgerufen wird (`onload`, `onunload`)
- **Command_Palette**: UI-Element das Plugin-registrierte Befehle als durchsuchbare Liste anzeigt
- **Settings_Tab**: Von einem Plugin registrierter Einstellungs-Tab in der Plugin-Verwaltung
- **Plugin_Event**: Typisiertes Event das vom API-Shim an registrierte Plugin-Listener weitergeleitet wird
- **Compatibility_Level**: Grad der API-Abdeckung für ein Plugin (full, partial, unsupported, unknown)
- **Slatebase_Frontend**: Die React-SPA (Vite) die das Slatebase Web-Interface bereitstellt
- **ViewMode**: Bestehende React-Komponente die Markdown-Inhalte als formatierte HTML-Elemente rendert

## Requirements

### Requirement 1: Plugin-Manifest-Parsing

**User Story:** Als Entwickler möchte ich, dass Slatebase Obsidian-Plugin-Manifeste korrekt liest und validiert, damit nur kompatible Plugins geladen werden.

#### Acceptance Criteria

1. WHEN eine `manifest.json`-Datei bereitgestellt wird, THE Plugin_Loader SHALL die Felder `id`, `name`, `version`, `minAppVersion`, `author` und `description` extrahieren und als Plugin_Manifest-Objekt zurückgeben
2. IF ein Pflichtfeld (`id`, `name`, `version`) in der `manifest.json` fehlt oder ein leerer String ist, THEN THE Plugin_Loader SHALL einen Validierungsfehler zurückgeben der das fehlende Feld namentlich benennt, und das Plugin nicht laden
3. IF das Feld `minAppVersion` eine gemäß Semver-Vergleich höhere Version angibt als die emulierte Obsidian-API-Version, THEN THE Plugin_Loader SHALL das Plugin als inkompatibel markieren und eine Warnung in das Plugin-spezifische Log schreiben die die geforderte und die emulierte Version enthält
4. FOR ALL gültigen Obsidian-Plugin-Manifeste, THE Plugin_Loader SHALL die Manifest-Daten ohne Informationsverlust parsen (Round-Trip: Parsen → Serialisieren → Parsen ergibt äquivalentes Objekt), einschließlich unbekannter Zusatzfelder
5. IF die `manifest.json` ungültiges JSON enthält, THEN THE Plugin_Loader SHALL einen Parse-Fehler mit Dateiname und Zeilenposition des Syntaxfehlers zurückgeben
6. IF die `manifest.json`-Datei größer als 1 MB ist, THEN THE Plugin_Loader SHALL die Datei ablehnen und einen Fehler zurückgeben der die maximale Dateigröße angibt
7. WHEN eine `manifest.json`-Datei bereitgestellt wird, THE Plugin_Loader SHALL das Feld `version` als gültigen Semver-String (Format MAJOR.MINOR.PATCH) validieren und bei ungültigem Format einen Validierungsfehler mit dem ungültigen Wert zurückgeben

### Requirement 2: Plugin-Bundle-Laden

**User Story:** Als Benutzer möchte ich Obsidian-Plugins in Slatebase installieren können, damit ich deren Funktionalität im Web-Frontend nutzen kann.

#### Acceptance Criteria

1. WHEN ein Plugin-Bundle (`main.js`) zusammen mit einem gültigen Manifest bereitgestellt wird, THE Plugin_Loader SHALL das Bundle als ES-Modul evaluieren und die exportierte Plugin-Klasse instanziieren
2. IF ein Plugin-Bundle keinen Default-Export enthält oder der Export keine instanziierbare Klasse (Konstruktor-Funktion) ist, THEN THE Plugin_Loader SHALL das Plugin als fehlerhaft markieren und eine Fehlermeldung im Plugin-Verwaltungsbereich anzeigen die den Plugin-Namen und den Grund (fehlender oder ungültiger Export) enthält
3. WHEN ein Plugin-Bundle einen Syntax-Fehler enthält, THE Plugin_Loader SHALL den Fehler abfangen, das Plugin als fehlerhaft markieren und die übrige Anwendung weiterhin vollständig bedienbar halten (Navigation, Dateioperationen und andere Plugins funktionieren ohne Einschränkung)
4. WHEN ein Plugin-Bundle während der Evaluation eine Exception wirft, THE Plugin_Loader SHALL die Exception loggen, das Plugin deaktivieren und eine sichtbare Fehlermeldung im Plugin-Verwaltungsbereich anzeigen die den Plugin-Namen und den Fehlertyp enthält
5. THE Plugin_Loader SHALL Plugin-Bundles asynchron laden und die Evaluation erst nach Abschluss des initialen Seiten-Renderings (nach First Contentful Paint) starten, sodass das Laden von Plugins den First Contentful Paint um maximal 50 Millisekunden verzögert
6. WHILE ein Plugin geladen wird, THE Slatebase_Frontend SHALL einen Lade-Indikator für das betreffende Plugin anzeigen

### Requirement 3: Plugin-Lifecycle-Management

**User Story:** Als Benutzer möchte ich Plugins aktivieren und deaktivieren können, damit ich kontrollieren kann welche Plugins aktiv sind.

#### Acceptance Criteria

1. WHEN ein Plugin aktiviert wird, THE Plugin_Loader SHALL die `onload()`-Methode der Plugin-Instanz aufrufen und maximal 10 Sekunden auf deren Abschluss warten
2. WHEN ein Plugin deaktiviert wird, THE Plugin_Loader SHALL die `onunload()`-Methode der Plugin-Instanz aufrufen und alle vom Plugin registrierten Event-Listener, Commands und UI-Elemente entfernen
3. WHEN Slatebase gestartet wird, THE Plugin_Loader SHALL alle als aktiv markierten Plugins in der Reihenfolge ihrer Registrierung laden und aktivieren
4. IF ein Plugin während `onload()` eine Exception wirft oder das Timeout von 10 Sekunden überschreitet, THEN THE Plugin_Loader SHALL das Plugin als fehlerhaft markieren, den Fehler loggen und die Aktivierung der übrigen Plugins fortsetzen
5. THE Plugin_Registry SHALL den Aktivierungsstatus jedes Plugins im Backend persistent speichern, sodass der Status nach einem Seitenneuladen und über Geräte hinweg erhalten bleibt
6. WHEN ein Plugin deaktiviert wird, THE Plugin_Loader SHALL alle vom Plugin erstellten DOM-Elemente, Timer (`setTimeout`, `setInterval`), registrierten Event-Listener und Referenzen auf die Plugin-Instanz entfernen
7. IF ein Plugin während `onunload()` eine Exception wirft, THEN THE Plugin_Loader SHALL die Exception loggen und die Ressourcen-Bereinigung (Event-Listener, Commands, UI-Elemente, Timer) dennoch vollständig durchführen

### Requirement 4: App-Shim (Zentraler API-Einstiegspunkt)

**User Story:** Als Plugin-Entwickler erwarte ich Zugriff auf das `App`-Objekt, damit mein Plugin mit Vault, Workspace und MetadataCache interagieren kann.

#### Acceptance Criteria

1. THE App_Shim SHALL die Properties `vault`, `workspace` und `metadataCache` als Instanzen der jeweiligen Shim-Implementierungen bereitstellen, wobei jede Property eine Instanz zurückgibt die das entsprechende Shim-Interface vollständig implementiert
2. THE App_Shim SHALL eine `plugins`-Property bereitstellen die ein Objekt mit den Properties `plugins` (Map von Plugin-ID zu Plugin-Instanz für alle aktiven Plugins) und `enabledPlugins` (Set der IDs aller aktiven Plugins) exponiert, sowie eine Methode `getPlugin(id: string)` die die Plugin-Instanz zurückgibt oder `undefined` wenn das Plugin nicht aktiv ist
3. WHEN ein Plugin auf eine nicht-emulierte Property des App-Objekts zugreift, THE App_Shim SHALL `undefined` zurückgeben und eine Warnung in der Entwicklerkonsole ausgeben die den Property-Namen und die Plugin-ID enthält (maximal eine Warnung pro Property-Name pro Plugin-Instanz)
4. WHEN ein Plugin eine nicht-emulierte Methode des App-Objekts aufruft, THE App_Shim SHALL eine No-Op-Funktion zurückgeben die `undefined` liefert und eine Warnung in der Entwicklerkonsole ausgeben die den Methodennamen und die Plugin-ID enthält
5. THE App_Shim SHALL pro Vault-Kontext eine eigene Instanz bereitstellen, wobei die zugehörigen Sub-Shims (`vault`, `workspace`, `metadataCache`) ebenfalls an denselben Vault-Kontext gebunden sind
6. WHEN der Benutzer den aktiven Vault wechselt, THE App_Shim SHALL den geladenen Plugins die App-Instanz des neuen Vault-Kontexts bereitstellen und die `onunload()`/`onload()`-Lifecycle-Hooks in dieser Reihenfolge auslösen

### Requirement 5: Vault-Shim (Dateisystem-Emulation)

**User Story:** Als Plugin-Entwickler erwarte ich Zugriff auf Vault-Dateien über die bekannte Obsidian Vault API, damit mein Plugin Dateien lesen, schreiben und auflisten kann.

#### Acceptance Criteria

1. WHEN ein Plugin `vault.read(file)` aufruft, THE Vault_Shim SHALL den Dateiinhalt über die Slatebase-API laden und das Ergebnis als Promise<string> zurückgeben
2. WHEN ein Plugin `vault.modify(file, content)` aufruft, THE Vault_Shim SHALL den Dateiinhalt über die Slatebase-API speichern und ein Promise<void> zurückgeben das bei Erfolg resolved
3. WHEN ein Plugin `vault.create(path, content)` aufruft und der Pfad noch nicht existiert, THE Vault_Shim SHALL eine neue Datei über die Slatebase-API erstellen und ein Promise<TFile> zurückgeben
4. WHEN ein Plugin `vault.delete(file)` aufruft, THE Vault_Shim SHALL die Datei über die Slatebase-API löschen und ein Promise<void> zurückgeben das bei Erfolg resolved
5. WHEN ein Plugin `vault.getAbstractFileByPath(path)` aufruft, THE Vault_Shim SHALL ein TFile- oder TFolder-Objekt aus dem DirectoryTree zurückgeben, oder `null` wenn der Pfad nicht existiert
6. WHEN eine Dateioperation (`read`, `modify`, `create`, `delete`) über den Vault_Shim erfolgreich abgeschlossen wird, THE Vault_Shim SHALL das korrespondierende Event (`create`, `modify`, `delete`) emittieren und dabei das betroffene TFile-Objekt als Argument übergeben
7. WHEN ein Plugin `vault.getMarkdownFiles()` aufruft, THE Vault_Shim SHALL alle `.md`-Dateien des aktuellen Vaults als TFile-Array zurückgeben
8. IF ein Plugin eine Dateioperation auf einen Pfad außerhalb des Vaults versucht, THEN THE Vault_Shim SHALL die Operation mit einem Error ablehnen dessen `message` den ungültigen Pfad benennt
9. IF ein Plugin `vault.read(file)` oder `vault.modify(file, content)` oder `vault.delete(file)` auf eine nicht-existierende Datei aufruft, THEN THE Vault_Shim SHALL das zurückgegebene Promise mit einem Error rejecten dessen `message` den fehlenden Pfad benennt
10. IF ein Plugin `vault.create(path, content)` aufruft und am Zielpfad bereits eine Datei existiert, THEN THE Vault_Shim SHALL das Promise mit einem Error rejecten dessen `message` angibt dass die Datei bereits existiert
11. IF die Slatebase-API bei einer Vault_Shim-Operation einen Netzwerk- oder Server-Fehler zurückgibt, THEN THE Vault_Shim SHALL das Promise mit einem Error rejecten der den API-Fehlercode und die Fehlermeldung enthält

### Requirement 6: Workspace-Shim (UI-Integration)

**User Story:** Als Plugin-Entwickler erwarte ich Zugriff auf den Workspace, damit mein Plugin auf die aktive Datei reagieren und UI-Elemente registrieren kann.

#### Acceptance Criteria

1. WHEN ein Plugin `workspace.getActiveFile()` aufruft und eine Datei im aktiven Tab geöffnet ist, THE Workspace_Shim SHALL die aktuell im Editor geöffnete Datei als TFile-Objekt zurückgeben
2. WHEN ein Plugin `workspace.getActiveFile()` aufruft und kein Datei-Tab aktiv ist (z.B. Settings-Tab, Graph-View, oder kein Tab geöffnet), THE Workspace_Shim SHALL `null` zurückgeben
3. WHEN der Benutzer eine andere Datei öffnet, THE Workspace_Shim SHALL das Event `file-open` emittieren mit dem geöffneten TFile-Objekt als Argument an alle registrierten Callbacks
4. WHEN der aktive Tab wechselt, THE Workspace_Shim SHALL das Event `active-leaf-change` emittieren mit dem TFile-Objekt des neuen Tabs (oder `null` wenn der neue Tab keine Datei enthält) als Argument
5. WHEN ein Plugin `workspace.on(event, callback)` aufruft, THE Workspace_Shim SHALL den Callback für das spezifizierte Event registrieren und eine Unregister-Funktion zurückgeben, deren mehrfacher Aufruf keine Fehler verursacht
6. WHEN ein Plugin einen Command über `addCommand()` registriert, THE Workspace_Shim SHALL den Command in der Command_Palette verfügbar machen
7. IF ein Plugin auf nicht-emulierte Workspace-Methoden zugreift (z.B. `createLeafBySplit`, `getLeaf`), THEN THE Workspace_Shim SHALL eine No-Op-Funktion zurückgeben und eine Kompatibilitätswarnung in der Browser-Entwicklerkonsole loggen

### Requirement 7: MetadataCache-Shim (Metadaten-Zugriff)

**User Story:** Als Plugin-Entwickler erwarte ich Zugriff auf den MetadataCache, damit mein Plugin Frontmatter, Links und Tags einer Datei abfragen kann.

#### Acceptance Criteria

1. WHEN ein Plugin `metadataCache.getFileCache(file)` aufruft, THE MetadataCache_Shim SHALL ein CachedMetadata-Objekt mit `frontmatter`, `links`, `tags` und `headings` zurückgeben
2. IF das übergebene TFile nicht im Vault existiert oder noch nicht geparst wurde, THEN THE MetadataCache_Shim SHALL `null` zurückgeben
3. WHEN ein Plugin `metadataCache.getFirstLinkpathDest(linkpath, sourcePath)` aufruft, THE MetadataCache_Shim SHALL den Link gegen den DirectoryTree auflösen und das Ziel-TFile zurückgeben
4. IF der übergebene Linkpfad nicht gegen eine existierende Datei im Vault aufgelöst werden kann, THEN THE MetadataCache_Shim SHALL `null` zurückgeben
5. WHEN eine Datei gespeichert oder durch einen externen Sync aktualisiert wird, THE MetadataCache_Shim SHALL das Event `changed` emittieren und dem Callback das betroffene TFile sowie das aktualisierte CachedMetadata-Objekt übergeben
6. WHEN der initiale Cache-Aufbau für alle Markdown-Dateien im Vault abgeschlossen ist, THE MetadataCache_Shim SHALL das Event `resolved` genau einmal emittieren
7. WHEN ein Plugin `metadataCache.resolvedLinks` abfragt, THE MetadataCache_Shim SHALL eine Map aller aufgelösten Links im Vault zurückgeben (Quell-Pfad → Ziel-Pfad → Anzahl)

### Requirement 8: Plugin-Sicherheit und Sandboxing

**User Story:** Als Administrator möchte ich sicherstellen, dass Plugins keinen unkontrollierten Zugriff auf Browser-APIs oder andere Vaults haben, damit die Systemsicherheit gewährleistet bleibt.

#### Acceptance Criteria

1. THE Plugin_Sandbox SHALL den Zugriff eines Plugins auf den aktuellen Vault beschränken (kein Zugriff auf andere Vaults des Benutzers), indem API-Shim-Aufrufe mit einer anderen Vault-ID abgelehnt werden
2. THE Plugin_Sandbox SHALL den Zugriff auf `localStorage`, `sessionStorage` und `IndexedDB` auf einen Plugin-spezifischen Namespace beschränken (Key-Prefix `slatebase_plugin_<pluginId>_`) und den Speicherverbrauch pro Plugin auf maximal 5 MB pro Storage-Typ begrenzen
3. THE Plugin_Sandbox SHALL Netzwerk-Requests (`fetch`, `XMLHttpRequest`) eines Plugins auf eine vom Administrator pro Plugin konfigurierbare Allowlist von maximal 20 Domains beschränken; IF die Allowlist leer ist oder keine Netzwerk-Berechtigung erteilt wurde, THEN THE Plugin_Sandbox SHALL alle ausgehenden Netzwerk-Requests des Plugins blockieren
4. IF ein Plugin versucht auf eine nicht-erlaubte Browser-API zuzugreifen, THEN THE Plugin_Sandbox SHALL den Zugriff blockieren, einen Sicherheits-Fehler in die Entwicklerkonsole loggen und dem Benutzer eine Warnung in der Plugin-Verwaltungsseite anzeigen
5. IF ein Plugin den Main-Thread länger als 5 Sekunden kontinuierlich blockiert, THEN THE Plugin_Sandbox SHALL das Plugin automatisch deaktivieren und dem Benutzer eine Benachrichtigung mit Plugin-Name und Grund der Deaktivierung anzeigen
6. WHEN ein Plugin deaktiviert wird, THE Plugin_Sandbox SHALL alle vom Plugin erstellten DOM-Elemente, Timer (`setTimeout`, `setInterval`), Event-Listener und offene WebSocket-Verbindungen entfernen
7. THE Plugin_Registry SHALL pro Plugin eine vom Administrator konfigurierbare Liste erlaubter Berechtigungen speichern (Netzwerk, Dateisystem-Schreiben, DOM-Manipulation), wobei neue Plugins standardmäßig keine Berechtigungen erhalten (Deny-by-Default)

### Requirement 9: Plugin-Einstellungen-Persistenz

**User Story:** Als Benutzer möchte ich, dass Plugin-Einstellungen gespeichert werden, damit meine Konfiguration nach einem Neuladen erhalten bleibt.

#### Acceptance Criteria

1. WHEN ein Plugin `this.loadData()` aufruft und gespeicherte Einstellungen existieren, THE API_Shim SHALL die gespeicherten Plugin-Einstellungen aus dem Backend laden und als JSON-Objekt zurückgeben
2. WHEN ein Plugin `this.saveData(data)` aufruft und die serialisierten Daten 1 MB nicht überschreiten, THE API_Shim SHALL die Einstellungen als JSON im Backend persistieren
3. THE Plugin_Settings SHALL pro Plugin-ID und pro Vault-ID isoliert gespeichert werden (ein Plugin in Vault A hat andere Einstellungen als dasselbe Plugin in Vault B)
4. IF beim Laden der Einstellungen ein Fehler auftritt (Netzwerkfehler, ungültiges JSON im Backend), THEN THE API_Shim SHALL `null` zurückgeben und den Fehler in der Entwicklerkonsole loggen
5. IF ein Plugin `this.saveData(data)` aufruft und die JSON-Serialisierung der Daten 1 MB überschreitet, THEN THE API_Shim SHALL die Speicherung ablehnen und einen Fehler an das Plugin zurückgeben
6. WHEN ein Plugin `this.loadData()` aufruft und keine gespeicherten Einstellungen für dieses Plugin existieren (erster Aufruf), THE API_Shim SHALL `null` zurückgeben
7. IF ein Plugin `this.saveData(data)` mit nicht JSON-serialisierbaren Daten aufruft (zirkuläre Referenzen, Funktionen), THEN THE API_Shim SHALL die Speicherung ablehnen, den Fehler loggen und eine Exception an das Plugin werfen

### Requirement 10: Plugin-Verwaltungsoberfläche

**User Story:** Als Benutzer möchte ich eine Übersicht aller installierten Plugins mit Aktivierungs-/Deaktivierungsmöglichkeit, damit ich Plugins verwalten kann.

#### Acceptance Criteria

1. THE Slatebase_Frontend SHALL eine Plugin-Verwaltungsseite bereitstellen die als Tab geöffnet werden kann
2. THE Plugin-Verwaltungsseite SHALL für jedes installierte Plugin Name, Version, Autor, Beschreibung (maximal 200 Zeichen sichtbar, bei längerer Beschreibung mit Expand-Option) und Aktivierungsstatus anzeigen
3. WHEN der Benutzer den Aktivierungs-Toggle eines Plugins betätigt, THE Slatebase_Frontend SHALL das Plugin aktivieren oder deaktivieren und den Status persistent im Backend speichern
4. IF die Aktivierung oder Deaktivierung eines Plugins fehlschlägt, THEN THE Slatebase_Frontend SHALL den Toggle auf den vorherigen Zustand zurücksetzen und eine Fehlermeldung anzeigen die den Grund des Fehlschlags beschreibt
5. WHEN ein Plugin einen Settings_Tab registriert hat, THE Plugin-Verwaltungsseite SHALL einen "Einstellungen"-Button anzeigen der die Plugin-Einstellungen als separaten Tab öffnet
6. THE Plugin-Verwaltungsseite SHALL den Compatibility_Level jedes Plugins anzeigen (full, partial, unsupported) basierend auf den genutzten API-Methoden
7. WHEN ein Plugin als fehlerhaft markiert ist, THE Plugin-Verwaltungsseite SHALL den Fehlerstatus mit einer Fehlermeldung (maximal 500 Zeichen, bei längerer Meldung mit Expand-Option) anzeigen und eine Option zum erneuten Laden bieten
8. IF das erneute Laden eines fehlerhaften Plugins ebenfalls fehlschlägt, THEN THE Plugin-Verwaltungsseite SHALL die aktualisierte Fehlermeldung anzeigen und den Fehlerstatus beibehalten
9. IF keine Plugins installiert sind, THEN THE Plugin-Verwaltungsseite SHALL einen Leer-Zustand mit einem Hinweis anzeigen dass keine Plugins installiert sind

### Requirement 11: Plugin-Installation und -Upload

**User Story:** Als Benutzer möchte ich Obsidian-Plugins installieren können, indem ich die Plugin-Dateien hochlade oder aus dem `.obsidian/plugins`-Verzeichnis eines synchronisierten Vaults lade.

#### Acceptance Criteria

1. WHEN ein Benutzer eine ZIP-Datei hochlädt die im Root-Verzeichnis oder in genau einem Unterverzeichnis eine `manifest.json` und eine `main.js` enthält, THE Plugin_Loader SHALL das Plugin extrahieren, das Manifest gemäß Requirement 1 validieren und das Plugin in der Plugin_Registry registrieren
2. WHEN ein Vault geöffnet wird und ein `.obsidian/plugins/<plugin-id>/`-Verzeichnis mit gültiger `manifest.json` und `main.js` enthält (z.B. durch CouchDB-Sync), THE Plugin_Loader SHALL die darin enthaltenen Plugins erkennen und dem Benutzer in der Plugin-Verwaltungsseite als installierbar anzeigen
3. WHEN ein Plugin bereits installiert ist und eine Version mit höherer Semver-Versionsnummer hochgeladen wird, THE Plugin_Loader SHALL das Plugin-Bundle und Manifest aktualisieren und die bestehende `data.json` (Plugin_Settings) unverändert beibehalten
4. IF ein Plugin bereits installiert ist und eine gleiche oder niedrigere Semver-Version hochgeladen wird, THEN THE Plugin_Loader SHALL den Upload ablehnen und eine Fehlermeldung anzeigen die die installierte und die hochgeladene Version nennt
5. THE Plugin_Loader SHALL die Integrität des Plugin-Bundles prüfen: syntaktisch gültiges JavaScript (parsebar ohne SyntaxError) und Abwesenheit der Patterns `eval(`, `new Function(` und `document.write(`
6. IF ein Plugin-Upload die maximale ZIP-Dateigröße von 5 MB oder eine extrahierte Gesamtgröße von 10 MB überschreitet, THEN THE Plugin_Loader SHALL den Upload ablehnen und eine Fehlermeldung anzeigen
7. IF eine hochgeladene ZIP-Datei keine `manifest.json` oder keine `main.js` enthält oder die ZIP-Datei nicht lesbar ist, THEN THE Plugin_Loader SHALL den Upload ablehnen und eine Fehlermeldung anzeigen die das fehlende Element benennt

### Requirement 12: Command-Palette-Integration

**User Story:** Als Benutzer möchte ich Plugin-Befehle über eine Command-Palette ausführen können, damit ich schnell auf Plugin-Funktionalität zugreifen kann.

#### Acceptance Criteria

1. WHEN ein Plugin `this.addCommand({ id, name, callback })` aufruft, THE API_Shim SHALL den Command in der globalen Command-Liste registrieren, wobei die Command-ID im Format `<pluginId>:<commandId>` gespeichert wird um Eindeutigkeit über Plugins hinweg sicherzustellen
2. THE Command_Palette SHALL alle registrierten Commands als durchsuchbare Liste anzeigen, wobei die Suche case-insensitive Teilstring-Matching auf dem Command-Namen durchführt und maximal 50 Ergebnisse anzeigt
3. WHEN der Benutzer einen Command auswählt, THE Command_Palette SHALL den registrierten Callback ausführen und die Palette schließen
4. WHEN ein Plugin deaktiviert wird, THE API_Shim SHALL alle vom Plugin registrierten Commands aus der Command-Liste entfernen und alle zugehörigen Hotkey-Registrierungen aufheben
5. WHEN der Benutzer Ctrl+P (Windows/Linux) oder Cmd+P (macOS) drückt, THE Command_Palette SHALL sich als modaler Overlay öffnen und den Fokus auf das Suchfeld setzen
6. WHEN ein Command einen optionalen `hotkey` definiert und der Hotkey nicht bereits durch einen Built-in-Shortcut oder ein anderes Plugin belegt ist, THE API_Shim SHALL den Hotkey als globalen Keyboard-Shortcut registrieren
7. IF ein Command-Callback während der Ausführung eine Exception wirft, THEN THE Command_Palette SHALL die Exception loggen, die Palette schließen und den Benutzer nicht mit einem unbehandelten Fehler blockieren
8. IF ein Plugin einen Hotkey registriert der bereits belegt ist, THEN THE API_Shim SHALL die Registrierung ignorieren und eine Warnung in der Entwicklerkonsole ausgeben

### Requirement 13: Event-System

**User Story:** Als Plugin-Entwickler erwarte ich ein Event-System das Obsidian-kompatible Events emittiert, damit mein Plugin auf Zustandsänderungen reagieren kann.

#### Acceptance Criteria

1. THE API_Shim SHALL die Methoden `on(event, callback)`, `off(event, callback)` und `trigger(event, ...args)` auf allen Event-emittierenden Objekten (App, Vault, Workspace, MetadataCache) bereitstellen, wobei `on()` eine EventRef-Referenz zurückgibt die zur Deregistrierung verwendet werden kann
2. WHEN ein Plugin `this.registerEvent(eventRef)` aufruft, THE API_Shim SHALL das Event-Abonnement tracken und bei `onunload()` automatisch entfernen
3. WHEN ein Event-Callback eine Exception wirft, THE API_Shim SHALL die Exception in der Browser-Konsole loggen (inkl. Plugin-ID und Event-Name) und die Ausführung weiterer Callbacks für dasselbe Event nicht unterbrechen
4. THE API_Shim SHALL Events synchron in der Reihenfolge der Registrierung an alle Listener dispatchen
5. WHEN ein Listener über `off(event, callback)` oder über die von `on()` zurückgegebene EventRef entfernt wird, THE API_Shim SHALL den Listener sofort deregistrieren, sodass er bei nachfolgenden `trigger()`-Aufrufen nicht mehr aufgerufen wird
6. IF `off()` mit einem Callback aufgerufen wird der nicht registriert ist oder bereits entfernt wurde, THEN THE API_Shim SHALL den Aufruf ohne Fehler ignorieren (idempotente Deregistrierung)

### Requirement 14: Plugin-Speicher im Backend

**User Story:** Als Benutzer möchte ich, dass Plugin-Dateien und -Einstellungen serverseitig gespeichert werden, damit sie über Geräte hinweg verfügbar sind.

#### Acceptance Criteria

1. THE Slatebase_Frontend SHALL Plugin-Bundles (`main.js`, `manifest.json`, `styles.css`) über einen dedizierten API-Endpoint an das Backend senden, wobei einzelne Dateien eine maximale Größe von 5 MB nicht überschreiten dürfen
2. THE Backend SHALL Plugin-Dateien unter `data/plugins/<vaultId>/<pluginId>/` mittels atomarer Schreiboperationen (Temp-Datei → rename) speichern
3. THE Backend SHALL Plugin-Einstellungen unter `data/plugins/<vaultId>/<pluginId>/data.json` speichern, wobei die maximale Größe der Einstellungsdatei 1 MB beträgt
4. WHEN ein Benutzer sich anmeldet und einen Vault öffnet, THE Slatebase_Frontend SHALL die Plugin-Liste und aktive Plugins vom Backend laden
5. IF ein nicht-authentifizierter oder nicht-berechtigter Benutzer auf Plugin-Daten zugreift, THEN THE Backend SHALL den Zugriff mit der gleichen Zugriffskontrolle wie Vault-Dateien ablehnen (nur Vault-Besitzer und Benutzer mit Vault-Freigabe erhalten Zugriff)
6. IF ein Plugin gelöscht wird, THEN THE Backend SHALL alle zugehörigen Dateien und Einstellungen unter `data/plugins/<vaultId>/<pluginId>/` vollständig entfernen
7. WHEN ein Vault gelöscht wird, THEN THE Backend SHALL alle Plugin-Daten unter `data/plugins/<vaultId>/` vollständig entfernen
8. IF der Upload einer Plugin-Datei die maximale Dateigröße von 5 MB überschreitet, THEN THE Backend SHALL den Upload ablehnen und eine Fehlermeldung zurückgeben die auf die Größenbeschränkung hinweist

### Requirement 15: CSS-Injection für Plugins

**User Story:** Als Plugin-Entwickler erwarte ich, dass mein Plugin eigene CSS-Styles laden kann, damit die Plugin-UI korrekt dargestellt wird.

#### Acceptance Criteria

1. WHEN ein Plugin eine `styles.css`-Datei enthält und aktiviert wird, THE Plugin_Loader SHALL ein `<style>`-Element mit dem Attribut `data-plugin-id="<pluginId>"` im Dokument-`<head>` einfügen, das den Inhalt der `styles.css`-Datei enthält
2. WHEN ein Plugin deaktiviert wird, THE Plugin_Loader SHALL das `<style>`-Element mit dem Attribut `data-plugin-id="<pluginId>"` aus dem Dokument-`<head>` entfernen, sodass keine verwaisten Style-Elemente im DOM verbleiben
3. THE Plugin_Loader SHALL alle CSS-Selektoren innerhalb des injizierten `<style>`-Elements unter einen Plugin-spezifischen Scope stellen (Präfix `[data-plugin-id="<pluginId>"]`), sodass Plugin-Styles nur auf DOM-Elemente innerhalb des Plugin-Containers wirken und weder Styles anderer Plugins noch der Hauptanwendung überschreiben
4. IF eine `styles.css`-Datei ungültiges CSS enthält, THEN THE Plugin_Loader SHALL die Datei trotzdem injizieren (Browser ignoriert ungültige Regeln) und eine Warnung in der Browser-Entwicklerkonsole (`console.warn`) mit Plugin-ID und Dateiname ausgeben
5. IF eine `styles.css`-Datei die maximale Größe von 512 KB überschreitet, THEN THE Plugin_Loader SHALL die Datei nicht injizieren und einen Fehler loggen

### Requirement 16: Kompatibilitäts-Analyse

**User Story:** Als Benutzer möchte ich vor der Aktivierung eines Plugins wissen, welche API-Methoden es verwendet und ob diese von Slatebase unterstützt werden.

#### Acceptance Criteria

1. WHEN ein Plugin installiert wird, THE Plugin_Loader SHALL das Bundle statisch analysieren (Pattern-Matching auf Obsidian-API-Zugriffe wie `this.app.vault.*`, `this.app.workspace.*`, `this.app.metadataCache.*`) und eine Liste der erkannten API-Methoden-Aufrufe extrahieren, wobei die Analyse innerhalb von 10 Sekunden abgeschlossen sein muss
2. THE Plugin_Loader SHALL jeden erkannten API-Aufruf als `supported` (vollständig emuliert, verhält sich wie in Obsidian), `partial` (Methode existiert im Shim, gibt aber nur einen Subset der Obsidian-Funktionalität zurück oder ignoriert bestimmte Parameter) oder `unsupported` (Methode ist nicht im Shim implementiert, gibt `undefined` zurück oder wirft einen Fehler) klassifizieren
3. THE Plugin_Loader SHALL einen Compatibility_Level berechnen: `full` (alle erkannten Aufrufe sind `supported`), `partial` (mindestens ein Aufruf ist `partial` oder `unsupported`, aber kein Aufruf aus der Kategorie der Lifecycle-kritischen Methoden (`onload`, `onunload`, `Plugin.registerEvent`, `vault.read`, `vault.modify`) ist `unsupported`), `unsupported` (mindestens ein Lifecycle-kritischer Aufruf ist `unsupported`)
4. IF die statische Analyse fehlschlägt (z.B. durch obfuskierten Code oder unerwartete Bundle-Struktur), THEN THE Plugin_Loader SHALL den Compatibility_Level als `unknown` markieren, eine Meldung anzeigen die darauf hinweist dass die Kompatibilität nicht automatisch bestimmt werden konnte, und dem Benutzer die manuelle Aktivierung ermöglichen
5. THE Plugin-Verwaltungsseite SHALL die Kompatibilitäts-Analyse als aufklappbare Detail-Liste anzeigen, gruppiert nach Klassifikation (`supported`, `partial`, `unsupported`), wobei jeder Eintrag den Methoden-Namen und die Klassifikation enthält
6. WHEN ein Plugin als `unsupported` klassifiziert wird, THE Plugin-Verwaltungsseite SHALL eine Warnung anzeigen die den Benutzer darauf hinweist dass das Plugin möglicherweise nicht funktioniert, und die Liste der unsupported Lifecycle-kritischen Methoden benennen
