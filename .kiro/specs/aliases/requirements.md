# Aliases — Requirements

Obsidian-Feature-Parität: Frontmatter-`aliases` als alternative Namen für Wikilink-Auflösung
und Quick-Switcher-Treffer. Teil des Branches `feature/obsidian-feature-gaps`.

## Ausgangslage (im Code verifiziert)

- `aliases` ist bereits ein reservierter Property-Key (`RESERVED_PROPERTY_KEYS`) und wird im
  Property-Editor als Listen-Typ gespeichert. Die **Speicherung** existiert also schon.
- Was fehlt: die **Nutzung** der Aliase an zwei Stellen —
  1. `frontend/src/plugins/link-resolver.ts` (`resolveWikilinkTargetWithAlternatives`) matcht nur
     gegen Datei-**Namen**/Pfade, nie gegen Aliase.
  2. `frontend/src/components/QuickSwitcher.tsx` (`buildEntries`) rankt nur über Dateinamen
     (`collectFilesSorted` + `fuzzyMatch`), kennt keine Aliase.
- Die Aliase stehen im Backend-Link-Index nicht separat bereit: `properties` im Index enthält
  frontmatter-Keys, aber der Frontend-Resolver arbeitet auf dem `DirectoryTree` (nur Name/Pfad),
  nicht auf Metadaten. Eine Alias→Pfad-Quelle muss erst geschaffen werden.

## Requirements

### R1 — Alias-Auflösung von Wikilinks
- Als Benutzer möchte ich `[[Mein Alias]]` schreiben und dass es auf die Notiz auflöst, die
  `aliases: [Mein Alias]` im Frontmatter deklariert.
- Namens-/Pfad-Treffer behalten Vorrang vor Alias-Treffern (ein echter Dateiname gewinnt).
- Mehrere Notizen mit demselben Alias werden über dieselbe Disambiguierung aufgelöst wie
  gleichnamige Dateien (gleicher Ordner → kürzester Pfad → alphabetisch).
- Case-insensitiv wie die Namensauflösung.

### R2 — Aliase im Quick Switcher
- Als Benutzer möchte ich im Quick Switcher (Ctrl+O) einen Alias eintippen und die zugehörige
  Datei als Treffer sehen, erkennbar als „Alias → Datei".
- Alias-Treffer werden über denselben `fuzzyMatch` gerankt wie Namenstreffer.

### R3 — Alias-Quelle (Daten)
- Es MUSS eine abfragbare Alias→Pfad-Abbildung geben, die der Resolver und der Switcher ohne
  teures Re-Parsen jeder Datei nutzen können.
- Entscheidung (Design): Der Backend-Link-Index führt `aliases` bereits als Property — eine
  neue abgeleitete Map `aliases: Map<alias, Set<path>>` dort ist die billigste Quelle, synchron
  gepflegt an denselben Mutations-Einstiegspunkten wie der übrige Index (rebuild/updateFile/
  removeFile/renameFile/renameDirectory). Frontend bezieht sie über eine Index-/Graph-Route.

### R4 — Live-Konsistenz
- Wird ein Alias hinzugefügt/entfernt/eine Datei umbenannt, MUSS die Auflösung ohne Neustart
  aktuell sein (an denselben `vault:change`/Index-Update-Pfaden wie Tags/Properties).

## Nicht in Scope
- Alias-Anzeige als Titel in der Dateiliste/Explorer (Obsidian zeigt den Dateinamen; Aliase sind
  nur Auflösungs-/Switcher-Hilfen). Später separat erwägbar.
- Alias-Autovervollständigung im Wikilink-Editor (`[[`-Completion) — eigenständiger Folgeschritt.
