# Obsidian Themes: Community-Store — Tasks

Umsetzung in Phasen; jede Phase einzeln committbar und grün (tsc, Lint, betroffene Tests). Branch:
`obsidian-themes-store`, aufbauend auf `master` (Stufe 1 und 2 sind gemergt: #251, #253).

## Phase 0 — Spike gegen die Wirklichkeit (abgeschlossen 2026-10-21)
- [x] 0.1 `probe-catalog.py` im Spec-Ordner: Katalog laden, für alle Einträge `manifest.json` und `theme.css` am Repo-Wurzel
      abrufen (Wiederholung mit Wartezeit bei fehlender Antwort, Fortsetzen eines früheren Laufs). Erster Lauf mit 8
      parallelen Anfragen unbrauchbar (431 Anfragen ohne Antwort), zweiter mit 3 Anfragen vollständig
- [x] 0.2 Screenshot-Pfade normalisiert und geprüft: 906 von 911 lösen auf
- [x] 0.3 Ergebnis in den Requirements nachgetragen: 818 von 911 (90 %) installierbar, 26 über 2 MB, 62/66 ohne Manifest/CSS;
      R3.3 (Manifest Pflicht) bestätigt, R3.8 und R5.1 um die gemessenen Fälle ergänzt. CSS-Grenze auf 3 MB angehoben
      (Entscheidung 2026-10-21, 824 von 911 installierbar)

## Phase 1 — Grundlagen im Backend
- [x] 1.0 (erledigt 2026-10-21, `4721a2e`) CSS-Grenze auf 3 MB (Entscheidung 2026-10-21), zuerst und einzeln committbar, weil sie den bestehenden Import
      betrifft: `MAX_THEME_CSS_SIZE` (`backend/src/themes/validation.ts`), `MAX_THEME_CSS_BYTES` und Meldung
      (`themeImport.ts`), Request-Body-Grenze der Theme-Route prüfen, Tests der Grenzwerte (3 MB ok, 3 MB + 1 abgelehnt),
      Doku (Welcome-Vault DE/EN „maximal 3 MB", README-API-Tabelle). Messung: Wechsel auf Catppuccin und Virgo bremst die
      Oberfläche nicht merklich.
      Umgesetzt an drei Stellen (Backend, Import-Prüfung, `ThemeInjector`), Randwerttests, Doku. Messung auf einer
      Testseite mit 4000 Elementen: Catppuccin und Virgo brauchen beim ersten Einfügen samt Stilberechnung 0,4–0,8 s,
      danach ca. 0,15 s; in der vollen Anwendung noch nicht gemessen
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
- 2026-10-21: CSS-Grenze 3 MB für Store und Import (6 weitere Themes installierbar, 20 bleiben zu groß).
- 2026-10-20: Katalog beim Start vorwärmen (nicht blockierend), unendliches Scrollen mit Schaltfläche „Mehr laden",
  Abschalten nur serverweit.
