# Security Hardening — Design

## Vorgehen

Kein neues Architektur-Modul — dieses Feature ist ein Querschnitts-Audit + gezielte Patches an bestehenden Stellen. Design beschreibt daher pro Anforderungsbereich die konkrete Umsetzung, nicht ein neues Subsystem.

## R1: Security-Report

**Standort:** `SECURITY-AUDIT.md` im Projekt-Root (analog zu `SECURITY.md`, das bereits die Meldewege dokumentiert — Report ergänzt, ersetzt nicht).

**Struktur:**

```markdown
# Security Audit — <Datum>

## Zusammenfassung
<N Findings, davon X Kritisch/Hoch/Mittel/Niedrig, Y in diesem Pass behoben>

## A01 Broken Access Control
| Befund | Schweregrad | Datei | Status |
...

## A02 Cryptographic Failures
...
(A03–A10 analog, OWASP-Top-10-2021-Kategorien)

## Bereits behoben (Baseline, Commit d176e49)
- XSS in Canvas-Markdown-Rendering
- Biased random bei Temp-Passwörtern
- YAML-Escaping
- Unvollständige HTML-Sanitisierung in htmlToMarkdown
```

Der Report wird manuell aus den Ergebnissen der Tasks in R2–R8 befüllt, kein Automatisierungstool nötig für v1.

## R2: CSP-Vervollständigung

**Standort:** `backend/src/index.ts`, `secureHeaders()`-Aufruf.

**Ansatz:** Additiv zur bestehenden Konfiguration (`objectSrc`/`frameAncestors: 'none'` bleiben):

```typescript
secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],              // kein 'unsafe-inline'/'unsafe-eval' — prüfen ob Editor/Plugins das brauchen
    styleSrc: ["'self'", "'unsafe-inline'"], // Plugin-CSS-Injection nutzt <style>-Tags
    imgSrc: ["'self'", "data:", "https:"],   // externe Bilder in Notizen
    connectSrc: ["'self'"],              // ggf. + konfigurierte externe MCP/Ollama-Hosts
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
  },
  strictTransportSecurity: 'max-age=63072000; includeSubDomains',
  xContentTypeOptions: 'nosniff',
  referrerPolicy: 'strict-origin-when-cross-origin',
})
```

**Kritischer Punkt:** `scriptSrc: ["'self'"]` ohne `'unsafe-eval'` bricht potenziell den Plugin-Loader, falls dieser `new Function()`/`eval()` zur Bundle-Ausführung nutzt (siehe `plugin-installer.ts`-Scan, der genau das erkennt). Vor Rollout: manuell prüfen, ob `PluginSandbox`/Plugin-Loader `eval`-artige Ausführung braucht — falls ja, `'unsafe-eval'` gezielt aufnehmen und im Report als akzeptiertes Risiko dokumentieren (Plugin-System ist ohnehin Trust-on-Install).

## R3: Input-Validierung

**Muster:** Bestehendes zod-Schema-Pattern aus `graphRoutes.ts`/`fileVersionRoutes.ts` übernehmen — kein neues Validierungs-Framework.

**Reihenfolge (Angriffsfläche zuerst):**
1. `uploadRoutes.ts` (Datei-Upload — Größe, MIME, Pfad)
2. `vaultShareRoutes.ts` (öffentlich erreichbar, kein Auth)
3. `adminRoutes.ts` (privilegierte Operationen)
4. `authRoutes.ts` (Login/Session — Vorsicht: Timing-Verhalten aus R-Login nicht durch zusätzliche Validierungslogik verändern)
5. `pluginRoutes.ts`, `mcpRoutes.ts`, `userRoutes.ts`

Jede Route bekommt ein Schema-Objekt am Dateianfang (analog `graphRoutes.ts`), `zValidator('json'|'query'|'param', schema)` als Middleware vor dem Handler.

## R4: Rate-Limit-Audit

**Vorgehen:** Tabellarischer Abgleich aller Routen in `backend/src/api/*.ts` gegen vorhandene Limiter (`backend/src/shared/sliding-window-rate-limiter.ts`, `chat/rate-limiter.ts`, `mcp/rate-limiter.ts`, `realtime/rate-limiter.ts`). Ergebnis fließt in R1-Report als Tabelle. Konkrete Ergänzungen (falls Lücken gefunden) nutzen den bestehenden `SlidingWindowRateLimiter` — kein neuer Limiter-Typ.

## R5: Dependency-Audit in CI

**Standort:** `.github/workflows/ci.yml`, neuer Step nach `npm ci`, vor `npm run build`, in beiden Jobs (backend/frontend):

```yaml
- name: Dependency audit
  run: npm audit --audit-level=high
  continue-on-error: false
```

Falls bestehende High/Critical-Findings ohne verfügbaren Fix existieren (häufig bei transitiven Dev-Dependencies): `npm audit --omit=dev --audit-level=high` für Produktions-Dependencies verwenden, Dev-Findings separat im Report (R1) als akzeptiertes Risiko vermerken statt CI dauerhaft zu brechen.

## R6: Plugin-Sandbox-Härtung

**Kein neues Isolations-Modul.** Zwei konkrete, kleine Änderungen:

1. **UI-Warnung bei `eval`/`new Function`-Fund:** `plugin-installer.ts` liefert das Scan-Ergebnis bereits zurück — Frontend (`PluginManagementPage`/Install-Dialog) zeigt bei `hasEvalUsage: true` eine sichtbare Warnung ("Dieses Plugin nutzt dynamische Code-Ausführung — Risiko X") mit explizitem Bestätigungsschritt vor Aktivierung, statt die Information nur im Log/Registry verschwinden zu lassen.
2. **Bypass-Dokumentation:** Kurzer Abschnitt in `sandbox.ts` (Kommentar) + im Security-Report, der festhält, dass die Sandbox Proxy-basiert und nicht escape-sicher ist — als bewusste Design-Entscheidung (Trust-Modell: Plugins kommen aus der Community-Liste mit Domain-Allowlist, nicht von beliebigen Quellen), mit Verweis auf `server-side-plugins`-Spec für den Fall, dass echte Isolation später gebraucht wird.

## R7: Secrets-Management

- Startup-Check in `backend/src/index.ts` (oder `auth/csrf-secret.ts`): Falls `SLATEBASE_CSRF_SECRET`/`SLATEBASE_SYNC_SECRET` nicht gesetzt sind, wird beim Serverstart eine deutlich sichtbare Konsolen-Warnung ausgegeben (nicht nur Debug-Log) — Format konsistent mit bestehenden Startup-Logs.
- `.gitignore`-Check: Verifizieren dass `backend/.env` ignoriert ist (einmaliger Check, kein wiederkehrender Task).
- README/Deploy-Doku: Abschnitt "Produktions-Secrets" ergänzen falls nicht vorhanden.

## R8: Path-Traversal-Lückenprüfung

Code-Review von `backend/src/business/index.ts` Rename/Move-Logik (`path.join(sourceDir, newName)`): Falls `newName` nicht durch `validateFilePath()` läuft, wird der Aufruf so umgebaut, dass der resultierende Pfad denselben Guard durchläuft wie reguläre Datei-Operationen (Wiederverwendung von `validateFilePath` aus `vault/index.ts`, kein Duplikat).

## Testing

- R2 (CSP): Manuelle Regression (Editor laden, Canvas öffnen, Plugin installieren+aktivieren, Graph-View öffnen) + Browser-Konsole auf CSP-Violations prüfen.
- R3 (Validierung): Bestehende Route-Tests erweitern um invalid-payload-Fälle (400 erwartet).
- R5 (Audit): CI-Lauf grün nach Einführung (ggf. mit `--omit=dev` falls nötig).
- R8 (Path-Traversal): Test analog zu bestehenden `vault/index.test.ts`-Fällen, aber für den Rename/Move-Pfad.

## Offene Entscheidungen

1. **`script-src` ohne `unsafe-eval`**: Hängt davon ab, ob Plugin-Ausführung dynamische Code-Evaluierung braucht. Muss vor R2-Umsetzung geklärt werden (Code-Read von `frontend/src/plugins/compat/plugin-loader.ts`).
2. **`npm audit`-Schwelle**: `--audit-level=high` vs. `moderate` — Empfehlung: `high` starten, um False-Positive-Rauschen aus Dev-Dependencies zu vermeiden, später verschärfen.
