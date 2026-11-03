# Bases — Toolbar, Tabellenoptik, Quelltext-Editor

Stand 2026-11-03. Auslöser: Nutzerfeedback beim Öffnen der Beispiel-Bases in Obsidian und Slatebase.

## Anforderungen

### T1 Obsidian-Kompatibilität (umgesetzt, Commit d0de7d6)
- `(a - b).days` (auch `.hours/.minutes/.seconds/.milliseconds`) auf Datumsdifferenzen; `days()` war ein Slatebase-Zusatz und in Obsidian unbekannt → Fehler „Funktion days wurde nicht gefunden".
- `sort` im Obsidian-Format `{ property, direction: ASC|DESC }` lesen UND schreiben (`column` bleibt lesbar).
- Beispiel-Bases: Summary-Schlüssel `formula.days_left`, `Filled` statt `Count` (Obsidian kennt `Count` nicht).

### T2 Tabellenoptik wie Obsidian
- Gitter aus Haarlinien um jede Zelle, ruhige Kopfzeile, einheitliche Zeilenhöhe, Hover je Zeile, einzeilige Zellen mit Ellipse.
- Formeln der Tabelle nutzen denselben Kontext wie Filter (`formula.x`, `file.*`).

### T3 Toolbar
- R3.1 Ansichten: auswählen, neu anlegen (Name + Typ), umbenennen, duplizieren, Typ ändern, löschen (mind. eine bleibt).
- R3.2 Sortierung: mehrere Klauseln (Eigenschaft + Richtung), hinzufügen/entfernen/umordnen.
- R3.3 Gruppierung: Eigenschaft + Richtung oder keine.
- R3.4 Eigenschaften: sichtbare Spalten an-/abwählen, Reihenfolge ändern, eigene Eigenschaft hinzufügen.
- R3.5 Filter: „Diese Ansicht" / „Alle Ansichten"; verschachtelte und/oder/nicht-Gruppen; Bedingung als Baukasten
  (Eigenschaft, Operator, Wert) oder als freier Ausdruck, wenn sie sich nicht zerlegen lässt.
- R3.6 Alle Änderungen schreiben ins `.base`-File (`serializeBase`); bei Schreibschutz ist die Toolbar nur lesend.
- Reine Logik in `base-edit.ts` (testbar ohne DOM).

### T4 Quelltext-Editor
- Der YAML-Editor füllt den verfügbaren Platz des Tabs.

## Nicht-Ziele
- Spaltenbreiten, Zeilenhöhe der Tabelle, Listen-Optionen (YAML-Schlüssel nicht belegt).
- Eine Browser-Abnahme auf einem echten Gerät ersetzt diese Spec nicht.
