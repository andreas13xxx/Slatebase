# Security Hardening — Tasks

## Phase 1: Audit & Report-Grundlage

- [ ] Task 1: `SECURITY-AUDIT.md` mit OWASP-Top-10-Struktur anlegen, bereits behobene Findings (Commit `d176e49`) als Baseline eintragen
- [ ] Task 2: Rate-Limit-Abgleich aller `/api/v1/*`-Routen gegen vorhandene Limiter durchführen, Tabelle in Report eintragen (R4)
- [ ] Task 3: Path-Traversal-Stichprobe: Rename/Move-Pfad in `backend/src/business/index.ts` sowie weitere `path.join`/`path.resolve`-Aufrufe mit Nutzer-Input prüfen (R8.1/R8.2)

## Phase 2: CSP & Security-Header

- [ ] Task 4: Klären ob Plugin-Loader (`frontend/src/plugins/compat/plugin-loader.ts`) `eval`/`new Function` zur Bundle-Ausführung braucht (Voraussetzung für Task 5)
- [ ] Task 5: `secureHeaders()`-Konfiguration in `backend/src/index.ts` um `scriptSrc`/`defaultSrc`/`styleSrc`/`imgSrc`/`connectSrc` erweitern
- [ ] Task 6: `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy` ergänzen falls fehlend
- [ ] Task 7: Regressionsprüfung: Editor, Canvas, Plugin-Install/-Aktivierung, Graph-View mit neuer CSP testen (Browser-Konsole auf Violations prüfen)

## Phase 3: Input-Validierung

- [ ] Task 8: zod-Schemas für `uploadRoutes.ts` (Größe, MIME, Pfad)
- [ ] Task 9: zod-Schemas für `vaultShareRoutes.ts`
- [ ] Task 10: zod-Schemas für `adminRoutes.ts`
- [ ] Task 11: zod-Schemas für `authRoutes.ts` (ohne Timing-Verhalten der Login-Route zu verändern)
- [ ] Task 12: zod-Schemas für `pluginRoutes.ts`, `mcpRoutes.ts`, `userRoutes.ts`
- [ ] Task 13: Tests für invalid-payload-Fälle (400-Response) in den betroffenen Route-Test-Dateien ergänzen

## Phase 4: Dependency-Audit in CI

- [ ] Task 14: `npm audit --audit-level=high` als Step in `.github/workflows/ci.yml` (Backend-Job) ergänzen
- [ ] Task 15: `npm audit --audit-level=high` als Step in `.github/workflows/ci.yml` (Frontend-Job) ergänzen
- [ ] Task 16: Bestehende Findings ohne verfügbaren Fix identifizieren, ggf. `--omit=dev` nutzen und Rest im Report dokumentieren

## Phase 5: Plugin-Sandbox-Härtung

- [ ] Task 17: UI-Warnung im Plugin-Install-Flow bei `hasEvalUsage: true` (aus `plugin-installer.ts`-Scan) mit explizitem Bestätigungsschritt
- [ ] Task 18: Bypass-Dokumentation als Kommentar in `sandbox.ts` + Report-Eintrag (Trust-Modell, Verweis auf `server-side-plugins`-Spec)

## Phase 6: Secrets-Management

- [ ] Task 19: Sichtbare Startup-Warnung falls `SLATEBASE_CSRF_SECRET`/`SLATEBASE_SYNC_SECRET` nicht gesetzt
- [ ] Task 20: `.gitignore`-Abdeckung für `backend/.env` verifizieren
- [ ] Task 21: README/Deploy-Doku um "Produktions-Secrets"-Abschnitt ergänzen falls nicht vorhanden

## Phase 7: Abschluss

- [ ] Task 22: `SECURITY-AUDIT.md` finalisieren (alle Findings mit Status Fixed/Backlog/Akzeptiert), Fix-Backlog für nicht in diesem Pass behobene Punkte festhalten
