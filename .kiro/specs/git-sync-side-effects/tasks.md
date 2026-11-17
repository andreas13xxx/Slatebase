# Git-Sync Nebeneffekte — Tasks

Pro Phase: tsc + Tests grün, dann Commit.

## Phase 1 — Git-Grundlagen
- [ ] 1.1 `diffNameStatus` in `IGitCli`/`GitCli` + Tests (echtes Temp-Repo: A, M, D, R, Leerzeichen im Pfad)
- [ ] 1.2 `showFileAt` + Tests (Text, binär, fehlende Datei → null)

## Phase 2 — Papierkorb
- [ ] 2.1 `TrashService.addFromContent` + `ITrashService` + Tests (Wiederherstellen funktioniert)

## Phase 3 — SyncSideEffects
- [ ] 3.1 Klasse mit Papierkorb (D), Version (M), Verschieben (R), Link-Index
- [ ] 3.2 Aktivität pro Datei, Grenze 500, versteckte Pfade, Fehler geschluckt
- [ ] 3.3 Tests

## Phase 4 — Engine + Verdrahtung
- [ ] 4.1 Engine ruft `apply` nach Merge und nach `concludeMerge`
- [ ] 4.2 `index.ts` verdrahten (Aktivität nur bei `activityEnabled`)
- [ ] 4.3 Engine-Tests (Pull mit Löschung/Änderung/Neu)

## Phase 5 — Doku und Abschluss
- [ ] 5.1 `product.md`, `structure.md`, `lessons-learned.md`, Welcome-Vault-Hinweis
- [ ] 5.2 Vor-Push-Checks, PR, CI grün
