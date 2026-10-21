# Obsidian Themes: Community-Store — Requirements

## Kontext

Stufe 1 (`obsidian-themes`, PR #251) macht Themes aus dem Vault nutzbar, Stufe 2 (`obsidian-themes-structure`, PR #253)
gleicht die Editor-Klassen an. Themes kommen heute **nur per Datei-Import** in den Vault (`theme.css` + optional
`manifest.json`, Einstellungen → Vault → Themes). Der Community-Katalog war in Stufe 1 ausdrücklich ein Nicht-Ziel.

Diese Spec beschreibt den **Community-Store für Themes**: Katalog durchsuchen, Theme installieren, auf Updates prüfen.
Sie folgt dem vorhandenen Community-Plugin-Store (`community-plugin-store`, `backend/src/plugin-store/`) und nutzt dessen
Schutzmaßnahmen (Host-Allowlist, Größenlimit, Rate-Limit, Cache). Ein Abschnitt am Ende erfasst die übrigen offenen
Themes-Anforderungen mit Entscheidung, was in diese Spec gehört und was nicht.

### Befund zum Upstream (geprüft 2026-10-20)

| Punkt | Befund |
|---|---|
| Katalog | `obsidianmd/obsidian-releases/master/community-css-themes.json`, 910–911 Einträge (Stand beim Messen: 911), Felder `name`, `author`, `repo` (`owner/repo`), `screenshot` (Pfad im Repo), `modes` (`dark`/`light`), bei 17 Einträgen `legacy: true` |
| Namen | alle 910 Namen sind eindeutig (auch case-insensitiv); Obsidian ordnet installierte Themes dem Katalog über den Namen zu |
| Dateien | `theme.css` und `manifest.json` im Repo-Wurzelverzeichnis des Default-Branches, abrufbar über `raw.githubusercontent.com/<repo>/HEAD/…` (Minimal, Things geprüft: beide 200). **Kein GitHub-API-Aufruf nötig, kein API-Rate-Limit** |
| Statistik | Es gibt keine `community-css-theme-stats.json` wie bei Plugins; keine Download-Zahlen |
| Screenshots | repo-relative Pfade mit Unregelmäßigkeiten (`./docs/dark.png`, `/images/x.png`, Leerzeichen, leer), 378 verschiedene Werte |
| `legacy` | Ältere Themes (`obsidian.css`), die Obsidian nur noch begrenzt unterstützt |

### Messung gegen die Wirklichkeit (Phase 0, 2026-10-21, `probe-catalog.py`)

Alle 911 Einträge wurden abgerufen (nur `raw.githubusercontent.com`, mit Wiederholung bei Netzfehlern; ein erster Lauf mit
8 parallelen Anfragen lieferte bei 431 Anfragen gar keine Antwort und wurde verworfen, der gültige Lauf nutzt 3).

| Ergebnis | Zahl |
|---|---|
| installierbar: `manifest.json` gültig **und** `theme.css` ≤ 2 MB | **818 (90 %)** |
| davon Manifestname = Katalogname | 818 (alle) |
| `manifest.json` fehlt (404) | 62 |
| `theme.css` fehlt (404) | 66 |
| beide fehlen | 60, davon **15 der 17 `legacy`-Themes** |
| nur eines fehlt | 6 ohne CSS (z. B. Material 3, steam), 2 ohne Manifest (Lizardmen Zettelkasten, Viridian) |
| Manifest ungültig / über 64 KB | 0 / 0 |
| `theme.css` über 2 MB | **26** (siehe unten) |
| Screenshot erreichbar (normalisierter Pfad) | 906 von 911; 3 × 404, 2 ohne Pfad |
| Screenshot über 2 MB | 16 |
| Screenshot-Typen | PNG 829, JPEG 69, WebP 5, GIF 1, SVG 1, `octet-stream` 1 |

Größe der installierbaren `theme.css`: Median 37 KB, 90. Perzentil 392 KB, Maximum 2038 KB. Die 26 zu großen Themes liegen
zwischen 2,0 und 42,5 MB; die größten betten offenbar Schriften oder Bilder als Base64 ein (Latsidian 42,5 MB, Agate
16,3 MB, Mint-Breeze, Evergreen-Shadow, Lavender-Mist je 8,1 MB). Knapp über der Grenze liegen **Catppuccin (2,2 MB)** und
Typomagical (2,0 MB), beides bekannte Themes.

**Folgerungen:**
- Das Manifest als Pflicht (R3.3) kostet nichts: Es gibt keinen Eintrag mit gültigem CSS und ungültigem Manifest. Die zwei
  Themes ohne Manifest (Lizardmen Zettelkasten, Viridian) sind über den Katalog nicht installierbar.
- 93 Themes (10 %) sind nicht installierbar. Der Katalog zeigt sie trotzdem (er kennt die Dateien erst beim Abruf); die
  Oberfläche muss „Nicht installierbar: <Grund>" sauber anzeigen (R3.8), statt einen allgemeinen Fehler.
- Das 2-MB-Limit schließt 26 Themes aus. Es bleibt bei 2 MB (gleich wie beim Import; ein Browser parst 40 MB CSS nicht
  sinnvoll), die Entscheidung über Catppuccin steht in den offenen Fragen des Designs.
- Screenshot-Normalisierung (R5.2) funktioniert: 906 von 911 lösen auf.

## Ziel

Ein Administrator oder Schreibberechtigter kann in den Themes-Einstellungen den Katalog durchsuchen, ein Theme mit einem
Klick in den Vault installieren (landet in `.obsidian/themes/<id>/`, wie beim Import) und sieht, wenn eine neuere Version
vorliegt. Der Server holt Dateien nur von GitHub-Hosts, begrenzt Größen und gibt keine Rohinhalte weiter, die er nicht
geprüft hat.

## Nicht-Ziele

- **Style Settings** und andere Plugins, die ein Theme erweitern (eigene Spec, siehe Backlog).
- **Mehrere aktive Themes** (Obsidian kennt genau eines).
- **Themes veröffentlichen** oder in den Katalog eintragen.
- **Automatische Installation ohne Zutun** (kein Auto-Update; Updates nur auf Klick).
- **Themes pro Nutzer.** Das Theme bleibt Vault-Eigenschaft (Stufe 1).
- **Eigene Kataloge** (andere URLs als `obsidianmd/obsidian-releases`) in dieser Version.

## Anforderungen

### R1 — Katalog anzeigen
1.1 Der Abschnitt **Themes** bekommt zwei Tabs: **Installiert** (heutige Ansicht mit Import) und **Entdecken** (Katalog).
1.2 Der Backend-Server lädt `community-css-themes.json`, validiert jeden Eintrag (`repo` muss `owner/repo` sein, `name`
    nicht leer, `modes` Teilmenge von `dark`/`light`) und überspringt fehlerhafte Einträge mit einer Warnung im Log.
1.3 Der Server **wärmt den Katalog beim Start vor** (Entscheidung 2026-10-20): ein einmaliger, nicht blockierender Abruf
    nach dem Start, nur wenn das Feature eingeschaltet ist. Scheitert er (offline), läuft der Server normal weiter, loggt
    eine Warnung und startet mit dem persistierten Stand; es gibt keine Wiederholungsschleife, der nächste Abruf erfolgt
    beim ersten Öffnen von „Entdecken" nach Ablauf der TTL.
    Die Liste wird serverseitig gecacht (TTL 1 Stunde, wie der Plugin-Katalog). Schlägt der Abruf fehl, liefert der Server
    den letzten gültigen Stand; ohne Cache eine Fehlermeldung mit Grund. Ein fehlgeschlagener Abruf ist „unbekannt", nie
    „leer".
1.4 Pro Eintrag zeigt die Oberfläche Name, Autor, unterstützte Modi (Hell/Dunkel) und, falls installiert, die
    installierte Version.
1.5 Einträge mit `legacy: true` sind standardmäßig ausgeblendet; ein Filter „Veraltete anzeigen" blendet sie ein und
    kennzeichnet sie.
1.6 Die Katalog-Route liefert die Liste ohne Vault-Bezug; der Zugriff folgt dem Plugin-Store (angemeldet, Feature-Gate
    siehe R7).

### R2 — Suche und Filter
2.1 Textsuche (debounced, höchstens 200 ms) über Name und Autor, ohne Beachtung der Groß-/Kleinschreibung.
2.2 Filter nach Modus: **Hell**, **Dunkel**, **Beide**. Voreinstellung ist der aktuelle Farbmodus des Nutzers
    (`theme-light`/`theme-dark`), damit niemand ein Dunkel-Theme in einer hellen Oberfläche installiert, ohne es zu merken.
2.3 Filter **Installiert** und **Update verfügbar**.
2.4 Gesamtzahl und Zahl der Treffer sind sichtbar; leere Ergebnisse zeigen „Keine Themes gefunden" mit
    „Filter zurücksetzen".
2.5 Die Liste lädt **unendlich nach** (Entscheidung 2026-10-20): Zunächst werden 24 Karten gerendert, beim Scrollen
    kommen weitere 24 hinzu (`IntersectionObserver`). Die Filterung läuft im Client auf dem vollständig geladenen Katalog;
    ein Filterwechsel setzt die Liste auf die ersten 24 zurück.
2.6 Unendliches Scrollen bleibt zugänglich: Unter der Liste steht immer die Schaltfläche **„Mehr laden"** (tastaturbedienbar,
    der Observer löst nur dieselbe Aktion aus), der Zähler „24 von 310 angezeigt" ist ein `aria-live`-Bereich, und der
    Fokus springt beim Nachladen nicht. Bei `prefers-reduced-motion` und ohne `IntersectionObserver` greift nur die
    Schaltfläche.

### R3 — Installieren
3.1 „Installieren" ruft eine Vault-Route auf (`POST /vaults/:vaultId/theme-store/install`, Body `{ "repo": "owner/repo" }`);
    sie braucht Schreibzugriff auf den Vault (zentrale Vault-Autorisierung: GET = lesen, sonst schreiben).
3.2 Der Server prüft, dass `repo` im aktuellen Katalog steht (kein beliebiges Repo), und lädt `manifest.json` und
    `theme.css` von `raw.githubusercontent.com/<repo>/HEAD/`.
3.3 Der Server validiert wie beim Import: CSS höchstens 2 MB, Manifest höchstens 64 KB und gültiges JSON, Theme-ID aus
    `manifest.name` (gleiche Regeln wie `validation.ts`: reservierte Namen, Windows-Namen, Groß-/Kleinschreibung). Fehlt
    das Manifest oder ist es ungültig, schlägt die Installation fehl (anders als beim Import: Der Katalog verspricht eins).
3.4 Die Installation geht durch `ThemeService.saveTheme` (atomare Schreibvorgänge, Manifest vor CSS, keine Symlinks).
3.5 Existiert schon ein Theme mit dieser ID, **überschreibt** die Installation nur, wenn der Client `replace: true`
    sendet (nach Rückfrage); sonst `409`.
3.6 Die Antwort enthält die Meta-Daten des Themes inklusive der externen Hosts (`@import`, `url(…)`), damit die Oberfläche
    denselben Hinweis zeigen kann wie beim Import.
3.7 Optional „Danach aktivieren" (Standard: aus). Aktivieren nutzt den bestehenden Weg (`appearance.json`,
    `vault:change`).
3.8 Ein Fehler (Netz, 404, zu groß, ungültig) zeigt die konkrete Ursache am Eintrag, getrennt nach „Dateien nicht im Repo gefunden" (404), „Theme zu groß (x MB, Grenze 2 MB)" und „Netzwerkfehler, erneut versuchen"; es bleibt kein halber Zustand im
    Vault.

### R4 — Updates
4.1 „Nach Updates suchen" vergleicht für jedes installierte Theme, das einem Katalogeintrag **namentlich** entspricht
    (case-insensitiv), `manifest.version` lokal und remote. Die Zuordnung braucht keine zusätzliche Datei im Vault.
4.2 Versionen werden als SemVer verglichen; nicht parsbare Versionen gelten als „unbekannt", nicht als Update.
4.3 Pro Theme mit Update zeigt die Oberfläche „1.2.0 → 1.3.1" und „Aktualisieren"; Aktualisieren ist Installieren mit
    `replace: true` für dasselbe Repo.
4.4 Die Ergebnisse werden 15 Minuten gecacht. Fehler einzelner Themes (Repo gelöscht, 404) überspringen nur dieses Theme
    und erscheinen als Warnung; sie sind „unbekannt", nie „kein Update".
4.5 Ein installiertes Theme ohne Katalogtreffer (selbst importiert) wird nicht geprüft und nie verändert.
4.6 Ein automatischer periodischer Check ist **nicht** Teil dieser Version (Offline-Betrieb, Datenschutz); nur auf Klick.

### R5 — Vorschau
5.1 Screenshots werden **nicht** direkt vom Browser bei GitHub geladen (Datenschutz). Der Server liefert sie über eine
    Route (`GET /theme-store/screenshot?repo=…`) aus, nur von `raw.githubusercontent.com`, nur Bildtypen (PNG, JPEG, WebP,
    GIF), höchstens 2 MB (16 von 911 Screenshots sind größer und bekommen den Platzhalter), mit Cache-Header.
5.2 Der Pfad aus dem Katalog wird normalisiert (`./`, führender `/`, URL-Kodierung); gelingt das nicht oder fehlt das Bild,
    zeigt die Karte einen neutralen Platzhalter. Ein fehlendes Bild blockiert nichts.
5.3 Die Bilder werden erst geladen, wenn die Karte sichtbar ist (lazy).

### R6 — Sicherheit
6.1 Nur diese Hosts: `raw.githubusercontent.com` (Dateien, Screenshots) und für den Katalog dieselbe Allowlist wie der
    Plugin-Store. Redirects werden nur innerhalb der Allowlist verfolgt (höchstens 5).
6.2 `repo` wird gegen `^[\w.-]+/[\w.-]+$` und gegen den Katalog geprüft, bevor es in eine URL eingesetzt wird.
6.3 Größenlimits wie R3.3 und R5.1, hart beim Lesen des Streams (nicht erst nach dem vollständigen Download).
6.4 Der Server gibt kein Token und keine internen Pfade zurück. Ein konfiguriertes `SLATEBASE_GITHUB_TOKEN` wird für
    `raw.githubusercontent.com` **nicht** mitgesendet (kein Grund, und es würde das Token an einen Cache-Host geben).
6.5 Ein Theme ist beliebiges CSS aus fremder Hand. Die Oberfläche sagt das vor der ersten Installation einmalig und zeigt
    externe Hosts (R3.6). CSS wird nicht ausgeführt, aber es kann Inhalte von fremden Servern laden; das ist derselbe
    Hinweis wie beim Import.
6.6 Audit-Log: Installation und Aktualisierung eines Themes werden wie andere Vault-Schreibvorgänge protokolliert.

### R7 — Berechtigung, Feature-Gate, Betrieb
7.1 Katalog lesen darf jeder angemeldete Nutzer; Installieren und Aktualisieren braucht Schreibzugriff auf den Vault.
7.2 Abschalten geschieht **nur serverweit** (Entscheidung 2026-10-20), nicht pro Vault. Das Feature hängt an einem **eigenen** Feature-Toggle (`obsidian-theme-store`, Standard: an), weil es als einziges
    Theme-Feature ausgehenden Netzverkehr auslöst. Aus: Tab „Entdecken" und alle `theme-store`-Routen entfallen
    (`createFeatureGuard`, Eintrag `feature:` in der Settings-Registry).
7.3 Ohne Internetzugang (Offline-Betrieb) bleibt der Tab „Installiert" voll nutzbar; „Entdecken" zeigt, dass der Katalog
    nicht erreichbar ist, und bietet „Erneut versuchen".
7.4 Single-Instance: Cache und Update-Ergebnisse liegen im Arbeitsspeicher; der Katalog wird zusätzlich wie beim
    Plugin-Store unter `data/` persistiert, damit ein Neustart ohne Netz nicht leer startet.

### R8 — Oberfläche und Barrierefreiheit
8.1 Neue Komponenten: `ThemeStoreBrowser` (Suche, Filter, Liste), `ThemeStoreCard`; deutsche Texte wie die übrigen
    Einstellungen; Fokusfalle in der Rückfrage („Theme ersetzen?").
8.2 Karten sind Tastatur-bedienbar (`button` statt `div`); Statusmeldungen (Installiert, Fehler) über `aria-live`.
8.3 `*.a11y.test.tsx` für Browser und Karte (vitest-axe).
8.4 Hell/Dunkel-Kennzeichnung nicht nur über Farbe, sondern mit Text.

### R9 — Dokumentation
9.1 Welcome-Vault `Features/Themes.md` (DE + EN): Abschnitt „Themes aus dem Katalog" mit Hinweis auf den Netzzugriff und
    den Schalter.
9.2 README (Features-Tabelle, API-Tabelle), `AGENTS.md` (Abschnitt Themes), `.kiro/steering/structure.md`,
    `VAULT-ROUTE-AUTHORIZATION.md`.

## Backlog: übrige offene Themes-Anforderungen

Stand der Spec-Reihe: Stufe 1 und 2 sind umgesetzt. Offen bzw. zurückgestellt, mit Einordnung:

| Punkt | Herkunft | Entscheidung |
|---|---|---|
| Community-Katalog, Online-Installation, Update-Prüfung | Stufe 1, Nicht-Ziel | **diese Spec** (R1–R9) |
| Screenshot-Vorschau im Katalog | neu | **diese Spec** (R5) |
| ZIP-Import | Stufe 1, Nicht-Ziel | **später, niedrige Priorität.** Obsidian-Themes werden als zwei Dateien verteilt; ZIP kommt fast nur bei Themes außerhalb des Katalogs vor. Wenn der Store da ist, deckt er den Normalfall ab |
| Style Settings (Plugin `obsidian-style-settings`) | Stufe 1/2, Nicht-Ziel | **eigene Spec nach einem Spike.** Offene Frage: Läuft das Plugin über die Plugin-Kompatibilität schon teilweise, und was setzt es (Variablen vs. Body-Klassen)? Die Messung zeigt, dass bei Minimal 1328 von 2954 Treffern hinter Style-Settings-Schaltern liegen; das ist der größte noch verbleibende Hebel für strukturlastige Themes |
| Mehrere aktive Themes | Stufe 1, Nicht-Ziel | **nein** (Obsidian-konform; Snippets bleiben die Ergänzung) |
| Lesemodus als Tab-Ansicht (`markdown-preview-view`) | Stufe 2, Nicht-Ziel | **eigenes Feature mit eigener Spec**; Voraussetzung für Reading-View-Selektoren (Things 73/75, Minimal 275/283 fehlend) |
| Workspace/Tabs/Ribbon/Titelleiste angleichen | Stufe 2, Entscheidung | **nein** (gemessen: keine Wirkung; Minimals Tab-Look hängt an Style-Settings-Schaltern) |
| `HyperMD-*` im Quellmodus, `cm-formatting` an allen Zeichen | Stufe 2, bekannte Grenzen | **nur auf Nachfrage**; keine gemessene Wirkung bei Minimal und Things. Erst neu bewerten, wenn der Store mehr Themes in Umlauf bringt und eines davon sichtbar abweicht |
| Wirkung an weiteren Themes messen | Stufe 2, Grenze | **nach dem Store, als Stichprobe** über die häufigsten Katalog-Themes (`measure-selectors.py` und die Sonden liegen vor); liefert die Entscheidungsgrundlage für die beiden Zeilen darüber |
| Texte der Themes-Einstellungen über i18n | Stufe 1 (deutsch fest verdrahtet wie die übrigen Einstellungen) | **mit dem Rest der Einstellungen**, nicht hier |
| Theme-Hinweis „Passt zu meinem Farbmodus" | neu | **diese Spec** (R2.2) |
