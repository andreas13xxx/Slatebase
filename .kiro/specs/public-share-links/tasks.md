# Öffentliche Freigabe-Links — Tasks

Jede Phase wird einzeln grün (tsc, Lint, betroffene Tests) committet.

## Phase 0 — Klärung

- [x] 0.1 Stabile Datei-ID im Link-Index prüfen; sonst Rewrite über Vault-Ereignisse (Design „Token folgt der Datei“)
- [x] 0.2 Reading-View-Pipeline prüfen: wo lässt sich `publicMode` einhängen (Wikilinks, Embeds, Plugin-Blöcke)
- [x] 0.3 Prüfen, wie Feature-Toggles und der Auth-Bypass (`VERSION_PATH`) verdrahtet sind

### Befunde Phase 0 (2026-10-23)

**0.1 Datei-ID: es gibt keine.** Der Link-Index arbeitet pfadbasiert (`GraphNode.id` = Pfad). Dafür gibt es einen Hook
`ILinkIndexHook` (`backend/src/api/index.ts:88-97`) mit `onFileSaved`, `onFileDeleted`, `onFileRenamed(vaultId, oldPath, newPath)`.
Er wird vom API-Controller (Umbenennen/Verschieben/Löschen) **und** von den MCP-Tools (`mcp/tool-handlers.ts`) aufgerufen und
in `backend/src/index.ts:344-346` verdrahtet. Entscheidung: Der Freigabe-Link speichert `vaultId` + `filePath` (kein `fileId`);
`PublicShareService` hängt sich als zusätzlicher Listener an diese Hooks (Umbenennen → Pfad umschreiben, auch Präfix bei
Ordnerverschiebung; Löschen → Link ungültig). Änderungen außerhalb von Slatebase (Dateisystem direkt) melden den Hook nicht;
dann findet `resolve()` die Datei nicht mehr und liefert 404, nie eine andere Datei. Zu prüfen in den Tests: ob der Papierkorb
über `onFileDeleted` läuft (`api/index.ts:537`). Das Datenmodell im Design entfällt um `fileId`.

**0.2 Reading View ist stark an die angemeldete App gekoppelt.** `ViewMode` (`frontend/src/components/ViewMode.tsx`, ~2100 Zeilen):
- Notiz-Einbettung (`NoteEmbed`, Z. 374): lädt über `AppContext.apiClient.fetchFileContent`, Abschnitt/Block über
  `extractHeadingSection` / `extractBlockById`.
- Bild/PDF (`renderEmbedNode`, Z. 1844): löst über `resolveWikilinkTarget(target, directoryTree)` auf und baut die URL mit
  `buildImageSrc(vaultId, path)`, also eine authentifizierte Vault-URL.
- `MAX_EMBED_DEPTH = 3` existiert bereits (passt zu 2.5); Plugin-Embeds (`RegisteredEmbed`) und `BasesEmbed` sind eingebunden.
- Ein bloßes Flag `publicMode` reicht daher nicht. Entscheidung: eine **Embed-Quelle** (`EmbedSource`: `resolveTarget`,
  `loadNote`, `assetUrl`) per Context oder Prop. Standard bleibt das heutige Verhalten (Verzeichnisbaum + API-Client), die
  öffentliche Seite liefert eine Quelle, die aus der `embeds`-Map der Antwort liest. Im öffentlichen Modus werden außerdem
  `RegisteredEmbed`/`BasesEmbed` zu `unavailable`, und Wikilinks rendern als Text. Der Standardpfad darf sich nicht ändern
  (Regressionstests in `ViewMode.test.tsx` zuerst absichern, dann umbauen).
- Offen für Phase 3: Abschnitts-/Blockauszug (`extractHeadingSection`, `extractBlockById`) läuft heute im Client. Der Server
  braucht dieselbe Logik. Prüfen, ob sie als reine Funktionen nach `shared-contracts/` wandern können, damit beide Seiten
  denselben Code nutzen (Hinweis in AGENTS.md: nach Änderung dort `build` + `npm install` in beiden Paketen).

**0.3 Toggle und Auth-Bypass.**
- Feature registrieren: `featureRegistry.register({ name, description, defaultEnabled: false, type: 'cold' })` (Vorbild `bases`,
  `backend/src/index.ts:126`); Guard per `app.use('/api/v1/…', createFeatureGuard('public-shares', featureToggleService))`,
  jeweils für Pfad mit und ohne `/*` (Vorbild Z. 675-678).
- Auth-Bypass: `auth/middleware.ts` vergleicht Pfadkonstanten (`LOGIN_PATH`, `MCP_TRANSPORT_PATH`, `VERSION_PATH`;
  Z. 96-101, nur GET für die Version). Für `/api/v1/public/s/…` ist ein **Präfix-Vergleich** nötig, nicht Gleichheit. Das ist
  bewusst eng zu halten (nur `GET`/`POST` unter genau diesem Präfix) und braucht Tests in `middleware.test.ts`, dass kein
  anderer Pfad durchrutscht (z. B. `/api/v1/public-x`, `/api/v1/public/../vaults`).
- Der Auth-Middleware-Bypass überspringt auch CSRF und Rate-Limit-Annahmen der Session: Das eigene Rate-Limit der
  öffentlichen Routen (Task 2.2) ist deshalb Pflicht, nicht optional.

## Phase 1 — Backend-Kern

- [ ] 1.1 Typen, Fehler, `IPublicShareStore` + Store über `json-file-store.ts` (Token nur als Hash)
- [ ] 1.2 `IPublicShareService`: create/list/revoke/update, Passwort (scrypt), Ablauf
- [ ] 1.3 `embed-resolver.ts`: rekursive Auflösung (Notiz, Abschnitt, Block, Asset), Tiefe 3, Zyklen, Größenlimit,
      `.base`/`.canvas`/Abfrageblöcke und Dot-Dateien → `unavailable`; `readAsset` mit transitiver Allowlist
- [ ] 1.3a Tests: Ring A→B→A, Tiefe 4, Fan-out über dem Limit, Abschnitts-/Blockauszug, Frontmatter entfernt,
      gelöschte Einbettung, `.base`, `.slatebase/…`, Asset außerhalb der Allowlist
- [ ] 1.4 Pfad-Umschreiben bei Umbenennen/Verschieben, 404 bei Löschen/Papierkorb
- [ ] 1.5 Tests (hand-geschriebene Mocks): Token-Entropie, Ablauf, Widerruf, Traversal, Dot-Dateien, Papierkorb

## Phase 2 — Routen und Sicherheit

- [ ] 2.1 Authentifizierte Routen, Feature-Guard (`public-shares`, Default aus), Audit-Einträge
- [ ] 2.2 Öffentliche Routen, Auth-Bypass-Präfix, Rate-Limit, Unlock-Cookie
- [ ] 2.3 Antwort-Header (no-store, noindex, CSP, Referrer-Policy)
- [ ] 2.4 Verdrahtung in `src/index.ts` (manuelle DI); Routen-Tests inkl. „404 ununterscheidbar“

## Phase 3 — Öffentliche Seite

- [ ] 3.1 `publicMode` in der Reading-View-Pipeline: Embed-Resolver aus der `embeds`-Map, Wikilinks/Markdown-Links
      zu Text, Plugin-Blöcke neutralisiert, Hinweisbox für `unavailable`
- [ ] 3.1a Vergleichstest: dieselbe Notiz mit Notiz-, Abschnitts-, Bild-Einbettung rendert im `publicMode` wie in der
      Reading View
- [ ] 3.2 `PublicSharePage` unter `/s/:token`, Passwortabfrage, Fehlerseite, Hell/Dunkel
- [ ] 3.3 Tests + `*.a11y.test.tsx`

## Phase 4 — Verwaltung

- [ ] 4.1 `PublicShareDialog` (Fokus-Falle, Kopieren, Passwort, Ablauf, Widerruf) und Kontextmenü-Eintrag
- [ ] 4.1a Vorschau „Dieser Link enthält zusätzlich …“ über `GET …/public-shares/preview`, inkl. Hinweisen
- [ ] 4.2 Einstellungen „Meine Links“ mit `feature:` in `settingsRegistry.ts`
- [ ] 4.3 Admin-Toggle in den Feature-Einstellungen

## Phase 5 — Abschluss

- [ ] 5.1 README (Features-Tabelle, API-Tabelle, Operating Model: öffentliche Pfade), Welcome-Vaults DE/EN
- [ ] 5.2 Gesamt-Review inkl. `/security-review`, Coverage-Schwellen prüfen (nicht senken)
- [ ] 5.3 Manueller Test in isolierter Instanz: Link ohne Login, Passwort, Ablauf, Widerruf, Umbenennen, Löschen
