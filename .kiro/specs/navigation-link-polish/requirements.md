# Requirements Document

## Introduction

„Navigation & Verknüpfungs-Politur" schließt eine Reihe von Lücken zwischen Slatebases bestehender Navigations-Infrastruktur und dem, was Nutzer aus Obsidian gewohnt sind. Der Kern-Editor, das Tab-System, der Backlinks-Bereich und der Knowledge Graph existieren bereits und funktionieren — diese Spec vertieft und poliert sie, statt neue Grundfunktionen zu schaffen: ein echter Zurück/Vor-Navigationsverlauf (die Befehle `app:go-back`/`app:go-forward` sind aktuell literale No-Ops), ein Schnellwechsler für dateinamenbasiertes Öffnen (`switcher:open` ist ebenfalls ein No-Op), Standard-Tastenkombinationen für den bereits funktionierenden Tab-Wechsel (`workspace:next-tab`/`previous-tab`), automatische Backlink-Aktualisierung bei entfernten Änderungen, deterministische Auflösung mehrdeutiger Wikilinks und eine Ordnerpfad-Breadcrumb für die aktive Datei.

## Glossary

- **Navigationsverlauf**: Die Zurück/Vor-Historie besuchter Dokumente, analog zum Browser-Verlauf.
- **History_Entry**: Ein einzelner Eintrag im Navigationsverlauf, bestehend aus Vault-ID, Dateipfad und optionalem Anker (Überschrift/Block-Referenz).
- **Zurück_Stack**: Die Liste der History_Entry-Einträge, zu denen mit der Zurück-Aktion navigiert werden kann.
- **Vor_Stack**: Die Liste der History_Entry-Einträge, zu denen mit der Vor-Aktion navigiert werden kann (entsteht durch vorherige Zurück-Aktionen).
- **Schnellwechsler**: Der modale Dialog zum Öffnen einer Datei per Namenssuche (Befehl `switcher:open`), analog zu Obsidians Quick Switcher.
- **Aktiver_Tab**: Der Tab, dessen Inhalt aktuell im Inhaltsbereich angezeigt wird (siehe tabbed-editor-viewer-Spec).
- **Backlink**: Ein Wikilink in einem anderen Dokument, der auf das aktuell geöffnete Dokument verweist (siehe context-panel-Spec, Links_View).
- **Vault_Change_Event**: Das bestehende Echtzeit-Ereignis (`realtimeVaultBridge.ts`), das bei `saved`/`deleted`/`renamed`-Aktionen an einer Datei im Vault ausgelöst wird, unabhängig davon welche Session/welches Gerät die Änderung vorgenommen hat.
- **Mehrdeutiger_Link**: Ein Wikilink-Ziel (z. B. `[[Notiz]]`), zu dem mehr als eine Datei im Vault gleichen Dateinamens existiert.
- **Quell-Datei**: Die Datei, in der ein Wikilink vorkommt (relevant für die Auflösung mehrdeutiger Links).
- **Auto_Reveal**: Das Verhalten, bei dem der Datei-Explorer automatisch die Datei des aktiven Tabs aufklappt und markiert, ohne dass der Benutzer den Befehl „Aktuelle Datei anzeigen" manuell auslösen muss.
- **Breadcrumb_Leiste**: Die Anzeige des Ordnerpfads der aktiven Datei als Kette klickbarer Segmente.

## Requirements

### Requirement 1: Navigationsverlauf (Zurück/Vor)

**User Story:** Als Benutzer möchte ich zwischen zuletzt besuchten Dokumenten vor- und zurückspringen können, damit ich beim Verfolgen von Links nicht manuell den Weg zurückfinden muss.

#### Acceptance Criteria

1. WHEN der Benutzer zu einem Dokument navigiert (Tab-Aktivierung durch Klick, Link-Klick, Backlink-Klick, Suchergebnis, Schnellwechsler, Datei-Explorer), THE Navigationsverlauf SHALL einen History_Entry mit Vault-ID, Dateipfad und optionalem Anker an das Ende des Zurück_Stack anhängen, außer die Navigation wurde selbst durch eine Zurück- oder Vor-Aktion ausgelöst
2. WHEN der Benutzer die Zurück-Aktion auslöst (Befehl `app:go-back`, Toolbar-Button oder Tastenkombination) und der Zurück_Stack mindestens einen Eintrag enthält, THE System SHALL zum vorherigen History_Entry navigieren und den zuvor aktiven History_Entry auf den Vor_Stack legen
3. WHEN der Benutzer die Vor-Aktion auslöst (Befehl `app:go-forward`) und der Vor_Stack mindestens einen Eintrag enthält, THE System SHALL zum nächsten History_Entry im Vor_Stack navigieren und diesen vom Vor_Stack entfernen
4. IF der Zurück_Stack leer ist, THEN THE Zurück-Bedienelement SHALL als deaktiviert dargestellt werden und der Befehl `app:go-back` SHALL keine Wirkung haben
5. IF der Vor_Stack leer ist, THEN THE Vor-Bedienelement SHALL als deaktiviert dargestellt werden und der Befehl `app:go-forward` SHALL keine Wirkung haben
6. WHEN der Benutzer über eine reguläre Navigation (nicht Zurück/Vor) zu einem neuen Dokument wechselt während der Vor_Stack nicht leer ist, THE System SHALL den Vor_Stack vollständig verwerfen
7. WHEN ein History_Entry auf eine Datei verweist deren Tab inzwischen geschlossen wurde, THE Zurück/Vor-Navigation SHALL die Datei erneut in einem neuen Tab öffnen statt den Eintrag zu überspringen
8. IF eine im Navigationsverlauf referenzierte Datei inzwischen im Vault gelöscht wurde, THEN THE System SHALL beim Navigieren zu diesem Eintrag eine Fehlermeldung mit dem Dateipfad anzeigen, den Eintrag aus dem jeweiligen Stack entfernen und zum nächsten gültigen Eintrag in derselben Richtung fortfahren
9. THE Zurück_Stack und THE Vor_Stack SHALL jeweils auf maximal 50 Einträge begrenzt werden; bei Überschreitung SHALL der älteste Eintrag verworfen werden
10. THE System SHALL Standard-Tastenkombinationen für Zurück (`Alt+Links`) und Vor (`Alt+Rechts`) über den bestehenden Keybindings-Store (`keybindingsStore.ts`) bereitstellen, die der Benutzer in den Einstellungen anpassen kann
11. THE Navigationsverlauf SHALL bei einem vollständigen Neuladen der Anwendung zurückgesetzt werden (keine Persistenz über Sessions hinweg)
12. WHEN der Benutzer den Vault wechselt, THE System SHALL den Navigationsverlauf für den vorherigen Vault verwerfen

### Requirement 2: Schnellwechsler (Quick Switcher)

**User Story:** Als Benutzer möchte ich per Tastenkombination eine beliebige Datei im Vault über eine Namenssuche öffnen können, damit ich nicht durch den Dateibaum klicken muss.

#### Acceptance Criteria

1. WHEN der Benutzer die Standard-Tastenkombination (`Mod+O`) drückt oder den Befehl `switcher:open` ausführt und ein Vault ausgewählt ist, THE Schnellwechsler SHALL sich als modaler Overlay öffnen und den Fokus auf das Sucheingabefeld setzen
2. WHILE der Benutzer im Sucheingabefeld tippt, THE Schnellwechsler SHALL alle Dateien des aktuell ausgewählten Vaults per unscharfer Teilzeichenketten-Suche gegen Dateiname und relativen Pfad filtern und die Treffer nach Übereinstimmungsgüte absteigend sortiert anzeigen, begrenzt auf maximal 50 Ergebnisse
3. WHEN das Sucheingabefeld leer ist, THE Schnellwechsler SHALL die zuletzt besuchten Dateien aus dem Navigationsverlauf als Vorschlagsliste anzeigen (neueste zuerst, maximal 20 Einträge)
4. THE Schnellwechsler SHALL Tastaturnavigation unterstützen: Pfeil-Hoch/-Runter zum Wechseln der Auswahl, Enter zum Öffnen des ausgewählten Eintrags, Escape zum Schließen ohne Aktion — konsistent mit der bestehenden Befehlspalette (`CommandPalette.tsx`)
5. WHEN der Benutzer ein Ergebnis per Klick oder Enter auswählt, THE System SHALL die Datei in einem neuen Tab öffnen bzw. einen bereits offenen Tab aktivieren, den Schnellwechsler schließen und einen History_Entry gemäß Requirement 1.1 hinzufügen
6. IF der eingegebene Suchtext auf keine bestehende Datei passt, THEN THE Schnellwechsler SHALL einen zusätzlichen Eintrag „Neue Datei „<Suchtext>.md" erstellen" am Ende der Ergebnisliste anzeigen
7. WHEN der Benutzer den „Neue Datei erstellen"-Eintrag auswählt, THE System SHALL eine neue Markdown-Datei mit dem eingegebenen Namen im Vault-Root anlegen, in einem neuen Tab öffnen und den Schnellwechsler schließen
8. IF das Anlegen der neuen Datei fehlschlägt, THEN THE System SHALL eine Fehlermeldung mit dem Dateinamen und dem Fehlergrund anzeigen und den Schnellwechsler geöffnet lassen
9. THE Schnellwechsler SHALL ausschließlich Dateien des aktuell ausgewählten Vaults durchsuchen
10. IF kein Vault ausgewählt ist, THEN THE Befehl `switcher:open` SHALL keine Wirkung haben

### Requirement 3: Tab-Navigation per Tastatur

**User Story:** Als Benutzer möchte ich mit der Tastatur zwischen offenen Tabs wechseln können, damit ich nicht für jeden Wechsel die Maus benutzen muss.

#### Acceptance Criteria

1. THE System SHALL für die bestehenden Befehle `workspace:next-tab` und `workspace:previous-tab` Standard-Tastenkombinationen (`Strg+Tab` bzw. `Strg+Umschalt+Tab`) im Keybindings-Store hinterlegen, die der Benutzer in den Einstellungen anpassen kann
2. WHEN der Benutzer die Tastenkombination für „nächster Tab" drückt und mindestens zwei Tabs geöffnet sind, THE System SHALL den in der Tab-Reihenfolge nächsten Tab aktivieren, wobei nach dem letzten Tab wieder zum ersten gesprungen wird
3. WHEN der Benutzer die Tastenkombination für „vorheriger Tab" drückt, THE System SHALL den in der Tab-Reihenfolge vorherigen Tab aktivieren, wobei vom ersten Tab zum letzten gesprungen wird
4. IF ein oder kein Tab geöffnet ist, THEN THE Tastenkombinationen für Tab-Wechsel SHALL keine Wirkung haben
5. WHEN eine Tab-Aktivierung per Tastenkombination erfolgt, THE Navigationsverlauf SHALL einen History_Entry gemäß Requirement 1.1 aufzeichnen

### Requirement 4: Aktive Datei im Datei-Explorer verfolgen

**User Story:** Als Benutzer möchte ich optional, dass der Datei-Explorer automatisch zur aktiven Datei springt, damit ich meinen Standort im Vault immer sehe, ohne den bestehenden Befehl manuell auszulösen.

#### Acceptance Criteria

1. THE Einstellungen SHALL unter der Kategorie „Vault" einen Umschalter „Aktive Datei im Explorer verfolgen" bereitstellen, standardmäßig deaktiviert
2. WHILE der Umschalter aktiviert ist, THE Datei-Explorer SHALL bei jedem Wechsel des Aktiven_Tab automatisch dessen übergeordnete Ordner aufklappen und den Dateieintrag ins sichtbare Fenster scrollen — unter Wiederverwendung des bestehenden `slatebase:reveal-file`-Mechanismus (`FileExplorer.tsx`)
3. IF der Umschalter deaktiviert ist, THEN THE Datei-Explorer SHALL sein aktuelles Verhalten beibehalten (Reveal nur über den expliziten Befehl `file-explorer:reveal-active-file`)
4. WHILE der Umschalter aktiviert ist UND der Aktive_Tab kein Datei-Tab ist (z. B. Graph-Tab, Plugin-View), THE Datei-Explorer SHALL keine Aktion auslösen
5. THE Einstellung SHALL pro Benutzer persistiert werden, über denselben Mechanismus wie bestehende Vault-Einstellungen (`settingsPersistence.ts`)

### Requirement 5: Live-Aktualisierung der Backlinks

**User Story:** Als Benutzer möchte ich, dass die Backlinks-Ansicht auch dann aktuell bleibt, wenn eine andere Datei von einem anderen Tab, Gerät oder Benutzer verlinkt oder entlinkt wird, damit ich mich auf die angezeigten Rückverweise verlassen kann.

#### Acceptance Criteria

1. WHILE ein Dokument mit geöffneter Links_View im Context Panel angezeigt wird, THE System SHALL auf Vault_Change_Event des aktuell ausgewählten Vaults hören
2. WHEN ein Vault_Change_Event mit Aktion `saved` oder `renamed` für eine beliebige Datei des aktuellen Vaults eintrifft, THE Links_View SHALL die Backlinks des aktiven Dokuments innerhalb von 1000ms (debounced) neu laden
3. WHEN mehrere Vault_Change_Event kurz hintereinander eintreffen, THE Links_View SHALL die Backlinks-Neuladung debouncen, sodass innerhalb eines 1000ms-Fensters höchstens eine Anfrage ausgelöst wird
4. WHEN ein Vault_Change_Event mit Aktion `deleted` für eine Datei eintrifft, die aktuell als Backlink-Quelle in der Links_View gelistet ist, THE Links_View SHALL die Backlinks neu laden, sodass der gelöschte Eintrag entfernt wird
5. IF der Benutzer das Dokument wechselt während eine debounced Backlinks-Neuladung aussteht, THEN THE System SHALL die ausstehende Neuladung für das alte Dokument verwerfen und stattdessen die Backlinks des neuen Dokuments laden (kein verspätetes Überschreiben mit veralteten Daten)
6. THE Live-Aktualisierung SHALL nur Vault_Change_Event des Vaults berücksichtigen, dem das aktuell angezeigte Dokument angehört; Ereignisse anderer Vaults SHALL ignoriert werden
7. IF die erneute Backlinks-Anfrage fehlschlägt, THEN THE Links_View SHALL die zuvor angezeigten Backlinks beibehalten und den bestehenden Fehlerzustand (`backlinksError`) gemäß der context-panel-Spec anzeigen

### Requirement 6: Deterministische Auflösung mehrdeutiger Wikilinks

**User Story:** Als Benutzer möchte ich, dass ein Wikilink zu einem mehrdeutigen Dateinamen vorhersagbar auf die naheliegendste Datei verweist, damit Links auch in großen Vaults mit gleichnamigen Notizen in unterschiedlichen Ordnern zuverlässig funktionieren.

#### Acceptance Criteria

1. WHEN ein Wikilink-Ziel auf mehr als eine Datei im Vault passt (Mehrdeutiger_Link), THE Auflösung SHALL zunächst prüfen, ob eine der Kandidaten-Dateien im selben Ordner wie die Quell-Datei liegt, und diese bevorzugen
2. IF keine Kandidaten-Datei im selben Ordner liegt, THEN THE Auflösung SHALL die Kandidaten-Datei mit dem kürzesten Pfad (geringste Anzahl an Ordner-Ebenen) bevorzugen
3. IF nach den Kriterien aus 6.1 und 6.2 weiterhin mehrere Kandidaten gleich gut passen, THEN THE Auflösung SHALL deterministisch die Datei wählen, die in alphabetischer Sortierung des vollständigen Pfads zuerst kommt (bestehendes Verhalten als letzter Tie-Breaker)
4. THE Funktion `resolveWikilinkTarget` SHALL einen optionalen dritten Parameter `sourcePath` erhalten; WHEN `sourcePath` nicht angegeben wird, THEN THE Auflösung SHALL sich auf die Kriterien aus 6.2 und 6.3 beschränken (unverändertes Verhalten für Aufrufstellen ohne bekannten Quellkontext)
5. THE Rendering-Stellen, die Wikilinks aus Dokumentinhalt auflösen (Ansichtsmodus, Live-Preview-Editor-Dekorationen, Links_View-Vorwärtslinks), SHALL den Pfad der jeweils angezeigten bzw. bearbeiteten Datei als `sourcePath` übergeben
6. WHEN ein Wikilink-Ziel zu einem Mehrdeutigen_Link aufgelöst wird, THE gerenderte Link-Element SHALL im `title`-Attribut (Tooltip) zusätzlich zum aufgelösten Pfad die Anzahl weiterer Kandidaten anzeigen (z. B. „Löst auf zu: Ordner/Notiz.md (+2 weitere gleichnamige Dateien)")
7. THE bestehende Verhaltens-Garantie SHALL erhalten bleiben: bei genau einer passenden Datei ändert sich die Auflösung gegenüber dem bisherigen Verhalten nicht

### Requirement 7: Breadcrumb-Pfad für die aktive Datei

**User Story:** Als Benutzer möchte ich den Ordnerpfad der aktuell geöffneten Datei auf einen Blick sehen und daraus zum übergeordneten Ordner springen können, damit ich die Position der Datei im Vault verstehe, ohne den Explorer zu öffnen.

#### Acceptance Criteria

1. WHILE ein Datei-Tab aktiv ist, THE Breadcrumb_Leiste SHALL oberhalb des Inhaltsbereichs den vollständigen Ordnerpfad der Datei als Kette klickbarer Segmente anzeigen, getrennt durch ein Trennzeichen (`/`), gefolgt vom nicht-klickbaren Dateinamen als letztem Segment
2. WHEN die Datei im Vault-Root liegt (kein übergeordneter Ordner), THE Breadcrumb_Leiste SHALL nur den Vault-Namen als erstes, klickbares Segment und den Dateinamen anzeigen
3. WHEN der Benutzer ein Ordner-Segment der Breadcrumb_Leiste anklickt, THE Datei-Explorer SHALL sichtbar werden (falls eingeklappt), den entsprechenden Ordner aufklappen und ins sichtbare Fenster scrollen
4. WHEN der Benutzer das Vault-Namen-Segment anklickt, THE Datei-Explorer SHALL zur Wurzelebene des Vaults scrollen
5. WHILE der Aktive_Tab kein Datei-Tab ist (Graph-Tab, Plugin-View, Kanban/Canvas-Sonderansichten ausgenommen, sofern diese einen Dateipfad besitzen), THE Breadcrumb_Leiste SHALL ausgeblendet werden
6. WHEN der verfügbare Platz für die Breadcrumb_Leiste nicht ausreicht um alle Segmente vollständig darzustellen, THE Breadcrumb_Leiste SHALL die mittleren Segmente durch ein „…"-Segment ersetzen, das per Klick ein Dropdown mit den ausgeblendeten Zwischenordnern öffnet, während das erste (Vault) und die letzten zwei Segmente sichtbar bleiben
7. THE Breadcrumb_Leiste SHALL bei einer Datei-Umbenennung oder -Verschiebung (z. B. über Drag & Drop im Explorer) den angezeigten Pfad innerhalb von 500ms aktualisieren
