# Requirements Document

## Introduction

Die installierte Slatebase-Versionsnummer soll auf dem Login-Screen angezeigt werden, damit Nutzer und Admins sofort erkennen welche Version läuft — ohne sich einloggen zu müssen.

## Glossary

- **Login_Screen**: Die `LoginPage.tsx`-Komponente die vor der Authentifizierung angezeigt wird
- **Version_Endpoint**: Der bestehende öffentliche Endpoint `GET /api/v1/version` der die installierte Version zurückgibt

## Requirements

### Requirement 1: Versionsnummer auf Login-Screen anzeigen

**User Story:** Als Benutzer möchte ich auf dem Login-Screen die installierte Slatebase-Version sehen, damit ich weiß welche Version ich verwende ohne mich einloggen zu müssen.

#### Acceptance Criteria

1. WHEN der Login-Screen geladen wird, THE Login_Screen SHALL die Versionsnummer vom bestehenden Version_Endpoint (`GET /api/v1/version`) abrufen und im unteren Bereich des Login-Formulars anzeigen
2. THE Login_Screen SHALL die Version im Format `v{major}.{minor}.{patch}` anzeigen (z.B. `v1.2.3`), in dezenter Schriftgröße (Design Token `--text-xs`) und reduzierter Deckkraft (`opacity: 0.6`)
3. IF der Version_Endpoint nicht erreichbar ist oder einen Fehler zurückgibt, THEN THE Login_Screen SHALL keine Versionsnummer anzeigen (kein Fehler sichtbar, kein Platzhalter)
4. IF die Version den Wert `development` hat, THEN THE Login_Screen SHALL `dev` anzeigen statt einer Versionsnummer
5. THE Login_Screen SHALL die Versionsnummer unterhalb des Login-Buttons und oberhalb des Seiten-Footers (falls vorhanden) zentriert darstellen
