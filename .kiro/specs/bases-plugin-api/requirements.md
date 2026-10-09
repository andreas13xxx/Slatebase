# Requirements Document

## Introduction

Diese Spec löst die bewusst stehen gelassenen Bases-**Plugin-API-No-Ops** im Obsidian-Kompatibilitäts-Layer durch echte Implementierungen ab, damit *fremde* Obsidian-Plugins eigene Bases-Views beisteuern können (`Plugin.registerBasesView()`), statt dass ihre Registrierung still verpufft. Sie ist die v2-Ausbaustufe der Bases-Spec (`.kiro/specs/bases/`) und war dort ausdrücklich „Out of Scope" (siehe Bases-Spec, Abschnitt „Out of Scope").

**Abgrenzung — zwei verschiedene Dinge:**

- Die **Bases-Spec** (`bases/`) hat Slatebases *eigenes* `.base`-Rendering gebaut: Parser, Query-Engine auf dem Link-Index, Formel-Interpreter und die editierbare Tabellen-View. Das ist fertig und davon unabhängig.
- Diese Spec betrifft die **Plugin-API-Oberfläche** in `frontend/src/plugins/compat/`: die Haken, über die ein Drittanbieter-Plugin eine *eigene* Bases-Darstellung in Slatebase einklinkt (`Plugin.registerBasesView(id, registration)`, die `Value`-Typhierarchie, `BasesView`/`QueryController`/`BasesViewConfig`/`BasesEntry`/`RenderContext`). Diese Namen existieren heute nur als nicht-abstürzende No-Ops, damit Plugins beim Laden nicht crashen; ihre `factory` wird nie aufgerufen.

Der Ist-Zustand ist bewusst sicher: Ein Plugin, das `registerBasesView()` aufruft oder `class X extends BasesView` schreibt, stürzt nicht ab — es passiert nur nichts (mit `warnNoOp`-Konsolenmeldung), und der `CompatibilityAnalyzer` stuft es als „teilweise" ein. Diese Spec hebt „passiert nichts" auf „die View eines Plugins wird tatsächlich gerendert" an.

## Glossary

- **Bases_View_Registration**: Die Registrierung, die ein Plugin über `Plugin.registerBasesView(id, { factory, options? })` abgibt — ein View-Typ-Name plus eine Factory, die pro `.base`-View eine `BasesView`-Instanz erzeugt.
- **Plugin_Bases_View**: Eine konkrete `BasesView`-Instanz, die eine Plugin-Factory erzeugt hat und die ihr eigenes DOM in einen von Slatebase bereitgestellten Container rendert.
- **Query_Controller**: Die Komponente (`QueryController`), die einer `Plugin_Bases_View` ihre Zeilendaten liefert und `onDataUpdated()` auslöst, wenn sich die Daten ändern. Setzt auf die vorhandene Backend-Query-Route der Bases-Spec auf.
- **Value_Object**: Eine Instanz der `Value`-Typhierarchie (`StringValue`, `NumberValue`, `DateValue`, …), in die ein Property-Rohwert für ein Plugin verpackt wird, inklusive `renderTo()`.
- **Bases_Entry**: Eine Zeile im Ergebnis (`BasesEntry`) — eine Notiz plus ihre als `Value_Object` verpackten Spaltenwerte.

## Requirements

### Requirement 1: Plugin-registrierte Bases-Views ausführen

**User Story:** Als Nutzer möchte ich ein Obsidian-Plugin installieren können, das eine eigene Bases-View-Art mitbringt (z.B. eine Karten- oder Kalenderansicht), damit eine `.base`-Datei in dieser vom Plugin gelieferten Ansicht gerendert wird.

#### Acceptance Criteria

1. WHEN ein Plugin `Plugin.registerBasesView(id, registration)` aufruft, THE Bases_Plugin_Registry SHALL die Registrierung unter `id` speichern UND den View-Typ für die `.base`-View-Auswahl verfügbar machen (statt sie nur zu verwerfen).
2. WHEN eine `.base`-Datei eine View mit einem `type` enthält, der einer Bases_View_Registration entspricht, THE Bases_View SHALL die Factory des Plugins aufrufen, die erzeugte Plugin_Bases_View in einen bereitgestellten Container mounten und ihren Lifecycle (`load`/`onload`/`onunload`/`unload`) korrekt treiben.
3. THE Bases_View SHALL weiterhin die eingebaute Tabellen-View verwenden, wenn der View-`type` keiner Plugin-Registrierung entspricht (kein Rückschritt gegenüber der v1-Tabelle).
4. WHEN ein Plugin deaktiviert oder der Vault gewechselt wird, THE Bases_Plugin_Registry SHALL dessen Registrierungen entfernen und laufende Plugin_Bases_View-Instanzen sauber unloaden.
5. WHEN die Factory eines Plugins wirft oder die Instanz beim Rendern einen Fehler erzeugt, THE Bases_View SHALL den Fehler isolieren (ErrorBoundary / try-catch), eine lesbare Meldung zeigen und auf die eingebaute Tabellen- oder Rohquellen-View zurückfallen — nie den Tab abstürzen lassen.

### Requirement 2: QueryController mit echten Daten speisen

**User Story:** Als Plugin-Autor möchte ich, dass meine Bases-View über den `QueryController` dieselben gefilterten/sortierten Zeilen bekommt wie die eingebaute Tabelle, damit meine View echte Vault-Daten anzeigt.

#### Acceptance Criteria

1. THE Query_Controller SHALL die Zeilenmenge aus der vorhandenen Backend-Query-Route der Bases-Spec beziehen (`POST /vaults/:vaultId/bases/query` via `runBaseQuery`), nicht aus einer zweiten Datenpipeline.
2. THE Query_Controller SHALL einer Plugin_Bases_View ihre Daten als Bases_Entry-Objekte bereitstellen, deren Spaltenwerte als Value_Object verpackt sind.
3. WHEN sich der Vault-Inhalt ändert (`vault:change`), THE Query_Controller SHALL die Abfrage erneut ausführen und `onDataUpdated()` auf der Plugin_Bases_View aufrufen.
4. THE Query_Controller SHALL Formel-Spalten über den vorhandenen Formel-Interpreter (`frontend/src/bases/formula/`) auswerten und das Ergebnis als Value_Object liefern.

### Requirement 3: Value-Typhierarchie funktional machen

**User Story:** Als Plugin-Autor möchte ich die `Value`-Objekte, die mein View-Code bekommt, tatsächlich rendern und vergleichen können, damit meine View korrekt funktioniert.

#### Acceptance Criteria

1. THE Value_Object-Hierarchie SHALL für jeden Typ (`StringValue`, `NumberValue`, `BooleanValue`, `DateValue`, `ListValue`, `LinkValue`, …) `toString()`, `isTruthy()`, `equals()`/`looseEquals()` und `renderTo(el, ctx)` korrekt implementieren, statt als inerter Default zurückzugeben.
2. THE Value_Object SHALL beim `renderTo()` den typgerechten Inhalt in das Element schreiben (z.B. `LinkValue` als klickbaren internen Link, `DateValue` als formatiertes Datum), konsistent mit der eingebauten Tabellen-Darstellung.
3. THE Value_Object-Fabrik SHALL einen Property-Rohwert (die string-Liste aus dem Link-Index) in das passende Value_Object umwandeln, mit derselben Typinferenz-Logik wie die eingebaute Tabellen-Zelle (`inferCellType`), sofern kein deklarierter Property-Typ vorliegt.

### Requirement 4: Kompatibilitäts-Report und Versionsaudit nachziehen

**User Story:** Als Administrator möchte ich, dass der Plugin-Kompatibilitäts-Report den tatsächlichen Stand widerspiegelt, damit ich weiß, welche Bases-Plugins laufen.

#### Acceptance Criteria

1. WHEN die Plugin-API-Freigabe implementiert ist, THE CompatibilityAnalyzer SHALL Plugins, die ausschließlich die jetzt echten Bases-API-Teile referenzieren, nicht mehr pauschal als „teilweise" einstufen, sondern nur noch Teile, die weiterhin fehlen.
2. THE `OBSIDIAN_API_VERSION` SHALL nur dann auf die Bases-API-Version (1.10.x) angehoben werden, wenn die hier spezifizierten APIs WIRKLICH implementiert sind (Projektregel: nie als Selbstzweck anheben).
3. THE PLUGIN-COMPAT.md SHALL aktualisiert werden: der bisherige „bewusst No-Op"-Vermerk zu `registerBasesView()`/`Value` wird durch den tatsächlichen Implementierungsstand ersetzt.

### Requirement 5: Sicherheit und Isolation

**User Story:** Als Betreiber möchte ich, dass eine Plugin-gelieferte Bases-View denselben Sandbox-/Sicherheitsregeln unterliegt wie jede andere Plugin-UI.

#### Acceptance Criteria

1. THE Plugin_Bases_View SHALL im selben Sandbox-/Scope-Kontext laufen wie andere Plugin-Views (CSS-Scoping via `data-plugin-id`, Netzwerk-Allowlist, Plugin-Ausführungskontext), ohne neue, ungeschützte Eintrittspunkte.
2. THE Plugin_Bases_View SHALL Vault-Daten ausschließlich über den geprüften Query-Pfad lesen und Schreibzugriffe (falls das Plugin welche anbietet) über den bestehenden geprüften Vault-Schreibpfad leiten — kein direkter Dateizugriff.
3. THE Value_Object `renderTo()` SHALL beim Rendern von Plugin-gelieferten Werten dieselben XSS-/Sanitizing-Regeln einhalten wie der übrige untrusted-content-Renderpfad (kein ungeschütztes `innerHTML`).

## Out of Scope (auch dieser Stufe)

- Nachbau der *vollständigen* Obsidian-Formelsprache (bleibt die begrenzte Menge aus der Bases-Spec; betrifft die Value-/QueryController-Daten, nicht die View-Freigabe).
- Serverseitige Ausführung von Plugin-Bases-Views (reines Frontend wie der übrige Plugin-Compat-Layer).
- Ein eigener Marketplace-/Store-Eintrag „Bases-Views" — Installation läuft über den bestehenden Community-Plugin-Store.

## Vorbedingung

Diese Spec setzt die abgeschlossene Bases-Spec (`.kiro/specs/bases/`, Phasen 1–8) voraus: Query-Route, Query-Engine und Formel-Interpreter werden hier wiederverwendet, nicht neu gebaut.
