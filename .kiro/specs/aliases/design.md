# Aliases — Design

## Schlüssel-Erkenntnis

Der Backend-Link-Index führt `aliases` bereits als normale Frontmatter-Property, und es gibt
**schon** eine Abfrage dafür: `LinkIndexService.getFilesByProperty('aliases', value)`
(`backend/src/link-index/link-index-service.ts:543`) liefert alle Pfade, deren Frontmatter diesen
Wert unter `aliases` trägt. Es muss also **keine** neue Index-Datenstruktur gebaut werden — nur
eine Lese-Route und die Verdrahtung im Resolver/Switcher. Das hält den Diff klein (Prinzip
„keine Insellösung, aber auch keine überflüssige Infrastruktur").

## Backend

### Neue Route
`GET /vaults/:vaultId/aliases` → `{ aliases: Array<{ alias: string; path: string }> }`
- Liefert die vollständige Alias→Pfad-Liste des Vaults. Baut auf dem bestehenden
  Property-Index auf: Keys der Property `aliases` iterieren (`getPropertyValues('aliases')`),
  je Wert `getFilesByProperty('aliases', value)`.
- In `graphRoutes.ts` einhängen (gleiche Datei wie `/tags`, gleiche Vault-Auth-Middleware).
- Zod-Schema für `:vaultId`, Fehlerformat `{ code, message, timestamp }` wie überall.
- Klein genug für eine Vollliste; kein Paging nötig (ein Vault hat selten >1000 Aliase).

### Normalisierung
- Vergleich case-insensitiv (wie Namensauflösung). Die Route liefert die Aliase verbatim; der
  Client lowercased beim Matchen.

## Frontend

### Alias-Cache
- `state/aliasStore.ts` (Action-Creator-Form wie `snippetStore.ts`, kein Singleton): lädt die
  Alias-Liste pro Vault, cached im Context (oder in `vaultTrees`-naher Struktur), invalidiert auf
  `vault:change` (`realtimeVaultBridge`) — identisches Muster wie die Tags-Liste in
  `documentPanelData.ts`.

### R1 — Resolver
- `resolveWikilinkTargetWithAlternatives(target, tree, sourcePath, aliasMap?)` bekommt einen
  optionalen `aliasMap: Map<lowerAlias, string[]>` Parameter.
- Reihenfolge: bestehende Pfad-/Exakt-Name-/`.md`-Fallback-Pässe zuerst. **Nur wenn kein
  Namenstreffer** existiert, wird `aliasMap.get(targetLower)` geprüft; mehrere Pfade laufen durch
  `resolveAmbiguousMatch` (gleicher Ordner → kürzester Pfad → alphabetisch). So gewinnt ein echter
  Dateiname immer vor einem Alias.
- Der Parameter ist optional → alle bestehenden Aufrufstellen (ViewMode, Live Preview,
  Backlinks) bleiben kompilierbar; sie werden schrittweise mit der Alias-Map versorgt.
  **Achtung:** `ViewMode.tsx` hatte historisch einen eigenen lokalen `resolveWikilinkTarget`-
  Schatten (siehe lessons-learned) — vor der Änderung alle Importeure greppen und sicherstellen,
  dass sie die gemeinsame Funktion nutzen.

### R2 — Quick Switcher
- `buildEntries` in `QuickSwitcher.tsx` ergänzt Alias-Kandidaten: je Alias ein zusätzlicher
  fuzzy-matchbarer Eintrag `{ kind: 'file', name: <alias>, path: <datei>, viaAlias: true }`.
- Darstellung: Alias-Zeile zeigt „<alias>" mit Sekundärzeile „→ <dateipfad>" (neues optionales
  Feld, kein Bruch der bestehenden Zeilen). Dedup: wenn Name und Alias dieselbe Datei treffen,
  nur der stärkere Fuzzy-Score.

## Tests
- Backend: Route-Integrationstest (leer, ein Alias, mehrere Dateien gleicher Alias) in
  `graphRoutes`-Testumfeld.
- Resolver: Alias-Treffer, Name gewinnt vor Alias, Mehrdeutigkeit via `resolveAmbiguousMatch`.
- Switcher: Alias erscheint als Treffer, Dedup gegen Namenstreffer.

## i18n
- Neue Switcher-Sekundärzeile/Label-Keys in `de.ts` UND `en.ts`.
