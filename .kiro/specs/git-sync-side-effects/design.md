# Git-Sync Nebeneffekte — Design

## Kernidee

Git behält den alten Stand. Nach dem Merge holt `git show <preMergeHead>:<pfad>` den Inhalt vor
dem Sync. Kein Eingriff vor dem Merge nötig.

## Bausteine

1. `IGitCli.diffNameStatus(cwd, from, to)` → `{ status: 'A'|'M'|'D'|'R', path, oldPath? }[]`
   (`git diff --name-status -z -M`).
2. `IGitCli.showFileAt(cwd, ref, path)` → `Buffer | null` (binärsicher, `maxBuffer` begrenzt).
3. `TrashService.addFromContent(vaultId, path, content)`: legt einen Eintrag mit Kopie an
   (die Datei ist bereits weg, daher kein `rename`).
4. `SyncSideEffects` (`git-sync/sync-side-effects.ts`): nimmt die Änderungsliste und ruft über
   injizierte Hooks Papierkorb, Version, Aktivität, Link-Index auf. Sequenziell, jeder Schritt
   in try/catch.
5. `GitSyncEngine` ruft nach erfolgreichem Merge (auch nach `concludeMerge`) `apply(vaultId,
   preMergeHead, postMergeHead)` auf, vor `publishVaultChange`.
6. Verdrahtung in `index.ts` (Composition Root).

## Entscheidungen

- Umbenennung (`R`): `note.moved`, Versionen wandern mit (`moveVersions`), Link-Index
  `onFileRenamed`. Kein Papierkorb.
- Ereignis-Typ nach Endung: `.md`→`note.*`, `.canvas`→`canvas.*`, `.base`→`base.*`, sonst `note.*`.
- Lokale Commits (`commitAll`) bleiben ohne Einträge (schon als Bearbeitung erfasst).
- Versteckte Pfade und `.gitignore` übersprungen.
- Dateien über `maxFileSize` bekommen keine Version (Papierkorb ja).
