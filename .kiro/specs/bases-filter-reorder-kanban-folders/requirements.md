# Requirements Document

## Introduction

Obsidian 1.14/1.15 erweitert Bases um: Filter per Drag-and-drop sortieren (mit Menü zum Verschieben zwischen „Alle Ansichten“ und „Diese Ansicht“), Kanban-Karten zwischen Ordner-Spalten verschieben (Gruppierung nach `file.folder`) inklusive neuer Notizen im Ordner der Spalte, Hinweis bei durch ein Limit verdeckten Treffern („10 von 40“) und den Standardnamen „View“ für die erste Ansicht einer neuen Base.

Stand Slatebase: `BasesFilterEditor.tsx` (201 Zeilen) bearbeitet Bedingungen und Gruppen, hat aber keine Umsortierung. `BasesKanbanView.tsx` verschiebt Karten per `onMoveCard(path, groupByProperty, newValue)` und schreibt dabei eine Eigenschaft.

## Glossary

- **Filter_Editor**: `frontend/src/components/bases/BasesFilterEditor.tsx`.
- **Doc_Filter**: Filter in `doc.filters` (gilt für alle Ansichten).
- **View_Filter**: Filter in `view.filters` (nur für eine Ansicht).
- **Folder_Column**: Kanban-Spalte, wenn nach `file.folder` gruppiert wird; der Spaltenschlüssel ist der Ordnerpfad.

## Requirements

### Requirement 1: Filter umsortieren

**User Story:** Als Nutzer möchte ich Filterbedingungen per Ziehen in eine andere Reihenfolge bringen.

#### Acceptance Criteria

1. THE Filter_Editor SHALL Bedingungen und Untergruppen innerhalb derselben Gruppe per Drag-and-drop umsortieren können; die Reihenfolge SHALL in der `.base`-Datei erhalten bleiben.
2. THE Filter_Editor SHALL für jede Zeile Griff-Symbol und Tastatur-/Menü-Alternative („Nach oben“, „Nach unten“) anbieten, damit die Funktion auch ohne Maus und auf Touch-Geräten nutzbar ist.
3. WHILE der Nutzer zieht, SHALL die Einfügeposition visuell markiert werden; beim Loslassen SHALL die Zeile an die neue Stelle animiert werden (nicht bei `prefers-reduced-motion`).
4. WHEN die Base schreibgeschützt ist (`disabled`), SHALL kein Umsortieren möglich sein.
5. THE Umsortieren SHALL die Semantik von `and`/`or`/`not` nicht verändern und keine Bedingungen duplizieren oder verlieren.

### Requirement 2: Filter zwischen Ebenen verschieben

#### Acceptance Criteria

1. THE Zeilenmenü SHALL „Zu allen Ansichten verschieben“ (View_Filter → Doc_Filter) und „Zu dieser Ansicht verschieben“ (Doc_Filter → View_Filter) anbieten, falls beide Ebenen im Editor angezeigt werden.
2. WHEN ein Filter verschoben wird, SHALL er am Ende der Ziel-Wurzelgruppe eingefügt und aus der Quelle entfernt werden; ein dabei leer werdender Wurzelknoten SHALL entfernt werden.
3. IF die Ziel-Ebene noch keinen Filter hat, THEN SHALL eine Wurzelgruppe `and` angelegt werden.

### Requirement 3: Kanban nach Ordner

#### Acceptance Criteria

1. WHEN die Kanban-Ansicht nach `file.folder` gruppiert ist und der Nutzer eine Karte in eine andere Spalte zieht, SHALL die Notiz in den Ordner der Spalte verschoben werden (Vault-Verschiebung statt Eigenschaft), unter Aktualisierung der Links wie bei einem normalen Verschieben.
2. IF das Verschieben fehlschlägt (Namenskonflikt, Berechtigung, Fehler), THEN SHALL die Karte in der Quellspalte bleiben und eine Fehlermeldung angezeigt werden.
3. WHEN der Nutzer in einer Folder_Column eine neue Notiz anlegt, SHALL sie im Ordner der Spalte erstellt werden.
4. THE Wurzelordner SHALL als eigene Spalte mit lesbarem Namen (z. B. „(Wurzel)“) dargestellt werden.
5. THE bisherige Eigenschaften-basierte Gruppierung SHALL unverändert funktionieren.

### Requirement 4: Limit-Hinweis

#### Acceptance Criteria

1. WHERE eine Ansicht ein Ergebnis-Limit (`limit`) hat und mehr Treffer existieren, SHALL die Bases-Suche/Toolbar „N von M angezeigt“ anzeigen.
2. IF kein Limit greift, THEN SHALL kein Hinweis erscheinen.

### Requirement 5: Standardname „View“

#### Acceptance Criteria

1. WHEN eine neue Base angelegt wird, SHALL die erste Ansicht „View“ heißen (sofern der aktuelle Standardname abweicht; sonst keine Änderung).

## Non-Goals

- RTL-Unterstützung der Tabelle, Gruppieren-Menü-Erweiterungen, Kanban-„Spalte ausblenden“ (eigene Specs, falls gewünscht).
- Native HTML5-Drag-and-drop als einziger Weg auf Touch-Geräten (bekanntes Konfliktthema mit Long-Press, siehe PR #346).
