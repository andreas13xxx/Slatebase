---
tags: [features]
---

# Mail-Import

Mail-Import fragt ein oder mehrere IMAP-Postfächer periodisch ab und legt ungelesene E-Mails als Markdown-Notizen mit Anhängen in einem Vault ab — serverseitig, ohne Browser-Plugin.

> [!tip] Warum kein Browser-Plugin?
> Ein IMAP-Client braucht eine direkte Netzwerkverbindung (TLS-Sockets) zum Mailserver — das ist im Browser-Sandbox-Umfeld nicht möglich. Mail-Import läuft deshalb als natives Backend-Feature.

---

## Voraussetzungen

- Feature-Toggle `mail-import` aktiviert (siehe [[Admin/Feature-Toggles]]; standardmäßig an)
- Ein Vault ist ausgewählt
- Zugangsdaten für ein IMAP-Postfach (Host, Port, Benutzername, Passwort)

---

## Mail-Import öffnen

1. Öffne die Einstellungen (`Ctrl+,`)
2. Navigiere zu **Vault → Mail-Import**

Ist das Feature serverweit deaktiviert, erscheint der Eintrag ausgegraut mit einem Hinweis, dich an einen Administrator zu wenden.

---

## Ein Postfach hinzufügen

1. Klicke auf **Postfach hinzufügen**
2. Trage Name, Host und Port ein (z.B. `imap.example.com`, Port `993` für TLS)
3. Aktiviere **TLS verwenden**, falls dein Anbieter das erwartet (praktisch immer der Fall)
4. Trage Benutzername und Passwort ein
5. Lege den **IMAP-Ordner** fest, der abgefragt wird (Standard: `INBOX`)
6. Lege den **Zielordner im Vault** fest, in den Notizen geschrieben werden (leer = Vault-Wurzel)
7. Lege das Abfrage-Intervall in Minuten fest
8. Speichern

Das Passwort wird verschlüsselt gespeichert und nie im Klartext an den Browser zurückgegeben — auch beim Bearbeiten eines Postfachs bleibt das Feld leer, bis du ein neues Passwort einträgst.

---

## Wie importierte Mails aussehen

Jede neue Mail wird als eigene Notiz `<Datum> <Betreff>.md` im Zielordner angelegt, mit YAML-Frontmatter (Absender, Empfänger, Betreff, Datum, Message-ID) und dem in Markdown umgewandelten Mail-Text. Anhänge landen in einem `attachments`-Unterordner und werden per Wikilink-Embed (`![[dateiname]]`) direkt in der Notiz eingebunden — Bilder, die bereits inline im Mail-Text sitzen, erscheinen wie gewohnt eingebettet und werden nicht doppelt als Anhang abgelegt.

---

## Import ausführen

| Aktion | Beschreibung |
|--------|--------------|
| Automatisch | Läuft im Hintergrund gemäß dem konfigurierten Intervall pro Postfach |
| **Jetzt importieren** | Löst sofort einen Abfrage-Lauf für dieses Postfach aus |
| Schalter am Postfach | Aktiviert/deaktiviert den automatischen Import für dieses Postfach |

**Importiert werden nur ungelesene Mails** im gewählten Ordner — der Gelesen-Status des Postfachs selbst ist die einzige Merkliste, es gibt keinen separaten internen Zähler. Sobald eine Mail erfolgreich als Notiz geschrieben wurde, markiert Mail-Import sie direkt im Anschluss auf dem Server als gelesen; schlägt eine einzelne Mail fehl, bleibt nur sie ungelesen und wird beim nächsten Lauf erneut versucht — der Rest des Postfachs wird davon nicht blockiert. Der Status-Badge zeigt Zeitpunkt, Ergebnis und Anzahl importierter Mails des letzten Laufs.

> [!warning] Manuelles Markieren als gelesen
> Da der Gelesen-Status die Merkliste ist, markiert ein Öffnen der Mail in einem anderen Client sie ebenfalls als gelesen — sie würde dann beim nächsten Lauf **nicht** importiert. Für Postfächer, die auch normal genutzt werden, empfiehlt sich ein dedizierter IMAP-Ordner nur für den Import.

Der Kollisionsschutz auf Dateiebene (siehe oben) bleibt in jedem Fall bestehen: Würde eine Mail aus irgendeinem Grund doch zweimal verarbeitet, entsteht keine Überschreibung, sondern eine umbenannte Zweitdatei — und ein entsprechender Hinweis erscheint im Server-Log.

---

## Praktisches Beispiel

1. Öffne Einstellungen → Vault → Mail-Import → **Postfach hinzufügen**
2. Trage die IMAP-Zugangsdaten eines Test-Postfachs ein, Zielordner z.B. `Mail`, Intervall 15 Minuten
3. Klicke **Jetzt importieren**
4. Prüfe im Vault-Ordner `Mail`, dass neue Notizen mit Frontmatter und ggf. Anhängen angekommen sind

---

> [!todo] Übung
> Richte ein Test-Postfach mit ein bis zwei ungelesenen Mails ein (idealerweise mit einem Anhang), löse einen manuellen Import aus und prüfe die entstandene Notiz samt `attachments`-Ordner.

---

## Verwandte Features

- [[Features/Git-Sync]] — Ein weiteres serverseitiges Feature mit ähnlichem Aufbau
- [[Features/Vault-Verwaltung]] — Vaults erstellen, teilen und verwalten
- [[Admin/Feature-Toggles]] — Feature serverweit aktivieren/deaktivieren
