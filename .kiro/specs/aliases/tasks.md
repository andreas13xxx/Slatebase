# Aliases — Tasks

## Backend
- [ ] 1. `GET /vaults/:vaultId/aliases` in `backend/src/api/graphRoutes.ts` ergänzen (Zod-Param,
      Vault-Auth-Middleware, Fehlerformat), implementiert über `getPropertyValues('aliases')` +
      `getFilesByProperty('aliases', value)` im `LinkIndexService`.
- [ ] 2. Integrationstest: leer / ein Alias / mehrere Dateien mit demselben Alias.
- [ ] 3. `IApiClient` (Frontend) um `fetchAliases(vaultId)` erweitern + fetch-Implementierung.

## Frontend — Daten
- [ ] 4. `state/aliasStore.ts` (Action-Creator-Form): Alias-Liste je Vault laden, als
      `Map<lowerAlias, string[]>` bereitstellen, auf `vault:change` invalidieren.

## Frontend — R1 Resolver
- [ ] 5. Vor der Änderung: alle Importeure von `resolveWikilinkTarget*` greppen; sicherstellen,
      dass `ViewMode.tsx` die gemeinsame Funktion nutzt (kein lokaler Schatten mehr).
- [ ] 6. `resolveWikilinkTargetWithAlternatives` um optionalen `aliasMap`-Parameter erweitern;
      Alias-Pass NUR nach erfolglosem Namens-/Pfad-Pass, Mehrdeutigkeit via `resolveAmbiguousMatch`.
- [ ] 7. Aufrufstellen (ViewMode, Live-Preview-Link-Decorations, Backlinks/Unlinked-Mentions) mit
      der Alias-Map versorgen.
- [ ] 8. Resolver-Tests: Alias-Treffer, Name gewinnt vor Alias, Alias-Mehrdeutigkeit.

## Frontend — R2 Quick Switcher
- [ ] 9. `buildEntries` in `QuickSwitcher.tsx`: Alias-Einträge erzeugen (`viaAlias`-Flag),
      fuzzy-rankbar, Dedup gegen Namenstreffer.
- [ ] 10. Darstellung „<alias> → <pfad>"; i18n-Keys in de.ts + en.ts.
- [ ] 11. Switcher-Tests: Alias erscheint, Dedup korrekt.

## Abschluss
- [ ] 12. `npx tsc --noEmit` (Backend), `npm run build` (Frontend), beide `test:coverage` grün,
      `npx eslint . --quiet` 0 Errors.
- [ ] 13. `product.md` um Aliases ergänzen; diesen Posten in `obsidian-feature-gaps` als erledigt
      markieren.
