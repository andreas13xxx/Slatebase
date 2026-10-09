# Design Document: Bases Plugin API (v2)

## Overview

Diese Stufe macht die heute inerten Bases-Plugin-API-No-Ops funktional, sodass ein fremdes Obsidian-Plugin eine eigene Bases-View-Art rendern kann. Sie baut vollständig auf der v1-Bases-Spec auf: die Query-Route, `runBaseQuery` und der Formel-Interpreter werden wiederverwendet; neu ist nur die Brücke zwischen Plugin-API und dieser vorhandenen Datenschicht sowie das Mounten der Plugin-View.

Architektur-Leitplanken:

- **Keine zweite Datenpipeline.** Der `QueryController` ruft dieselbe `runBaseQuery`-Funktion wie die eingebaute Tabelle. Plugin-Views und die eingebaute Tabelle sehen identische Zeilen.
- **Dieselbe Sandbox/Scope wie jede andere Plugin-View.** Das Mounten läuft über das vorhandene Plugin-View-Muster (`view-registry.ts`/`PluginViewPanel`-Pattern, `data-plugin-id`-Scoping, Plugin-Ausführungskontext). Kein neuer, ungeschützter Eintrittspunkt.
- **ErrorBoundary um fremden Code.** Eine werfende Plugin-Factory oder ein Render-Fehler fällt auf die eingebaute Tabelle/Rohquelle zurück, nie auf einen Tab-Crash (gleiches Prinzip wie `PluginProvider` schon in eine ErrorBoundary gehüllt ist).
- **Vorhandene Stubs werden ersetzt, nicht parallel ergänzt.** Die No-Op-Definitionen in `install-globals.ts` werden durch echte Implementierungen ausgetauscht; es entsteht keine zweite, konkurrierende Klassenkette (Lesson „eine echte Prototypenkette schlägt mehrere Lookalikes").

## Architektur

### Geänderte Dateien (Compat-Layer)

| Pfad | Änderung |
|------|----------|
| `frontend/src/plugins/compat/install-globals.ts` | Die `Value`-Hierarchie von inerten Defaults auf echte `toString`/`isTruthy`/`equals`/`renderTo`-Implementierungen heben. `BasesView`/`QueryController`/`BasesViewConfig`/`BasesEntry`/`RenderContext` von Platzhaltern auf funktionsfähige Basisklassen heben (Lifecycle real, `onDataUpdated` real auslösbar). |
| `frontend/src/plugins/compat/setting-tab.ts` o. die Plugin-Prototyp-Stelle | `Plugin.registerBasesView(id, registration)` von `warnNoOp` auf echte Registrierung in der neuen `bases-view-registry.ts` umstellen (gibt weiterhin `void` zurück wie die echte API). |
| `frontend/src/plugins/compat/compatibility-analyzer.ts` | Bases-Referenzen nicht mehr pauschal `partial`; nur noch tatsächlich fehlende Teile markieren. |
| `frontend/src/plugins/compat/obsidian-api-extensions.ts` | `OBSIDIAN_API_VERSION` erst anheben, wenn die APIs real sind (siehe Requirement 4.2). |

### Neue Dateien (Compat-Layer)

| Pfad | Verantwortung |
|------|---------------|
| `frontend/src/plugins/compat/bases-view-registry.ts` | Modul-Level-Registry der Bases_View_Registration (gleiches Muster wie `view-registry.ts`/`embed-registry.ts`): `registerBasesView(id, registration, pluginId)`, `getBasesViewRegistration(type)`, `clearForPlugin(pluginId)`, `resetForVault()`. |
| `frontend/src/plugins/compat/bases-value-factory.ts` | Wandelt einen Property-Rohwert (string-Liste) + optionalen deklarierten Typ in das passende `Value_Object` um (nutzt dieselbe `inferCellType`-Logik wie die Tabellenzelle). |
| `frontend/src/plugins/compat/bases-query-controller.ts` | Echter `QueryController`: ruft `runBaseQuery`, baut `BasesEntry[]` mit `Value_Object`-Spalten, hört auf `vault:change` und löst `onDataUpdated()` aus; wertet Formel-Spalten über `frontend/src/bases/formula/` aus. |
| `frontend/src/plugins/compat/*.test.ts` | Tests: Registrierung/Deregistrierung, Factory-Aufruf + Lifecycle, Fehler-Isolation, Value-`renderTo`-Typen, QueryController-Daten + Live-Refresh. |

### Geänderte Dateien (Bases-View-Container)

| Pfad | Änderung |
|------|----------|
| `frontend/src/components/bases/BasesView.tsx` | Vor dem Rendern der eingebauten Tabelle prüfen, ob der aktive View-`type` einer Bases_View_Registration entspricht. Falls ja: Plugin-View in einen Container mounten (ErrorBoundary + `data-plugin-id`), einen `QueryController` daran hängen und bei `vault:change` `onDataUpdated()` treiben. Falls nein oder bei Fehler: unveränderte eingebaute Tabelle/Rohquelle. |

## Daten-/Kontroll-Fluss

1. Beim Plugin-`onload()` ruft das Plugin `registerBasesView('cards', { factory })`; die Registry speichert `type → { factory, pluginId }`.
2. Öffnet der Nutzer eine `.base` mit `views: [{ type: 'cards' }]`, prüft `BasesView.tsx` die Registry, findet `cards` und erzeugt via Factory eine `Plugin_Bases_View` in einem gescopten, in eine ErrorBoundary gehüllten Container.
3. Ein `QueryController` wird an die View gehängt: er ruft `runBaseQuery(doc, apiClient, vaultId, view)`, verpackt jede Zeile als `BasesEntry` mit `Value_Object`-Spalten und ruft `view.onDataUpdated()`.
4. Ein `vault:change`-Event (über `realtimeVaultBridge`) löst eine erneute Query und ein weiteres `onDataUpdated()` aus — dasselbe Live-Refresh-Muster wie die Tabelle.
5. Plugin-Deaktivierung/Vault-Wechsel: `clearForPlugin`/`resetForVault` entfernt Registrierungen; gemountete Views werden unloaded.

## Wiederverwendung aus der Bases-v1-Spec

- **Query:** `frontend/src/bases/query-engine.ts` (`buildQuerySpec`, `runBaseQuery`) + Backend-Route `basesRoutes.ts`. Unverändert.
- **Formeln:** `frontend/src/bases/formula/` (`evaluateFormula`, `formatFormulaValue`). Unverändert; der `QueryController` ruft sie für Formel-Spalten.
- **Typinferenz:** `frontend/src/components/bases/base-cell-type.ts` (`inferCellType`) als gemeinsame Quelle für die Value-Fabrik.

## Sicherheit

- Plugin-View im selben Sandbox-/Scope-Kontext wie jede andere Plugin-View (`data-plugin-id`, Netzwerk-Allowlist, `withPluginContext`).
- Datenzugriff nur über die geprüfte Query-Route; etwaige Schreibzugriffe nur über den geprüften Vault-Schreibpfad.
- `Value.renderTo()` nutzt kein ungeprüftes `innerHTML`; HTML-wertige Typen (`HTMLValue`) laufen durch denselben Sanitizer wie der übrige untrusted-content-Pfad.
- Fremder View-Code in einer ErrorBoundary; eine Exception degradiert auf die eingebaute Tabelle, nicht auf einen Tab-Crash.

## Testing-Strategie

- Registry: Registrieren, Auflösen nach `type`, `clearForPlugin`/`resetForVault`.
- Mounten: Factory wird aufgerufen, Lifecycle korrekt (`load`→`onload`→`onDataUpdated`→`unload`), Container trägt `data-plugin-id`.
- Fehler-Isolation: werfende Factory/Render → eingebaute Tabelle + sichtbare Meldung, kein Crash.
- Value-Objekte: `toString`/`isTruthy`/`equals`/`renderTo` je Typ; `LinkValue` rendert klickbaren Link, `DateValue` formatiert, `HTMLValue` sanitisiert.
- QueryController: liefert dieselben Zeilen wie die Tabelle; `vault:change` → erneute Query + `onDataUpdated()`.

## Offene Design-Fragen (vor Umsetzung zu klären)

1. Exakte Signatur von `registerBasesView` und dem `registration`-Objekt gegen eine echte Obsidian-Version/`obsidian.d.ts` verifizieren (Factory-Argumente, `options`-Schema).
2. Wie wählt die `.base`-View-UI zwischen eingebauter Tabelle und mehreren registrierten Plugin-View-Typen? (View-Switcher-Erweiterung — ggf. kleine UI-Ergänzung in `BasesView.tsx`.)
3. Welche `Value`-Untertypen rendern Plugins real an (Priorisierung von `renderTo` nach tatsächlichem Bedarf statt alle 20 gleich tief).
