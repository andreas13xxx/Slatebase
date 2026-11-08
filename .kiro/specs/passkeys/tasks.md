# Passkeys und Mail-Wiederherstellung — Tasks

Jede Phase wird einzeln grün (tsc, `npm run lint`, `npm run build`, betroffene Tests) committet; Doku direkt nach der Phase.

## Phase 0 — Klärung

- [x] 0.1 `AuthService`: Login-Erfolgspfad (Sitzung, Cookie, Audit) so aufteilen, dass Passkey ihn wiederverwenden kann
- [x] 0.2 Nutzer-Store (`user/index.ts`): Schema-Erweiterung, Index-Aufbau, Session-Widerruf pro Nutzer, Passwortregeln
- [x] 0.3 Auth-Middleware-Bypass und CSRF für neue `/auth/*`-Pfade prüfen
- [x] 0.4 Feature-Toggle-Verdrahtung (Default an) und `allowedOrigins`-Admin-UI ansehen
- [x] 0.5 Geheimnis-Speicher für das SMTP-Passwort (keychain/shared-secrets, wie beim Mail-Import) prüfen
- [x] 0.6 `@simplewebauthn/*` und `nodemailer` auf Version, ESM und Lizenz prüfen

## Phase 1 — SMTP und Mail-Adresse

- [x] 1.1 `MailService` (nodemailer), SMTP-Config mit verschlüsseltem Passwort, Testmail
- [x] 1.2 Admin-UI: SMTP-Einstellungen, `mailBaseUrl`
- [x] 1.3 Adresse eintragen, Bestätigungstoken, `emailVerifiedAt`, Eindeutigkeit, Tests
- [x] 1.4 UI: Einstellungen → Sicherheit (Adresse), Admin-Übersicht „bestätigt“
- [x] 1.5 Doku DE/EN

## Phase 2 — Passwort-Reset per Mail

- [x] 2.1 Reset-Token (Hash, 30 min, einmalig), Anfrage- und Einlöse-Route, einheitliche Antwort und Antwortzeit
- [x] 2.2 Rate-Limit pro Konto/IP, Audit, Session-Widerruf, Info-Mail nach Änderung
- [x] 2.3 Admin-Reset beendet Sitzungen
- [x] 2.4 UI: „Passwort vergessen“, Reset-Seite (Token im URL-Fragment, wird aus der Adressleiste entfernt; das Fragment geht weder an den Server noch in den Referrer)
- [x] 2.5 Tests inkl. Host-Header-Fälschung (Link-Basis), abgelaufene und wiederverwendete Token
- [x] 2.6 Doku DE/EN

## Phase 3 — Passkeys Backend

- [x] 3.1 Datenmodell, Credential-Index (im Speicher, beim Start aufgebaut), Challenge-Store
- [x] 3.2 Origin-/rpId-Auflösung inkl. `passkeyRpId`-Validierung; Tests (Proxy, zwei Domains, fremde Origin, Header-Fälschung)
- [x] 3.3 Register/Login-Routen, Zähler-Prüfung, Rate-Limit, Audit, Toggle `passkeys`
- [x] 3.4 Verwaltung (Liste, Umbenennen, Löschen), Admin „alle Passkeys entfernen“
- [x] 3.5 Route-/Integrationstests (neue Felder in der Route-Allowlist nicht vergessen)

## Phase 4 — Passkeys Frontend

- [x] 4.1 Login-Button inkl. Conditional UI, Fehlerzustände
- [x] 4.2 Passkey-Verwaltung in `SecuritySettings`, Re-Auth-Dialog
- [x] 4.3 Admin-UI: `passkeyRpId`, Hinweise zu Origins/HTTPS
- [x] 4.4 Komponententests; e2e-Specs auf geänderte Login-Selektoren geprüft (`smoke.spec.ts` nutzt sie nicht)
- [ ] 4.4a Axe-Test für die neuen Seiten
- [x] 4.5 Doku, Betriebshinweis Reverse Proxy (Origin durchreichen, HTTPS)

## Phase 5 — Abschluss

- [ ] 5.1 Selbst-Review, PR, CI bis grün (max. 3 Iterationen), danach Sage-Review
