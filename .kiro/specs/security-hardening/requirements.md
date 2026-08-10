# Security Hardening — Requirements

## Motivation

Slatebase nähert sich v1.0. Der letzte Security-Pass (Commit `d176e49`, 2026-08-09) hat CodeQL-Findings behoben (XSS in Canvas-Markdown-Rendering, biased random bei Temp-Passwörtern, unvollständige YAML-Escaping, unvollständige HTML-Sanitisierung). Auth-Grundlagen sind solide (argon2id, HMAC-CSRF, Path-Traversal-Schutz im Vault-Layer, Rate-Limiting-Infrastruktur), aber es fehlt ein systematischer Durchgang: Input-Validierung ist nur in 7 von ~24 Route-Modulen per zod abgesichert, es gibt keinen `npm audit`-Schritt in CI, die CSP ist unvollständig (kein `script-src`/`default-src`), und der Plugin-"Sandbox" ist eine Proxy-basierte Soft-Isolation ohne echte Prozess-/Worker-Trennung.

Ziel: Ein OWASP-Top-10-orientierter Audit-Durchlauf über die bestehende Codebase, gefolgt von gezielten Härtungsmaßnahmen dort, wo der Aufwand im Rahmen (~20–30h) realistisch ist. Kein Rewrite der Auth- oder Sandbox-Architektur — das wären eigene, größere Features.

## Ist-Zustand (Referenz für die Umsetzung)

- **Auth:** Session-basiert (nicht JWT), Tokens via `randomBytes(64)` in `backend/src/auth/index.ts`, Passwort-Hashing mit argon2id (`backend/src/user/index.ts`), Timing-Angleichung bei unbekannten Usernamen, sliding (24h) + absolute (7d) Session-Expiry.
- **CSRF:** HMAC-SHA256 aus `sessionId` + Server-Secret, `timingSafeEqual`-Vergleich, Middleware auf `/api/v1/*` (`backend/src/index.ts`). Secret optional via `SLATEBASE_CSRF_SECRET`, sonst random beim Start generiert (übersteht keinen Neustart ohne gesetztes ENV).
- **CSP/Headers:** `hono/secure-headers` global aktiv, aber nur `objectSrc`/`frameAncestors: 'none'` explizit gesetzt — kein `script-src`/`default-src`.
- **Input-Validierung:** zod nur in graphRoutes, fileVersionRoutes u.a. (7/24 Dateien). Ohne zod: `authRoutes.ts`, `uploadRoutes.ts`, `userRoutes.ts`, `vaultShareRoutes.ts`, `pluginRoutes.ts`, `mcpRoutes.ts`, `adminRoutes.ts`.
- **Rate-Limiting:** Globaler `RateLimiter` auf `/api/v1/*` + dedizierte Limiter für Chat, MCP, Realtime/SSE, MCP-Token-Erstellung, Login.
- **Plugin-Sandbox:** `frontend/src/plugins/compat/sandbox.ts` — Proxy-Wrapper um `fetch`/`XHR`/Storage mit Allowlist, kein echtes Isolat (kein iframe/Worker/VM); Plugin-Code läuft im Main-Thread-Kontext. Install-Time-Scan auf `eval(`/`new Function(` ist ein Lint-Hinweis, kein Hard-Block.
- **Dependency-Audit:** Dependabot (wöchentlich, nur minor/patch gruppiert) vorhanden, aber kein `npm audit`-Gate in CI.
- **Path-Traversal:** `validateFilePath()` in `backend/src/vault/index.ts` robust und getestet (Normalisierung, Null-Byte-Check, `startsWith(vaultRoot + sep)`).

## Funktionale Anforderungen

### R1: Security-Report & Fix-Backlog

- R1.1: Ein strukturierter OWASP-Top-10-orientierter Report wird erstellt (Ist-Zustand pro Kategorie: A01 Broken Access Control … A10 SSRF), abgelegt als `SECURITY-AUDIT.md` oder gleichwertig.
- R1.2: Jeder identifizierte Befund erhält Schweregrad (Kritisch/Hoch/Mittel/Niedrig), betroffene Datei(en), und Status (Fixed in diesem Pass / Backlog / Akzeptiertes Risiko).
- R1.3: Der Report verweist auf bereits behobene CodeQL-Findings (Commit `d176e49`) als Baseline, statt sie erneut zu untersuchen.

### R2: Content-Security-Policy vervollständigen

- R2.1: `script-src`, `default-src`, `connect-src`, `img-src`, `style-src` werden explizit in der `secureHeaders()`-Konfiguration gesetzt (`backend/src/index.ts`).
- R2.2: Die Policy berücksichtigt bestehende Anforderungen: Plugin-CSS-Injection (`frontend/src/plugins/compat/css-injector.ts`), Community-Plugin-Assets, ggf. externe Bilder in gerenderten Notizen.
- R2.3: Ein Verstoß gegen die CSP darf keine bestehende Kernfunktion brechen (manuelle Regressionsprüfung: Editor, Canvas, Plugin-Loading, Graph-View).
- R2.4: `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy` werden geprüft und falls fehlend ergänzt.

### R3: Input-Validierung vervollständigen

- R3.1: Die verbleibenden Route-Module ohne zod-Schema (`authRoutes.ts`, `uploadRoutes.ts`, `userRoutes.ts`, `vaultShareRoutes.ts`, `pluginRoutes.ts`, `mcpRoutes.ts`, `adminRoutes.ts`) erhalten zod-Schemas für Request-Body/Query/Params, konsistent mit dem bestehenden Muster in `graphRoutes.ts`.
- R3.2: Priorisierung nach Angriffsfläche: Endpoints mit Datei-Uploads, Admin-Rechten oder öffentlichem Zugriff (`vaultShareRoutes.ts`) zuerst.
- R3.3: Validierungsfehler liefern konsistente 400-Responses ohne interne Implementierungsdetails preiszugeben.

### R4: Rate-Limit-Vollständigkeitsprüfung

- R4.1: Alle `/api/v1/*`-Endpoints werden gegen die Frage geprüft: "Hat dieser Endpoint einen angemessenen Rate-Limit (global reicht/braucht dedizierten Limiter)?"
- R4.2: Endpoints mit hohem Missbrauchspotenzial (Password-Reset/Temp-Password-Erstellung, Share-Link-Erstellung, Registrierung falls vorhanden, MCP-Token-Erstellung) werden auf einen dedizierten, engeren Limiter geprüft.
- R4.3: Ergebnis fließt als Tabelle (Endpoint → aktueller Limiter → Empfehlung) in den Security-Report (R1).

### R5: Dependency-Audit in CI

- R5.1: `npm audit --audit-level=high` (oder äquivalent) wird als CI-Schritt für Backend und Frontend ergänzt (`.github/workflows/ci.yml`).
- R5.2: Der Schritt bricht den Build bei kritischen/hohen Findings ab; bestehende, nicht behebbare Findings (kein Fix verfügbar) werden dokumentiert und explizit ausgenommen statt den Build dauerhaft rot zu lassen.
- R5.3: Bestehende Dependabot-Konfiguration bleibt unverändert (ergänzt CI, ersetzt sie nicht).

### R6: Plugin-Sandbox — gezielte Härtung (kein Rewrite)

- R6.1: Bekannte Bypass-Vektoren der Proxy-basierten Sandbox (`sandbox.ts`) werden dokumentiert (z. B. Zugriff auf ungeprosste `window`-Referenzen vor Proxy-Installation).
- R6.2: Der `eval(`/`new Function(`-Scan im Installer (`plugin-installer.ts`) wird von reinem Warn-Hinweis zu einer sichtbaren Warnung im Install-Flow der UI aufgewertet (Admin sieht die Warnung vor Aktivierung, keine automatische Blockade wegen False-Positives durch Bundler-Code).
- R6.3: Eine echte Prozess-/Worker-Isolation wird NICHT in diesem Pass umgesetzt — das ist gleichwertig mit dem offenen Punkt aus `server-side-plugins`/Prio-4-Spec (`vm` vs. `isolated-vm`) und wird dort verlinkt statt dupliziert.

### R7: Secrets-Management

- R7.1: `SLATEBASE_CSRF_SECRET` und `SLATEBASE_SYNC_SECRET` werden dahingehend geprüft, ob ein fehlendes ENV beim Serverstart eine klar sichtbare Warnung erzeugt (nicht nur Log-Zeile).
- R7.2: `.env`/`.env.example` werden auf versehentlich committete Secrets geprüft; `.gitignore`-Abdeckung für `backend/.env` wird verifiziert.
- R7.3: Dokumentation (README/deploy-docs) wird ergänzt: Secrets MÜSSEN in Produktion gesetzt werden (kein Verlassen auf Auto-Generierung).

### R8: Path-Traversal — Lückenprüfung

- R8.1: Der Rename/Move-Pfad (`backend/src/business/index.ts`, `path.join(sourceDir, newName)`) wird darauf geprüft, ob `newName` durch `validateFilePath()` re-validiert wird oder nur durch vorgelagerte Checks — Lücke wird geschlossen falls vorhanden.
- R8.2: Alle weiteren `path.join`/`path.resolve`-Aufrufe mit nutzergesteuertem Input in `backend/src` werden stichprobenartig gegen dieselbe Klasse von Lücke geprüft.

## Nicht-funktionale Anforderungen

- NF1: Keine der Härtungsmaßnahmen darf bestehende Funktionalität (Plugin-Loading, Canvas-Rendering, Share-Links) sichtbar brechen — Regressionsprüfung vor Merge.
- NF2: CI-Laufzeit darf durch den neuen `npm audit`-Schritt um max. ~30s pro Job steigen.
- NF3: Der Security-Report ist in deutscher oder englischer Sprache wiederverwendbar für zukünftige Audits (Vorlage, kein Einmal-Dokument).

## Abgrenzung

- Kein Wechsel der Auth-Architektur (Session-Tokens bleiben, kein JWT-Umstieg).
- Keine echte Plugin-Sandbox-Isolation (Worker/VM) — das ist Teil von `server-side-plugins` (Prio 4) bzw. eine eigene zukünftige Spec, falls Frontend-Plugins ebenfalls isoliert werden sollen.
- Kein Penetrationstest durch Dritte / kein Bug-Bounty-Setup — reiner Code-/Config-Audit.
- Keine neuen Auth-Faktoren (2FA/MFA) — das wäre ein eigenständiges Feature.
