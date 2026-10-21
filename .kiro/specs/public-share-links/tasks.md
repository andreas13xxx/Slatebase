# Öffentliche Freigabe-Links — Tasks

Jede Phase wird einzeln grün (tsc, Lint, betroffene Tests) committet.

## Phase 0 — Klärung

- [ ] 0.1 Stabile Datei-ID im Link-Index prüfen; sonst Rewrite über Vault-Ereignisse (Design „Token folgt der Datei“)
- [ ] 0.2 Reading-View-Pipeline prüfen: wo lässt sich `publicMode` einhängen (Wikilinks, Embeds, Plugin-Blöcke)
- [ ] 0.3 Prüfen, wie Feature-Toggles und der Auth-Bypass (`VERSION_PATH`) verdrahtet sind

## Phase 1 — Backend-Kern

- [ ] 1.1 Typen, Fehler, `IPublicShareStore` + Store über `json-file-store.ts` (Token nur als Hash)
- [ ] 1.2 `IPublicShareService`: create/list/revoke/update, Passwort (scrypt), Ablauf
- [ ] 1.3 `embed-resolver.ts` und `readAsset` mit Einbettungs-Allowlist
- [ ] 1.4 Pfad-Umschreiben bei Umbenennen/Verschieben, 404 bei Löschen/Papierkorb
- [ ] 1.5 Tests (hand-geschriebene Mocks): Token-Entropie, Ablauf, Widerruf, Traversal, Dot-Dateien, Papierkorb

## Phase 2 — Routen und Sicherheit

- [ ] 2.1 Authentifizierte Routen, Feature-Guard (`public-shares`, Default aus), Audit-Einträge
- [ ] 2.2 Öffentliche Routen, Auth-Bypass-Präfix, Rate-Limit, Unlock-Cookie
- [ ] 2.3 Antwort-Header (no-store, noindex, CSP, Referrer-Policy)
- [ ] 2.4 Verdrahtung in `src/index.ts` (manuelle DI); Routen-Tests inkl. „404 ununterscheidbar“

## Phase 3 — Öffentliche Seite

- [ ] 3.1 `publicMode` in der Reading-View-Pipeline (Wikilinks/Transklusion/Plugin-Blöcke neutralisiert)
- [ ] 3.2 `PublicSharePage` unter `/s/:token`, Passwortabfrage, Fehlerseite, Hell/Dunkel
- [ ] 3.3 Tests + `*.a11y.test.tsx`

## Phase 4 — Verwaltung

- [ ] 4.1 `PublicShareDialog` (Fokus-Falle, Kopieren, Passwort, Ablauf, Widerruf) und Kontextmenü-Eintrag
- [ ] 4.2 Einstellungen „Meine Links“ mit `feature:` in `settingsRegistry.ts`
- [ ] 4.3 Admin-Toggle in den Feature-Einstellungen

## Phase 5 — Abschluss

- [ ] 5.1 README (Features-Tabelle, API-Tabelle, Operating Model: öffentliche Pfade), Welcome-Vaults DE/EN
- [ ] 5.2 Gesamt-Review inkl. `/security-review`, Coverage-Schwellen prüfen (nicht senken)
- [ ] 5.3 Manueller Test in isolierter Instanz: Link ohne Login, Passwort, Ablauf, Widerruf, Umbenennen, Löschen
