# Obsidian Themes: Community-Store — Design

## 1. Überblick

```
Einstellungen → Themes → Tab „Entdecken"
      │  GET /theme-store/themes             (Katalog, gecacht)
      │  GET /theme-store/screenshot?repo=   (Bild über den Server)
      │  GET /vaults/:id/theme-store/updates (Versionsvergleich, gecacht)
      │  POST /vaults/:id/theme-store/install
      ▼
ThemeStoreService ──► ThemeStoreClient ──► raw.githubusercontent.com  (community-css-themes.json,
      │                 (guarded fetch)                                 manifest.json, theme.css, Bilder)
      ▼
ThemeService.saveTheme(...)  →  <vault>/.obsidian/themes/<id>/{theme.css,manifest.json}
```

Der Store ist eine **Zulieferung** für den vorhandenen `ThemeService`: Er holt Dateien und übergibt sie so, wie es der
Import tut. Aktivierung, Anzeige, Löschen und `vault:change`-Ereignisse bleiben unverändert (Stufe 1).

## 2. Entscheidungen

| Frage | Entscheidung | Begründung |
|---|---|---|
| Eigener Client oder Plugin-Store-Client erweitern? | **Eigener `ThemeStoreClient`** in `backend/src/theme-store/`, mit einem kleinen gemeinsamen `shared/guarded-fetch.ts` (Allowlist, manuelle Redirects mit erneuter Prüfung, Timeout, Größenlimit beim Streamen) | `GitHubClient` ist auf Plugins zugeschnitten (Release-Assets, `api.github.com`). Er sendet **bei jeder Anfrage** das `SLATEBASE_GITHUB_TOKEN` mit, auch an `raw.githubusercontent.com` und über Redirects. Das wollen wir für Themes nicht übernehmen (R6.4). Der Plugin-Store wird in dieser Spec nicht angefasst |
| GitHub-API oder Roh-Dateien? | **Nur `raw.githubusercontent.com`** | Themes liegen als `theme.css` und `manifest.json` im Repo-Wurzelverzeichnis; kein Release-Asset nötig. Kein API-Rate-Limit, kein Token |
| Wie erkennt ein Update das Theme? | **Über den Namen** (`manifest.name` ↔ Katalogname, case-insensitiv) | Wie Obsidian. Namen im Katalog sind eindeutig. Keine Zusatzdatei im Vault, ein aus Obsidian übernommener Vault funktioniert sofort |
| Wo steht der Katalog-Cache? | Arbeitsspeicher plus Datei unter `data/theme-store-cache.json` über `JsonFileStore` | Neustart ohne Netz bleibt nutzbar (R7.4); Vorbild `plugin-store-cache.ts` |
| Automatischer Check? | **Nein** | Offline-Betrieb und Datenschutz; nur auf Klick (R4.6) |
| Screenshots | **Über den Server**, nicht direkt vom Browser | Der Browser würde sonst bei jedem Öffnen von „Entdecken" bis zu 900 Anfragen an GitHub schicken und dabei IP und Referrer preisgeben |
| Feature-Gate | Eigener Toggle `obsidian-theme-store` (Standard an, `cold`) | Einziges Theme-Feature mit ausgehendem Netzverkehr; ein Betreiber ohne Außenzugriff schaltet es ab, ohne Themes zu verlieren |
| Katalog beim Start laden? | **Ja, vorwärmen** (einmalig, nicht blockierend, nur bei eingeschaltetem Feature) | Entscheidung 2026-10-20. Das erste Öffnen von „Entdecken" ist sofort fertig. Kosten: ein ausgehender Abruf pro Start, auch wenn nie jemand den Store öffnet; offline scheitert er leise (Warnung, persistierter Stand), ohne Wiederholungen |
| Liste: Seiten oder unendlich? | **Unendliches Scrollen** in Schritten von 24, mit Schaltfläche „Mehr laden" als gleichwertigem Weg | Entscheidung 2026-10-20. Die Schaltfläche hält Tastatur und Screenreader nutzbar |
| Abschalten | **Nur serverweit** über den Feature-Toggle | Entscheidung 2026-10-20 |
| Katalog-Quelle konfigurierbar? | Nein, fest `obsidianmd/obsidian-releases` | Nicht-Ziel; spart SSRF-Fläche |

## 3. Backend

### Modul `backend/src/theme-store/`
| Datei | Inhalt |
|---|---|
| `types.ts` | `CommunityThemeEntry { name, author, repo, screenshot, modes, legacy? }`, `ThemeStoreUpdate { themeId, name, installed, latest, repo }`, `IThemeStoreClient`, `IThemeStoreService` |
| `validation.ts` | Zod-Schema für Katalogeinträge (Backend nutzt Zod 3), `isValidRepo`, `normalizeScreenshotPath`, `isNewerVersion` (SemVer, tolerant gegenüber `v`-Präfix; nicht parsbar → `unknown`) |
| `errors.ts` | `ThemeStoreFetchError`, `ThemeNotInCatalogError`, `ThemeStoreAssetTooLargeError`, `ThemeStoreOfflineError` |
| `theme-store-client.ts` | `fetchCatalog()`, `fetchThemeFiles(repo)`, `fetchScreenshot(repo, path)`; baut URLs nur aus validiertem `repo`; Größenlimits aus R3/R5 |
| `theme-store-cache.ts` | Katalog (TTL 1 h, Datei persistiert), Remote-Manifeste (TTL 15 min), Update-Ergebnisse pro Vault (TTL 15 min, nicht persistiert) |
| `theme-store-service.ts` | `listCatalog()`, `install(vaultPath, repo, {replace, activate})`, `checkUpdates(vaultPath)`, `screenshot(repo)` |
| `index.ts` | Barrel |

### `shared/guarded-fetch.ts`
```ts
guardedFetch(url, { allowedHosts, maxBytes, timeoutMs, maxRedirects, accept? }): Promise<{ status, headers, body: Buffer }>
```
- Host-Allowlist vor dem Request **und** vor jedem Redirect-Hop, `redirect: 'manual'`.
- Liest den Body als Stream und bricht ab, sobald `maxBytes` überschritten ist (nicht erst nach dem Download).
- Sendet **keine** Authorization-Header; `User-Agent: Slatebase-Theme-Store/1.0`.
- Ein Fehlschlag ist ein Fehler, nie „leer" (Projektregel: fehlgeschlagene Anfrage = unbekannt).

### Install-Ablauf (`install`)
1. `repo` gegen Schema und gegen den **aktuellen Katalog** prüfen (`ThemeNotInCatalogError` → 404).
2. `manifest.json` (≤ 64 KB) und `theme.css` (≤ 6 MB) parallel holen. Fehlt `theme.css` (404), wird die ältere `obsidian.css` (gleiche Grenze) geholt. Ein `theme.css`-Repo ohne Manifest, ein ungültiges Manifest oder fehlende Dateien → Fehler, nichts wird geschrieben. Nur bei einer `obsidian.css` darf das Manifest fehlen; dann gilt der Katalogname als Manifest (`{ name }`), die Namensprüfung in Schritt 3 ist damit erfüllt, und die Installation hat keine Version.
3. `manifest.name` muss mit dem Katalognamen übereinstimmen (case-insensitiv); sonst Fehler „Manifest passt nicht zum Katalog" (verhindert, dass ein Repo ein fremdes Theme überschreibt).
4. `ThemeService.saveTheme(vaultPath, id, css, manifest)` unter dem bestehenden Schutz (Reservierte Namen, Groß-/Kleinschreibung, Staged Writes). `replace` entscheidet vorher über `themeExists`: vorhanden und nicht `replace` → `409`.
5. Optional `setActiveThemeId`. Die bestehenden Ereignisse (`vault:change`) tragen die Änderung zu offenen Clients.
6. Antwort: `ThemeMeta` (inkl. `externalHosts`).

### Update-Check (`checkUpdates`)
Für jedes installierte Theme per Namen im Katalog suchen; Treffer → Remote-`manifest.json` (aus Cache oder neu, mit
begrenzter Parallelität 5). Ergebnis `{ updates: ThemeStoreUpdate[], warnings: string[], checkedAt }`. Einzelne Fehler
landen in `warnings`, nie in `updates`.

### Routen (`api/themeStoreRoutes.ts`)
| Methode | Pfad | Zugriff |
|---|---|---|
| GET | `/api/v1/theme-store/themes` | angemeldet |
| GET | `/api/v1/theme-store/screenshot?repo=owner/repo` | angemeldet; nur Bildtypen, ≤ 2 MB, `Cache-Control: private, max-age=86400` |
| GET | `/api/v1/vaults/:vaultId/theme-store/updates` | Lesezugriff auf den Vault (zentrale Autorisierung: GET = lesen) |
| POST | `/api/v1/vaults/:vaultId/theme-store/install` | Schreibzugriff (jede Nicht-GET-Route) |

`install` nimmt `{ repo, replace?, activate? }`. Für Installationen und Updates schreibt die Route einen Audit-Eintrag.
Beide `theme-store`-Präfixe und die Vault-Variante werden in `index.ts` mit `createFeatureGuard('obsidian-theme-store', …)`
abgesichert. Der Eintrag in `VAULT-ROUTE-AUTHORIZATION.md` nennt die neuen Pfade.

### Fehlerabbildung
| Fehler | HTTP |
|---|---|
| Repo nicht im Katalog / Schema ungültig | 404 / 400 |
| Theme existiert, `replace` fehlt | 409 |
| Datei zu groß, Manifest ungültig / passt nicht | 422 |
| GitHub nicht erreichbar, Timeout | 502 (Katalog: letzter Cache-Stand mit `stale: true`) |
| Feature aus | 403 (Feature-Guard) |

## 4. Frontend

| Datei | Zweck |
|---|---|
| `components/settings/ThemeManager.tsx` | bekommt Tabs **Installiert** (heutiger Inhalt) und **Entdecken** |
| `components/settings/ThemeStoreBrowser.tsx` (+ `.css`) | Suche, Filter, Liste, Update-Prüfung |
| `components/settings/ThemeStoreCard.tsx` | Karte: Bild, Name, Autor, Modi, Status, Aktion |
| `components/settings/themeStoreFilter.ts` | reine Filterlogik (Text, Modus, installiert, Update), getestet |
| `api/index.ts` | `listStoreThemes`, `installStoreTheme`, `checkStoreThemeUpdates`; `storeThemeScreenshotUrl(repo)` baut nur die URL |

- **Zustand:** lokal im Browser-Component; installierte Themes kommen aus dem vorhandenen `ThemeManager`-State, damit
  „Installiert" sofort nach dem Installieren stimmt. Filter sind reiner Sitzungszustand und werden nicht gespeichert.
- **Modus-Filter:** Voreinstellung aus dem Farbmodus des Nutzers (`body.theme-light/dark`); der Nutzer kann auf „Alle"
  wechseln.
- **Liste:** Kartenraster mit unendlichem Nachladen: 24 Karten sichtbar, ein Beobachter (`IntersectionObserver`) am Listenende
  rendert 24 weitere; es werden nur Karten gerendert, die Daten liegen komplett im Speicher (910 Einträge, wenige KB).
  Gleichwertiger Weg ist die Schaltfläche „Mehr laden" unter der Liste; der Zähler „24 von 310 angezeigt" ist
  `aria-live="polite"`. Beim Nachladen wandert der Fokus nicht. Ohne `IntersectionObserver` oder bei
  `prefers-reduced-motion` gibt es nur die Schaltfläche. Ein Filterwechsel setzt auf die ersten 24 zurück. Bilder
  `loading="lazy"`.
- **Rückfrage vor Ersetzen:** `useFocusTrap`, wie beim Import-Überschreiben.
- **Hinweis zum Fremd-CSS:** einmalig vor der ersten Installation pro Browser (nur Hinweis, kein Gate); der Merker liegt
  als `localStorage`-**Cache**, nicht als Einstellung (reiner Komfort, Projektregel „localStorage ist Cache").
- **Fehler und Offline:** jede Fehlermeldung nennt die Ursache; „Erneut versuchen" lädt den Katalog neu.

## 5. Sicherheit

| Risiko | Gegenmaßnahme |
|---|---|
| SSRF über `repo` oder Screenshot-Pfad | `repo` gegen Regex **und** Katalog; Pfad normalisiert, Host fest; Allowlist auf jedem Redirect-Hop |
| Token-Abfluss | `guardedFetch` sendet keine Authorization-Header; kein Token-Bezug im Modul |
| Speicher-/Disk-Erschöpfung | Größenlimit beim Streamen; Katalog hat eine Obergrenze von 5 MB und 5000 Einträgen |
| Bösartiges CSS | Wie beim Import: kein Skript, aber Fremdinhalte; Hinweis plus `externalHosts` in der Antwort. Der Store prüft CSS nicht inhaltlich |
| Überschreiben eines fremden Themes | Katalogname muss zum Manifest passen (Schritt 3), `replace` nur nach Rückfrage |
| Manipulierter Katalog | Der Katalog kommt aus Obsidians eigenem, reviewtem Repository; es gibt keine Signatur, das Vertrauen ist dasselbe wie im Plugin-Store |
| Bild als Angriffsfläche (SVG mit Skript) | nur PNG/JPEG/WebP/GIF, Typ aus den ersten Bytes geprüft (nicht nur aus dem Header), `Content-Type` fest gesetzt, `X-Content-Type-Options: nosniff` |

## 6. Tests und Abnahme

- **Backend (ohne Mock-Bibliothek, handgeschriebene Fabriken):** `validation` (Repo, Pfade, Versionen), `guarded-fetch`
  gegen einen lokalen Test-HTTP-Server (Redirect auf fremden Host wird abgelehnt, Größenlimit greift beim Streamen, kein
  Authorization-Header), `theme-store-client`, `theme-store-cache`, `theme-store-service` (Installieren, Ersetzen, 409,
  Namenskonflikt, Update-Check mit Teilfehlern), Routen (Feature-Gate, Zugriffsrechte, Fehlerabbildung).
- **Frontend:** Filterlogik, Browser (Suche, Modus-Voreinstellung, Installieren, Ersetzen-Rückfrage, Fehler, Offline),
  `*.a11y.test.tsx`.
- **Echte Prüfung (Phase 0 und Abnahme):** Katalog gegen die Wirklichkeit: Wie viele der 910 Themes haben `manifest.json`
  und `theme.css` im Wurzelverzeichnis? Welche scheitern an Größe oder Namen? Installation von Minimal, Things und einem
  `legacy`-Theme in einer isolierten Instanz; Update-Check mit künstlich gesenkter lokaler Version.
- **Datenschutz-Check:** im Netzwerkprotokoll des Browsers dürfen beim Öffnen von „Entdecken" keine Anfragen an GitHub
  auftauchen, nur an den eigenen Server.

## 7. Offene Fragen und Entscheidungen

- **Grenze für `theme.css`: entschieden am 2026-10-26 auf 6 MB** (am 2026-10-21 von 2 auf 3 MB angehoben; die Zahlen unten
  stammen aus jener Entscheidung). Anlass war Willemstad (5,3 MB), eines der 50 meistgeladenen Themes. Die Messung der
  Oberflächenbremse mit einem Theme dieser Größe steht noch aus (siehe „Zu prüfen"). Gilt für Store und Import
  (`MAX_THEME_CSS_SIZE` im Backend, `MAX_THEME_CSS_BYTES` und die Meldung im Frontend, Doku „maximal 2 MB" in
  Welcome-Vault und README). Sechs weitere Themes werden installierbar, 20 bleiben draußen. Zu prüfen: Das Anhängen eines
  bis zu 6 MB großen `<style>`-Blocks muss die Oberfläche beim Wechsel nicht merklich bremsen (Messung in der Abnahme,
  bisher mit Catppuccin und Virgo; mit Willemstad offen), und die Request-Body-Grenze der Theme-Route darf 6 MB nicht unterschreiten.
- **`obsidian.css` (entschieden am 2026-10-26):** Der Store akzeptiert die ältere Stylesheet-Datei als Rückfall, weil 9 der 50
  meistgeladenen Themes nur sie haben (Atom, Dracula for Obsidian, Everforest, Notation, Ono Sendai, Pink Topaz, Obuntu,
  Golden Topaz, Yin and Yang). Die Update-Prüfung zählt ein fehlendes Remote-Manifest als „unbekannt", nicht als Warnung;
  solche Themes erhalten also keine Update-Hinweise und werden bei Bedarf neu installiert. Messung:
  `.kiro/specs/obsidian-themes-structure/kompatibilitaet-top50.md`.

Entschieden am 2026-10-20: Katalog beim Start vorwärmen, unendliches Scrollen, Abschalten nur serverweit (siehe §2).

- Der Plugin-Store schickt das GitHub-Token an alle Hosts. Das ist ein eigenes Thema; hier nur erwähnt, nicht Teil
  dieser Spec.
