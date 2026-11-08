# Passkeys und Mail-Wiederherstellung — Design

## Bibliothek

`@simplewebauthn/server` (Backend) und `@simplewebauthn/browser` (Frontend). Sie übernehmen CBOR, Attestation und
Signaturprüfung. `expectedOrigin` und `expectedRPID` werden pro Request gesetzt (siehe unten).

## Datenmodell

Nutzer liegen als JSON unter `data/users/<userId>.json` (kein SQL). Erweiterung des Nutzerdatensatzes, beides optional und
rückwärtskompatibel:

```ts
passkeys?: Array<{
  id: string            // interne ID (UUID)
  credentialId: string  // base64url
  publicKey: string     // base64url
  counter: number
  transports?: string[]
  rpId: string
  name: string
  createdAt: string
  lastUsedAt?: string
}>
emailVerifiedAt?: string
mailTokens?: Array<{ purpose: 'verify-email' | 'password-reset'; hash: string; expiresAt: string; email?: string }>
```

Für den Login ohne Benutzername (Discoverable Credentials) braucht der Server `credentialId → userId`. Dieser Index liegt
**nur im Speicher** und wird beim Start aus den Nutzerdateien aufgebaut (`PasskeyService.loadIndex`), beim Registrieren und
Löschen gepflegt. Eine eigene Datei wäre eine zweite Wahrheit, die auseinanderlaufen kann.

Challenges liegen im Speicher (`Map`, TTL 2 min, einmalig), analog zum `sse-ticket-store`.

## Origins und rpId

```
Request → Origin-Header → in allowedOrigins? → nein: 403
                       → ja: rpId = passkeyRpId ?? hostname(origin)
```

- `expectedOrigin`: der Origin-Header selbst (nach Allow-List-Prüfung). Der Browser setzt ihn, eine Seite kann ihn nicht
  fälschen; `X-Forwarded-Host` wird nie benutzt.
- `allowedOrigins` ist heute die CORS-Liste. Wiederverwendung heißt: wer eine Origin für Passkeys freigeben will, gibt sie auch
  für CORS frei. Das ist gewollt, weil derselbe Browser-Kontext dort ohnehin die API nutzt. Die Standardliste enthält
  `http://localhost:5173`; `localhost` bleibt für die Entwicklung erlaubt, andere Hosts nur mit `https:`.
- Pro Passkey wird die `rpId` gespeichert. Beim Login bietet der Server nur Credentials der aktuellen `rpId` an
  (`allowCredentials` bei bekanntem Nutzer; sonst prüft der Server, dass die gefundene Credential-`rpId` passt).
- **Zwei Domains**: Mit `rpId = hostname` entstehen getrennte Passkeys je Domain (öffentlich, intern). Wer einen
  gemeinsamen Passkey will und eine gemeinsame Eltern-Domain hat, setzt `passkeyRpId` (Admin-UI, Config `passkeyRpId`).
  Validierung: `passkeyRpId` muss jede erlaubte HTTPS-Origin als Suffix auf Label-Grenze enthalten.
- Reverse Proxy: Er muss `Origin` durchreichen und HTTPS an den Browser liefern. TLS-Terminierung am Proxy ist unkritisch.
  Die vorhandene `trustedProxies`/`cookieSecure`-Logik bleibt für das Session-Cookie zuständig.

## Endpunkte

| Methode, Pfad | Auth | Zweck |
|---|---|---|
| `POST /auth/passkey/register/options` | Sitzung + Re-Auth | Challenge erzeugen |
| `POST /auth/passkey/register/verify` | Sitzung | Passkey speichern |
| `POST /auth/passkey/login/options` | keine | Challenge (optional mit Benutzername) |
| `POST /auth/passkey/login/verify` | keine | Signatur prüfen, Sitzung erzeugen |
| `GET /users/me/passkeys` | Sitzung | Liste |
| `PATCH` / `DELETE /users/me/passkeys/:id` | Sitzung | Umbenennen, Löschen |
| `PUT /users/me/email` | Sitzung + Re-Auth | Adresse setzen, Bestätigungsmail senden |
| `POST /auth/email/verify` | keine (Token) | Adresse bestätigen |
| `POST /auth/password-reset/request` | keine | Benutzername oder Adresse, einheitliche Antwort |
| `POST /auth/password-reset/confirm` | keine (Token) | Token + neues Passwort |
| `GET /auth/capabilities?origin=` | keine | Welche Login-Optionen sichtbar sind (Passkey, Mail-Reset). Same-Origin-GETs senden keinen `Origin`-Header, deshalb übergibt die Seite `location.origin` als Hinweis; er wird gegen `allowedOrigins` geprüft und ist nur eine Anzeige-Entscheidung |
| `GET/PUT /admin/mail` · `POST /admin/mail/test` | Admin | SMTP lesen/setzen, Testmail |
| `DELETE /admin/users/:id/passkeys` | Admin | Alle Passkeys entfernen |

Der Login-Erfolg ruft dieselbe Funktion auf wie der Passwort-Login (`AuthService`), damit Sitzung, Cookie und Audit
identisch sind. Validierung der Bodies über Zod in `auth/validation.ts`.

## Mail-Reset

- **Versand**: `MailService` mit `nodemailer`. SMTP-Config (Host, Port, Verschlüsselung, Nutzer, Absender) in der Server-Config;
  das Passwort liegt im bestehenden Geheimnis-Speicher (Phase 0.5) und wird nie an die UI zurückgegeben.
- **Token** (Bestätigung und Reset): 256 Bit aus `crypto.randomBytes`, base64url, gespeichert wird `sha256(token)` mit
  Ablaufzeit und Zweck (`verify-email` | `password-reset`) im Nutzerdatensatz (`mailTokens`). Im Link steht `<userId>.<token>`,
  damit das Konto ohne Suche über alle Nutzer gefunden wird. Einlösen vergleicht in
  konstanter Zeit, verbraucht den Token atomar und löscht abgelaufene.
- **Anfrage**: Die Route antwortet sofort und einheitlich; der Versand läuft danach asynchron (keine Zeitdifferenz zwischen
  „Konto existiert“ und „nicht“). Rate-Limit über den vorhandenen `RateLimiter` (`reset:<userId>` und `reset:<ip>`).
- **Link**: `${mailBaseUrl}/reset-password#token=…`. `mailBaseUrl` kommt aus der Config und muss in `allowedOrigins` stehen;
  bei zwei Domains ist das die öffentliche. Das Fragment (`#`) gelangt nicht in Server-Logs und nicht in den Referrer.
- **Einlösen**: Passwort setzen (Regeln wie bei der Registrierung), Token verbrauchen, alle Sitzungen des Kontos widerrufen,
  Audit, Info-Mail. Passkeys bleiben unberührt.

## Abweichungen von der ersten Fassung

- Die Einstellungen (SMTP, `mailBaseUrl`, `passkeyRpId`) liegen in `data/account/settings.json` (Admin-Route
  `/admin/account-settings`), nicht in `ServerConfig`. Das SMTP-Passwort steht im `ModuleSecretStore` (`_server`/`account`).
- Ein ausgeschalteter Toggle antwortet wie alle anderen Toggles mit **403 `FEATURE_DISABLED`** (nicht 404).
- Eine Adressänderung über `PUT /users/me` setzt die Bestätigung zurück und verwirft offene Mail-Tokens; der geführte Weg
  mit Bestätigungsmail ist `PUT /users/me/email` (die alte Adresse bleibt bis zur Bestätigung eingetragen).
- Der Passkey-Login ist immer „discoverable“ (kein Benutzername). Eine Variante mit Benutzername gibt es nicht.
- `passkeyRpId` prüft nur die HTTPS-Origins der Liste; der `localhost`-Eintrag der Standardliste bleibt zulässig und bekommt
  dann keinen gemeinsamen Passkey.

## Frontend

- `LoginPage`: Button „Mit Passkey anmelden“ (sichtbar bei aktivem Toggle und erlaubter Origin), Link „Passwort vergessen“
  (sichtbar bei aktivem `mail-recovery` und konfiguriertem SMTP; die Sichtbarkeit kommt aus einem öffentlichen Capabilities-Endpunkt).
- `SecuritySettings` (neu in den Einstellungen): Mail-Adresse und Bestätigung, Passkeys verwalten.
- Admin-Config: SMTP-Einstellungen mit Testmail, `mailBaseUrl`, Hinweis an `allowedOrigins`, Feld `passkeyRpId`,
  Aktion „Passkeys entfernen“ in der Nutzerverwaltung.
- Neue Hilfsfunktionen in eigenen `.ts`-Dateien (kein Export aus `.tsx`, wegen react-refresh-Lint).

## Risiken

- **Domainwechsel** macht Passkeys unbrauchbar → Passwort als Fallback, Hinweis in Admin-UI.
- **Origin-Header** fehlt bei manchen Nicht-Browser-Clients → dort kein Passkey-Login; gewollt.
- **Wiederverwendung von `allowedOrigins`** koppelt CORS und Passkeys. Falls das später stört, lässt sich eine eigene Liste
  einführen, ohne das Datenformat zu ändern (die `rpId` steht im Passkey).
