# Slatebase — Code-Review Checkliste

Bevor Code als "fertig" gilt, diese Punkte prüfen:

## Funktionalität

- [ ] Feature funktioniert wie in Requirements/Design beschrieben
- [ ] Error-Pfade sind abgedeckt (nicht nur Happy Path)
- [ ] Edge Cases berücksichtigt (leere Listen, maximale Längen, ungültige Eingaben)

## TypeScript

- [ ] Keine `any`-Types (explizite Typisierung)
- [ ] `noUncheckedIndexedAccess` beachtet (Null-Checks bei Array/Object-Zugriff)
- [ ] `exactOptionalPropertyTypes` beachtet
- [ ] Keine TypeScript-Errors (`npm run build` im Frontend, `npx tsc --noEmit` im Backend)

## Code-Qualität

- [ ] JSDoc auf allen öffentlichen Methoden und Interfaces
- [ ] Keine auskommentierten Code-Blöcke
- [ ] Keine `console.log` — stattdessen Logger verwenden
- [ ] Naming-Konventionen eingehalten (I-Prefix, Error-Suffix, etc.)
- [ ] Keine Default-Exports

## Tests

- [ ] Unit Tests für neue Funktionalität vorhanden
- [ ] Success- und Error-Pfade getestet
- [ ] Alle Tests grün (`npm run test`)
- [ ] Mocks folgen dem `createMock*`-Pattern

## Sicherheit

- [ ] Path Traversal Protection bei Dateizugriffen
- [ ] Input-Validierung mit Zod bei neuen Endpoints
- [ ] Keine Secrets in Logs oder Responses
- [ ] File-Size-Limits beachtet

## Integration

- [ ] Backend-Imports mit `.js`-Extension
- [ ] Barrel-Export in `index.ts` aktualisiert
- [ ] API-Error-Format eingehalten (`{ code, message, timestamp }`)
- [ ] Frontend `IApiClient`-Interface erweitert falls neuer Endpoint
