# Requirements Document

## Introduction

Dieses Dokument definiert die Anforderungen für die Workspace Leaf API-Kompatibilität in Slatebase. Viele populäre Obsidian-Plugins (Calendar, Kanban, Excalidraw, etc.) nutzen die Workspace Leaf API um Custom Views zu registrieren und anzuzeigen. Ohne vollständige Emulation dieser API werden solche Plugins als "partial" klassifiziert und deren Custom Views erscheinen nicht in der UI.

Ziel ist es, die Obsidian Workspace Leaf API auf Slatebase's bestehendes Tab-System (TabBar/TabContent) abzubilden, sodass Plugin-Views als Tabs im Hauptbereich oder als Panel-Sections im Context Panel gerendert werden können. Dadurch steigen viele Plugins von "partial" auf "full" Kompatibilität.

## Glossary

- **Workspace_Shim**: Die Slatebase-Emulation der Obsidian `app.workspace`-API (existiert bereits in `workspace-shim.ts`)
- **View_Registry**: Registry für Plugin-View-Typen und deren Factory-Funktionen
- **Workspace_Leaf**: Ein Slot der eine View enthält — in Obsidian ein Panel/Split, in Slatebase ein Tab oder Panel-Section
- **Item_View**: Basisklasse für Plugin-Views mit `containerEl`, `getViewType()`, `getDisplayText()`, `onOpen()`, `onClose()`
- **Tab_System**: Slatebase's bestehendes Tab-Management (TabBar + TabContent + tabReducer)
- **Context_Panel**: Das rechte Seitenpanel mit Outline, Links, Tags, Properties
- **View_Type**: Eindeutiger String-Identifier für einen Plugin-View-Typ (z.B. `"calendar"`, `"kanban-board"`)
- **Plugin_View_Tab**: Ein Tab im Hauptbereich der eine Plugin-View rendert (virtueller Pfad `__view::{viewType}`)
- **Compatibility_Analyzer**: Die bestehende Komponente die Obsidian-API-Zugriffe klassifiziert

## Requirements

### Requirement 1: View-Registrierung durch Plugins

**User Story:** Als Plugin-Entwickler möchte ich Custom Views registrieren können, damit mein Plugin eigene UI-Panels in Slatebase anzeigen kann.

#### Acceptance Criteria

1. WHEN ein Plugin `workspace.registerView(viewType, viewCreator)` aufruft mit einem nicht-leeren String als viewType (max 128 Zeichen) und einer Funktion als viewCreator, THE View_Registry SHALL den View-Typ mit seiner Factory-Funktion speichern und die Registrierung dem aufrufenden Plugin zuordnen
2. WHEN ein Plugin einen bereits registrierten View-Typ erneut registriert, THE View_Registry SHALL die bestehende Registrierung überschreiben und die Plugin-Zuordnung aktualisieren
3. WHEN ein Plugin deaktiviert wird, THE View_Registry SHALL anhand der Plugin-Zuordnung alle von diesem Plugin registrierten View-Typen identifizieren und deren Registrierungen entfernen
4. THE View_Registry SHALL eine Methode `hasViewType(viewType)` bereitstellen die `true` zurückgibt wenn der View-Typ registriert ist, und `false` wenn nicht
5. IF `workspace.registerView` mit einem leeren String als viewType oder einem nicht-aufrufbaren Wert als viewCreator aufgerufen wird, THEN THE View_Registry SHALL die Registrierung ignorieren und eine Warnung loggen

### Requirement 2: Leaf-Erstellung und View-Aktivierung

**User Story:** Als Plugin möchte ich Leaves erstellen und Views darin aktivieren, damit meine Custom Views in der Slatebase-UI erscheinen.

#### Acceptance Criteria

1. WHEN ein Plugin `workspace.getLeaf(true)` aufruft, THE Workspace_Shim SHALL ein neues Workspace_Leaf-Objekt erstellen und zurückgeben
2. WHEN ein Plugin `workspace.getLeaf(false)` oder `workspace.getLeaf()` aufruft, THE Workspace_Shim SHALL ein Leaf zurückgeben dessen aktuelle View null ist (kein aktiver Content), oder ein neues Leaf erstellen falls kein solches existiert
3. WHEN ein Plugin `leaf.setViewState({ type: viewType })` aufruft, THE Workspace_Leaf SHALL die registrierte Factory-Funktion für den View-Typ aufrufen, die View instanziieren und ein Promise zurückgeben das nach `view.onOpen()` resolved
4. WHEN `leaf.setViewState` aufgerufen wird und der View-Typ nicht in der View_Registry registriert ist, THE Workspace_Leaf SHALL eine Warnung per `console.warn` loggen und das zurückgegebene Promise resolven ohne eine View zu erstellen
5. WHEN eine View erfolgreich instanziiert wird, THE Workspace_Leaf SHALL `view.onOpen()` aufrufen bevor das Promise von `setViewState` resolved
6. WHEN ein Leaf bereits eine View enthält und `setViewState` erneut aufgerufen wird, THE Workspace_Leaf SHALL zuerst `view.onClose()` auf der alten View aufrufen und das `containerEl` aus dem DOM entfernen bevor die neue View instanziiert wird

### Requirement 3: Plugin-Views als Tabs im Hauptbereich

**User Story:** Als Benutzer möchte ich Plugin-Views als Tabs sehen, damit ich sie wie normale Dateien im Hauptbereich öffnen, wechseln und schließen kann.

#### Acceptance Criteria

1. WHEN eine Plugin-View aktiviert wird und das zugehörige Leaf über `workspace.getLeaf()` erstellt wurde (nicht über `getRightLeaf`/`getLeftLeaf`), THE Tab_System SHALL einen neuen Tab mit dem virtuellen Pfad `__view::{viewType}` öffnen
2. WHEN ein Plugin-View-Tab geöffnet wird, THE Tab_System SHALL den Rückgabewert von `view.getDisplayText()` als Tab-Label verwenden und das Label bei jedem Tab-Aktivierungswechsel aktualisieren
3. IF `view.getIcon()` einen nicht-leeren String zurückgibt, THEN THE Tab_System SHALL diesen als Tab-Icon verwenden; IF `view.getIcon()` einen leeren String oder null zurückgibt, THEN THE Tab_System SHALL kein Icon anzeigen
4. WHEN ein Plugin-View-Tab aktiv ist, THE Tab_System SHALL das `containerEl` der Item_View als direktes Kind-Element in den Content-Bereich des Tabs einhängen (DOM appendChild)
5. WHEN ein Plugin-View-Tab geschlossen wird, THE Tab_System SHALL `view.onClose()` aufrufen, das `containerEl` aus dem DOM entfernen und die Leaf-Referenz aus der Workspace_Shim-internen Leaf-Liste entfernen
6. WHEN ein Plugin-View-Tab bereits existiert (gleicher virtueller Pfad `__view::{viewType}`) und erneut geöffnet wird, THE Tab_System SHALL den existierenden Tab aktivieren anstatt einen neuen zu erstellen
7. WHEN ein Plugin-View-Tab aktiv ist, THE Workspace_Shim SHALL `getActiveFile()` mit null zurückgeben und kein `file-open` Event emittieren

### Requirement 4: Plugin-Views im Context Panel (Sidebar)

**User Story:** Als Benutzer möchte ich leichtgewichtige Plugin-Views (z.B. Calendar-Sidebar) im rechten Panel sehen, damit sie permanent sichtbar sind ohne einen Haupttab zu belegen.

#### Acceptance Criteria

1. WHEN ein Plugin `workspace.getRightLeaf()` aufruft, THE Workspace_Shim SHALL ein Leaf mit der internen Markierung `location: 'right-sidebar'` erstellen und zurückgeben
2. WHEN ein Plugin `workspace.getLeftLeaf()` aufruft, THE Workspace_Shim SHALL ein Leaf mit der internen Markierung `location: 'right-sidebar'` erstellen und zurückgeben (Slatebase hat kein separates linkes Plugin-Panel — beide werden im Context_Panel gerendert)
3. WHEN eine Sidebar-View via `leaf.setViewState()` aktiviert wird, THE Context_Panel SHALL eine neue Section mit dem `containerEl` der View als Inhalt hinzufügen
4. THE Context_Panel SHALL den Rückgabewert von `view.getDisplayText()` als Section-Tab-Label und den Rückgabewert von `view.getIcon()` als Section-Icon verwenden
5. WHEN die Sidebar-View geschlossen wird (via `detachLeavesOfType` oder Plugin-Deaktivierung), THE Context_Panel SHALL die Section entfernen, das `containerEl` aus dem DOM entfernen und `view.onClose()` aufrufen

### Requirement 5: Leaf-Abfrage und -Iteration

**User Story:** Als Plugin möchte ich existierende Leaves abfragen können, damit ich prüfen kann ob meine View bereits geöffnet ist und darauf reagieren kann.

#### Acceptance Criteria

1. WHEN ein Plugin `workspace.getLeavesOfType(viewType)` aufruft, THE Workspace_Shim SHALL ein Array aller Leaves zurückgeben deren View `getViewType()` den angegebenen viewType-String zurückgibt
2. WHEN keine Leaves des angegebenen Typs existieren, THE Workspace_Shim SHALL ein leeres Array zurückgeben
3. WHEN ein Plugin `workspace.getActiveViewOfType(ViewClass)` aufruft, THE Workspace_Shim SHALL prüfen ob das aktive Leaf eine View enthält die eine Instanz von ViewClass ist (via `instanceof`-Check), und diese View zurückgeben falls ja, sonst null
4. WHEN ein Plugin `workspace.getActiveLeaf()` aufruft und ein Tab aktiv ist, THE Workspace_Shim SHALL das Leaf des aktuell aktiven Tabs zurückgeben
5. IF kein Tab aktiv ist, THEN THE Workspace_Shim SHALL bei `getActiveLeaf()` null zurückgeben
6. WHEN ein Plugin `workspace.iterateAllLeaves(callback)` aufruft, THE Workspace_Shim SHALL den Callback synchron für jedes aktive Leaf aufrufen (Hauptbereich und Sidebar)
7. WHEN ein Plugin `workspace.iterateRootLeaves(callback)` aufruft, THE Workspace_Shim SHALL den Callback synchron nur für Leaves aufrufen die im Hauptbereich (Tab_System) liegen, nicht für Leaves die über `getRightLeaf()` oder `getLeftLeaf()` im Context_Panel erstellt wurden
8. IF ein Callback innerhalb von `iterateAllLeaves` oder `iterateRootLeaves` eine Exception wirft, THEN THE Workspace_Shim SHALL die Exception loggen und die Iteration mit dem nächsten Leaf fortsetzen

### Requirement 6: Leaf-Management (Reveal, Detach, Set Active)

**User Story:** Als Plugin möchte ich Leaves fokussieren und schließen können, damit ich die Navigation zu meinen Views steuern und Ressourcen bereinigen kann.

#### Acceptance Criteria

1. WHEN ein Plugin `workspace.revealLeaf(leaf)` aufruft und das Leaf im Hauptbereich liegt, THE Workspace_Shim SHALL den zugehörigen Tab aktivieren
2. WHEN ein Plugin `workspace.revealLeaf(leaf)` aufruft und das Leaf im Context_Panel liegt, THE Workspace_Shim SHALL die zugehörige Section im Context_Panel sichtbar machen (Tab aktivieren)
3. WHEN ein Plugin `workspace.detachLeavesOfType(viewType)` aufruft, THE Workspace_Shim SHALL alle Leaves mit dem angegebenen View-Typ (sowohl Hauptbereich als auch Sidebar) schließen und deren Tabs/Sections entfernen
4. WHEN `detachLeavesOfType` aufgerufen wird, THE Workspace_Shim SHALL für jede geschlossene View `view.onClose()` aufrufen bevor das Leaf aus der internen Liste entfernt wird
5. WHEN ein Plugin `workspace.setActiveLeaf(leaf)` aufruft und das Leaf in der internen Leaf-Liste existiert, THE Workspace_Shim SHALL den zugehörigen Tab als aktiven Tab setzen
6. IF `workspace.setActiveLeaf(leaf)` mit einem Leaf aufgerufen wird das nicht in der internen Liste existiert, THEN THE Workspace_Shim SHALL eine Warnung loggen und keine Aktion ausführen
7. WHEN ein Plugin `workspace.getUnpinnedLeaf()` aufruft, THE Workspace_Shim SHALL ein neues Leaf erstellen und zurückgeben (Slatebase hat kein Pinning-Konzept)

### Requirement 7: Split-Leaf-Erstellung (vereinfacht)

**User Story:** Als Plugin möchte ich `createLeafBySplit` und `splitActiveLeaf` aufrufen können, ohne dass die Anwendung abstürzt, auch wenn Slatebase kein echtes Split-Pane-System hat.

#### Acceptance Criteria

1. WHEN ein Plugin `workspace.createLeafBySplit(leaf)` aufruft, THE Workspace_Shim SHALL ein neues Leaf erstellen und zurückgeben (ohne tatsächlichen Split — als neuer Tab im Hauptbereich)
2. WHEN ein Plugin `workspace.splitActiveLeaf()` aufruft, THE Workspace_Shim SHALL ein neues Leaf erstellen und zurückgeben
3. THE Workspace_Shim SHALL bei Split-Aufrufen keine Fehlermeldung werfen sondern graceful als neuen Tab behandeln
4. THE Workspace_Shim SHALL bei jedem Split-Aufruf einmalig eine `console.info`-Nachricht ausgeben die darauf hinweist dass Slatebase kein Split-Pane-System hat und ein neuer Tab erstellt wurde

### Requirement 8: Link-Öffnung in Leaves

**User Story:** Als Plugin möchte ich `workspace.openLinkText` aufrufen können um Markdown-Links in einem Leaf zu öffnen, damit ich die Standard-Navigation nutzen kann.

#### Acceptance Criteria

1. WHEN ein Plugin `workspace.openLinkText(linkText, sourcePath)` aufruft, THE Workspace_Shim SHALL den Ziel-Dateipfad mittels des bestehenden link-resolver auflösen (case-insensitive Suche, `.md`-Extension-Fallback)
2. WHEN der aufgelöste Pfad eine existierende Datei ist, THE Tab_System SHALL den regulären Datei-Tab-Öffnungs-Workflow verwenden (OPEN_TAB Action)
3. IF der Linktext nicht aufgelöst werden kann (kein Treffer im Vault), THEN THE Workspace_Shim SHALL eine Warnung per `console.warn` loggen und keine Aktion ausführen
4. WHEN `openLinkText` mit einem leeren String als linkText aufgerufen wird, THE Workspace_Shim SHALL keine Aktion ausführen

### Requirement 9: Item_View-Basisklasse

**User Story:** Als Plugin-Entwickler möchte ich eine ItemView-Basisklasse instanziieren können die mir `containerEl`, `contentEl` und Lifecycle-Methoden bereitstellt.

#### Acceptance Criteria

1. THE Item_View SHALL bei Konstruktion ein `containerEl` (div-Element mit CSS-Klasse `view-content`) und ein `contentEl` (Kind-div des containerEl) erstellen
2. THE Item_View SHALL eine Referenz auf `this.app` bereitstellen (die AppShim-Instanz des Plugins, bezogen aus dem Leaf)
3. THE Item_View SHALL die Methoden `getViewType(): string`, `getDisplayText(): string`, `getIcon(): string`, `onOpen(): Promise<void>`, `onClose(): Promise<void>` als überschreibbare Methoden mit Default-Implementierung (leerer String / leeres Promise) bereitstellen
4. THE Item_View SHALL eine `leaf`-Property bereitstellen die auf das enthaltende Workspace_Leaf verweist
5. THE Item_View SHALL eine `addAction(icon, title, callback)`-Methode bereitstellen die Action-Buttons im View-Header registriert (als DOM-Elemente im containerEl)

### Requirement 10: Compatibility-Analyzer-Update

**User Story:** Als System möchte ich die Leaf-API-Methoden als "supported" klassifizieren, damit Plugins die diese API nutzen als "full" statt "partial" eingestuft werden.

#### Acceptance Criteria

1. WHEN der Compatibility_Analyzer einen Plugin-Bundle analysiert, THE Compatibility_Analyzer SHALL die Methoden `workspace.getLeaf`, `workspace.getLeavesOfType`, `workspace.getActiveViewOfType`, `workspace.revealLeaf`, `workspace.detachLeavesOfType`, `workspace.getActiveLeaf`, `workspace.setActiveLeaf`, `workspace.createLeafBySplit`, `workspace.getRightLeaf`, `workspace.getLeftLeaf`, `workspace.splitActiveLeaf`, `workspace.openLinkText`, `workspace.getUnpinnedLeaf`, `workspace.iterateAllLeaves`, `workspace.iterateRootLeaves` als "supported" klassifizieren
2. WHEN ein Plugin ausschließlich Leaf-API-Methoden und andere Methoden aus der SUPPORTED_METHODS-Menge verwendet (keine Methoden aus PARTIAL_METHODS oder UNSUPPORTED_METHODS), THE Compatibility_Analyzer SHALL das Kompatibilitäts-Level als "full" berechnen
3. WHEN die Leaf-API-Methoden in die SUPPORTED_METHODS-Menge verschoben werden, THE Compatibility_Analyzer SHALL diese Methoden aus der UNSUPPORTED_METHODS-Menge entfernen

### Requirement 11: Workspace-Events für Leaf-Änderungen

**User Story:** Als Plugin möchte ich auf Leaf-Änderungen reagieren können, damit ich meinen State aktualisieren kann wenn der Benutzer Tabs wechselt.

#### Acceptance Criteria

1. WHEN der aktive Tab wechselt (Datei-Tab oder Plugin-View-Tab), THE Workspace_Shim SHALL das Event `active-leaf-change` mit dem neuen aktiven Workspace_Leaf als Argument emittieren
2. WHEN ein neuer Plugin-View-Tab geöffnet wird, THE Workspace_Shim SHALL das Event `layout-change` ohne Argumente emittieren
3. WHEN ein Plugin-View-Tab geschlossen wird, THE Workspace_Shim SHALL das Event `layout-change` ohne Argumente emittieren
4. WHEN kein Tab aktiv ist (alle Tabs geschlossen), THE Workspace_Shim SHALL das Event `active-leaf-change` mit null als Argument emittieren

### Requirement 12: Rückwärtskompatibilität

**User Story:** Als bestehendes Plugin möchte ich die bisherige WorkspaceShim-Funktionalität (getActiveFile, file-open Events) unverändert nutzen können.

#### Acceptance Criteria

1. THE Workspace_Shim SHALL weiterhin `getActiveFile()` mit dem aktuell geöffneten TFile oder null zurückgeben
2. WHEN eine Markdown-Datei im Tab aktiviert wird, THE Workspace_Shim SHALL das `file-open` Event mit dem zugehörigen TFile emittieren
3. THE Workspace_Shim SHALL weiterhin den ES6-Proxy für nicht-emulierte Properties bereitstellen (einmalige console.warn pro Property, No-Op-Rückgabe)
4. WHEN ein Plugin-View-Tab aktiv ist (kein File-Tab), THE Workspace_Shim SHALL `getActiveFile()` mit null zurückgeben
5. WHEN ein Nicht-Markdown-Datei-Tab aktiviert wird, THE Workspace_Shim SHALL `getActiveFile()` mit dem TFile zurückgeben aber kein `file-open` Event emittieren

### Requirement 13: View-Lifecycle und Cleanup

**User Story:** Als System möchte ich sicherstellen dass Plugin-Views korrekt bereinigt werden, damit keine Memory-Leaks oder verwaisten DOM-Elemente entstehen.

#### Acceptance Criteria

1. WHEN ein Plugin deaktiviert wird, THE View_Registry SHALL alle Leaves dieses Plugins detachen, `onClose()` auf jeder View aufrufen und die zugehörigen Tabs entfernen
2. WHEN ein Vault-Wechsel stattfindet, THE View_Registry SHALL alle Plugin-View-Tabs schließen, `onClose()` auf jeder View aufrufen und deren `containerEl` aus dem DOM entfernen
3. IF `view.onOpen()` eine Exception wirft, THEN THE Workspace_Leaf SHALL den Fehler per console.error loggen und die View trotzdem im Leaf behalten (graceful degradation)
4. IF `view.onClose()` eine Exception wirft, THEN THE Workspace_Leaf SHALL den Fehler per console.error loggen und das Leaf trotzdem entfernen sowie das DOM-Element bereinigen
