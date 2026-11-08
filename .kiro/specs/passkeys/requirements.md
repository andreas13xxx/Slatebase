# Passkeys und Mail-Wiederherstellung — Requirements

## Kontext

Slatebase kennt heute nur Benutzername und Passwort (argon2, Sitzungs-Cookie, CSRF, Rate-Limit). Es gibt kein 2FA, kein OIDC
und keinen Mailversand (nur IMAP-Import). Nutzer haben ein optionales, unverifiziertes `email`-Feld. Der Admin kann ein
Passwort zurücksetzen (temporäres Passwort). Diese Spec ergänzt **Passkeys (WebAuthn)** als zusätzliche Anmeldemethode und
einen **Passwort-Reset per Mail** für vergessene Passwörter und verlorene Passkeys.

Betrieb: Slatebase läuft hinter einem Reverse Proxy und ist über eine **öffentliche und eine interne Domain** erreichbar.

## Entschieden

| Punkt | Entscheidung |
|---|---|
| Rolle des Passkeys | **Alternative zum Passwort.** Das Passwort bleibt bei jedem Konto bestehen und ist weiter ein gültiger Login |
| Zweiter Faktor | Nicht Teil von v1 |
| Erlaubte Origins | Bestehende Liste `allowedOrigins` (Admin-UI, Env `SLATEBASE_ALLOWED_ORIGINS`); keine neue Origin-Liste |
| Passkey-Bindung | Ein Passkey gehört zu genau einer `rpId` (Hostname). Öffentliche und interne Domain brauchen **je einen eigenen Passkey**, außer beide teilen sich eine Eltern-Domain (`passkeyRpId`) |
| Wiederherstellung | **Nur Mail-Reset** (Link per SMTP) plus bestehender Admin-Reset. **Keine Wiederherstellungscodes** |
| Feature-Toggles | `passkeys` und `mail-recovery`, beide **standardmäßig an**. Die UI erscheint aber nur, wenn die Voraussetzung erfüllt ist (Passkeys: erlaubte sichere Origin; Mail-Reset: SMTP konfiguriert) |

## Nicht-Ziele

- Passwortlose Konten (Passwort entfernen)
- Passkey als zweiter Faktor, TOTP, OIDC
- Wiederherstellungscodes
- Automatische Auswertung von `X-Forwarded-Host` für Origin oder Mail-Links
- Mail-Benachrichtigungen jenseits von Reset und Bestätigung

## Anforderungen

### 1. Passkey registrieren und verwalten

1.1 Ein angemeldeter Nutzer kann Passkeys registrieren, auflisten, umbenennen und löschen („Einstellungen → Sicherheit“).
1.2 Beim Registrieren wird das Passwort erneut abgefragt (Re-Auth).
1.3 Höchstens 10 Passkeys pro Konto; dieselbe Credential-ID nicht doppelt (`excludeCredentials`).
1.4 Die Liste zeigt Name, `rpId`, Erstellung, letzte Nutzung. Der Name ist frei wählbar, Vorschlag aus Gerät/Browser.
1.5 Registrierung und Löschung stehen im Audit-Log (`PASSKEY_REGISTERED`, `PASSKEY_REMOVED`).

### 2. Anmeldung mit Passkey

2.1 Die Login-Seite zeigt „Mit Passkey anmelden“, wenn `passkeys` aktiv ist **und** die aktuelle Origin in `allowedOrigins`
    steht und sicher ist (HTTPS oder `localhost`).
2.2 Discoverable Credentials: kein Benutzername nötig. Optional Autofill im Benutzernamenfeld (Conditional UI).
2.3 Der Server prüft Challenge, Origin, `rpId`, Signatur und Zähler. Ein sinkender Zähler lehnt den Login ab und wird geloggt.
2.4 Nach Erfolg entsteht dieselbe Sitzung wie beim Passwort-Login (Cookie, CSRF, Laufzeiten).
2.5 Fehlschläge sind nach außen einheitlich und fallen unter dasselbe Rate-Limit wie der Passwort-Login.
2.6 Challenges sind einmalig und laufen nach 2 Minuten ab.
2.7 Gesperrte oder gelöschte Konten können sich nicht per Passkey anmelden.

### 3. Origins und Reverse Proxy

3.1 Die erwartete Origin ist der `Origin`-Header des Requests, **sofern** er in `allowedOrigins` steht. Sonst 403.
3.2 `rpId` ist der Hostname dieser Origin (oder `passkeyRpId`). Sie wird mit dem Passkey gespeichert; beim Login zählen nur
    Passkeys der passenden `rpId`.
3.3 Nie aus `Host` oder `X-Forwarded-Host` ableiten.
3.4 Optional `passkeyRpId` (Admin-Einstellung): gemeinsame Eltern-Domain, z. B. `example.org`. Sie muss auf Label-Grenze
    Suffix jeder erlaubten HTTPS-Origin sein, sonst wird die Konfiguration abgelehnt.
3.5 Die Admin-UI warnt: Ein Domainwechsel macht Passkeys unbrauchbar; Origins müssen HTTPS sein.
3.6 Betriebshinweis: Der Proxy reicht `Origin` unverändert durch.

### 4. SMTP und Mail-Adresse

4.1 Der Admin konfiguriert SMTP in der Admin-UI: Host, Port, Verschlüsselung (STARTTLS/TLS), Nutzer, Passwort, Absender.
    Das Passwort wird nicht im Klartext in der Config abgelegt und nie an die UI zurückgegeben.
4.2 „Testmail senden“ prüft die Konfiguration. Ohne gültige Konfiguration ist der Mail-Reset in der UI unsichtbar.
4.3 Ein Nutzer trägt seine Adresse in den Einstellungen ein und bestätigt sie per Link (Token 256 Bit, nur als Hash
    gespeichert, 24 h gültig, einmalig). Das Feld bekommt dafür ein `emailVerifiedAt`.
4.4 Ändert sich die Adresse, gilt sie erst nach erneuter Bestätigung; die alte bleibt bis dahin eingetragen. Wird die Adresse über das Profil direkt geändert, verliert sie die Bestätigung und offene Mail-Tokens verfallen.
4.5 Eine Adresse darf nur bei einem Konto bestätigt sein (Eindeutigkeit, ohne bestätigte Adressen preiszugeben).
4.6 Die Admin-Übersicht zeigt pro Nutzer „Adresse bestätigt“ ja/nein.

### 5. Passwort per Mail zurücksetzen

5.1 Die Login-Seite hat „Passwort vergessen“ (nur sichtbar bei aktivem `mail-recovery` und konfiguriertem SMTP). Eingabe:
    Benutzername oder Mail-Adresse.
5.2 Die Antwort ist immer gleich („Falls ein Konto mit bestätigter Adresse existiert, wurde eine Mail gesendet“), auch in der
    Antwortzeit (Versand asynchron, nach der Antwort).
5.3 Gesendet wird nur an **bestätigte** Adressen. Der Link enthält einen Token 256 Bit, nur als Hash gespeichert, 30 Minuten
    gültig, einmal einlösbar. Ein neuer Token macht den alten ungültig.
5.4 Die Link-Basis kommt aus der Config (`mailBaseUrl`, muss in `allowedOrigins` stehen, Standard: erste HTTPS-Origin),
    **nie** aus dem Request.
5.5 Einlösen: neues Passwort (Passwortregeln wie bei der Registrierung) setzen, Token verbrauchen, **alle Sitzungen** beenden,
    Audit `PASSWORD_RESET_BY_MAIL`, Info-Mail „Dein Passwort wurde geändert“ an die Adresse. Passkeys bleiben bestehen.
5.6 Rate-Limit pro Konto (z. B. 3 Mails/Stunde) und pro IP, damit niemand fremde Postfächer flutet.
5.7 Der Reset-Link ist ein Hash-Fragment oder POST-Ziel ohne Token in Logs/Referrer (`Referrer-Policy: no-referrer`).
5.8 Hat ein Konto keine bestätigte Adresse, bleibt nur der Admin-Reset. Die Einstellungen weisen darauf hin.
5.9 Admin-Reset (heute vorhanden) beendet zusätzlich alle Sitzungen. Der Admin kann pro Nutzer **alle Passkeys entfernen**.

### 6. Sicherheit und Betrieb

6.1 Es werden nur öffentliche Schlüssel und Zähler gespeichert.
6.2 `/auth/passkey/*` und `/auth/password-reset/*` sind vom Auth-Bypass erfasst (wie `/auth/login`), aber CSRF- und
    Rate-Limit-geschützt.
6.3 MCP-Tokens, öffentliche Freigabe-Links und API-Zugriff bleiben unverändert.
6.4 Ist ein Toggle aus, antworten seine Endpunkte wie bei allen Toggles mit 403 `FEATURE_DISABLED`; gespeicherte Daten bleiben erhalten.
6.5 Doku (DE/EN, Welcome-Vault, README, Betriebshinweise zu Proxy, Origins und SMTP) wird mit jeder Phase aktualisiert.
