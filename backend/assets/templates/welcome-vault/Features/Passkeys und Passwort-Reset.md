---
tags: [features]
---

# Passkeys und Passwort-Reset

Neben dem Passwort kannst du dich mit einem **Passkey** anmelden, und ein vergessenes Passwort lässt sich **per Mail** zurücksetzen. Beides findest du unter *Einstellungen → Konto → Sicherheit*.

> [!info] Zwei Feature-Toggles, beide standardmäßig an
> `passkeys` und `mail-recovery` (*Einstellungen → Administration → Feature-Toggles*). Die Oberfläche erscheint aber erst, wenn die Voraussetzungen erfüllt sind: eine erlaubte HTTPS-Adresse für Passkeys, ein eingerichteter Mailserver für den Reset.

## Passkeys

Ein Passkey meldet dich ohne Passwort an: per Fingerabdruck, Gesichtserkennung, Geräte-PIN oder Sicherheitsschlüssel. Der geheime Schlüssel bleibt auf deinem Gerät oder in deinem Passwortmanager. Slatebase speichert nur den öffentlichen Teil.

- **Dein Passwort bleibt bestehen** und ist immer eine gültige Alternative.
- **Hinzufügen:** *Sicherheit → Passkey hinzufügen*. Zur Bestätigung gibst du dein Passwort ein.
- **Anmelden:** Auf der Anmeldeseite *„Mit Passkey anmelden“* wählen, oder den Benutzernamen anklicken und den Passkey aus der Vorschlagsliste des Browsers nehmen. Ein Benutzername ist nicht nötig.
- **Verwalten:** Umbenennen und Löschen in derselben Ansicht. Pro Konto sind bis zu 10 Passkeys möglich.

### Eine Domain, ein Passkey

Ein Passkey gehört zu genau einer Domain. Erreichst du Slatebase unter einer öffentlichen **und** einer internen Adresse, legst du auf jeder Adresse einen eigenen Passkey an. Die Liste zeigt dir zu jedem Passkey die Domain.

Haben beide Adressen eine gemeinsame Eltern-Domain (z. B. `notes.example.org` und `intern.example.org`), kann ein Administrator sie als **gemeinsame Domain für Passkeys** eintragen (`example.org`). Dann gilt ein Passkey für beide. Ein späterer Wechsel dieser Einstellung oder der Domain macht bestehende Passkeys unbrauchbar. Das Passwort funktioniert dann weiter.

## Passwort vergessen

Voraussetzung: Du hast eine **bestätigte E-Mail-Adresse** hinterlegt.

1. *Sicherheit → E-Mail-Adresse*: Adresse und dein Passwort eingeben. Du bekommst eine Mail mit einem Bestätigungslink (24 Stunden gültig).
2. Auf der Anmeldeseite *„Passwort vergessen?“* wählen und Benutzernamen oder Adresse eingeben.
3. Der Link in der Mail ist **30 Minuten gültig und nur einmal nutzbar**. Er führt dich zur Seite, auf der du ein neues Passwort festlegst.

Die Antwort ist immer dieselbe, egal ob das Konto existiert. Mails gehen nur an bestätigte Adressen. Nach dem Zurücksetzen werden **alle Sitzungen beendet**, und du bekommst eine Info-Mail. Deine Passkeys bleiben bestehen.

> [!warning] Ohne bestätigte Adresse
> Dann kann nur ein Administrator dein Passwort zurücksetzen (*Benutzerverwaltung → Passwort zurücksetzen*). Ist ein Passkey verloren oder gestohlen, kann er ihn dort mit *„Alle Passkeys entfernen“* löschen.

## Für Administratoren

*Einstellungen → Administration → Serverkonfiguration → Anmeldung und Wiederherstellung*:

| Einstellung | Bedeutung |
|---|---|
| SMTP-Server, Port, Verschlüsselung, Benutzer, Passwort, Absender | Mailversand. Das Passwort wird verschlüsselt gespeichert und nie angezeigt |
| Adresse für Links in Mails | Eine der **erlaubten Origins** (HTTPS). Leer = die erste HTTPS-Origin. Bei zwei Domains wählst du die öffentliche |
| Gemeinsame Domain für Passkeys | Optional, siehe oben |
| Testmail | Prüft die *gespeicherten* Einstellungen |

Die erlaubten Origins pflegst du wie bisher unter *Erlaubte Origins* (`SLATEBASE_ALLOWED_ORIGINS`). Passkeys und Links in Mails funktionieren nur für Adressen aus dieser Liste, und nur mit HTTPS (oder `localhost` zum Entwickeln).

**Reverse Proxy:** Der Proxy muss den `Origin`-Header des Browsers unverändert weiterreichen. TLS darf er beenden. Slatebase leitet Origin und Domain nie aus `Host` oder `X-Forwarded-Host` ab.

In der Benutzerverwaltung siehst du pro Konto, ob die Adresse bestätigt ist, und kannst bei Verdacht auf Kompromittierung alle Passkeys eines Kontos entfernen.
