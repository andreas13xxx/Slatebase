# Aliases — Tasks

## Backend
- [x] 1. `GET /vaults/:vaultId/aliases` in `backend/src/api/graphRoutes.ts` ergänzen (Zod-Param,
      Vault-Auth-Middleware, Fehlerformat), implementiert über `getPropertyValues('aliases')` +
      `getFilesByProperty('aliases', value)` im `LinkIndexService`.
- [x] 2. Integrationstest: leer / ein Alias / mehrere Dateien mit demselben Alias.
- [x] 3. `IApiClient` (Frontend) um `getVaultAliases(vaultId)` erweitern + fetch-Implementierung.

## Frontend — Daten
- [x] 4. `state/aliasStore.ts` (Action-Creator-Form): Alias-Liste je Vault laden, als
      `Map<lowerAlias, string[]>` bereitstellen, auf `vault:change` invalidieren. Lifecycle in
      `App.tsx` (Vault-Wechsel + `vault:change`).

## Frontend — R1 Resolver
- [x] 5. Vor der Änderung: alle Importeure von `resolveWikilinkTarget*` gegrept; `ViewMode.tsx`
      nutzt bereits die gemeinsame Funktion (Thin Wrapper, kein lokaler Schatten mehr).
- [x] 6. `resolveWikilinkTargetWithAlternatives` um optionalen `aliasMap`-Parameter erweitert;
      Alias-Pass NUR nach erfolglosem Namens-/Pfad-Pass, Mehrdeutigkeit via `resolveAmbiguousMatch`.
- [x] 7. Aufrufstellen ViewMode + Live-Preview-Click mit der Alias-Map versorgt.
      (Bewusst offen: Backlinks/Unlinked-Mentions + Embed-Widget-Decorations — eigener Folgeschritt.)
- [x] 8. Resolver-Tests: Alias-Treffer, Name gewinnt vor Alias, Alias-Mehrdeutigkeit, same-folder.

## Frontend — R2 Quick Switcher
- [x] 9. `buildEntries` in `QuickSwitcher.tsx`: Alias-Einträge erzeugt (`viaAlias`-Feld),
      fuzzy-rankbar, Dedup gegen Namenstreffer (best-Score je Pfad).
- [x] 10. Darstellung „<alias> → <name>"; i18n-Namespace bewusst nicht eingeführt (Komponente ist
      durchgängig hartkodiert-deutsch — eigener Cleanup-Posten).
- [x] 11. Store-Tests (`aliasStore.test.ts`): Folding/Lowercasing/Dedup/Entries + Snapshots.

## Abschluss
- [x] 12. `npx tsc --noEmit` (Backend), `tsc -b` (Frontend), neue Tests grün isoliert.
      (Volle `test:coverage` + eslint vor dem Push gemäß quality.md.)
- [x] 13. `product.md` um Aliases ergänzt; Posten in `obsidian-feature-gaps` als erledigt markiert.
