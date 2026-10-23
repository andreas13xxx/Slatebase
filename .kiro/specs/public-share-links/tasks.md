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

- [x] 1.1 Typen, Fehler, `IPublicShareStore` + Store über `json-file-store.ts` (Token nur als Hash)
- [x] 1.2 `IPublicShareService`: create/list/revoke/update, Passwort (scrypt), Ablauf
- [x] 1.3 `embed-resolver.ts`: rekursive Auflösung (Notiz, Abschnitt, Block, Asset), Tiefe 3, Zyklen, Größenlimit,
      `.base`/`.canvas`/Abfrageblöcke und Dot-Dateien → `unavailable`; `readAsset` mit transitiver Allowlist
      (umgesetzt als `getAsset` im Service, das die Einbettungen pro Abruf neu auflöst)
- [x] 1.3a Tests: Ring A→B→A, Tiefe 4, Fan-out über dem Limit, Abschnitts-/Blockauszug, Frontmatter entfernt,
      gelöschte Einbettung, `.base`, `.slatebase/…`, Asset außerhalb der Allowlist
- [x] 1.4 Pfad-Umschreiben bei Umbenennen/Verschieben, 404 bei Löschen/Papierkorb
      (`onFileRenamed`/`onFileDeleted` im Service; das Anhängen an `ILinkIndexHook` folgt bei der Verdrahtung in Phase 2.4)
- [x] 1.5 Tests (hand-geschriebene Mocks): Token-Entropie, Ablauf, Widerruf, Traversal, Dot-Dateien, Papierkorb

### Befunde Phase 4

- **Zugang:** Kontextmenü einer Notiz im Explorer („Öffentlichen Link verwalten“, nur `.md`, nur Schreibende, nur bei
  aktivem Feature) und Befehlspalette („Öffentlichen Link der Notiz verwalten“). Beide lösen das Window-Event
  `slatebase:open-public-share` aus (wie bei der Versionsansicht); `App` zeigt den Dialog. Der Explorer liest das Feature
  über den optionalen `FeatureContext`, damit er auch ohne `FeatureProvider` rendert.
- **Dialog:** Vorschau „Der Link enthält zusätzlich“ (Notizen, Dateien, nicht verfügbare Einbettungen mit Erklärung),
  Passwort und Ablaufdatum beim Erzeugen, danach URL nur einmal sichtbar und kopierbar. Ein bestehender Link zeigt seine
  Eigenschaften (ohne URL), erlaubt Passwort/Ablauf setzen und entfernen, widerrufen und „Neuen Link erzeugen“.
- **Einstellungen:** Sektion „Öffentliche Links“ (Konto, `feature: 'public-shares'`) mit allen eigenen Links über alle
  Vaults, Widerruf mit Bestätigung. Die `settings.sections.*`-i18n-Schlüssel der Registry werden im Code nicht gelesen
  (Labels kommen aus `SECTION_LABELS`); ein Eintrag dort wurde deshalb nicht angelegt.
- **Admin-Toggle:** Die Feature-Tabelle der Administration kommt generisch aus der Backend-Registry; `public-shares`
  erscheint ohne Frontend-Änderung. Das Audit-Log kennt die fünf neuen Aktionen (Filter-Dropdown ergänzt).

### Befunde Phase 3

- **Umsetzung ohne Umbau von `ViewMode`:** Statt die Embed-Quelle durch alle Render-Funktionen zu reichen, bekommt die
  Reading View eine **synthetische Vault-ID** `public-share:<token>` (`public-share/publicVault.ts`). Nur wenige Stellen
  erkennen sie: `buildImageSrc` (Asset-URL statt Vault-URL), `renderWikilinkNode` und `renderLink` (Text statt Link),
  `NoteEmbed` (liest aus `PublicEmbedContext` statt aus dem API-Client, ohne erneuten Auszug) und
  `missingEmbedLabel` (neutraler Hinweis „Eingebetteter Inhalt nicht verfügbar“). Plugin-Embeds und Bases sind im
  öffentlichen Modus abgeschaltet. Der Standardpfad bleibt unverändert (64 bestehende `ViewMode`-Tests grün).
- **Synthetischer Dateibaum** (`buildPublicTree`): enthält nur vom Server aufgelöste Einbettungen; Pfad = Ziel wie
  geschrieben (Notizen mit `.md`), das ist zugleich die `ref` der Asset-URL. Nicht aufgelöste Einbettungen fehlen im Baum
  und erscheinen als neutraler Hinweis.
- **Markdown-Bilder:** Der Server normalisiert den Schlüssel wie `normalizeImagePath` (dekodiert, `\` → `/`, `./` weg,
  doppelte `/` zusammengefasst), damit Client und Server denselben Schlüssel bilden.
- **Standalone:** `main.tsx` rendert für `/s/<token>` nur `PublicSharePage` (dynamisch geladen), ohne `App`, Sitzungsprüfung
  und Provider. Ein fehlgeschlagener Abruf gilt als „unbekannt“ (Wiederholen-Knopf), nur ein 404 als „Link nicht verfügbar“.
- **Nicht umgesetzt:** Der in 3.1a genannte Vergleichstest „wie in der Reading View“ ist als Verhaltenstest umgesetzt
  (Notiz-, Bild-, Wikilink-Verhalten in `PublicSharePage.test.tsx`), nicht als Pixelvergleich.

### Befunde Phase 2

- **Header:** `secureHeaders` ist global vor den Routen registriert und setzt seine Header nach dem Handler; eine eigene CSP
  oder Referrer-Policy pro Route würde überschrieben. Die globale CSP (`frame-ancestors 'none'`, `default-src 'self'`) und die
  Referrer-Policy `strict-origin-when-cross-origin` (kein Pfad, also kein Token, an Fremdseiten) gelten daher auch für die
  öffentlichen Routen; die Route setzt `Cache-Control: no-store` und `X-Robots-Tag: noindex, nofollow`. SVG/HTML/XML-Assets
  werden mit `Content-Disposition: attachment` ausgeliefert (als `<img>` bleiben sie wirkungslos). Die Seite setzt zusätzlich
  `<meta name="referrer" content="no-referrer">` (Phase 3).
- **Feature aus:** Verwaltungsrouten antworten wie alle Feature-Guards mit 403 `FEATURE_DISABLED`, der anonyme Leser mit 404.
- **Audit:** Aufrufe der Notiz (`PUBLIC_SHARE_ACCESSED`) und Fehlversuche (`PUBLIC_SHARE_DENIED`, höchstens 10 Zeilen pro
  Minute und Adresse) werden protokolliert; Asset-Abrufe nicht einzeln (sie gehören zum Aufruf der Notiz). Das Audit nennt nur
  die letzten vier Zeichen des Tokens.
- **Passwort-Sitzung:** Cookie `sb_share_<hash>` (HttpOnly, SameSite=Strict, Pfad = genau dieser Link, 30 min), HMAC über
  Link, Ablauf und eine vom Passwort abhängige Bindung; ein neues oder entferntes Passwort entwertet es sofort. Falsche
  Passwörter: 5 pro 15 Minuten je Adresse und Link, dazu 300 Anfragen pro Minute und Adresse insgesamt.
- **Offen:** Beim Löschen eines ganzen Vaults bleiben dessen Link-Einträge in `public-shares.json` liegen (der Leser liefert
  404, die Verwaltung zeigt sie nicht mehr). Aufräumen in Phase 5.

### Befunde Phase 1 (für Phase 2/3)

- **Vault-Zugriff ist abstrahiert** (`IPublicShareVaultAccess`: `getTree`, `readText`, `readBinary`). Die Implementierung auf
  `VaultReader` + `validateFilePath()` + `assertRealPathInsideVault` entsteht bei der Verdrahtung (2.4) und braucht eigene
  Tests (Symlink aus dem Vault heraus, Pfad mit `..`, Binärdatei als Text).
- **SVG als Asset:** SVG kann Skripte enthalten. Die Asset-Route (2.3) muss `Content-Security-Policy: sandbox` bzw.
  `default-src 'none'` und `X-Content-Type-Options: nosniff` setzen und SVG nur als `<img>`, nie inline ausliefern.
- **Auflösung relativ zum Vault, nicht zur Notiz:** Wie die Reading View löst der Resolver Einbettungsnamen ohne Quellordner
  auf; die Map ist nach dem Verweis wie geschrieben geschlüsselt. Der Client muss denselben Schlüssel bilden
  (`embedRef`: `ziel`, `ziel#Überschrift`, `ziel#^block`).
- **Passwort-Hash ist scrypt** (Salt + 64 Byte, Node-Standardparameter), nicht argon2 wie bei Nutzerpasswörtern, um keine
  zweite Abhängigkeit im öffentlichen Pfad zu brauchen; passt zu Anforderung 3.3.
- **Zugriffszeit** (`lastAccessAt`) wird höchstens einmal pro Minute geschrieben und scheitert still.

## Phase 2 — Routen und Sicherheit

- [x] 2.1 Authentifizierte Routen, Feature-Guard (`public-shares`, Default aus), Audit-Einträge
- [x] 2.2 Öffentliche Routen, Auth-Bypass-Präfix, Rate-Limit, Unlock-Cookie
- [x] 2.3 Antwort-Header (no-store, noindex, CSP, Referrer-Policy)
- [x] 2.4 Verdrahtung in `src/index.ts` (manuelle DI); Routen-Tests inkl. „404 ununterscheidbar“

## Phase 3 — Öffentliche Seite

- [x] 3.1 `publicMode` in der Reading-View-Pipeline: Embed-Resolver aus der `embeds`-Map, Wikilinks/Markdown-Links
      zu Text, Plugin-Blöcke neutralisiert, Hinweisbox für `unavailable`
- [x] 3.1a Vergleichstest: dieselbe Notiz mit Notiz-, Abschnitts-, Bild-Einbettung rendert im `publicMode` wie in der
      Reading View
- [x] 3.2 `PublicSharePage` unter `/s/:token`, Passwortabfrage, Fehlerseite, Hell/Dunkel
- [x] 3.3 Tests + `*.a11y.test.tsx`

## Phase 4 — Verwaltung

- [x] 4.1 `PublicShareDialog` (Fokus-Falle, Kopieren, Passwort, Ablauf, Widerruf) und Kontextmenü-Eintrag
- [x] 4.1a Vorschau „Dieser Link enthält zusätzlich …“ über `GET …/public-shares/preview`, inkl. Hinweisen
- [x] 4.2 Einstellungen „Meine Links“ mit `feature:` in `settingsRegistry.ts`
- [x] 4.3 Admin-Toggle in den Feature-Einstellungen

## Phase 5 — Abschluss

- [ ] 5.1 README (Features-Tabelle, API-Tabelle, Operating Model: öffentliche Pfade), Welcome-Vaults DE/EN
- [ ] 5.2 Gesamt-Review inkl. `/security-review`, Coverage-Schwellen prüfen (nicht senken)
- [ ] 5.3 Manueller Test in isolierter Instanz: Link ohne Login, Passwort, Ablauf, Widerruf, Umbenennen, Löschen
