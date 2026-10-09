# Requirements Document

## Introduction

Bases sind Obsidians Datenbank-/Tabellenansicht über die Properties-/Metadaten-Schicht eines Vaults: eine `.base`-Datei beschreibt deklarativ Filter, berechnete Spalten (Formeln) und eine oder mehrere Ansichten (zuerst Tabelle, später Karten/Board) über eine Menge von Notizen. Slatebase hat die Grundlage dafür bereits — die Property-Type-Registry, den Frontmatter-Editor, den `property:`-Suchoperator und die inverse Property-Value-Index-Schicht im `link-index`-Modul — aber keine Query-/View-Ebene darüber. Dieses Feature liefert sie: Lesen und Schreiben des Obsidian-kompatiblen `.base`-Formats, eine Query-Engine auf der vorhandenen Metadaten-Schicht und eine editierbare Tabellenansicht, die sich wie ein Datei-Tab öffnet.

Die Obsidian-API-Typen für Bases sind in `frontend/src/plugins/compat/` bereits als bewusste No-Ops registriert (`BasesView`, `QueryController`, die `Value`-Typhierarchie, `Plugin.registerBasesView()`) und vom `CompatibilityAnalyzer` als `partial` markiert. Dieses Feature löst diese No-Ops durch echte Implementierungen ab; der Kompat-Pfad für fremde Plugins ist ausdrücklich **nicht** Teil der ersten Version (siehe Out of Scope).

Dies ist Prio 6 / Track H der Roadmap (`.kiro/specs/implementation-plan.md`), Scope ~55–75h. Das Scope-Risiko liegt bei den Formeln; die erste Version beschränkt sich bewusst auf einfache Ausdrücke.

## Glossary

- **Base**: Eine `.base`-Datei — ein YAML-Dokument, das Filter, Formeln und Views über eine Notizmenge deklariert. Liegt als normale, sichtbare Datei im Vault.
- **Base_Source**: Die Menge der Notizen, über die eine Base operiert — der gesamte Vault oder ein per Ordner/Tag/Pfad eingeschränkter Ausschnitt, bevor Filter greifen.
- **Base_Filter**: Eine deklarative Bedingung über Properties, Tags, Datei-Metadaten oder Pfad, die eine Notiz ein- oder ausschließt. Filter sind UND-/ODER-verschachtelbar.
- **Base_Formula**: Eine berechnete Spalte: ein Ausdruck über die Properties/Metadaten einer Zeile, der zur Anzeigezeit ausgewertet wird (nie in die Notiz zurückgeschrieben).
- **Base_View**: Eine benannte Ansicht innerhalb einer Base (Typ, sichtbare Spalten, Sortierung, Spaltenbreiten). Eine Base hat mindestens eine View.
- **Base_Table_View**: Die Tabellen-View — Zeilen sind Notizen, Spalten sind Properties/Formeln; Property-Zellen sind editierbar und schreiben in die Frontmatter der jeweiligen Notiz.
- **Query_Engine**: Die Komponente, die aus Base_Source + Base_Filter + Sortierung die geordnete Zeilenmenge erzeugt, gespeist aus der vorhandenen `link-index`-Metadaten-Schicht.
- **Formula_Evaluator**: Die Komponente, die eine Base_Formula pro Zeile zu einem anzeigbaren Wert auswertet.

## Requirements

### Requirement 1: `.base`-Dateiformat lesen und schreiben

**User Story:** Als Nutzer möchte ich `.base`-Dateien in meinem Vault anlegen und bearbeiten, damit aus Obsidian importierte Vaults ihre Bases behalten und ich neue erstellen kann.

#### Acceptance Criteria

1. THE Bases_Parser SHALL das Obsidian-kompatible `.base`-YAML-Format lesen: `filters`, `formulas`, `properties` (Anzeigenamen/Spalten-Metadaten) und `views` (Liste benannter Ansichten mit Typ, sichtbaren Spalten, Sortierung).
2. THE Bases_Parser SHALL unbekannte Felder beim Parsen erhalten (Passthrough) und beim Serialisieren zurückschreiben, damit ein Round-Trip neuere Obsidian-Felder nicht verliert (gleiches Prinzip wie der Canvas-Parser).
3. WHEN eine `.base`-Datei ungültiges YAML oder ein nicht interpretierbares Schema enthält, THE Bases_View SHALL eine lesbare Fehlermeldung anzeigen und die Rohquelle zugänglich halten (nicht still eine leere Tabelle zeigen).
4. THE Bases_Store SHALL `.base`-Dateien über den bestehenden Vault-Schreibpfad (`IVaultService.saveFile`) atomar speichern, inklusive Versionierung/Trash wie bei jeder anderen Datei.
5. THE File_Explorer SHALL `.base`-Dateien als normale, sichtbare Vault-Dateien mit eigenem Icon behandeln (nicht dot-/underscore-versteckt).

### Requirement 2: Query-Engine auf der vorhandenen Metadaten-Schicht

**User Story:** Als Nutzer möchte ich eine Base nach Properties, Tags und Pfad filtern und sortieren, damit ich genau die Notizen sehe, die mich interessieren.

#### Acceptance Criteria

1. THE Query_Engine SHALL ihre Kandidatenmenge aus der vorhandenen `link-index`-Metadaten-Schicht beziehen (Properties, Tags, Pfade) und KEINE neue Festplatten-Scan-Pipeline einführen.
2. THE Query_Engine SHALL Filter über Property-Werte (Gleichheit, Ungleichheit, enthält, existiert/leer, numerische und Datums-Vergleiche), über Tags (hat/hat-nicht), über den Pfad (`path:`-Glob wie im Suchmodul) und über Datei-Metadaten (Name, Erstellungs-/Änderungsdatum) unterstützen.
3. THE Query_Engine SHALL Filter per UND/ODER verschachteln können, mindestens eine Verschachtelungsebene.
4. THE Query_Engine SHALL nach einer oder mehreren Spalten (Property oder Formel) auf- oder absteigend sortieren, mit einer stabilen, deterministischen Reihenfolge bei Gleichstand.
5. THE Query_Engine SHALL ausschließlich sichtbare Notizen berücksichtigen (dot-/underscore-Regeln des Vaults), konsistent mit Suche und Graph.
6. WHEN sich der Vault-Inhalt ändert (Speichern/Löschen/Umbenennen, auch per Realtime-`vault:change`), THE Bases_View SHALL ihre Zeilenmenge aktualisieren, ohne dass der Nutzer die Base neu öffnen muss.

### Requirement 3: Formeln (einfache Ausdrücke)

**User Story:** Als Nutzer möchte ich berechnete Spalten definieren (z.B. Tage bis zur Deadline, zusammengesetzte Beschriftung), damit meine Base mehr zeigt als die rohen Property-Werte.

#### Acceptance Criteria

1. THE Formula_Evaluator SHALL Property-Referenzen, String-Literale, Zahl-Literale, Boolean-Literale, Vergleichsoperatoren (`==`, `!=`, `<`, `<=`, `>`, `>=`), Basis-Arithmetik (`+`, `-`, `*`, `/`) und String-Verkettung unterstützen.
2. THE Formula_Evaluator SHALL eine überschaubare, dokumentierte Menge an Hilfsfunktionen bereitstellen (mindestens: `if`, `concat`, `now`/`today`, einfache Datumsdifferenz, `length`); die vollständige Obsidian-Formelsprache ist ausdrücklich NICHT Ziel der ersten Version.
3. THE Formula_Evaluator SHALL Formeln rein lesend auswerten und das Ergebnis NIE in die Frontmatter einer Notiz zurückschreiben.
4. WHEN eine Formel einen Fehler wirft, auf eine fehlende Property verweist oder durch Null teilt, THE Formula_Evaluator SHALL einen klar erkennbaren Fehler-/Leerwert in der Zelle anzeigen, nie den Tab abstürzen lassen.
5. THE Formula_Evaluator SHALL einen Ausdruck ohne `eval()`/`new Function()` auswerten (eigener kleiner Parser + Interpreter), passend zur CSP des Projekts (kein `unsafe-eval`).

### Requirement 4: Editierbare Tabellen-View

**User Story:** Als Nutzer möchte ich eine Base als Tabelle öffnen und Property-Zellen direkt bearbeiten, damit ich meine Notiz-Metadaten pflegen kann, ohne jede Datei einzeln zu öffnen.

#### Acceptance Criteria

1. THE Bases_Table_View SHALL eine Base als Tabelle rendern: eine Zeile pro Notiz, eine Spalte pro konfigurierter Property/Formel, mit der ersten Spalte als Link zur Notiz.
2. THE Bases_Table_View SHALL Property-Zellen inline editierbar machen, typisiert über dieselben Controls wie der Properties-Editor (Text, Zahl, Datum/Datetime, Checkbox, Liste/Tags), und eine Änderung in die Frontmatter der jeweiligen Notiz schreiben (`IVaultService.saveFile`, gleicher Pfad wie der Properties-Editor).
3. THE Bases_Table_View SHALL Formel-Spalten als schreibgeschützt darstellen (keine Edit-Affordanz).
4. THE Bases_Table_View SHALL Spalten per Klick sortierbar machen und die gewählte Sortierung in die `.base`-Datei zurückschreiben.
5. THE Bases_Table_View SHALL einen Zell-Edit, der beim Rebuild/Tab-Wechsel/Unmount noch offen ist, committen statt zu verwerfen (gleiche `useCommitOnUnmount`-Semantik wie der Properties-Editor).
6. WHEN eine Zell-Bearbeitung fehlschlägt (Schreibkonflikt, Netzwerk), THE Bases_Table_View SHALL den Fehler sichtbar machen und den vorigen Zellwert wiederherstellen.

### Requirement 5: Integration ins Tab-/Dateisystem

**User Story:** Als Nutzer möchte ich eine Base wie jede andere Datei öffnen, damit sie sich natürlich in meinen Workflow einfügt.

#### Acceptance Criteria

1. WHEN eine `.base`-Datei aus dem File-Explorer, einem Wikilink oder dem Quick Switcher geöffnet wird, THE Tab_System SHALL die Bases_Table_View im Datei-Tab rendern (nicht den Markdown-Editor).
2. THE Command_Palette SHALL einen Befehl zum Erstellen einer neuen leeren Base im aktuellen Ordner anbieten (German label).
3. THE Bases_View SHALL einen Rohquellen-Modus anbieten (YAML der `.base`-Datei direkt bearbeiten), analog zum Canvas-Source-View, als Rückfallebene und für Felder, die die UI nicht abbildet.
4. THE Link_Index SHALL beim Löschen/Verschieben/Umbenennen von Notizen keine inkonsistente Base erzeugen — die Query-Engine liest live aus dem Index, hält also keinen eigenen veralteten Zustand.

### Requirement 6: Feature-Toggle und Welcome-Vault-Dokumentation

**User Story:** Als Administrator möchte ich Bases ein-/ausschalten können, und als neuer Nutzer möchte ich im Tutorial-Vault erfahren, was Bases sind.

#### Acceptance Criteria

1. THE Feature_Registry SHALL ein Feature-Toggle `bases` registrieren (kalt, default aus, admin-schaltbar), analog zu `git-sync`/`mail-import`.
2. WHEN das `bases`-Toggle aus ist, THE Bases_View SHALL nicht als Datei-View aktiv sein und der Erstell-Befehl SHALL nicht erscheinen; vorhandene `.base`-Dateien bleiben als normale Dateien sichtbar.
3. THE Welcome_Vault (DE und EN) SHALL eine Feature-Anleitung „Bases" (DE) / „Bases" (EN) enthalten, strukturiert wie die übrigen Feature-Guides (Kurzbeschreibung, Schritt-für-Schritt, Beispiel, Tipps, Übung, verwandte Features), mit einer funktionsfähigen Beispiel-`.base`-Datei und Beispielnotizen, auf die sie sich bezieht.
4. THE Welcome_Vault Features-Übersicht (DE: `Features/Übersicht.md`, EN: `Features/Overview.md`) SHALL die neue Bases-Anleitung in der Liste „Weitere Features" / „More Features" verlinken.
5. THE Welcome_Vault `_meta.md` (DE und EN) SHALL in Version und `updated`-Datum angehoben werden, wenn der Bases-Guide hinzugefügt wird.

## Out of Scope (erste Version)

- Karten-/Board-/Kanban-ähnliche Base-Views — nur Tabelle zuerst (Roadmap-Ausbaustufe).
- Vollständige Obsidian-Formelsprache (alle eingebauten Funktionen, Lambda-/Map-Operationen).
- Freigabe der Bases-Query-Engine an fremde Obsidian-Plugins über `registerBasesView()` — die Compat-No-Ops bleiben zunächst bestehen; ihre Ablösung ist als eigene Spec geplant: `.kiro/specs/bases-plugin-api/`.
- Bases in eigenen Split-Panes (hängt an Prio 5 „Workspaces & Split-Panes"; bis dahin öffnen Bases als normale Tabs).
- Serverseitige Bases-Auswertung über die MCP-Schnittstelle.
