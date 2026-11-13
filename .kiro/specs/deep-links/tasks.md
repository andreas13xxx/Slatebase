# Deep-Links — Tasks

Jede Phase wird einzeln grün (tsc, `npm run lint`, `npm run build`, betroffene Tests) committet.

## Phase 0 — Klärung

- [x] 0.1 Mechanik für „zur Überschrift/zum Block springen“ finden, die der Wikilink-Klick nutzt (Event/Bridge) und prüfen, ob sie nach `openTab` verlässlich greift (Tab-Inhalt noch am Laden)
- [x] 0.2 Signal „Workspace-Restore fertig“ in `useWorkspaceRestore.ts` ablesbar machen (oder bestehendes nutzen)
- [x] 0.3 Prüfen, ob `/open` in `nginx.conf` und im Vite-Dev-Server ohne Änderung ausgeliefert wird (SPA-Fallback) und keine Backend-Route kollidiert
- [x] 0.4 Stelle klären, an der Login + `mustChangePassword` abgeschlossen sind (wann `DeepLinkHandler` starten darf)

### Befunde Phase 0 (2026-11-13)

**0.1 Sprung zur Überschrift gibt es nur in der Leseansicht.** `ViewMode.tsx` hat lokale `scrollToHeadingAnchor()`/
`scrollToBlockAnchor()` (DOM-Anker, Aufruf nach `setTimeout(…, 100)` als Warten auf das Rendern des Ziel-Tabs). Der CM6-Editor
hat keinen Sprung (`FavoritesView.tsx:231` hat dafür ein offenes TODO). Konsequenz für Phase 3: Die Anker-Auflösung ist neu zu
bauen und aus `ViewMode` herauszuziehen (gemeinsame, testbare Funktion; kein 100-ms-Raten, sondern warten, bis der Tab geladen
ist). Im Editor: Überschrift über `extractHeadings`/Syntaxbaum finden, `EditorView.scrollIntoView` + Cursor setzen. Das ist
mehr Arbeit als in der Spec angenommen („dieselbe Mechanik wie `[[Notiz#…]]`“) — Wikilink-Klick im Editor springt heute
ebenfalls nicht zur Überschrift.

**0.2 Kein beobachtbares „Restore fertig“.** `useWorkspaceRestore` setzt nur Refs (`hasRestoredRef`, `isRestoringRef`) im
Effekt, sobald `vaults.length > 0`; der Pane-Baum ist vor dem ersten Render geseedet, nur der Tab-Inhalt kommt asynchron.
Entscheidung: kein neues Signal. `DeepLinkHandler` wird in `AppContent` NACH dem `useWorkspaceRestore`-Aufruf eingehängt und
wartet ebenfalls auf `vaults.length > 0`; Effekte laufen in Deklarationsreihenfolge, `VAULT_SELECTED`/`OPEN_TAB` des Links
kommen damit nach denen des Restores und gewinnen. Nachladende Tab-Inhalte sind per Tab-ID adressiert und stören nicht.

**0.3 `/open` ist ohne Änderung erreichbar.** `nginx.conf` liefert über `try_files … /index.html` aus, Vite (SPA-Default) ebenso;
im Backend gibt es keine Route `/open` (alles unter `/api/v1`, Ausnahmen `/healthz`, `/readyz`, `/.well-known/`).

**0.4 Startpunkt.** `AppContent` (und damit der Handler) rendert erst bei `isAuthenticated && !mustChangePassword`; der Login
ist eine SPA-Zustandsänderung ohne Reload, `sessionStorage` bleibt also erhalten. Einlesen von `/open` am Modul-Level von
`App.tsx` (neben `initializeWorkspace()`), VOR dem Auth-Gate.

**Abweichung vom Design (Phase 1):** Der Anker wird nur dann abgetrennt, wenn das `#` direkt auf `.md` folgt
(`^(.*?\.md)#(.*)$`). Ein `#` sonst gehört zum Dateinamen (`C#.md`); sonst wären solche Notizen nicht adressierbar.
Ein leerer/ungültiger Anker macht den ganzen Link ungültig statt die Notiz oben zu öffnen.

## Phase 1 — Reine Logik

- [x] 1.1 `deep-link/deepLink.ts`: `parseDeepLink`, `buildDeepLink`, `isSafeVaultPath`, `resolveVaultRef`
- [x] 1.2 `deep-link/pendingDeepLink.ts`: sessionStorage, Ablauf 10 min, einmaliger Verbrauch
- [x] 1.3 Tests (Round-Trip, Randfälle, Ablauf) — Pfad-Traversal-Test zuerst

## Phase 2 — Link erzeugen (`workspace:copy-url`)

- [x] 2.1 Handler in `core-commands-app.ts` verdrahten, `unsupported: 'url-scheme'` entfernen
- [x] 2.2 Clipboard + Fallback-Toast, i18n de/en (`deepLink.*`)
- [ ] 2.3 „Link kopieren“ im Tab-Kontextmenü (`tab-context-menu.ts`, **erledigt**) und Explorer-Kontextmenü (**offen**: das Menü in `FileExplorer.tsx` hat noch keinen Pfad-/Link-Eintrag)
- [x] 2.4 `UNSUPPORTED_REASONS`-Eintrag und PLUGIN-COMPAT.md-Tabelle („Geplant, aber noch nicht umgesetzt“) bereinigen
- [x] 2.5 Tests (Datei-Tab, Sentinel-Tab, kein Vault)

## Phase 3 — Link öffnen

- [x] 3.1 Einlesen von `/open` vor dem ersten Render (Modul-Level in `App.tsx`), Adresse bereinigen
- [x] 3.2 `DeepLinkHandler.tsx` (Auth/Restore/Vault-Liste abwarten, Vault wählen, Baum prüfen, `openTab`, Anker)
- [x] 3.3 Einheitliche Fehlermeldung (R5.1), kein Existenz-Orakel
- [x] 3.4 Login-Überbrückung (Link überlebt Login und erzwungenen Passwortwechsel)
- [x] 3.5 Tests inkl. Vault-Wechsel-Race und Restore-Reihenfolge

### Umsetzung Phase 3 (2026-11-13)

- Einlesen: `deep-link/captureDeepLink.ts`, am Modul-Level von `App.tsx` neben `initializeWorkspace()`; Adresse wird auf `/` bereinigt, ein
  unbrauchbarer Link wird als Merker gehalten und nach dem Login einmal gemeldet.
- Öffnen: **Hook** `deep-link/useDeepLink.ts` statt einer Komponente (Abweichung vom Design) — Effekt-Reihenfolge innerhalb von
  `AppContent` ist die Garantie, dass der Link-Tab NACH dem Vault-Wechsel-Effekt geöffnet wird; eine Kind-Komponente liefe vorher und
  würde von dessen `CLEAR_ALL_TABS` überschrieben. Aufruf deshalb direkt hinter diesem Effekt, mit Kommentar.
- Die Datei wird VOR dem Tab geholt (`fetchFileContent`): ein toter Link hinterlässt keinen Fehler-Tab; Fehler/Unbekannt/kein Zugriff →
  dieselbe Meldung (R5.1). Kein Baum-Abgleich, weil der Baum lazy lädt.
- Anker: `state/anchorJumpBridge.ts` (geparkte Anforderung je Tab + Listener) und `hooks/useAnchorJump.ts` (wendet an, sobald der Tab fertig
  geladen ist; begrenzte Wiederholungen alle 50 ms bis ca. 2 s, dann wird die Anforderung verworfen). Angewendet in `TabContent.tsx`:
  Leseansicht über DOM-Anker (`utils/scrollToAnchor.ts`, aus `ViewMode.tsx` herausgezogen, liefern jetzt `boolean`), Editor über
  `utils/findAnchorOffset.ts` + `EditorView.scrollIntoView`; der Editor wird erst angefasst, wenn sein Dokument dem Tab-Inhalt entspricht.
  Fehlt der Anker in der Notiz, bleibt sie oben stehen.
- Bekannte Grenzen: Der Wikilink-Klick im Editor springt weiterhin nicht zu Überschriften (nur Deep-Links nutzen den neuen Weg); die
  Wiederholungen sind bewusst begrenzt statt ereignisgesteuert; ein Link auf eine Notiz in einem eingeklappten Abschnitt der Leseansicht
  scrollt nur, wenn der Anker im DOM existiert.

## Phase 4 — Abschluss

- [x] 4.1 `product.md` (Navigation & Discovery), `structure.md` (neues Verzeichnis `deep-link/`), `PLUGIN-COMPAT.md`, Welcome-Vault-Guide (DE `Features/Links zu Notizen.md`, EN `Features/Links to Notes.md`, beide in der Übersicht verlinkt) ergänzt
- [x] 4.2 `implementation-plan.md`: Zeile „Deep-Links“ auf umgesetzt gesetzt (Reste vermerkt)
- [ ] 4.3 **Noch nicht gemacht** (braucht einen echten Browser gegen eine laufende Instanz; Befund 4 des Reviews — späte Tab-Wiederherstellung nach Vault-Wechsel — hängt daran). Manueller Test: abgemeldet → Link → Login → Notiz; falscher Vault; fremder Vault; Datei gelöscht; Reload bleibt auf `/`
