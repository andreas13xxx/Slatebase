---
inclusion: manual
---

# Slatebase — Workflow für neue Features

Schritt-für-Schritt-Anleitung für die Implementierung neuer Features.

## Reihenfolge

1. **Requirements klären** — Was genau soll gebaut werden? Akzeptanzkriterien definieren.
2. **Design** — Interfaces, Datenmodelle, Fehlerklassen skizzieren
3. **Backend zuerst** — API lauffähig machen, dann Frontend anbinden
4. **Tests parallel** — Tests zusammen mit der Implementierung schreiben, nicht nachträglich

## Backend-Workflow

```
1. Interface definieren (I*-Interface in der passenden Schicht)
2. Error-Klassen definieren (falls neue Fehlerfälle)
3. Implementierung schreiben
4. Unit Tests schreiben (createMock*-Factories)
5. Controller-Methode + Route hinzufügen
6. Error-Mapping in handleError() ergänzen
7. Composition Root verdrahten (src/index.ts)
8. Integration Test (falls sinnvoll)
```

## Frontend-Workflow

```
1. Types in types.ts ergänzen (falls neue Datenmodelle)
2. IApiClient-Interface erweitern + Implementierung
3. Action-Types zum Reducer hinzufügen
4. Action Creator schreiben (async Funktion mit dispatch)
5. UI-Komponente implementieren
6. Tests schreiben
```

## Checkliste vor Abschluss

- [ ] Backend-Tests grün
- [ ] Frontend-Tests grün
- [ ] TypeScript kompiliert fehlerfrei (beide Packages)
- [ ] Manuell getestet (Backend läuft, Frontend zeigt Feature)
- [ ] Steering/Docs aktualisiert falls nötig (structure.md, API-Routes)
