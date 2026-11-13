# Deep-Links — Tasks

Jede Phase wird einzeln grün (tsc, `npm run lint`, `npm run build`, betroffene Tests) committet.

## Phase 0 — Klärung

- [ ] 0.1 Mechanik für „zur Überschrift/zum Block springen“ finden, die der Wikilink-Klick nutzt (Event/Bridge) und prüfen, ob sie nach `openTab` verlässlich greift (Tab-Inhalt noch am Laden)
- [ ] 0.2 Signal „Workspace-Restore fertig“ in `useWorkspaceRestore.ts` ablesbar machen (oder bestehendes nutzen)
- [ ] 0.3 Prüfen, ob `/open` in `nginx.conf` und im Vite-Dev-Server ohne Änderung ausgeliefert wird (SPA-Fallback) und keine Backend-Route kollidiert
- [ ] 0.4 Stelle klären, an der Login + `mustChangePassword` abgeschlossen sind (wann `DeepLinkHandler` starten darf)

## Phase 1 — Reine Logik

- [ ] 1.1 `deep-link/deepLink.ts`: `parseDeepLink`, `buildDeepLink`, `isSafeVaultPath`, `resolveVaultRef`
- [ ] 1.2 `deep-link/pendingDeepLink.ts`: sessionStorage, Ablauf 10 min, einmaliger Verbrauch
- [ ] 1.3 Tests (Round-Trip, Randfälle, Ablauf) — Pfad-Traversal-Test zuerst

## Phase 2 — Link erzeugen (`workspace:copy-url`)

- [ ] 2.1 Handler in `core-commands-app.ts` verdrahten, `unsupported: 'url-scheme'` entfernen
- [ ] 2.2 Clipboard + Fallback-Toast, i18n de/en (`deepLink.*`)
- [ ] 2.3 „Link kopieren“ im Tab-Kontextmenü (`tab-context-menu.ts`) und Explorer-Kontextmenü
- [ ] 2.4 `UNSUPPORTED_REASONS`-Eintrag und PLUGIN-COMPAT.md-Tabelle („Geplant, aber noch nicht umgesetzt“) bereinigen
- [ ] 2.5 Tests (Datei-Tab, Sentinel-Tab, kein Vault)

## Phase 3 — Link öffnen

- [ ] 3.1 Einlesen von `/open` vor dem ersten Render (Modul-Level in `App.tsx`), Adresse bereinigen
- [ ] 3.2 `DeepLinkHandler.tsx` (Auth/Restore/Vault-Liste abwarten, Vault wählen, Baum prüfen, `openTab`, Anker)
- [ ] 3.3 Einheitliche Fehlermeldung (R5.1), kein Existenz-Orakel
- [ ] 3.4 Login-Überbrückung (Link überlebt Login und erzwungenen Passwortwechsel)
- [ ] 3.5 Tests inkl. Vault-Wechsel-Race und Restore-Reihenfolge

## Phase 4 — Abschluss

- [ ] 4.1 `product.md` (Navigation & Discovery), `structure.md` (neues Verzeichnis `deep-link/`), `PLUGIN-COMPAT.md`, Welcome-Vault-Guide (DE/EN) ergänzen
- [ ] 4.2 `implementation-plan.md`: Zeile „Deep-Links“ auf ausgeliefert setzen
- [ ] 4.3 Manueller Test: abgemeldet → Link → Login → Notiz; falscher Vault; fremder Vault; Datei gelöscht; Reload bleibt auf `/`
