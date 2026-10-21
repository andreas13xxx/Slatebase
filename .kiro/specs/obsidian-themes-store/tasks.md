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
- [x] 1.1 `shared/guarded-fetch.ts` (Allowlist je Hop, Streaming-Limit, Timeout, kein Authorization-Header) + Tests gegen
      lokalen Test-Server (12 Tests: fremder Host im Redirect wird nicht angefragt, Limit greift beim Streamen, keine
      Credential-Header, Timeout, Netzfehler getrennt vom Status)
- [x] 1.2 `theme-store/{types,errors,validation}.ts` + Tests (46). Repo-Regex strenger als im Plugin-Store: `..`/`.` als Segment
      wird abgelehnt (`../x` passt dort auf das Muster und würde im URL-Pfad ausbrechen); Bildtyp aus den ersten Bytes,
      SVG abgelehnt; Versionsvergleich liefert `null` (= unbekannt) statt „kein Update"
- [x] 1.3 `theme-store-client.ts` (Katalog, Dateien, Screenshot) + Tests (12, gegen lokalen Server als Ersatz für
      `raw.githubusercontent.com`; Ursprung konfigurierbar nur für Tests, Allowlist und Protokoll folgen daraus)
- [x] 1.4 `theme-store-cache.ts` über `JsonFileStore` (Katalog persistiert, Rest im Speicher) + Tests; veraltete/ungültige
      Cache-Datei zählt als leer, ungültige Einträge werden beim Laden verworfen
- [x] 1.5 Vorwärmen: `warmThemeStoreCatalog` (`theme-store/warmup.ts`) ist nicht blockierend gedacht (Aufruf ohne `await`),
      wirft nie, wiederholt nie; Fehlschlag = eine Warnung und persistierter Stand. Ein noch frischer Katalog braucht keine
      Anfrage. Tests in `theme-store-cache.test.ts`. Das **Einhängen in den Serverstart** (nur bei eingeschaltetem
      Feature) folgt mit der DI in 2.3

## Phase 2 — Service, Routen, Feature-Gate (abgeschlossen 2026-10-21)
- [x] 2.1 `theme-store-service.ts`: `listCatalog` (Cache, geteilte Anfrage, veralteter Stand bei Fehler), `install`,
      `checkUpdates`, `getScreenshot` + 21 Tests. `toThemeId` ist jetzt auch im Backend (`themes/validation.ts`, Spiegel der
      Frontend-Funktion). Zuordnung installiert ↔ Katalog über `manifest.name`; ein Update-Check mit fehlgeschlagenen
      Abfragen wird nicht gecacht, damit der nächste Klick sie wiederholt; nicht vergleichbare Versionen landen in
      `unknown`, nie in „aktuell"
- [x] 2.2 `api/themeStoreRoutes.ts` + 20 Tests (Rechte, Fehlerabbildung, Eingabeprüfung, Screenshot-Header). Der 502 nennt
      keine Upstream-URL. Protokoll über `logger.info` statt `AuditService` (Requirements 6.6 korrigiert)
- [x] 2.3 DI und Feature-Toggle `obsidian-theme-store` in `index.ts`; `createFeatureGuard` für alle vier Pfade; Vorwärmen
      nicht blockierend (`void warmThemeStoreCatalog`), nur bei eingeschaltetem Feature
- [x] 2.4 `VAULT-ROUTE-AUTHORIZATION.md` ergänzt; Test, dass `GET …/theme-store/updates` = read und
      `POST …/theme-store/install` = write ohne Ausnahme gilt

## Phase 3 — Frontend (abgeschlossen 2026-10-21)
- [x] 3.1 `api/index.ts`: `listStoreThemes`, `installStoreTheme`, `checkStoreThemeUpdates`, `storeThemeScreenshotUrl` (reine
      URL, relativ: Cookie-Anmeldung, der Browser spricht nur mit dem eigenen Server)
- [x] 3.2 `themeStoreFilter.ts` + 15 Tests (Text, Modus, installiert, Update, veraltet; Fehlertexte auf Deutsch je Fehlercode)
- [x] 3.3 `ThemeStoreBrowser` und `ThemeStoreCard` (22 Tests): unendliches Nachladen mit „Mehr laden", Modus-Voreinstellung
      aus dem Farbmodus, Ersetzen-Rückfrage (`ConfirmModal`), Fehler je Karte, Katalogfehler mit „Erneut versuchen",
      Hinweis „zuletzt bekannte Liste", Update-Prüfung mit Warnungen, einmaliger Fremd-CSS-Hinweis. Der Test „Mehr laden bleibt
      nach 400 ms erhalten" fand einen echten Fehler: Der Suchtimer setzte die Liste nach 200 ms auch ohne geänderten Text
      auf 24 zurück (behoben)
- [x] 3.4 Feature-Gate: **nicht** über `feature:` in `settingsRegistry.ts`, weil das den ganzen Abschnitt „Themes"
      ausblenden würde. `ThemesSection` zeigt den Tab „Entdecken" nur bei eingeschaltetem `obsidian-theme-store`; ohne
      Feature gibt es keine Tabs und keine Katalog-Anfrage (getestet). Tabs nach dem ARIA-Muster (Pfeiltasten, Home/End,
      `aria-controls`)
- [x] 3.5 `ThemesSection.test.tsx` (4) und erweiterter `ThemeManager.a11y.test.tsx` (axe auf „Entdecken" ohne Verstöße)
- Hinweis: Unter paralleler Last laufen `SettingsPanel.a11y.test.tsx` und die 60-Karten-Tests ins 5-s-Limit; einzeln grün.
  Die 60-Karten-Tests haben deshalb 20 s und zählen Karten ohne Rollenabfrage

## Phase 4 — Abnahme und Doku (abgeschlossen 2026-10-21)
- [x] 4.1 Abnahme in isolierter Instanz mit dem echten GitHub (Minimal, Things, Catppuccin, Blue Topaz über die Oberfläche):
      - Start: Katalog beim Start vorgewärmt (911 Einträge, ohne den Start zu blockieren), in `data/theme-store-cache.json`
        gespeichert; nach Neustart „Katalog von Platte geladen", keine neue Anfrage
      - Installieren: Minimal 9.1.4, Things 2.2.4, Catppuccin (2,2 MB) → 200; erneut ohne `replace` → 409; mit → 200;
        Amethyst (`legacy`) → 422 `THEME_FILES_NOT_FOUND`; Fancy-a-Story (3,1 MB) → 422 `THEME_TOO_LARGE`; Repo nicht im
        Katalog → 404; `../x` → 400
      - Update-Prüfung mit auf 1.0.0 gesenkter lokaler Version: Things 1.0.0 → 2.2.4 erkannt, Aktualisieren → 200,
        erneute Prüfung ohne Update. **Dabei gefundener Fehler:** Der 15-Minuten-Cache des Update-Checks wurde nach einer
        Installation nicht verworfen, ein gerade aktualisiertes Theme wäre weiter als veraltet gemeldet worden (behoben,
        `install` bekommt die Vault-ID, 2 Tests)
      - Oberfläche: Tab „Entdecken" mit Hell-Voreinstellung, „24 von 671 angezeigt (Katalog: 911)", Vorschaubilder;
        unendliches Nachladen live (24 → 48 → 72 beim Scrollen); Blue Topaz mit „Nach der Installation aktivieren":
        sofort angewendet, `appearance.json` = `{"cssTheme":"Blue Topaz"}`, Hinweis „Fremdes CSS" danach weg
      - Feature aus (`PUT /admin/features/obsidian-theme-store`): Store-Routen 403, normale Theme-Routen 200, in der
        Oberfläche keine Tabs und keine Katalog-Anfrage, 5 Radiobuttons (Standard + 4 installierte Themes)
      - **Nicht live geprüft:** Verhalten ohne Internetzugang (Netz ließ sich nicht sperren). Durch Tests abgedeckt:
        veralteter Stand bei Ausfall, Vorwärmen wirft nie, Katalogfehler mit „Erneut versuchen"
- [x] 4.2 Datenschutz-Check: Beim Öffnen von „Entdecken" lud der Browser 14 Ressourcen, **alle von `127.0.0.1:5173`**
      (eigener Server), 0 externe Hosts, davon 10 Screenshots über `/api/v1/theme-store/screenshot` (lazy, nur die
      sichtbaren Karten)
- [x] 4.3 Doku: Welcome-Vault `Themes.md` (DE + EN: Abschnitt „Themes aus dem Katalog", Hinweis auf Netzzugriff und
      Schalter), README (Features-Tabelle, API-Tabelle), `AGENTS.md`, `structure.md`, `VAULT-ROUTE-AUTHORIZATION.md`.
      Nebenbei: Größenanzeige in MB ab 1 MB (Catppuccin zeigte „2287.4 KB")
- [ ] 4.4 `test:coverage` und Lint in beiden Paketen; Coverage-Schwellen nie senken (läuft in der CI; lokal nur die
      betroffenen Tests)

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
