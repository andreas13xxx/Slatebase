# Passkeys und Mail-Wiederherstellung — Tasks

Jede Phase wird einzeln grün (tsc, `npm run lint`, `npm run build`, betroffene Tests) committet; Doku direkt nach der Phase.

## Phase 0 — Klärung

- [ ] 0.1 `AuthService`: Login-Erfolgspfad (Sitzung, Cookie, Audit) so aufteilen, dass Passkey ihn wiederverwenden kann
- [ ] 0.2 Nutzer-Store (`user/index.ts`): Schema-Erweiterung, Index-Aufbau, Session-Widerruf pro Nutzer, Passwortregeln
- [ ] 0.3 Auth-Middleware-Bypass und CSRF für neue `/auth/*`-Pfade prüfen
- [ ] 0.4 Feature-Toggle-Verdrahtung (Default an) und `allowedOrigins`-Admin-UI ansehen
- [ ] 0.5 Geheimnis-Speicher für das SMTP-Passwort (keychain/shared-secrets, wie beim Mail-Import) prüfen
- [ ] 0.6 `@simplewebauthn/*` und `nodemailer` auf Version, ESM und Lizenz prüfen

## Phase 1 — SMTP und Mail-Adresse

- [ ] 1.1 `MailService` (nodemailer), SMTP-Config mit verschlüsseltem Passwort, Testmail
- [ ] 1.2 Admin-UI: SMTP-Einstellungen, `mailBaseUrl`
- [ ] 1.3 Adresse eintragen, Bestätigungstoken, `emailVerifiedAt`, Eindeutigkeit, Tests
- [ ] 1.4 UI: Einstellungen → Sicherheit (Adresse), Admin-Übersicht „bestätigt“
- [ ] 1.5 Doku DE/EN

## Phase 2 — Passwort-Reset per Mail

- [ ] 2.1 Reset-Token (Hash, 30 min, einmalig), Anfrage- und Einlöse-Route, einheitliche Antwort und Antwortzeit
- [ ] 2.2 Rate-Limit pro Konto/IP, Audit, Session-Widerruf, Info-Mail nach Änderung
- [ ] 2.3 Admin-Reset beendet Sitzungen
- [ ] 2.4 UI: „Passwort vergessen“, Reset-Seite, Referrer-Policy
- [ ] 2.5 Tests inkl. Host-Header-Fälschung (Link-Basis), abgelaufene und wiederverwendete Token
- [ ] 2.6 Doku DE/EN

## Phase 3 — Passkeys Backend

- [ ] 3.1 Datenmodell, `_passkey-index.json`, Challenge-Store
- [ ] 3.2 Origin-/rpId-Auflösung inkl. `passkeyRpId`-Validierung; Tests (Proxy, zwei Domains, fremde Origin, Header-Fälschung)
- [ ] 3.3 Register/Login-Routen, Zähler-Prüfung, Rate-Limit, Audit, Toggle `passkeys`
- [ ] 3.4 Verwaltung (Liste, Umbenennen, Löschen), Admin „alle Passkeys entfernen“
- [ ] 3.5 Route-/Integrationstests (neue Felder in der Route-Allowlist nicht vergessen)

## Phase 4 — Passkeys Frontend

- [ ] 4.1 Login-Button inkl. Conditional UI, Fehlerzustände
- [ ] 4.2 Passkey-Verwaltung in `SecuritySettings`, Re-Auth-Dialog
- [ ] 4.3 Admin-UI: `passkeyRpId`, Hinweise zu Origins/HTTPS
- [ ] 4.4 Axe-/Komponententests; e2e-Specs auf geänderte Login-Selektoren prüfen
- [ ] 4.5 Doku, Betriebshinweis Reverse Proxy (Origin durchreichen, HTTPS)

## Phase 5 — Abschluss

- [ ] 5.1 Selbst-Review, PR, CI bis grün (max. 3 Iterationen), danach Sage-Review
