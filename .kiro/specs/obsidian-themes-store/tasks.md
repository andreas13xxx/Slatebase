# Obsidian Themes: Community-Store — Tasks

Umsetzung in Phasen; jede Phase einzeln committbar und grün (tsc, Lint, betroffene Tests). Branch:
`obsidian-themes-store`, aufbauend auf `master` (Stufe 1 und 2 sind gemergt: #251, #253).

## Phase 0 — Spike gegen die Wirklichkeit
- [ ] 0.1 Skript im Spec-Ordner: Katalog laden, für alle 910 Einträge `manifest.json` und `theme.css` am Repo-Wurzel
      abrufen (mäßige Parallelität, keine Wiederholung bei 404). Ausgabe: Anzahl vollständig / ohne Manifest / ohne CSS /
      über 2 MB / Manifestname ≠ Katalogname / ungültiges JSON
- [ ] 0.2 Screenshot-Pfade normalisieren und prüfen, wie viele auflösen (HEAD)
- [ ] 0.3 Ergebnis in Requirements und Design nachtragen; R3.3 (Manifest Pflicht?) und R5.2 anhand der Zahlen bestätigen
      oder lockern

## Phase 1 — Grundlagen im Backend
- [ ] 1.1 `shared/guarded-fetch.ts` (Allowlist je Hop, Streaming-Limit, Timeout, kein Authorization-Header) + Tests gegen
      lokalen Test-Server
- [ ] 1.2 `theme-store/{types,errors,validation}.ts` + Tests (Repo-Regex, Pfadnormalisierung, SemVer-Vergleich)
- [ ] 1.3 `theme-store-client.ts` (Katalog, Dateien, Screenshot) + Tests
- [ ] 1.4 `theme-store-cache.ts` über `JsonFileStore` (Katalog persistiert, Rest im Speicher) + Tests
- [ ] 1.5 Vorwärmen: nicht blockierender Abruf nach dem Start, nur bei eingeschaltetem Feature; Fehlschlag = Warnung im Log
      und persistierter Stand, keine Wiederholungsschleife; Test, dass ein Fehlschlag den Start nicht verzögert

## Phase 2 — Service, Routen, Feature-Gate
- [ ] 2.1 `theme-store-service.ts`: `listCatalog`, `install`, `checkUpdates`, `screenshot` + Tests (Ersetzen, 409,
      Namenskonflikt, Teilfehler beim Update-Check)
- [ ] 2.2 `api/themeStoreRoutes.ts` + Tests (Rechte, Fehlerabbildung, Audit-Eintrag)
- [ ] 2.3 DI und Feature-Toggle `obsidian-theme-store` in `index.ts`; `createFeatureGuard` für beide Präfixe
- [ ] 2.4 `VAULT-ROUTE-AUTHORIZATION.md` ergänzen

## Phase 3 — Frontend
- [ ] 3.1 `api/index.ts`: `listStoreThemes`, `installStoreTheme`, `checkStoreThemeUpdates`, Screenshot-URL
- [ ] 3.2 `themeStoreFilter.ts` + Tests
- [ ] 3.3 `ThemeStoreBrowser` und `ThemeStoreCard` (Tabs im `ThemeManager`, unendliches Nachladen mit Schaltfläche „Mehr laden", Modus-Voreinstellung,
      Ersetzen-Rückfrage mit `useFocusTrap`, Offline-/Fehlerzustände)
- [ ] 3.4 Feature-Gate in `settingsRegistry.ts` (`feature:`), Tab entfällt bei ausgeschaltetem Feature
- [ ] 3.5 Tests und `*.a11y.test.tsx`

## Phase 4 — Abnahme und Doku
- [ ] 4.1 Isolierte Instanz: Minimal, Things und ein `legacy`-Theme installieren, Ersetzen, Update-Check mit gesenkter
      Version, Offline-Verhalten (Netz gesperrt), Feature aus
- [ ] 4.2 Datenschutz-Check: beim Öffnen von „Entdecken" keine Anfragen des Browsers an GitHub
- [ ] 4.3 Welcome-Vault `Themes.md` (DE + EN), README, `AGENTS.md`, `.kiro/steering/structure.md`
- [ ] 4.4 `test:coverage` und Lint in beiden Paketen; Coverage-Schwellen nie senken

## Backlog (außerhalb dieser Spec, siehe Requirements)
- Spike „Style Settings" (läuft das Plugin über die Plugin-Kompatibilität, was setzt es?), danach eigene Spec
- Stichprobe der Wirkung an den häufigsten Katalog-Themes (`measure-selectors.py` und Sonden aus `obsidian-themes-structure`)
- ZIP-Import (niedrige Priorität)
- Lesemodus als Tab-Ansicht (eigenes Feature)

## Entscheidungen
- 2026-10-20: Eigener `ThemeStoreClient` statt Erweiterung des Plugin-Store-Clients; nur `raw.githubusercontent.com`, kein
  Token (siehe Design §2).
- 2026-10-20: Zuordnung installierter Themes zum Katalog über den Namen, keine Zusatzdatei im Vault.
- 2026-10-20: Kein automatischer Update-Check; Screenshots nur über den Server.
- 2026-10-20: Katalog beim Start vorwärmen (nicht blockierend), unendliches Scrollen mit Schaltfläche „Mehr laden",
  Abschalten nur serverweit.
